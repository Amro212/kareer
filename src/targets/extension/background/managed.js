import { api } from '../shared/browser.js';
import { readSecrets, writeLicense, updateStoredRecord } from './storage.js';

// A staging build must explicitly replace this constant; normal packages always use production.
const GATEWAY = typeof KAREER_GATEWAY_URL === 'string' ? KAREER_GATEWAY_URL : 'https://api.kareer.itsamro.me';
const UNCERTAIN = 'Could not confirm the AI result. It may have used one credit. Refresh usage before explicitly retrying.';
const safeStates = new Set(['ready', 'activationNeeded', 'outOfCredits', 'unavailable']);
async function saveStatus(status) {
  return updateStoredRecord('kr:ai-status', previous => {
    const next = { ...previous, ...status };
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    return { state: safeStates.has(next.state) ? next.state : 'unavailable', monthly: count(next.monthly), purchased: count(next.purchased),
      total: count(next.total), monthlyExpiresAt: next.monthlyExpiresAt || null,
      subscriptions: (Array.isArray(next.subscriptions) ? next.subscriptions : []).map(s => ({ status: String(s.status), periodEnd: s.periodEnd || null })) };
  });
}
async function call(path, { body, credential, signal } = {}) {
  const response = await fetch(`${GATEWAY}${path}`, { method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return response;
}
async function json(response) {
  let body; try { body = await response.json(); } catch { throw new Error('Kareer AI is temporarily unavailable.'); }
  if (!response.ok || body.error) {
    // Fixed client copy prevents an unexpected proxy response exposing provider details.
    const errors = { NO_CREDITS: 'Out of credits. Buy credits in Settings.', ACTIVATION_NEEDED: 'Activate your Kareer key in Settings.',
      INVALID_KEY: 'That license key could not be verified.', KEY_DISABLED: 'This key is disabled. Check your purchase in billing.',
      SUBSCRIPTION_EXISTS: 'Your wallet already has a monthly plan. Open Manage billing.',
      SALES_DISABLED: 'Purchases are not available yet.', CLAIM_UNAVAILABLE: 'Purchase polling ended. Activate the key from your receipt email.',
      INPUT_TOO_LARGE: 'This request is too large. Reduce the supplied text and retry.',
      BUSY: 'Two AI requests are running. Wait for one to finish.', RATE_LIMIT: 'Too many requests. Wait a minute and retry.' };
    const error = new Error(errors[body.code] || 'Kareer AI is temporarily unavailable. Try again later.');
    error.code = body.code;
    throw error;
  }
  return body;
}

export async function managedOperation(operation, input = {}) {
  const secrets = await readSecrets();
  const signal = AbortSignal.timeout(20000);
  if (operation === 'activate') {
    const key = String(input.licenseKey || '').trim();
    const result = await json(await call('/v1/activate', { body: { licenseKey: key }, signal }));
    await writeLicense(key);
    await updateStoredRecord('kr:settings', settings => ({ ...settings, aiMode: 'managed' }));
    return saveStatus(result);
  }
  if (operation === 'disconnect') {
    await writeLicense('');
    return saveStatus({ state: 'activationNeeded', monthly: 0, purchased: 0, total: 0, monthlyExpiresAt: null, subscriptions: [] });
  }
  if (operation === 'checkout') {
    const result = await json(await call('/v1/checkouts', { body: { offer: input.offer }, credential: secrets.licenseKey, signal }));
    await updateStoredRecord('kr:secrets', old => ({ ...old, checkout: { id: result.id, claimSecret: result.claimSecret, expiresAt: result.expiresAt } }));
    return { url: result.url, expiresAt: result.expiresAt };
  }
  if (operation === 'purchase') {
    const result = await json(await call('/v1/purchases', { body: {}, credential: secrets.licenseKey, signal }));
    if (!/^[a-f0-9-]{36}$/.test(result.id || '') || result.url !== `${GATEWAY}/plans/${result.id}`
      || !/^[^\s]{8,256}$/.test(result.claimSecret || '') || !(Date.parse(result.expiresAt) > Date.now())) throw new Error('Purchase link unavailable. Please try again later.');
    await updateStoredRecord('kr:secrets', old => ({ ...old, checkout: { id: result.id, claimSecret: result.claimSecret, expiresAt: result.expiresAt } }));
    return { url: result.url, expiresAt: result.expiresAt };
  }
  if (operation === 'claim') {
    const c = secrets.checkout;
    if (!c) return { status: 'idle' };
    if (Date.parse(c.expiresAt) <= Date.now()) return { status: 'expired' };
    let result;
    try { result = await json(await call(`/v1/checkouts/${encodeURIComponent(c.id)}`, { credential: c.claimSecret, signal })); }
    catch (error) {
      if (error.code === 'CLAIM_UNAVAILABLE') return { status: 'expired' };
      return { status: 'pending', expiresAt: c.expiresAt, unavailable: true };
    }
    if (result.status === 'complete') {
      await writeLicense(result.licenseKey);
      await updateStoredRecord('kr:secrets', old => ({ ...old, checkout: null }));
      return { status: 'complete', aiStatus: await saveStatus(result.aiStatus) };
    }
    return { status: 'pending', expiresAt: c.expiresAt };
  }
  if (!['status', 'billing'].includes(operation)) throw new Error('Unknown billing operation.');
  if (!secrets.licenseKey) return saveStatus({ state: 'activationNeeded', total: 0, monthly: 0, purchased: 0, monthlyExpiresAt: null, subscriptions: [] });
  try {
    const result = await json(await call('/v1/status', { credential: secrets.licenseKey, signal }));
    const safe = await saveStatus(result);
    return operation === 'billing' ? { url: result.billingUrl } : safe;
  } catch (error) {
    await saveStatus({ state: error.code === 'ACTIVATION_NEEDED' || error.code === 'KEY_DISABLED' ? 'activationNeeded' : 'unavailable' });
    throw error;
  }
}

export async function managedRequest(options, signal) {
  const { licenseKey } = await readSecrets();
  if (!licenseKey) throw new Error('Activate your Kareer key in Settings.');
  let parsed; try { parsed = JSON.parse(options.data); } catch { throw new Error('Invalid AI request.'); }
  const body = { id: crypto.randomUUID(), operation: options.operation, messages: parsed.messages,
    ...(options.document ? { document: options.document } : {}) };
  let response;
  try { response = await call('/v1/ai', { body, credential: licenseKey, signal }); }
  catch { throw new Error(UNCERTAIN); }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    let data; try { data = await json(response); } catch (error) {
      if (error.code === 'NO_CREDITS') await saveStatus({ state: 'outOfCredits', total: 0, monthly: 0, purchased: 0 });
      throw error;
    }
    if (data.duplicate) throw new Error(UNCERTAIN);
    throw new Error('Kareer AI is temporarily unavailable.');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', result, credits, size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      size += value?.byteLength || 0;
      if (size > 1024 * 1024) throw new Error(UNCERTAIN);
      const lines = pending.split('\n'); pending = lines.pop();
      if (done && pending) lines.push(pending);
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line);
        if (event.type === 'error') {
          if (event.credits) await saveStatus({ ...event.credits, state: event.credits.total > 0 ? 'ready' : 'outOfCredits' }).catch(() => {});
          throw new Error('Kareer AI could not complete this request. No credit was charged.');
        }
        if (event.type === 'result' && typeof event.content === 'string') { result = event.content; credits = event.credits; }
      }
      if (done) break;
    }
    if (result === undefined) throw new Error(UNCERTAIN);
    // Settlement already checked the wallet. Avoid re-verifying payments after every AI call.
    if (credits) await saveStatus({ ...credits, state: credits.total > 0 ? 'ready' : 'outOfCredits' }).catch(() => {});
    return { status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: result } }] }), responseHeaders: '' };
  } catch (error) {
    if (error.message.includes('No credit was charged')) throw error;
    throw new Error(UNCERTAIN);
  } finally { await reader.cancel().catch(() => {}); }
}
