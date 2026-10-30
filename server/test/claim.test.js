import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import worker from '../src/index.js';
import { webhook, startPurchase, selectPurchase, claimPurchase, billingPortal, CLAIM_WINDOW, SELECT_WINDOW } from '../src/payments.js';
import { cleanup } from '../src/ledger.js';
import { environment, mockStripe, sign, event, packSession, monthlySession } from './stripe.js';

const env = environment();
const DAY = 86400000;
async function purchase(db, stripe, offer, wallet = null, now = Date.now()) {
  const started = await startPurchase(db, wallet, now);
  await selectPurchase(db, env, stripe, started.id, offer, 'https://api.test', now);
  const { session_id: session } = db.sql.prepare('SELECT session_id FROM purchases WHERE id=?').get(started.id);
  return { ...started, session };
}
const deliver = (db, stripe, e) => { const { payload, header } = sign(e); return webhook(db, env, stripe, payload, header); };
const call = (db, path, { method = 'GET', key, body, extra = {} } = {}) => worker.fetch(new Request(`https://api.test${path}`, {
  method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
}), { ...env, ...extra, DB: db }, {});

test('the first claim after payment mints a kr_ key once; the key is stored only as a hash', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  assert.deepEqual(await claimPurchase(db, env, stripe, p.id, p.claimSecret), { status: 'pending' });
  stripe.objects[p.session] = packSession(p.session, p.id);
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session, object: 'checkout.session' }));
  const claimed = await claimPurchase(db, env, stripe, p.id, p.claimSecret, Date.now() + 20000);
  assert.equal(claimed.status, 'complete');
  assert.match(claimed.licenseKey, /^kr_[A-Za-z0-9_-]{43}$/);
  assert.equal(claimed.aiStatus.purchased, 300);
  const stored = db.sql.prepare('SELECT * FROM credentials').all();
  assert.equal(stored.length, 1);
  assert.notEqual(stored[0].hash, claimed.licenseKey);
  assert.ok(!JSON.stringify(db.sql.prepare('SELECT * FROM purchases').all()).includes(claimed.licenseKey));
  await assert.rejects(claimPurchase(db, env, stripe, p.id, p.claimSecret), /CLAIM_UNAVAILABLE/);
  await assert.rejects(claimPurchase(db, env, stripe, p.id, 'wrong-secret'), /CLAIM_UNAVAILABLE/);

  const activated = await call(db, '/v1/activate', { method: 'POST', body: { licenseKey: claimed.licenseKey } });
  assert.equal(activated.status, 200);
  assert.equal((await activated.json()).total, 300);
  const current = await call(db, '/v1/status', { key: claimed.licenseKey });
  assert.equal((await current.json()).purchased, 300);
  assert.equal((await call(db, '/v1/activate', { method: 'POST', body: { licenseKey: 'kr_unknown_key_value' } })).status, 401);
});

test('concurrent claims mint exactly one key', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  stripe.objects[p.session] = packSession(p.session, p.id);
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session, object: 'checkout.session' }));
  const results = await Promise.allSettled([1, 2, 3].map(() => claimPurchase(db, env, stripe, p.id, p.claimSecret)));
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.status === 'complete').length, 1);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM credentials').get().n, 1);
});

test('a claim before the webhook retrieves the Checkout Session from Stripe, at most every 15 seconds', async () => {
  const db = database(), stripe = mockStripe();
  const now = Date.now();
  const p = await purchase(db, stripe, 'monthly', null, now);
  stripe.payments.in_1 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_in_1' } }];
  stripe.objects[p.session] = { ...monthlySession(p.session, p.id), status: 'open', payment_status: 'unpaid' };
  assert.deepEqual(await claimPurchase(db, env, stripe, p.id, p.claimSecret, now), { status: 'pending' });
  const retrievals = () => stripe.calls.filter(c => c === p.session).length;
  assert.equal(retrievals(), 1);
  stripe.objects[p.session] = monthlySession(p.session, p.id);
  assert.deepEqual(await claimPurchase(db, env, stripe, p.id, p.claimSecret, now + 5000), { status: 'pending' });
  assert.equal(retrievals(), 1);
  const claimed = await claimPurchase(db, env, stripe, p.id, p.claimSecret, now + 16000);
  assert.equal(retrievals(), 2);
  assert.equal(claimed.status, 'complete');
  assert.equal(claimed.aiStatus.monthly, 1000);
  assert.equal(claimed.aiStatus.subscriptions[0].status, 'active');
  // The late webhook is then a no-op: the grant is idempotent.
  await deliver(db, stripe, event('checkout.session.completed', { id: p.session, object: 'checkout.session' }));
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM grants').get().n, 1);
});

