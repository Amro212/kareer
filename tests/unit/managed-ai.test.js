import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const records = {};
globalThis.chrome = { runtime: {}, storage: { local: {
  async get(key) { return key === null ? structuredClone(records) : { [key]: structuredClone(records[key]) }; },
  async set(values) { Object.assign(records, structuredClone(values)); },
  async remove(key) { delete records[key]; },
} } };
const storage = await import('../../src/targets/extension/background/storage.js');
const { proxyAiRequest } = await import('../../src/targets/extension/background/ai.js');
const { managedOperation } = await import('../../src/targets/extension/background/managed.js');
const PAGE = { applicantProfile: {}, fieldsToFill: [{ fieldId: 'f1' }] };
beforeEach(() => {
  for (const key of Object.keys(records)) delete records[key];
  records['kr:secrets'] = { apiKey: 'byok-secret', licenseKey: 'private-license' };
  records['kr:settings'] = { aiMode: 'managed' };
});

test('credential changes preserve the other credential and snapshots exclude all secrets', async () => {
  records['kr:secrets'] = { licenseKey: 'private-license', checkout: { claimSecret: 'private-claim' } };
  delete records['kr:settings'];
  await storage.writeSecret('byok-secret');
  await storage.clearSecret();
  assert.equal(records['kr:secrets'].licenseKey, 'private-license');
  await storage.writeSecret('byok-secret');
  const snapshot = await storage.buildSnapshot();
  assert.doesNotMatch(JSON.stringify(snapshot), /private-license|private-claim|byok-secret/);
  assert.equal(snapshot.aiStatus.mode, 'byok');
  records['kr:settings'] = { aiMode: 'managed' };
  records['kr:ai-status'] = { state: 'ready', total: 4, monthly: 1, purchased: 3 };
  assert.equal((await storage.buildSnapshot()).aiStatus.mode, 'managed');
});

test('removing a legacy personal key does not silently switch its mode to managed', async () => {
  delete records['kr:settings'];
  assert.equal((await storage.readAiStatus()).mode, 'byok');
  await storage.clearSecret();
  assert.equal((await storage.readAiStatus()).mode, 'byok');
  assert.equal(records['kr:secrets'].licenseKey, 'private-license');
});

test('managed requests strip BYOK policy, use bounded streaming, and never fall back to saved key', async () => {
  const realFetch = globalThis.fetch;
  records['kr:settings'] = { aiMode: 'managed' };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/v1/status')) return Response.json({ state: 'ready', total: 3 });
    calls++;
    assert.equal(url, 'https://api.kareer.itsamro.me/v1/ai');
    assert.equal(options.headers.Authorization, 'Bearer private-license');
    const body = JSON.parse(options.body);
    assert.equal(body.operation, 'autofill');
    assert.deepEqual(Object.keys(body).sort(), ['id', 'input', 'operation'], 'only the structured operation leaves the extension');
    assert.deepEqual(body.input.fieldsToFill, [{ fieldId: 'f1' }]);
    return new Response('{"type":"processing"}\n{"type":"result","content":"{\\"answers\\":[]}"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    const result = await proxyAiRequest({ operation: 'autofill', url: 'https://openrouter.ai/api/v1/chat/completions',
      data: JSON.stringify({ model: 'custom', messages: [{ role: 'user', content: 'hello' }] }), input: PAGE });
    assert.equal(JSON.parse(result.responseText).choices[0].message.content, '{"answers":[]}');
    globalThis.fetch = async url => { if (url.endsWith('/v1/ai')) calls++; return Response.json({ code: 'NO_CREDITS', error: 'Out of credits.' }, { status: 402 }); };
    assert.match((await proxyAiRequest({ operation: 'autofill', input: PAGE })).error, /Out of credits/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = realFetch; }
});

