import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import { reconcileOrder, reconcileSubscription, activate, verifySignature } from '../src/payments.js';
import { balances } from '../src/ledger.js';

const now = Date.parse('2026-01-31T12:00:00Z');
const env = { LS_STORE_ID: '1', LS_PACK_VARIANT: '20', LS_MONTHLY_VARIANT: '10', LS_TEST_MODE: 'true' };
const resource = (id, attributes) => ({ id: String(id), attributes: { store_id: 1, test_mode: true, customer_id: 7, ...attributes } });
function provider() {
  const objects = {
    'orders/1': resource(1, { status: 'paid', subtotal_usd: 500, discount_total_usd: 0, first_order_item: { id: 11, variant_id: 20 } }),
    'orders/2': resource(2, { status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, first_order_item: { id: 12, variant_id: 10 } }),
    'order-items/11': { id: '11', attributes: { order_id: 1, variant_id: 20, quantity: 1 } },
    'order-items/12': { id: '12', attributes: { order_id: 2, variant_id: 10, quantity: 1 } },
    'license-keys/5': resource(5, { key: 'license-secret', order_id: 1, disabled: false, status: 'expired' }),
    'subscriptions/3': resource(3, { order_id: 2, variant_id: 10, status: 'active', billing_anchor: 31,
      created_at: '2026-01-31T12:00:00Z', renews_at: '2026-02-28T12:00:00Z', updated_at: '2026-01-31T12:00:00Z' }),
  };
  let invoices = [resource(4, { subscription_id: 3, status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, billing_reason: 'initial', created_at: '2026-01-31T12:00:00Z' })];
  return { objects, setInvoices(v) { invoices = v; },
    async get(path) { if (!objects[path]) throw Error(path); return objects[path]; },
    async list(type) { return type === 'subscription-invoices' ? invoices : []; },
    async validate() { return { license_key: { id: 5 } }; },
  };
}

test('paid orders deduplicate, reversals stay revoked, unrelated stores cannot grant', async () => {
  const db = database(), p = provider();
  const wallet = await reconcileOrder(db, env, p, '1', null, now);
  await reconcileOrder(db, env, p, '1', null, now);
  assert.equal((await balances(db, wallet, now)).purchased, 300);
  p.objects['orders/1'].attributes.status = 'refunded';
  await reconcileOrder(db, env, p, '1', null, now);
  p.objects['orders/1'].attributes.status = 'paid';
  await reconcileOrder(db, env, p, '1', null, now);
  assert.equal((await balances(db, wallet, now)).total, 0);
  p.objects['orders/1'].attributes.store_id = 2;
  await assert.rejects(reconcileOrder(db, env, p, '1', null, now));
});

test('monthly invoices use provider periods at month-end; failures never extend allowance', async () => {
  const db = database(), p = provider();
  const wallet = await reconcileOrder(db, env, p, '2', null, now);
  await reconcileSubscription(db, env, p, '3', wallet, now);
  assert.equal((await balances(db, wallet, now)).monthly, 1000);
  assert.equal((await balances(db, wallet, now)).monthlyExpiresAt, '2026-02-28T12:00:00.000Z');
  p.objects['subscriptions/3'].attributes.status = 'past_due';
  p.objects['subscriptions/3'].attributes.renews_at = '2026-03-03T12:00:00Z';
  await reconcileSubscription(db, env, p, '3', wallet, now + 29 * 86400000);
  assert.equal((await balances(db, wallet, now + 29 * 86400000)).monthly, 0);
  p.objects['subscriptions/3'].attributes.status = 'active';
  p.objects['subscriptions/3'].attributes.renews_at = '2026-03-31T12:00:00Z';
  p.setInvoices([resource(6, { subscription_id: 3, status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, billing_reason: 'renewal', created_at: '2026-02-28T12:00:00Z' }),
    resource(4, { subscription_id: 3, status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, billing_reason: 'initial', created_at: '2026-01-31T12:00:00Z' })]);
  await reconcileSubscription(db, env, p, '3', wallet, now + 29 * 86400000);
  await reconcileSubscription(db, env, p, '3', wallet, now + 29 * 86400000);
  assert.equal((await balances(db, wallet, now + 29 * 86400000)).monthly, 1000);
});

test('expired native subscription keys still authenticate a wallet with purchased credits', async () => {
  const db = database(), p = provider();
  const result = await activate(db, env, p, 'license-secret', now);
  assert.equal((await balances(db, result.wallet, now)).purchased, 300);
  assert.equal(db.sql.prepare('SELECT hash FROM credentials').get().hash.includes('license-secret'), false);
  p.objects['license-keys/5'].attributes.disabled = true;
  await assert.rejects(activate(db, env, p, 'license-secret', now));
  assert.equal((await balances(db, result.wallet, now)).total, 0);
});