test('the claim window outlives Checkout, and expired or unpaid sessions end the claim', async () => {
  const db = database(), stripe = mockStripe();
  const now = Date.now();
  const p = await purchase(db, stripe, 'pack', null, now);
  const params = stripe.calls.find(c => c.create).create;
  assert.ok(params.expires_at * 1000 - now >= 30 * 60000 && params.expires_at * 1000 - now < 24 * 3600000);
  assert.ok(CLAIM_WINDOW > params.expires_at * 1000 - now);
  stripe.objects[p.session] = packSession(p.session, p.id);
  const late = await claimPurchase(db, env, stripe, p.id, p.claimSecret, now + 3 * 3600000);
  assert.equal(late.status, 'complete');

  const q = await purchase(db, stripe, 'pack', null, now);
  await assert.rejects(claimPurchase(db, env, stripe, q.id, q.claimSecret, now + CLAIM_WINDOW + 1), /CLAIM_UNAVAILABLE/);
  stripe.objects[q.session] = { id: q.session, status: 'expired', client_reference_id: q.id };
  await assert.rejects(claimPurchase(db, env, stripe, q.id, q.claimSecret, now + 20000), /CLAIM_UNAVAILABLE/);

  const unchosen = await startPurchase(db, null, now);
  assert.deepEqual(await claimPurchase(db, env, stripe, unchosen.id, unchosen.claimSecret, now), { status: 'pending' });
  await assert.rejects(claimPurchase(db, env, stripe, unchosen.id, unchosen.claimSecret, now + SELECT_WINDOW + 1), /CLAIM_UNAVAILABLE/);
});

test('a Stripe outage during the claim fallback is reported as temporary', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  stripe.checkout.sessions.retrieve = async () => { throw new Error('network'); };
  await assert.rejects(claimPurchase(db, env, stripe, p.id, p.claimSecret), /BILLING_UNAVAILABLE/);
});

