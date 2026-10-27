import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import { createCheckout, claimCheckout, webhook } from '../src/payments.js';
import { digest } from '../src/policy.js';

const env = { LS_STORE_ID: '1', LS_PACK_VARIANT: '20', LS_MONTHLY_VARIANT: '10', LS_TEST_MODE: 'true', LS_WEBHOOK_SECRET: 'signing' };
const resource = (id, attributes) => ({ id: String(id), attributes: { store_id: 1, test_mode: true, customer_id: 7, ...attributes } });
function fixture() {
  const db = database();
  const order = resource(1, { status: 'paid', subtotal_usd: 500, discount_total_usd: 0, first_order_item: { id: 11, variant_id: 20 } });
  const key = resource(5, { order_id: 1, key: 'verified-license-key', disabled: false });
  const provider = {
    async create(data) {
      assert.equal(data.relationships.variant.data.id, '20');
      assert.equal(data.attributes.checkout_data.variant_quantities[0].quantity, 1);
      assert.equal(data.attributes.custom_price, undefined);
      assert.match(data.attributes.product_options.description, /US\$5 once/);
      assert.match(data.attributes.product_options.description, /non-refundable/);
      return resource(8, { url: 'https://store.lemonsqueezy.com/checkout/8' });
    },
    async get(path) { return ({ 'orders/1': order, 'order-items/11': { id: '11', attributes: { order_id: 1, variant_id: 20, quantity: 1 } }, 'license-keys/5': key, 'customers/7': resource(7, { urls: {} }) })[path]; },
    async list(type) { return type === 'license-keys' ? [key] : []; },
    async validate() { return { license_key: { id: 5 } }; },
  };
  return { db, provider, order };
}
test('checkout secrets are hashed, bound, never in URLs, and can be claimed exactly once', async () => {
  const { db, provider } = fixture();
  const checkout = await createCheckout(db, env, provider, 'pack');
  assert.ok(!checkout.url.includes(checkout.claimSecret));
  assert.equal(db.sql.prepare('SELECT secret_hash FROM checkouts').get().secret_hash, await digest(checkout.claimSecret));
  await assert.rejects(claimCheckout(db, env, provider, checkout.id, 'wrong-secret'));
  assert.deepEqual(await claimCheckout(db, env, provider, checkout.id, checkout.claimSecret), { status: 'pending' });
  await db.prepare('UPDATE checkouts SET order_id=? WHERE id=?').bind('1', checkout.id).run();
  const claims = await Promise.allSettled([claimCheckout(db, env, provider, checkout.id, checkout.claimSecret), claimCheckout(db, env, provider, checkout.id, checkout.claimSecret)]);
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1);
  assert.equal(claims.find(c => c.status === 'fulfilled').value.licenseKey, 'verified-license-key');
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM grants').get().n, 1);
});

test('a failed status lookup does not consume the once-only purchase claim', async () => {
  const { db, provider } = fixture();
  const checkout = await createCheckout(db, env, provider, 'pack');
  await db.prepare('UPDATE checkouts SET order_id=? WHERE id=?').bind('1', checkout.id).run();
  const get = provider.get.bind(provider);
  provider.get = async path => { if (path === 'customers/7') throw new Error('Temporary provider outage'); return get(path); };
  await assert.rejects(claimCheckout(db, env, provider, checkout.id, checkout.claimSecret));
  assert.equal(db.sql.prepare('SELECT claimed_at FROM checkouts').get().claimed_at, null);
  provider.get = get;
  assert.equal((await claimCheckout(db, env, provider, checkout.id, checkout.claimSecret)).status, 'complete');
});

test('active monthly wallets cannot start another monthly checkout', async () => {
  const { db, provider } = fixture();
  await db.prepare('INSERT INTO wallets VALUES (?,?)').bind('w', '7').run();
  await db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').bind('s', 'w', '1', 'active', Date.now() + 100000, Date.now()).run();
  await assert.rejects(createCheckout(db, env, provider, 'monthly', 'w'), /SUBSCRIPTION_EXISTS/);
});

test('signed payment event must match its checkout offer and environment before any grant', async () => {
  const { db, provider, order } = fixture();
  const checkout = await createCheckout(db, env, provider, 'pack');
  await db.prepare("UPDATE checkouts SET offer='monthly' WHERE id=?").bind(checkout.id).run();
  const raw = JSON.stringify({ meta: { custom_data: { kareer_checkout: checkout.id } }, data: { ...order, type: 'orders' } });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LS_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))).toString('hex');
  await assert.rejects(webhook(db, env, provider, raw, signature), /INVALID_PURCHASE/);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM grants').get().n, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
});
