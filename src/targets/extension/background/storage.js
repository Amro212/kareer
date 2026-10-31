import { api } from '../shared/browser.js';
import { SECRET_KEYS, STORAGE_AREA } from '../shared/protocol.js';
import { DEFAULT_PROFILE } from '../../../core/constants.js';

const area = () => api.storage[STORAGE_AREA];
const recordWrites = new Map();
export function updateStoredRecord(key, update) {
  const next = (recordWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = (await area().get(key))[key];
    const value = update(previous);
    if (value) await area().set({ [key]: value });
    return value;
  });
  recordWrites.set(key, next);
  void next.finally(() => { if (recordWrites.get(key) === next) recordWrites.delete(key); }).catch(() => {});
  return next;
}

export function applyProfilePatch(values, expected) {
  if (!values || !expected || typeof values !== 'object' || typeof expected !== 'object'
    || Array.isArray(values) || Array.isArray(expected)) throw new Error('Invalid profile changes.');
  return updateStoredRecord('kr:profile', stored => {
    const previous = { ...DEFAULT_PROFILE, ...stored };
    for (const key of Object.keys(values)) {
      if (!Object.hasOwn(expected, key)
        || JSON.stringify(previous[key] ?? '') !== JSON.stringify(expected[key] ?? '')) {
        throw new Error('This section changed in another window. Reload to review the newer profile before saving.');
      }
    }
    const next = { ...previous, ...values };
    if (Object.hasOwn(values, 'workEligibilities')) {
      const primary = next.workEligibilities.find(item => item.enabled !== false) || next.workEligibilities[0];
      for (const key of ['workCountry', 'workAuthorization', 'sponsorshipNow', 'sponsorshipFuture']) {
        next[key] = key === 'workCountry' ? primary?.country || '' : primary?.[key] || '';
      }
    }
    return next;
  });
}

function isSecret(key) {
  return SECRET_KEYS.includes(key);
}

/**
 * Everything a page context is allowed to see, plus a presence flag standing in
 * for the API key. Content scripts hydrate a synchronous cache from this.
 */
export async function buildSnapshot() {
  const all = await area().get(null);
  const data = {};
  for (const [key, value] of Object.entries(all)) {
    if (!isSecret(key)) data[key] = value;
  }
  return {
    data,
    hasApiKey: Boolean(all['kr:secrets']?.apiKey),
    aiStatus: cachedAiStatus(all),
  };
}

export async function applySet(key, value) {
  if (isSecret(key)) throw new Error(`Refusing to write secret key "${key}" from a page context`);
  // Document activation belongs to the background. A running content script
  // can otherwise overwrite a just-completed generation with its old session.
  if (key.startsWith('kr:sessions:') && value && typeof value === 'object') {
    return updateStoredRecord(key, previous => ({ ...value,
      ...(previous?.materialRefs ? { materialRefs: previous.materialRefs } : {}),
      ...(previous?.materialTasks ? { materialTasks: previous.materialTasks } : {}),
      materialRunRef: previous?.materialRunRef || null,
    }));
  }
  if (key === 'kr:profile') return updateStoredRecord(key, () => value);
  await area().set({ [key]: value });
}

export async function applyDelete(key) {
  if (isSecret(key)) throw new Error(`Refusing to delete secret key "${key}" from a page context`);
  await area().remove(key);
}

export async function writeSecret(apiKey) {
  const clean = typeof apiKey === 'string' ? apiKey.trim() : '';
  await updateStoredRecord('kr:secrets', previous => ({ ...previous, apiKey: clean }));
}

export async function clearSecret() {
  const { mode } = await readAiStatus();
  await updateStoredRecord('kr:settings', previous => ({ ...previous, aiMode: previous?.aiMode || mode }));
  await updateStoredRecord('kr:secrets', previous => ({ ...previous, apiKey: '' }));
}

// Build-time default: Kareer AI (managed) only once it is released; otherwise your own key.
const DEFAULT_MODE = typeof KAREER_MANAGED_DEFAULT === 'boolean' && KAREER_MANAGED_DEFAULT ? 'managed' : 'byok';
export function cachedAiStatus(all) {
  const mode = all['kr:settings']?.aiMode || (all['kr:secrets']?.apiKey ? 'byok' : all['kr:secrets']?.licenseKey ? 'managed' : DEFAULT_MODE);
  if (mode === 'byok') return { mode, state: all['kr:secrets']?.apiKey ? 'ready' : 'activationNeeded' };
  const saved = all['kr:ai-status'] || {};
  return { mode: 'managed', state: all['kr:secrets']?.licenseKey ? saved.state || 'unavailable' : 'activationNeeded',
    monthly: saved.monthly || 0, purchased: saved.purchased || 0, total: saved.total || 0, monthlyExpiresAt: saved.monthlyExpiresAt || null,
    flagged: saved.flagged === true, subscriptions: saved.subscriptions || [] };
}

export async function readAiStatus() {
  const records = await Promise.all(['kr:settings', 'kr:secrets', 'kr:ai-status'].map(key => area().get(key)));
  return cachedAiStatus(Object.assign({}, ...records));
}
export async function readSecrets() { return (await area().get('kr:secrets'))['kr:secrets'] || {}; }
export async function writeLicense(licenseKey) {
  await updateStoredRecord('kr:secrets', previous => ({ ...previous, licenseKey }));
}

export async function readApiKey() {
  const stored = await area().get('kr:secrets');
  const key = stored?.['kr:secrets']?.apiKey;
  return typeof key === 'string' ? key.trim() : '';
}

export async function hasApiKey() {
  return Boolean(await readApiKey());
}
