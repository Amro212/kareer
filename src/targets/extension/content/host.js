import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { decodeMaterial, encodeMaterial } from '../shared/binary.js';

/**
 * Extension host. Core reads storage synchronously, so this host hydrates a
 * full snapshot once during `storageReady()` and answers reads from memory
 * afterwards. Writes go to the background (the authority) and are applied to the
 * cache immediately so a read-after-write in the same tick sees the new value.
 *
 * The API key is never part of the snapshot. Only a presence flag crosses over.
 */
export function createExtensionHost() {
  const cache = new Map();
  const listeners = new Set();
  const navListeners = new Set();
  let keyPresent = false;
  let aiStatus = { mode: 'byok', state: 'activationNeeded' };
  let hydrated = null;
  // Seeded from the background so a freshly loaded document inherits the tab's
  // navigation count instead of restarting at zero.
  let navigation = { id: 0, url: '', frameId: 0, kind: '', at: 0 };

  function hydrate() {
    return Promise.all([
      sendMessage({ type: MSG.SNAPSHOT }),
      sendMessage({ type: MSG.NAV_STATE }).catch(() => null),
    ]).then(([snapshot, nav]) => {
      if (!snapshot || snapshot.error) {
        throw new Error(snapshot?.error || 'Storage snapshot failed');
      }
      cache.clear();
      for (const [key, value] of Object.entries(snapshot.data)) cache.set(key, value);
      keyPresent = Boolean(snapshot.hasApiKey);
      aiStatus = snapshot.aiStatus || { mode: 'byok', state: keyPresent ? 'ready' : 'activationNeeded' };
      if (nav && !nav.error) navigation = nav;
    });
  }

  // Changes made in other frames or tabs arrive here and refresh the cache.
  api.runtime.onMessage.addListener((message) => {
    if (message?.type === MSG.NAV_COMMITTED && message.navigation) {
      navigation = message.navigation;
      for (const listener of navListeners) {
        try { listener(navigation); } catch {}
      }
      return;
    }
    if (message?.type !== MSG.STORAGE_CHANGED) return;
    for (const [key, value] of Object.entries(message.keys || {})) {
      if (value === null) cache.delete(key);
      else cache.set(key, value);
    }
    if (message.secretChanged) keyPresent = Boolean(message.hasApiKey);
    if (message.aiStatus) aiStatus = message.aiStatus;
    for (const listener of listeners) {
      try { listener(message.keys || {}); } catch {}
    }
  });

  function storageGet(key, defaultValue = null) {
    if (!cache.has(key)) return defaultValue;
    const value = cache.get(key);
    return value === undefined ? defaultValue : value;
  }

  function storageSet(key, value) {
    cache.set(key, value);
    sendMessage({ type: MSG.STORAGE_SET, key, value }).catch((err) => {
      console.error(`[Kareer:Storage] Failed to persist "${key}":`, err);
    });
  }

  function storageDelete(key) {
    cache.delete(key);
    sendMessage({ type: MSG.STORAGE_DELETE, key }).catch((err) => {
      console.error(`[Kareer:Storage] Failed to delete "${key}":`, err);
    });
  }

  async function aiRequest(options) {
    const { headers, ...rest } = options;
    const result = await sendMessage({
      type: MSG.AI_REQUEST,
      options: { ...rest, headers },
    });
    if (!result || result.error) {
      throw new Error(result?.error || 'AI request failed');
    }
    return result;
  }

  return {
    name: 'extension',
    capabilities: {
      // The panel lives in the page. Collecting the key there would expose it to
      // the content script, so the options page owns it instead.
      writeSecretsInPage: false,
      menuCommands: false,
      crossFrame: true,
      fileUpload: true,
      materials: true,
    },
    storageReady: () => (hydrated ||= hydrate()),
    storageGet,
    storageSet,
    storageDelete,
    storageOnExternalChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    secretRead: () => '',
    secretWrite: (apiKey) => {
      sendMessage({ type: MSG.SECRET_WRITE, apiKey }).catch(() => {});
    },
    secretClear: () => {
      sendMessage({ type: MSG.SECRET_CLEAR }).catch(() => {});
    },
    secretHas: () => keyPresent,
    aiStatus: () => aiStatus,
    aiRefresh: async () => { aiStatus = await sendMessage({ type: MSG.AI_STATUS }); return aiStatus; },
    aiRequest,
    tabBind: (sessionId) => {
      sendMessage({ type: MSG.TAB_BIND, sessionId }).catch(() => {});
    },
    tabBoundId: () => sendMessage({ type: MSG.TAB_BOUND_ID })
      .then((res) => res?.sessionId || null)
      .catch(() => null),
    navigationMarker: () => navigation,
    navigationOnChange: (listener) => {
      navListeners.add(listener);
      return () => navListeners.delete(listener);
    },
    framesList: () => sendMessage({ type: MSG.FRAME_LIST })
      .then((res) => res?.frames || [])
      .catch(() => []),
    frameCommand: (frameId, command) => sendMessage({ type: MSG.FRAME_COMMAND, frameId, command: command.materials ? { ...command, materials: Object.fromEntries(Object.entries(command.materials).map(([kind, record]) => [kind, encodeMaterial(record)])) } : command })
      .catch((err) => ({ error: err?.message || 'Frame command failed' })),
    documentsMeta: () => sendMessage({ type: MSG.DOC_META }).then((res) => res?.meta || null).catch(() => null),
    documentsGet: (selection = {}) => sendMessage({ type: MSG.DOC_GET, ...selection }).then((res) => { if (res?.error) throw new Error(res.error); return res; }),
    documentsPut: (doc) => sendMessage({
      type: MSG.DOC_PUT,
      name: doc.name,
      mimeType: doc.mimeType || doc.type,
      buffer: doc.buffer,
    }),
    documentsDelete: () => sendMessage({ type: MSG.DOC_DELETE }),
    materialsRequest: async (operation, input) => {
      const result = await sendMessage({ type: MSG.MATERIALS, operation, input });
      if (result?.error && !result.status) throw new Error(result.error);
      if (operation === 'snapshot') return { ...result, records: Object.fromEntries(Object.entries(result.records).map(([kind, record]) => [kind, decodeMaterial(record)])) };
      return ['get', 'save'].includes(operation) ? decodeMaterial(result) : result;
    },
    openOptions: () => {
      sendMessage({ type: MSG.OPEN_OPTIONS }).catch(() => {});
    },
    menuRegister: () => {},
  };
}
