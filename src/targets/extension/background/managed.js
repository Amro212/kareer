import { api } from '../shared/browser.js';
import { readSecrets, writeLicense, updateStoredRecord } from './storage.js';
import { STAGING_GATEWAY_ORIGIN, SUPPORT_EMAIL } from '../../../core/endpoints.js';

// tools/build.js sets this per build; only --production packages use the production gateway.
const GATEWAY = typeof KAREER_GATEWAY_URL === 'string' ? KAREER_GATEWAY_URL : STAGING_GATEWAY_ORIGIN;
const UNREACHABLE = "Can't reach Kareer right now. Check your internet connection and try again. Filling forms from your saved profile still works.";
const UNCERTAIN = 'Could not confirm the AI result. It may have used credits. Refresh usage before explicitly retrying.';
const safeStates = new Set(['ready', 'activationNeeded', 'outOfCredits', 'unavailable']);
let pendingClaim;
async function saveStatus(status) {
  return updateStoredRecord('kr:ai-status', previous => {
    const next = { ...previous, ...status };
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    return { state: safeStates.has(next.state) ? next.state : 'unavailable', monthly: count(next.monthly), purchased: count(next.purchased),
      trial: count(next.trial), total: count(next.total), monthlyExpiresAt: next.monthlyExpiresAt || null,
      trialExpiresAt: next.trialExpiresAt || null, flagged: next.flagged === true, billing: next.billing !== false,
      subscriptions: (Array.isArray(next.subscriptions) ? next.subscriptions : [])
        .map(s => ({ status: String(s.status), cancelAtPeriodEnd: s.cancelAtPeriodEnd === true, periodEnd: s.periodEnd || null })) };
  });
}
async function call(path, { body, credential, signal } = {}) {
  try {
    return await fetch(`${GATEWAY}${path}`, { method: body === undefined ? 'GET' : 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch (cause) {
    // fetch rejects only for network failures and aborts; never show its raw "Failed to fetch".
    const error = new Error(UNREACHABLE, { cause });
    error.code = 'UNREACHABLE';
    throw error;
  }
}
async function json(response) {
  let body; try { body = await response.json(); } catch { throw new Error('Kareer AI is temporarily unavailable.'); }
  if (!response.ok || body.error) {
    // Fixed client copy prevents an unexpected proxy response exposing provider details.
    const errors = { NO_CREDITS: 'Not enough credits for this request. Buy credits in Settings.', ACTIVATION_NEEDED: 'Activate your Kareer key in Settings.',
      TRIAL_UNAVAILABLE: 'Free trials are paused right now. Try again tomorrow, or choose a plan.',
      INVALID_KEY: 'That Kareer key could not be verified.', KEY_DISABLED: `This key is disabled. Email ${SUPPORT_EMAIL} for help.`,
      SUBSCRIPTION_EXISTS: 'You already have a monthly plan. Open Manage billing.',
      SALES_DISABLED: 'Purchases are not available yet.', INVALID_OFFER: 'That plan is not available.',
      CLAIM_UNAVAILABLE: `Kareer stopped checking for this purchase. If you paid and Kareer did not activate, email ${SUPPORT_EMAIL}.`,
      WALLET_FLAGGED: `Purchases are paused while a payment issue is reviewed. Email ${SUPPORT_EMAIL}.`,
      NO_BILLING: 'This key has no billing account yet.',
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
  if (operation === 'trial') {
    if (secrets.licenseKey || secrets.trialUsed) throw new Error('This browser already used its free trial.');
    const result = await json(await call('/v1/trial', { body: {}, signal }));
    if (!/^kr_[A-Za-z0-9_-]{43}$/.test(result.licenseKey || '')) throw new Error('Kareer AI is temporarily unavailable. Try again later.');
    await updateStoredRecord('kr:secrets', old => ({ ...old, licenseKey: result.licenseKey, trialUsed: 1 }));
    await updateStoredRecord('kr:settings', settings => ({ ...settings, aiMode: 'managed' }));
    return saveStatus(result.aiStatus);
  }
  if (operation === 'revealKey') return { licenseKey: secrets.licenseKey || '' };
  if (operation === 'disconnect') {
    await writeLicense('');
    return saveStatus({ state: 'activationNeeded', monthly: 0, purchased: 0, trial: 0, total: 0, monthlyExpiresAt: null, trialExpiresAt: null, subscriptions: [] });
  }
  if (operation === 'purchase') {
    const offer = ['monthly', 'pack'].includes(input.offer) ? input.offer : undefined;
    const result = await json(await call('/v1/purchases', { body: offer ? { offer } : {}, credential: secrets.licenseKey, signal }));
    if (!/^[a-f0-9-]{36}$/.test(result.id || '') || result.url !== `${GATEWAY}/plans/${result.id}`
      || (offer && !/^https:\/\/checkout\.stripe\.com\//.test(result.checkoutUrl || ''))
      || !/^[^\s]{8,256}$/.test(result.claimSecret || '') || !(Date.parse(result.expiresAt) > Date.now())) throw new Error('Purchase link unavailable. Please try again later.');
    await updateStoredRecord('kr:secrets', old => ({ ...old, checkout: { id: result.id, claimSecret: result.claimSecret, expiresAt: result.expiresAt } }));
    return { url: offer ? result.checkoutUrl : result.url, expiresAt: result.expiresAt };
  }
  if (operation === 'claim') return pendingClaim ||= claim(secrets.checkout, signal).finally(() => { pendingClaim = null; });
  if (!['status', 'billing'].includes(operation)) throw new Error('Unknown billing operation.');
  if (!secrets.licenseKey) return saveStatus({ state: 'activationNeeded', total: 0, monthly: 0, purchased: 0, trial: 0, monthlyExpiresAt: null, trialExpiresAt: null, subscriptions: [] });
  try {
    if (operation === 'billing') {
      const { url } = await json(await call('/v1/billing-portal', { body: {}, credential: secrets.licenseKey, signal }));
      return { url };
    }
    return await saveStatus(await json(await call('/v1/status', { credential: secrets.licenseKey, signal })));
  } catch (error) {
    const signedOut = error.code === 'ACTIVATION_NEEDED' || error.code === 'KEY_DISABLED';
    if (operation === 'status' || signedOut) await saveStatus({ state: signedOut ? 'activationNeeded' : 'unavailable' });
    throw error;
  }
}

async function claim(c, signal) {
  if (!c) return { status: 'idle' };
  if (Date.parse(c.expiresAt) <= Date.now()) return { status: 'expired' };
  let result;
  try { result = await json(await call(`/v1/purchases/${encodeURIComponent(c.id)}`, { credential: c.claimSecret, signal })); }
  catch (error) {
    if (error.code === 'CLAIM_UNAVAILABLE') return { status: 'expired' };
    return { status: 'pending', expiresAt: c.expiresAt, unavailable: true };
  }
  if (result.status === 'complete') {
    await updateStoredRecord('kr:secrets', old => ({ ...old, licenseKey: result.licenseKey, checkout: old.checkout?.id === c.id ? null : old.checkout }));
    await updateStoredRecord('kr:settings', settings => ({ ...settings, aiMode: settings?.aiMode || 'managed' }));
    return { status: 'complete', aiStatus: await saveStatus(result.aiStatus) };
  }
  return { status: 'pending', expiresAt: c.expiresAt };
}

export async function managedRequest(options, signal) {
  const { licenseKey } = await readSecrets();
  if (!licenseKey) throw new Error('Activate your Kareer key in Settings.');
  if (typeof options.operation !== 'string' || !options.input || typeof options.input !== 'object') throw new Error('Invalid AI request.');
  // Kareer's gateway writes the prompts; the extension sends only the structured operation.
  const body = { id: crypto.randomUUID(), operation: options.operation, input: options.input };
  let response;
  try { response = await call('/v1/ai', { body, credential: licenseKey, signal }); }
  catch { throw new Error(UNCERTAIN); }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    let data; try { data = await json(response); } catch (error) {
      // A document can need more credits than remain, so refresh the real balance instead of assuming zero.
      if (error.code === 'NO_CREDITS') await managedOperation('status').catch(() => {});
      throw error;
    }
    if (data.duplicate) throw new Error(UNCERTAIN);
    throw new Error('Kareer AI is temporarily unavailable.');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', result, credits, terminalError, size = 0;
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
          const reason = event.code === 'INVALID_COMPLETION' ? 'Kareer AI returned an incomplete or invalid answer.' : 'Kareer AI could not complete this request.';
          const released = event.charged === false;
          if (released && event.credits) await saveStatus({ ...event.credits, state: event.credits.total > 0 ? 'ready' : 'outOfCredits' }).catch(() => {});
          else await saveStatus({ state: 'unavailable' }).catch(() => {});
          terminalError = new Error(`${reason} ${released ? 'No credits were charged.' : 'Kareer could not confirm whether credits were used. Refresh usage before retrying.'}`);
          throw terminalError;
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
    if (error === terminalError) throw error;
    throw new Error(UNCERTAIN);
  } finally { await reader.cancel().catch(() => {}); }
}
