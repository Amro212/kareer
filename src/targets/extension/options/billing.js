import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';

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
  $('plan-status').textContent = subscriptions.length ? subscriptions.map(s => {
    const date = s.periodEnd ? new Date(s.periodEnd).toLocaleDateString() : '';
    if (s.status === 'active') return `Monthly plan renews ${date || 'on your billing date'}.`;
    if (s.status === 'cancelled') return `Monthly plan cancelled. Paid allowance remains until ${date || 'the end of its paid period'}.`;
    if (['past_due', 'unpaid'].includes(s.status)) return 'Monthly payment needs attention. No renewal credits have been added. Open Manage billing.';
    if (s.status === 'paused') return 'Monthly billing is paused. Existing paid credits remain available until expiry.';
    return 'Monthly plan ended. Purchased credits remain available.';
  }).join(' ') : 'No monthly plan. Credit packs work on their own.';
}
async function billing(operation, input) {
  const result = await sendMessage({ type: MSG.BILLING, operation, input });
  if (result?.error) throw new Error(result.error);
  return result;
}
function openBilling(url) {
  if (!/^https:\/\/(?:[a-z0-9-]+\.)?lemonsqueezy\.com\//i.test(url || '')) throw new Error('Billing link unavailable. Use your receipt email to open your order.');
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
      $('purchase-status').textContent = 'Payment verified. Kareer AI is ready.';
      await refresh(); return;
    }
    if (result.status === 'expired') { $('purchase-status').textContent = 'Purchase checks have ended. If you paid, activate the key from your receipt email below.'; $('license-activation').open = true; return; }
    $('purchase-status').textContent = result.unavailable ? 'Payment checks are temporarily unavailable. Retrying while this panel stays open. Your receipt key is the fallback.' : 'Waiting for verified payment and your license key. You can also activate the key from your receipt email.';
    timer = setTimeout(poll, 3000);
  } catch (error) { $('purchase-status').textContent = error.message; }
}
export function setupBilling(snapshot) {
  draw(snapshot.aiStatus || { mode: snapshot.hasApiKey ? 'byok' : 'managed', state: snapshot.hasApiKey ? 'ready' : 'activationNeeded' });
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
  action('disconnect-license', async () => { await billing('disconnect'); await refresh(); $('managed-feedback').textContent = 'Key removed from this browser. Your paid entitlement is unchanged.'; });
  action('manage-billing', async () => { const result = await billing('billing'); await openBilling(result.url || 'https://app.lemonsqueezy.com/my-orders'); $('managed-feedback').textContent = ''; });
  action('start-checkout', async () => {
    const result = await billing('purchase');
    await api.tabs.create({ url: result.url });
    $('managed-feedback').textContent = '';
    await poll();
  });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  api.runtime.onMessage.addListener(message => { if (message.type === MSG.STORAGE_CHANGED && message.aiStatus) draw(message.aiStatus); });
  void refresh();
  void poll();
}
