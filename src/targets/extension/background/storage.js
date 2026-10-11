import { api } from '../shared/browser.js';
import { SECRET_KEYS, STORAGE_AREA } from '../shared/protocol.js';

const area = () => api.storage[STORAGE_AREA];
const sessionWrites = new Map();
export function updateStoredSession(key, update) {
  const next = (sessionWrites.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = (await area().get(key))[key];
    const value = update(previous);
    if (value) await area().set({ [key]: value });
    return value;
  });
  sessionWrites.set(key, next);
  void next.finally(() => { if (sessionWrites.get(key) === next) sessionWrites.delete(key); }).catch(() => {});
  return next;
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
  };
}

export async function applySet(key, value) {
  if (isSecret(key)) throw new Error(`Refusing to write secret key "${key}" from a page context`);
  // Document activation belongs to the background. A running content script
  // can otherwise overwrite a just-completed generation with its old session.
  if (key.startsWith('kr:sessions:') && value && typeof value === 'object') {
    return updateStoredSession(key, previous => ({ ...value,
      ...(previous?.materialRefs ? { materialRefs: previous.materialRefs } : {}),
      ...(previous?.materialTasks ? { materialTasks: previous.materialTasks } : {}),
      materialRunRef: previous?.materialRunRef || null,
    }));
  }
  await area().set({ [key]: value });
}

export async function applyDelete(key) {
  if (isSecret(key)) throw new Error(`Refusing to delete secret key "${key}" from a page context`);
  await area().remove(key);
}

export async function writeSecret(apiKey) {
  const clean = typeof apiKey === 'string' ? apiKey.trim() : '';
  await area().set({ 'kr:secrets': { apiKey: clean } });
}

export async function clearSecret() {
  await area().remove('kr:secrets');
}

export async function readApiKey() {
  const stored = await area().get('kr:secrets');
  const key = stored?.['kr:secrets']?.apiKey;
  return typeof key === 'string' ? key.trim() : '';
}

export async function hasApiKey() {
  return Boolean(await readApiKey());
}
