import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database } from './db.js';
import { startPurchase, selectPurchase } from '../src/payments.js';

const environment = () => ({ DB: database(), SALES_ENABLED: 'true', LS_STORE_ID: '1', LS_PACK_VARIANT: '20', LS_MONTHLY_VARIANT: '10', LS_TEST_MODE: 'true' });
const request = (path, options = {}) => new Request(`https://api.test${path}`, options);
const start = env => worker.fetch(request('/v1/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {});
const choose = (id, values, origin = 'https://api.test') => request(`/plans/${id}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });

test('hosted plans preserve a private background claim while validating consent and offer selection', async () => {
  const env = environment();
  const response = await start(env);
  assert.equal(response.status, 200);
  const purchase = await response.json();
  assert.equal(purchase.url, `https://api.test/plans/${purchase.id}`);
  assert.ok(purchase.claimSecret);
  const page = await worker.fetch(request(`/plans/${purchase.id}`), env, {});
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /US\$10/);
  assert.match(html, /US\$5/);
  assert.doesNotMatch(html, new RegExp(purchase.claimSecret));
  assert.match(page.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.equal(page.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack' }), env, {})).status, 400);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }, 'https://evil.test'), env, {})).status, 403);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'free', agreement: 'yes' }), env, {})).status, 400);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/checkouts');
    const body = JSON.parse(options.body).data;
    assert.equal(body.attributes.checkout_data.custom.kareer_checkout, purchase.id);
    assert.equal(body.relationships.variant.data.id, '20');
    return Response.json({ data: { id: '8', attributes: { url: 'https://store.lemonsqueezy.com/checkout/8' } } });
  };
  try {
    const redirect = await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }), env, {});
    assert.equal(redirect.status, 303);
    assert.equal(redirect.headers.get('Location'), 'https://store.lemonsqueezy.com/checkout/8');
    assert.equal(calls, 1);
    assert.equal(env.DB.sql.prepare('SELECT offer FROM checkouts').get().offer, 'pack');
    const pending = await worker.fetch(request(`/v1/checkouts/${purchase.id}`, { headers: { Authorization: `Bearer ${purchase.claimSecret}` } }), env, {});
    assert.deepEqual(await pending.json(), { status: 'pending' });
    const wrong = await worker.fetch(request(`/v1/checkouts/${purchase.id}`, { headers: { Authorization: 'Bearer wrong-private-claim' } }), env, {});
    assert.equal(wrong.status, 410);
  } finally { globalThis.fetch = original; }
});

test('hosted plans reject expired sessions and disabled sales without creating a payment', async () => {
  const env = environment();
  const purchase = await (await start(env)).json();
  await env.DB.prepare('UPDATE checkouts SET expires_at=0 WHERE id=?').bind(purchase.id).run();
  const expired = await worker.fetch(request(`/plans/${purchase.id}`), env, {});
  assert.equal(expired.status, 410);
  assert.match(await expired.text(), /expired/i);
  env.SALES_ENABLED = 'false';
  assert.equal((await start(env)).status, 503);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }), env, {})).status, 503);
});

test('different customers can open checkout concurrently while one purchase cannot be selected twice', async () => {
  const env = environment();
  const first = await startPurchase(env.DB), second = await startPurchase(env.DB);
  const pending = [];
  const provider = { create: () => new Promise(resolve => pending.push(resolve)) };
  const results = Promise.allSettled([selectPurchase(env.DB, env, provider, first.id, 'pack'), selectPurchase(env.DB, env, provider, second.id, 'pack')]);
  for (let i = 0; i < 30 && pending.length < 2; i++) await Promise.resolve();
  const count = pending.length;
  for (const [i, resolve] of pending.entries()) resolve({ id: String(i + 8), attributes: { url: `https://store.lemonsqueezy.com/checkout/${i + 8}` } });
  const completed = await results;
  assert.equal(count, 2);
  assert.ok(completed.every(result => result.status === 'fulfilled'));
  provider.get = async () => ({ attributes: { url: 'https://store.lemonsqueezy.com/checkout/8' } });
  assert.equal(await selectPurchase(env.DB, env, provider, first.id, 'pack'), 'https://store.lemonsqueezy.com/checkout/8');
  await assert.rejects(selectPurchase(env.DB, env, provider, first.id, 'monthly'), /INVALID_OFFER/);
});

test('hosted selection recovers from provider failure and enforces an existing monthly subscription', async () => {
  const env = environment();
  const purchase = await startPurchase(env.DB);
  await assert.rejects(selectPurchase(env.DB, env, { async create() { throw Error('provider offline'); } }, purchase.id, 'pack'), /provider offline/);
  assert.equal(env.DB.sql.prepare('SELECT offer FROM checkouts').get().offer, 'pending');
  await env.DB.prepare('INSERT INTO wallets VALUES (?,?)').bind('wallet', '7').run();
  await env.DB.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').bind('sub', 'wallet', '1', 'active', Date.now() + 60000, Date.now()).run();
  const monthly = await startPurchase(env.DB, 'wallet');
  await assert.rejects(selectPurchase(env.DB, env, {}, monthly.id, 'monthly'), /SUBSCRIPTION_EXISTS/);
});
