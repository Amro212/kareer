import { ApiError, fail, readBody, parseInput, upstreamBody, validateCompletion, digest } from './policy.js';
import { reserve, settle, release, cleanup, balances } from './ledger.js';
import { lemon, activate, authenticate, status, createCheckout, startPurchase, claimCheckout, webhook } from './payments.js';
import { hostedPurchase } from './purchase-page.js';

const messages = {
  ACTIVATION_NEEDED: 'Activate your Kareer key in Settings.', INVALID_KEY: 'That key could not be verified.',
  KEY_DISABLED: 'This key is disabled. Check your purchase in the billing portal.',
  NO_CREDITS: 'Out of credits. Buy a credit pack or renew your plan.',
  BUSY: 'Two AI requests are already running. Wait for one to finish.', RATE_LIMIT: 'Too many requests. Wait a minute and try again.',
  INPUT_TOO_LARGE: 'This request is too large. Reduce the supplied text and retry.',
  INVALID_COMPLETION: 'AI returned an incomplete or invalid result. No credit was charged.',
  GENERATION_FAILED: 'AI is temporarily unavailable. No credit was charged.',
  ID_CONFLICT: 'This request ID was already used for different content.',
  SUBSCRIPTION_EXISTS: 'Your wallet already has a subscription. Manage it in billing.',
  SALES_DISABLED: 'Purchases are not available yet.',
};
function errorData(error) {
  const code = error instanceof ApiError ? error.code : 'TEMPORARILY_UNAVAILABLE';
  return { code, error: messages[code] || 'The request could not be completed. Please try again later.' };
}
function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]{8,256}$/.test(value)) fail('ACTIVATION_NEEDED', 401);
  return value.slice(7);
}
async function jsonInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('INVALID_REQUEST', 415);
  try { return JSON.parse(await readBody(request)); } catch (error) {
    if (error instanceof ApiError) throw error;
    fail('INVALID_REQUEST');
  }
}

async function generation(request, env, auth, input) {
  const started = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(output) {
      const send = data => { if (!closed) { try { output.enqueue(encoder.encode(`${JSON.stringify(data)}\n`)); } catch { closed = true; } } };
      send({ type: 'processing' });
      const heartbeat = setInterval(() => send({ type: 'processing' }), 10000);
      const totalTimer = setTimeout(abort, 120000);
      let startTimer = setTimeout(abort, 25000);
      let usage = {};
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Kareer', 'HTTP-Referer': 'https://kareer.itsamro.me' },
          body: JSON.stringify(upstreamBody(input)),
        });
        clearTimeout(startTimer);
        if (!response.ok) fail('GENERATION_FAILED', 502);
        let body; try { body = JSON.parse(await readBody(response, 1024 * 1024)); } catch { fail('INVALID_COMPLETION', 502); }
        const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
        usage = { inputTokens: number(body.usage?.prompt_tokens), outputTokens: number(body.usage?.completion_tokens),
          cost: number(body.usage?.cost), latency: Date.now() - started };
        const content = validateCompletion(input, body);
        if (!await settle(env.DB, auth.wallet, input.id, usage)) fail('GENERATION_FAILED', 502);
        const credits = await balances(env.DB, auth.wallet).catch(() => undefined);
        send({ type: 'result', id: input.id, content, ...(credits ? { credits } : {}) });
      } catch (error) {
        const safe = error instanceof ApiError ? error : new ApiError('GENERATION_FAILED', 502);
        await release(env.DB, auth.wallet, input.id, safe.code, Date.now(), { ...usage, latency: Date.now() - started }).catch(() => {});
        const credits = await balances(env.DB, auth.wallet).catch(() => undefined);
        send({ type: 'error', id: input.id, ...errorData(safe), ...(credits ? { credits } : {}) });
      } finally {
        clearInterval(heartbeat); clearTimeout(totalTimer); clearTimeout(startTimer);
        request.signal.removeEventListener('abort', abort);
        if (!closed) { closed = true; output.close(); }
      }
    },
    cancel() { closed = true; abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function route(request, env) {
  const path = new URL(request.url).pathname, method = request.method;
  const provider = lemon(env);
  if (method === 'POST' && path === '/webhooks/lemonsqueezy') {
    await webhook(env.DB, env, provider, await readBody(request), request.headers.get('X-Signature'));
    return Response.json({ received: true });
  }
  if (method === 'POST' && path === '/v1/activate') {
    const input = await jsonInput(request);
    if (Object.keys(input).some(k => k !== 'licenseKey')) fail('INVALID_REQUEST');
    const auth = await activate(env.DB, env, provider, input.licenseKey);
    return Response.json(await status(env.DB, provider, auth.wallet));
  }
  if (method === 'POST' && path === '/v1/checkouts') {
    if (env.SALES_ENABLED !== 'true') fail('SALES_DISABLED', 503);
    const input = await jsonInput(request);
    if (Object.keys(input).some(k => k !== 'offer')) fail('INVALID_REQUEST');
    const auth = request.headers.has('Authorization') ? await authenticate(env.DB, env, provider, bearer(request), Date.now(), true) : null;
    return Response.json(await createCheckout(env.DB, env, provider, input.offer, auth?.wallet));
  }
  if (method === 'POST' && path === '/v1/purchases') {
    if (env.SALES_ENABLED !== 'true') fail('SALES_DISABLED', 503);
    const input = await jsonInput(request);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) fail('INVALID_REQUEST');
    const auth = request.headers.has('Authorization') ? await authenticate(env.DB, env, provider, bearer(request), Date.now(), true) : null;
    const purchase = await startPurchase(env.DB, auth?.wallet);
    return Response.json({ ...purchase, url: `${new URL(request.url).origin}/plans/${purchase.id}` });
  }
  if (method === 'GET' && /^\/v1\/checkouts\/[a-f0-9-]{36}$/.test(path)) {
    return Response.json(await claimCheckout(env.DB, env, provider, path.split('/').at(-1), bearer(request)));
  }
  if (method === 'GET' && path === '/v1/status') {
    const auth = await authenticate(env.DB, env, provider, bearer(request), Date.now(), true);
    return Response.json(await status(env.DB, provider, auth.wallet));
  }
  if (method === 'POST' && path === '/v1/ai') {
    const input = parseInput(await jsonInput(request));
    const auth = await authenticate(env.DB, env, provider, bearer(request));
    const hash = await digest(JSON.stringify({ operation: input.operation, messages: input.messages, document: input.document }));
    const hold = await reserve(env.DB, { wallet: auth.wallet, credential: auth.hash, id: input.id, hash, operation: input.operation });
    if (hold.code) fail(hold.code, hold.code === 'NO_CREDITS' ? 402 : hold.code === 'ID_CONFLICT' ? 409 : 429);
    if (hold.duplicate) return Response.json({ status: hold.status, duplicate: true });
    return generation(request, env, auth, input);
  }
  fail('NOT_FOUND', 404);
}

export default {
  async fetch(request, env) {
    if (/^\/plans\/[a-f0-9-]{36}$/.test(new URL(request.url).pathname)) return hostedPurchase(request, env);
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    // Firefox assigns a fresh internal UUID per installation; payment still requires the bearer key.
    const firefox = /^moz-extension:\/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(origin || '');
    if (origin && !allowed.includes(origin) && !firefox) return Response.json(errorData(new ApiError('ORIGIN_DENIED', 403)), { status: 403, headers });
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const response = await route(request, env);
      for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      return response;
    } catch (error) {
      return Response.json(errorData(error), { status: error instanceof ApiError ? error.status : 503, headers });
    }
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(cleanup(env.DB)); },
};