test('plan selection reuses one Stripe session, locks concurrent choices and blocks a second subscription', async () => {
  const db = database(), stripe = mockStripe();
  const started = await startPurchase(db);
  const url = await selectPurchase(db, env, stripe, started.id, 'pack', 'https://api.test');
  assert.match(url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(await selectPurchase(db, env, stripe, started.id, 'pack', 'https://api.test'), url);
  assert.equal(stripe.calls.filter(c => c.create).length, 1);
  assert.equal(stripe.calls.find(c => c.create).options.idempotencyKey, `kareer-purchase:${started.id}:pack`);
  await assert.rejects(selectPurchase(db, env, stripe, started.id, 'monthly', 'https://api.test'), /INVALID_OFFER/);
  await assert.rejects(selectPurchase(db, env, stripe, started.id, 'gift', 'https://api.test'), /INVALID_OFFER/);

  const other = await startPurchase(db);
  db.sql.prepare("UPDATE purchases SET status='creating' WHERE id=?").run(other.id);
  await assert.rejects(selectPurchase(db, env, stripe, other.id, 'pack', 'https://api.test'), /BUSY/);

  const failing = await startPurchase(db);
  const create = stripe.checkout.sessions.create;
  stripe.checkout.sessions.create = async () => { throw new Error('stripe down'); };
  await assert.rejects(selectPurchase(db, env, stripe, failing.id, 'pack', 'https://api.test'), /stripe down/);
  assert.equal(db.sql.prepare('SELECT status FROM purchases WHERE id=?').get(failing.id).status, 'open');
  stripe.checkout.sessions.create = create;

  // A returning wallet reuses its Stripe customer and cannot start a second subscription.
  const monthly = await purchase(db, stripe, 'monthly');
  stripe.payments.in_1 = [{ status: 'paid', payment: { type: 'payment_intent', payment_intent: 'pi_in_1' } }];
  stripe.objects[monthly.session] = monthlySession(monthly.session, monthly.id);
  await deliver(db, stripe, event('checkout.session.completed', { id: monthly.session, object: 'checkout.session' }));
  const wallet = db.sql.prepare("SELECT id FROM wallets WHERE customer_id='cus_month'").get().id;
  const again = await startPurchase(db, wallet);
  await assert.rejects(selectPurchase(db, env, stripe, again.id, 'monthly', 'https://api.test'), /SUBSCRIPTION_EXISTS/);
  await selectPurchase(db, env, stripe, again.id, 'pack', 'https://api.test');
  const params = stripe.calls.filter(c => c.create).at(-1).create;
  assert.equal(params.customer, 'cus_month');
  assert.equal(params.customer_creation, undefined);

  db.sql.prepare('UPDATE wallets SET flagged=1 WHERE id=?').run(wallet);
  await assert.rejects(startPurchase(db, wallet), /WALLET_FLAGGED/);
});

test('the billing portal is a separate authenticated request scoped to the wallet customer', async () => {
  const db = database(), stripe = mockStripe();
  const p = await purchase(db, stripe, 'pack');
  stripe.objects[p.session] = packSession(p.session, p.id);
  const { licenseKey } = await claimPurchase(db, env, stripe, p.id, p.claimSecret);
  const wallet = db.sql.prepare('SELECT wallet_id FROM credentials').get().wallet_id;
  const portal = await billingPortal(db, { ...env, STRIPE_PORTAL_CONFIGURATION: 'bpc_test' }, stripe, wallet);
  assert.equal(portal.url, 'https://billing.stripe.com/p/session/test_1');
  assert.deepEqual(stripe.calls.find(c => c.portal).portal, { customer: 'cus_pack', return_url: 'https://kareer.itsamro.me/', configuration: 'bpc_test' });
  await assert.rejects(billingPortal(db, env, stripe, 'missing'), /NO_BILLING/);
  assert.equal((await call(db, '/v1/billing-portal', { method: 'POST' })).status, 401);
  assert.equal((await call(db, '/v1/status', { key: licenseKey })).status, 200);
});

test('purchase creation through the worker respects the sales switch and the rate limiter', async () => {
  const db = database();
  assert.equal((await call(db, '/v1/purchases', { method: 'POST', body: {}, extra: { SALES_ENABLED: 'false' } })).status, 503);
  const created = await call(db, '/v1/purchases', { method: 'POST', body: {} });
  const body = await created.json();
  assert.equal(created.status, 200);
  assert.equal(body.url, `https://api.test/plans/${body.id}`);
  assert.ok(Date.parse(body.expiresAt) - Date.now() > 23 * 3600000);
  assert.equal((await call(db, '/v1/purchases', { method: 'POST', body: { offer: 'pack' } })).status, 400);
  const limiter = { limit: async () => ({ success: false }) };
  assert.equal((await call(db, '/v1/purchases', { method: 'POST', body: {}, extra: { PURCHASE_LIMITER: limiter } })).status, 429);
  assert.equal((await call(db, '/v1/checkouts', { method: 'POST', body: {} })).status, 404);
});

test('cleanup removes stale purchases and webhook records', async () => {
  const db = database();
  const now = Date.now();
  const old = await startPurchase(db, null, now - 60 * DAY);
  await startPurchase(db, null, now);
  db.sql.prepare("INSERT INTO webhook_events(id,type,created_at) VALUES ('evt_old','x',?),('evt_new','x',?)").run(now - 60 * DAY, now);
  await cleanup(db, now);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM purchases WHERE id=?').get(old.id).n, 0);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM purchases').get().n, 1);
  assert.deepEqual(db.sql.prepare('SELECT id FROM webhook_events').all().map(r => r.id), ['evt_new']);
});