test('managed status checks are free and malformed streams do not retry', async () => {
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => { calls++; assert.match(url, /\/v1\/status$/); return Response.json({ state: 'ready', monthly: 2, purchased: 3, total: 5 }); };
  try {
    assert.equal((await managedOperation('status')).total, 5);
    assert.equal(calls, 1);
    globalThis.fetch = async () => { calls++; return new Response('{"type":"processing"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }); };
    const result = await proxyAiRequest({ operation: 'autofill', input: PAGE });
    assert.match(result.error, /uncertain|confirm/i);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = realFetch; }
});

test('purchase polling stays idle before purchase and retains the deadline through an outage', async () => {
  assert.deepEqual(await managedOperation('claim'), { status: 'idle' });
  records['kr:secrets'].checkout = { id: 'purchase', claimSecret: 'claim-secret', expiresAt: new Date(Date.now() + 60000).toISOString() };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connection lost'); };
  try {
    const result = await managedOperation('claim');
    assert.equal(result.status, 'pending');
    assert.equal(result.unavailable, true);
    assert.equal(result.expiresAt, records['kr:secrets'].checkout.expiresAt);
  } finally { globalThis.fetch = realFetch; }
});

test('hosted purchases keep claim credentials in background storage and reject foreign purchase links', async () => {
  const original = globalThis.fetch;
  const id = '11111111-1111-4111-8111-111111111111';
  const purchase = { id, url: `https://api.kareer.itsamro.me/plans/${id}`, claimSecret: 'private-purchase-claim', expiresAt: new Date(Date.now() + 900000).toISOString() };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.kareer.itsamro.me/v1/purchases');
    assert.deepEqual(JSON.parse(options.body), {});
    assert.equal(options.headers.Authorization, 'Bearer private-license');
    return Response.json(purchase);
  };
  try {
    const result = await managedOperation('purchase');
    assert.equal(result.url, purchase.url);
    assert.equal(result.claimSecret, undefined);
    assert.equal(records['kr:secrets'].checkout.claimSecret, purchase.claimSecret);
    globalThis.fetch = async () => Response.json({ ...purchase, url: 'https://evil.test/plans/' + id });
    await assert.rejects(managedOperation('purchase'), /Purchase link unavailable/);
  } finally { globalThis.fetch = original; }
});

test('auto-claim preserves an explicit later mode choice and free status retains plan details', async () => {
  records['kr:settings'].aiMode = 'byok';
  records['kr:secrets'].checkout = { id: 'purchase', claimSecret: 'claim-secret', expiresAt: new Date(Date.now() + 60000).toISOString() };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: 'complete', licenseKey: 'new-license', aiStatus: {
    state: 'ready', total: 3, purchased: 3, subscriptions: [{ status: 'active', cancelAtPeriodEnd: true, periodEnd: '2026-11-01T00:00:00Z' }],
  } });
  try {
    await managedOperation('claim');
    assert.equal(records['kr:settings'].aiMode, 'byok');
    assert.deepEqual(records['kr:ai-status'].subscriptions[0], { status: 'active', cancelAtPeriodEnd: true, periodEnd: '2026-11-01T00:00:00Z' });
    assert.equal(records['kr:secrets'].licenseKey, 'new-license');
    assert.equal(records['kr:secrets'].checkout, null);
  } finally { globalThis.fetch = realFetch; }
});

test('all managed operations including both document paths use the shared metered transport', async () => {
  const { writingRequest } = await import('../../src/targets/extension/background/materials.js');
  const realFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/v1/status')) return Response.json({ state: 'ready', total: 10 });
    assert.equal(url, 'https://api.kareer.itsamro.me/v1/ai');
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.model, undefined);
    return new Response(JSON.stringify({ type: 'result', content: body.operation.startsWith('document') ? '{"paragraphs":["Hello"]}' : 'text' }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    for (const operation of ['autofill', 'repair', 'optionDiscovery', 'fieldRewrite']) {
      assert.equal((await proxyAiRequest({ operation, input: PAGE })).status, 200);
    }
    const input = { kind: 'coverLetter', source: {}, job: {} };
    await writingRequest(input, 'Write', new AbortController());
    await writingRequest({ ...input, rewrite: { path: 'paragraph:0' }, currentDocument: { kind: 'coverLetter', paragraphs: ['Hello'] } }, 'Rewrite', new AbortController());
    assert.deepEqual(calls.map(c => c.operation), ['autofill', 'repair', 'optionDiscovery', 'fieldRewrite', 'document', 'documentRewrite']);
    assert.equal(calls.at(-1).input.rewrite.path, 'paragraph:0');
    assert.ok(calls.every(c => !c.messages && !c.model));
    assert.equal(new Set(calls.map(c => c.id)).size, 6);
  } finally { globalThis.fetch = realFetch; }
});

