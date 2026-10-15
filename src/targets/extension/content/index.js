import { setPlatform, platform } from '../../../core/platform.js';
import { bootstrap, refreshPageDetection } from '../../../core/main.js';
import { toggleUIVisibility, refreshRemoteFieldCount } from '../../../core/ui.js';
import { createExtensionHost } from './host.js';
import { startAgent } from './agent.js';
import { api } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';

setPlatform(createExtensionHost());

const isTopFrame = window.self === window.top;

// Popup commands can arrive while the storage snapshot is still hydrating.
// Register immediately and keep the reply channel open until the UI is ready.
if (isTopFrame) {
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (![MSG.TOGGLE_PANEL, MSG.FRAMES_CHANGED].includes(message?.type)) return;
    void platform.storage.ready().then(() => {
      if (message.type === MSG.TOGGLE_PANEL) toggleUIVisibility();
      else { refreshRemoteFieldCount(); refreshPageDetection(); }
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ error: error.message }));
    return true;
  });
}

async function start() {
  // Core reads storage synchronously, so the cache must be filled before the
  // panel or the agent touches it.
  await platform.storage.ready();

  if (isTopFrame) {
    bootstrap();
  }

  startAgent({ isTopFrame });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