test('webhook authentication checks the exact raw body', async () => {
  const raw = '{"x":1}', secret = 'webhook-secret';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))).toString('hex');
  assert.equal(await verifySignature(raw, signature, secret), true);
  assert.equal(await verifySignature(raw + ' ', signature, secret), false);
});

test('quantity and paid price are verified from provider order items and amounts', async () => {
  const db = database(), p = provider();
  p.objects['order-items/11'].attributes.quantity = 2;
  await assert.rejects(reconcileOrder(db, env, p, '1'), /INVALID_PURCHASE/);
  p.objects['order-items/11'].attributes.quantity = 1;
  p.objects['orders/1'].attributes.subtotal_usd = 1;
  await assert.rejects(reconcileOrder(db, env, p, '1'), /INVALID_PURCHASE/);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM grants').get().n, 0);
});

test('simultaneous first activations resolve to one canonical customer wallet', async () => {
  const db = database(), p = provider();
  const wallets = await Promise.all([reconcileOrder(db, env, p, '1', null, now), reconcileOrder(db, env, p, '1', null, now)]);
  assert.equal(wallets[0], wallets[1]);
  assert.equal((await balances(db, wallets[0], now)).total, 300);
});

test('key reuse recovers missed renewals, while cancellation and expiry preserve purchased credits', async () => {
  const db = database(), p = provider(), invoiceList = p.list.bind(p);
  p.list = async (type, filters) => type === 'subscriptions' ? [p.objects['subscriptions/3']] : invoiceList(type, filters);
  const first = await activate(db, env, p, 'license-secret', now);
  assert.equal((await balances(db, first.wallet, now)).total, 1300);
  Object.assign(p.objects['subscriptions/3'].attributes, { status: 'cancelled', ends_at: '2026-02-28T12:00:00Z', updated_at: '2026-02-01T12:00:00Z' });
  await activate(db, env, p, 'license-secret', now + 86400000);
  assert.equal((await balances(db, first.wallet, now + 86400000)).monthly, 1000);
  p.objects['license-keys/6'] = resource(6, { key: 'second-expired-key', order_id: 2, disabled: false, status: 'expired' });
  p.validate = async key => ({ license_key: { id: key === 'second-expired-key' ? 6 : 5 } });
  Object.assign(p.objects['subscriptions/3'].attributes, { status: 'expired', updated_at: '2026-03-01T12:00:00Z' });
  const later = Date.parse('2026-03-01T12:00:00Z');
  const reused = await activate(db, env, p, 'second-expired-key', later);
  assert.equal(reused.wallet, first.wallet);
  assert.equal((await balances(db, reused.wallet, later)).total, 300);
  Object.assign(p.objects['subscriptions/3'].attributes, { status: 'active', ends_at: null, renews_at: '2026-03-31T12:00:00Z', updated_at: '2026-03-01T12:00:00Z' });
  p.setInvoices([resource(6, { subscription_id: 3, status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, billing_reason: 'renewal', created_at: '2026-02-28T12:00:00Z' })]);
  await activate(db, env, p, 'second-expired-key', later);
  await activate(db, env, p, 'license-secret', later);
  assert.deepEqual({ ...(await balances(db, first.wallet, later)) }, { monthly: 1000, purchased: 300, total: 1300, monthlyExpiresAt: '2026-03-31T12:00:00.000Z' });
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM credentials').get().n, 2);
});

test('an additional legitimate monthly payment retains its separate entitlement', async () => {
  const db = database(), p = provider(), originalList = p.list.bind(p);
  const wallet = await reconcileSubscription(db, env, p, '3', null, now);
  p.objects['orders/9'] = resource(9, { status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, first_order_item: { id: 19, variant_id: 10 } });
  p.objects['order-items/19'] = { id: '19', attributes: { order_id: 9, variant_id: 10, quantity: 1 } };
  p.objects['subscriptions/9'] = resource(9, { ...p.objects['subscriptions/3'].attributes, order_id: 9 });
  p.list = async (type, filters) => filters.subscription_id === '9'
    ? [resource(9, { subscription_id: 9, status: 'paid', subtotal_usd: 1000, discount_total_usd: 0, billing_reason: 'initial', created_at: '2026-01-31T12:00:00Z' })]
    : originalList(type, filters);
  assert.equal(await reconcileSubscription(db, env, p, '9', wallet, now), wallet);
  assert.equal((await balances(db, wallet, now)).monthly, 2000);
});