test('settled balance updates do not call the payment provider status path after every generation', async () => {
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    assert.match(url, /\/v1\/ai$/);
    return new Response(JSON.stringify({ type: 'result', content: 'Done', credits: { monthly: 2, purchased: 3, total: 5 } }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    await proxyAiRequest({ operation: 'fieldRewrite', input: { fieldLabel: 'Why?' } });
    assert.equal(records['kr:ai-status'].total, 5);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('released credit restores readiness after another concurrent request reported zero available', async () => {
  records['kr:ai-status'] = { state: 'outOfCredits', total: 0, monthly: 0, purchased: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'error', code: 'INVALID_COMPLETION', credits: { monthly: 0, purchased: 1, total: 1 } }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
  try {
    assert.match((await proxyAiRequest({ operation: 'autofill', input: PAGE })).error, /No credit was charged/);
    assert.equal(records['kr:ai-status'].state, 'ready');
    assert.equal(records['kr:ai-status'].total, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('claims use the purchase route, a first claim selects Kareer AI, and new installs default to your own key', async () => {
  delete records['kr:settings'];
  records['kr:secrets'] = { checkout: { id: 'purchase-1', claimSecret: 'claim-secret', expiresAt: new Date(Date.now() + 60000).toISOString() } };
  assert.equal((await storage.readAiStatus()).mode, 'byok');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.kareer.itsamro.me/v1/purchases/purchase-1');
    assert.equal(options.headers.Authorization, 'Bearer claim-secret');
    return Response.json({ status: 'complete', licenseKey: 'kr_new', aiStatus: { state: 'ready', total: 300, purchased: 300, flagged: false, subscriptions: [] } });
  };
  try {
    assert.equal((await managedOperation('claim')).status, 'complete');
    assert.equal(records['kr:settings'].aiMode, 'managed');
    assert.deepEqual(await managedOperation('revealKey'), { licenseKey: 'kr_new' });
  } finally { globalThis.fetch = realFetch; }
});

test('Manage billing asks for a Stripe portal session separately and a billing error keeps the status', async () => {
  records['kr:ai-status'] = { state: 'ready', total: 4, monthly: 0, purchased: 4 };
  const realFetch = globalThis.fetch, urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    assert.equal(options.method, 'POST');
    return Response.json({ url: 'https://billing.stripe.com/p/session/test' });
  };
  try {
    assert.deepEqual(await managedOperation('billing'), { url: 'https://billing.stripe.com/p/session/test' });
    globalThis.fetch = async () => Response.json({ code: 'NO_BILLING', error: 'x' }, { status: 404 });
    await assert.rejects(managedOperation('billing'), /no billing account/);
    assert.equal(records['kr:ai-status'].state, 'ready');
    assert.deepEqual(urls, ['https://api.kareer.itsamro.me/v1/billing-portal']);
    await assert.rejects(managedOperation('checkout'), /Unknown billing operation/);
  } finally { globalThis.fetch = realFetch; }
});

test('an ended claim points to support instead of a receipt email', async () => {
  records['kr:secrets'].checkout = { id: 'purchase-2', claimSecret: 'claim-secret', expiresAt: new Date(Date.now() + 60000).toISOString() };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 'CLAIM_UNAVAILABLE', error: 'x' }, { status: 410 });
  try { assert.deepEqual(await managedOperation('claim'), { status: 'expired' }); }
  finally { globalThis.fetch = realFetch; }
});
