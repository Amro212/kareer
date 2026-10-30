import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import worker from '../src/index.js';
import { digest } from '../src/policy.js';
import { grant, balances } from '../src/ledger.js';

async function fixture() {
  const DB = database(), key = 'private-license-key';
  await DB.prepare('INSERT INTO wallets(id,customer_id) VALUES (?,?)').bind('w', 'cus_1').run();
  await DB.prepare('INSERT INTO credentials(hash,wallet_id,created_at) VALUES (?,?,?)').bind(await digest(key), 'w', Date.now()).run();
  await grant(DB, { id: 'pack', wallet: 'w', credits: 1, kind: 'pack', payment: 'pi_1' });
  return { key, DB, SALES_ENABLED: 'false', OPENROUTER_API_KEY: 'upstream-secret', ALLOWED_ORIGINS: 'chrome-extension://abc' };
}
const req = (env, body) => new Request('https://api.test/v1/ai', { method: 'POST', headers: { Authorization: `Bearer ${env.key}`, Origin: 'chrome-extension://abc', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const input = { id: 'request-0001', operation: 'autofill', input: { applicantProfile: { firstName: 'Private' }, fieldsToFill: [{ fieldId: 'f1', label: 'private prompt' }] } };

test('settles valid completion before delivery and never regenerates duplicates', async () => {
  const env = await fixture(); let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const sent = JSON.parse(options.body);
    assert.equal(sent.max_tokens, 4096);
    assert.deepEqual(sent.messages.map(m => m.role), ['system', 'user'], 'the gateway writes the system prompt itself');
    assert.equal(JSON.parse(sent.messages[1].content).fieldsToFill[0].fieldId, 'f1');
    return Response.json({ model: 'hidden', choices: [{ finish_reason: 'stop', message: { content: '{"answers":[]}' } }], usage: { prompt_tokens: 2, completion_tokens: 3, cost: 0.0001 } });
  };
  try {
    const response = await worker.fetch(req(env, input), env, { waitUntil() {} });
    const text = await response.text();
    assert.match(text, /"type":"result"/);
    assert.equal(text.trim().split('\n').map(line => JSON.parse(line)).find(e => e.type === 'result').credits.total, 0);
    assert.doesNotMatch(text, /hidden|upstream-secret|private-license/);
    assert.equal((await balances(env.DB, 'w')).total, 0);
    const duplicate = await worker.fetch(req(env, input), env, {});
    assert.deepEqual(await duplicate.json(), { status: 'completed', duplicate: true });
    assert.equal(calls, 1);
    assert.equal(env.DB.sql.prepare('SELECT * FROM requests').get().input_hash.includes('private prompt'), false);
  } finally { globalThis.fetch = original; }
});

test('truncation releases credit and sanitizes upstream errors', async () => {
  const env = await fixture(), original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'secret model internals' } }], usage: { prompt_tokens: 12, completion_tokens: 4096, cost: 0.00164 } });
  try {
    const response = await worker.fetch(req(env, input), env, { waitUntil() {} });
    const text = await response.text();
    assert.match(text, /INVALID_COMPLETION/);
    assert.doesNotMatch(text, /secret model/);
    assert.equal(text.trim().split('\n').map(line => JSON.parse(line)).find(e => e.type === 'error').credits.total, 1);
    assert.equal((await balances(env.DB, 'w')).total, 1);
    const failed = env.DB.sql.prepare('SELECT * FROM requests').get();
    assert.equal(failed.output_tokens, 4096);
    assert.equal(failed.provider_cost, 0.00164);
    assert.equal(typeof failed.latency_ms, 'number');
  } finally { globalThis.fetch = original; }
});

test('unknown origins, policy tampering and disabled sales fail before generation', async () => {
  const env = await fixture();
  assert.equal((await worker.fetch(req(env, { ...input, model: 'override' }), env, {})).status, 400);
  assert.equal((await worker.fetch(req(env, { id: input.id, operation: 'autofill', messages: [{ role: 'system', content: 'anything' }] }), env, {})).status, 400);
  const bad = req(env, input); bad.headers.set('Origin', 'https://evil.test');
  assert.equal((await worker.fetch(bad, env, {})).status, 403);
  const purchase = new Request('https://api.test/v1/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await worker.fetch(purchase, env, {})).status, 503);
  assert.equal((await balances(env.DB, 'w')).total, 1);
  const firefox = req(env, { ...input, model: 'override' });
  firefox.headers.set('Origin', 'moz-extension://12345678-1234-1234-1234-123456789abc');
  assert.equal((await worker.fetch(firefox, env, {})).status, 400, 'per-install Firefox origins pass the supplementary check, then strict body validation applies');
});

for (const phase of ['response start', 'response body']) test(`${phase} timeout aborts upstream and releases its reservation`, async t => {
  const env = await fixture(), original = globalThis.fetch;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let aborted = false;
  globalThis.fetch = async (_url, { signal }) => {
    if (phase === 'response start') return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true; reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true }));
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{'));
      signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('Aborted', 'AbortError')); }, { once: true });
    } }));
  };
  try {
    const response = await worker.fetch(req(env, input), env, {});
    t.mock.timers.tick(phase === 'response start' ? 25000 : 120000);
    assert.match(await response.text(), /"type":"error"/);
    assert.equal(aborted, true);
    assert.equal((await balances(env.DB, 'w')).total, 1);
    assert.equal(env.DB.sql.prepare('SELECT status FROM requests').get().status, 'failed');
  } finally { globalThis.fetch = original; t.mock.timers.reset(); }
});

test('client disconnect aborts unsettled generation without charging or retrying', async () => {
  const env = await fixture(), original = globalThis.fetch;
  let calls = 0, aborted = false;
  globalThis.fetch = async (_url, { signal }) => {
    calls++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true; reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true }));
  };
  try {
    const response = await worker.fetch(req(env, input), env, {});
    await response.body.cancel();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(aborted, true);
    assert.equal((await balances(env.DB, 'w')).total, 1);
    const duplicate = await worker.fetch(req(env, input), env, {});
    assert.deepEqual(await duplicate.json(), { status: 'failed', duplicate: true });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
