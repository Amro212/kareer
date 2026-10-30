import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { database } from './db.js';
import { environment as stripeEnvironment } from './stripe.js';

const environment = () => ({ DB: database(), ...stripeEnvironment() });
const request = (path, options = {}) => new Request(`https://api.test${path}`, options);
const start = env => worker.fetch(request('/v1/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {});
const choose = (id, values, origin = 'https://api.test') => request(`/plans/${id}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });

// The real Stripe SDK client talks to this fake API through fetch.
function fakeStripe(t, respond = () => Response.json({ id: 'cs_test_1', object: 'checkout.session', status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method, headers: new Headers(options.headers), body: new URLSearchParams(options.body || '') };
    calls.push(call);
    return respond(call);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test('hosted plans preserve a private background claim while validating consent and offer selection', async t => {
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
  assert.match(html, /All sales are final/);
  assert.match(html, /https:\/\/kareer\.itsamro\.me\/terms\//);
  assert.match(html, /amromousa8@gmail\.com/);
  assert.doesNotMatch(html, /Lemon|OpenRouter|\bbot\b|auto-apply/i);
  assert.doesNotMatch(html, new RegExp(purchase.claimSecret));
  assert.match(page.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.match(page.headers.get('Content-Security-Policy'), /form-action 'self' https:\/\/checkout\.stripe\.com/);
  assert.equal(page.headers.get('Referrer-Policy'), 'same-origin');
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack' }), env, {})).status, 400);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }, 'https://evil.test'), env, {})).status, 403);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'free', agreement: 'yes' }), env, {})).status, 400);

  const calls = fakeStripe(t);
  const redirect = await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }), env, {});
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('Location'), 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(call.headers.get('Stripe-Version'), '2026-09-30.endive');
  assert.equal(call.headers.get('Authorization'), 'Bearer rk_test_kareer');
  assert.equal(call.headers.get('Idempotency-Key'), `kareer-purchase:${purchase.id}:pack`);
  assert.equal(call.body.get('mode'), 'payment');
  assert.equal(call.body.get('line_items[0][price]'), 'price_pack');
  assert.equal(call.body.get('client_reference_id'), purchase.id);
  assert.equal(call.body.get('metadata[kareer_purchase]'), purchase.id);
  assert.equal(call.body.get('automatic_tax[enabled]'), 'true');
  assert.equal(call.body.get('customer_creation'), 'always');
  assert.equal(call.body.get('success_url'), 'https://kareer.itsamro.me/setup/?purchase=complete');
  assert.equal(env.DB.sql.prepare('SELECT offer,status,session_id FROM purchases').get().session_id, 'cs_test_1');

  const pending = await worker.fetch(request(`/v1/purchases/${purchase.id}`, { headers: { Authorization: `Bearer ${purchase.claimSecret}` } }), env, {});
  assert.equal(pending.status, 200);
  assert.deepEqual(await pending.json(), { status: 'pending' });
  const wrong = await worker.fetch(request(`/v1/purchases/${purchase.id}`, { headers: { Authorization: 'Bearer wrong-private-claim' } }), env, {});
  assert.equal(wrong.status, 410);
  // Only the open session lookup reached Stripe; status and wrong claims stay local.
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET']);
});

test('hosted plans reject expired sessions and disabled sales without creating a payment', async t => {
  const env = environment();
  const calls = fakeStripe(t);
  const purchase = await (await start(env)).json();
  await env.DB.prepare('UPDATE purchases SET created_at=0 WHERE id=?').bind(purchase.id).run();
  const expired = await worker.fetch(request(`/plans/${purchase.id}`), env, {});
  assert.equal(expired.status, 410);
  assert.match(await expired.text(), /expired/i);
  env.SALES_ENABLED = 'false';
  assert.equal((await start(env)).status, 503);
  assert.equal((await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }), env, {})).status, 503);
  assert.equal(calls.length, 0);
});

test('a Stripe failure shows a plain retry message and leaves the purchase selectable', async t => {
  const env = environment();
  fakeStripe(t, () => Response.json({ error: { type: 'api_error', message: 'internal secret detail' } }, { status: 500 }));
  const purchase = await (await start(env)).json();
  const failed = await worker.fetch(choose(purchase.id, { offer: 'pack', agreement: 'yes' }), env, {});
  assert.equal(failed.status, 503);
  const html = await failed.text();
  assert.match(html, /temporarily unavailable/);
  assert.doesNotMatch(html, /internal secret detail/);
  assert.equal(env.DB.sql.prepare('SELECT status FROM purchases').get().status, 'open');
});
