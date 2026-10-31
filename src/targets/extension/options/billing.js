import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { SUPPORT_EMAIL } from '../../../core/endpoints.js';
import OFFERS from '../../../core/offers.json' with { type: 'json' };

const $ = id => document.getElementById(id);
const labels = { ready: 'Ready', activationNeeded: 'Activation needed', outOfCredits: 'Out of credits', unavailable: 'Temporarily unavailable' };
let bound = false, timer;
function draw(status) {
  const managed = status?.mode !== 'byok';
  $('ai-mode').value = managed ? 'managed' : 'byok';
  $('managed-ai').hidden = !managed;
  $('byok-connection').hidden = managed;
  $('byok-model').hidden = managed;
  if (!managed) $('advanced-ai').open = true;
  $('managed-state').textContent = labels[status?.state] || labels.unavailable;
  $('managed-state').className = `badge ${status?.state === 'ready' ? 'ok' : 'warn'}`;
  $('usage-details').hidden = status?.state === 'activationNeeded';
  $('monthly-balance').textContent = String(status?.monthly || 0);
  $('purchased-balance').textContent = String(status?.purchased || 0);
  $('monthly-expiry').textContent = status?.monthlyExpiresAt ? `Monthly credits expire ${new Date(status.monthlyExpiresAt).toLocaleString()}. Purchased credits never expire.` : 'Purchased credits never expire.';
  const subscriptions = status?.subscriptions || [];
  $('plan-status').textContent = [status?.flagged ? `A payment on this key is disputed. Its credits are on hold and new purchases are paused. Email ${SUPPORT_EMAIL} with questions.` : '',
    subscriptions.length ? subscriptions.map(planText).join(' ') : 'No monthly plan. Credit packs work on their own.'].filter(Boolean).join(' ');
}
function planText(s) {
  const date = s.periodEnd ? new Date(s.periodEnd).toLocaleDateString() : '';
  const until = date || 'the end of the paid period';
  if (['active', 'trialing'].includes(s.status) && s.cancelAtPeriodEnd) return `Monthly plan cancelled. It stays active and its credits remain until ${until}.`;
  if (s.status === 'active') return `Monthly plan renews ${date || 'on your billing date'}.`;
  if (s.status === 'trialing') return `Monthly plan trial. Billing starts ${date || 'at the end of the trial'}.`;
  if (['past_due', 'unpaid'].includes(s.status)) return 'Monthly payment failed. No renewal credits were added. Open Manage billing to update your card.';
  if (s.status === 'incomplete') return 'Monthly payment is not finished yet. Open Manage billing to complete it.';
  if (s.status === 'paused') return 'Monthly billing is paused. Existing credits remain until they expire.';
  return 'Monthly plan ended. Purchased credits remain available.';
}
async function billing(operation, input) {
  const result = await sendMessage({ type: MSG.BILLING, operation, input });
  if (result?.error) throw new Error(result.error);
  return result;
}
function openBilling(url) {
  if (!/^https:\/\/billing\.stripe\.com\//.test(url || '')) throw new Error(`Billing is unavailable right now. Try again later, or email ${SUPPORT_EMAIL}.`);
  return api.tabs.create({ url });
}
function action(button, work, feedbackId = 'managed-feedback') {
  $(button).onclick = async () => {
    $(button).disabled = true;
    $(button).setAttribute('aria-busy', 'true');
    const feedback = $(feedbackId);
    feedback.classList.remove('error');
    feedback.textContent = 'Working…';
    try { await work(); }
    catch (error) { feedback.textContent = error.message; feedback.classList.add('error'); }
    finally { $(button).removeAttribute('aria-busy'); $(button).disabled = button === 'activate-license' && !$('license-key').value.trim(); }
  };
}
async function refresh() {
  const status = await sendMessage({ type: MSG.AI_STATUS });
  draw(status);
  return status;
}
async function poll() {
  clearTimeout(timer);
  if ($('managed-ai').hidden) return;
  try {
    const result = await billing('claim');
    if (result.status === 'idle') { $('purchase-status').textContent = ''; return; }
    if (result.status === 'complete') {
      $('purchase-status').textContent = 'Payment verified. Kareer AI is ready. Use Show key to save your key for another browser.';
      await refresh(); return;
    }
    if (result.status === 'expired') { $('purchase-status').textContent = `Kareer stopped checking for this purchase. If you paid and Kareer did not activate, email ${SUPPORT_EMAIL}.`; return; }
    $('purchase-status').textContent = result.unavailable ? 'Payment checks are temporarily unavailable. Kareer keeps retrying while Settings is open.'
      : 'Waiting for payment. Kareer activates on its own once Stripe confirms it, even if you close Settings and open it again later.';
    timer = setTimeout(poll, 5000);
  } catch (error) { $('purchase-status').textContent = error.message; }
}
export function setupBilling(snapshot) {
  draw(snapshot.aiStatus || { mode: 'byok', state: snapshot.hasApiKey ? 'ready' : 'activationNeeded' });
  if (bound) return;
  bound = true;
  $('ai-mode').onchange = async () => {
    const snapshot = await sendMessage({ type: MSG.SNAPSHOT });
    await sendMessage({ type: MSG.STORAGE_SET, key: 'kr:settings', value: { ...snapshot.data['kr:settings'], aiMode: $('ai-mode').value } });
    await refresh(); void poll();
  };
  action('activate-license', async () => {
    await billing('activate', { licenseKey: $('license-key').value });
    $('license-key').value = '';
    await refresh(); $('activation-feedback').textContent = 'Key activated. Kareer AI is ready.';
  }, 'activation-feedback');
  $('license-key').oninput = () => { $('activate-license').disabled = !$('license-key').value.trim(); };
  action('refresh-usage', async () => { await refresh(); $('managed-feedback').textContent = 'Usage refreshed. Connection checks use no credits.'; });
  action('reveal-license', async () => {
    const { licenseKey } = await billing('revealKey');
    $('license-value').value = licenseKey || '';
    $('license-reveal').hidden = !licenseKey;
    $('managed-feedback').textContent = licenseKey ? '' : 'No key is saved in this browser.';
  });
  action('disconnect-license', async () => {
    $('license-reveal').hidden = true; $('license-value').value = ''; await billing('disconnect'); await refresh(); $('managed-feedback').textContent = 'Key removed from this browser. Your paid entitlement is unchanged.'; });
  action('manage-billing', async () => { const result = await billing('billing'); await openBilling(result.url); $('managed-feedback').textContent = ''; });
  const checkout = offer => async () => {
    const result = await billing('purchase', offer ? { offer } : {});
    await api.tabs.create({ url: result.url });
    $('managed-feedback').textContent = '';
    await poll();
  };
  $('ai-plans').replaceChildren(...Object.entries(OFFERS).map(([key, offer]) => {
    const item = document.createElement('li'), copy = document.createElement('div');
    const name = document.createElement('strong'), line = document.createElement('span'), button = document.createElement('button');
    name.textContent = `${offer.name} · ${offer.price} ${offer.cadence}`;
    line.textContent = offer.summary;
    button.id = `buy-${key}`;
    button.textContent = key === 'monthly' ? 'Subscribe' : 'Buy pack';
    button.setAttribute('aria-label', `${button.textContent}: ${offer.name}, ${offer.price} ${offer.cadence}`);
    copy.append(name, line);
    item.append(copy, button);
    return item;
  }));
  for (const key of Object.keys(OFFERS)) action(`buy-${key}`, checkout(key));
  action('start-checkout', checkout());
  window.addEventListener('pagehide', () => clearTimeout(timer));
  api.runtime.onMessage.addListener(message => { if (message.type === MSG.STORAGE_CHANGED && message.aiStatus) draw(message.aiStatus); });
  void refresh();
  void poll();
}
