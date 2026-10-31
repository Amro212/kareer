import { ApiError, MESSAGES, fail, readBody, parseInput, upstreamBody, validateCompletion, digest, limited } from './policy.js';
import { reserve, settle, release, cleanup, balances } from './ledger.js';
import { stripeClient, authenticate, status, billingPortal, startPurchase, selectPurchase, claimPurchase, webhook } from './payments.js';
import { hostedPurchase } from './purchase-page.js';
import { OFFERS } from './offers.js';
import { SITE_ORIGIN } from '../../src/core/endpoints.js';

function errorData(error) {
  const code = error instanceof ApiError ? error.code : 'TEMPORARILY_UNAVAILABLE';
  return { code, error: MESSAGES[code] || 'The request could not be completed. Please try again later.' };
}
function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]{8,256}$/.test(value)) fail('ACTIVATION_NEEDED', 401);
  return value.slice(7);
}
async function jsonInput(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('INVALID_REQUEST', 415);
  let input;
  try { input = JSON.parse(await readBody(request)); } catch (error) {
    if (error instanceof ApiError) throw error;
    fail('INVALID_REQUEST');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST');
  return input;
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
      const startTimer = setTimeout(abort, 25000);
      let usage = {};
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Kareer', 'HTTP-Referer': SITE_ORIGIN },
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

// Status, activation and AI authentication read D1 only. Stripe is called from webhooks,
// purchase creation, the claim fallback and explicit billing-portal requests.
async function route(request, env) {
  const path = new URL(request.url).pathname, method = request.method;
  if (method === 'POST' && path === '/webhooks/stripe') {
    await webhook(env.DB, env, stripeClient(env), await readBody(request), request.headers.get('Stripe-Signature'));
    return Response.json({ received: true });
  }
  if (method === 'POST' && path === '/v1/activate') {
    const input = await jsonInput(request);
    if (Object.keys(input).some(k => k !== 'licenseKey')) fail('INVALID_REQUEST');
    const auth = await authenticate(env.DB, input.licenseKey, 'INVALID_KEY');
    return Response.json(await status(env.DB, auth.wallet));
  }
  if (method === 'POST' && path === '/v1/purchases') {
    if (env.SALES_ENABLED !== 'true') fail('SALES_DISABLED', 503);
    const input = await jsonInput(request);
    if (Object.keys(input).some(k => k !== 'offer')) fail('INVALID_REQUEST');
    if (input.offer !== undefined && !Object.hasOwn(OFFERS, input.offer)) fail('INVALID_OFFER');
    await limited(request, env);
    const auth = request.headers.has('Authorization') ? await authenticate(env.DB, bearer(request)) : null;
    const purchase = await startPurchase(env.DB, auth?.wallet);
    const origin = new URL(request.url).origin;
    // With an offer chosen in the extension, skip the plans page and go straight to Stripe Checkout.
    const checkoutUrl = input.offer ? await selectPurchase(env.DB, env, stripeClient(env), purchase.id, input.offer, origin) : undefined;
    return Response.json({ ...purchase, url: `${origin}/plans/${purchase.id}`, ...(checkoutUrl ? { checkoutUrl } : {}) });
  }
  if (method === 'GET' && /^\/v1\/purchases\/[a-f0-9-]{36}$/.test(path)) {
    return Response.json(await claimPurchase(env.DB, env, stripeClient(env), path.split('/').at(-1), bearer(request)));
  }
  if (method === 'GET' && path === '/v1/status') {
    const auth = await authenticate(env.DB, bearer(request));
    return Response.json(await status(env.DB, auth.wallet));
  }
  if (method === 'POST' && path === '/v1/billing-portal') {
    const auth = await authenticate(env.DB, bearer(request));
    return Response.json(await billingPortal(env.DB, env, stripeClient(env), auth.wallet));
  }
  if (method === 'POST' && path === '/v1/ai') {
    const input = parseInput(await jsonInput(request));
    const auth = await authenticate(env.DB, bearer(request));
    const hash = await digest(JSON.stringify({ operation: input.operation, input: input.input }));
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
