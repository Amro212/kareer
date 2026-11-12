import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { APP_VERSION, STORAGE_KEYS } from '../../../core/constants.js';

const $ = (id) => document.getElementById(id);

const isPageTab = (tab) => /^https?:/.test(tab?.url || '');

/**
 * Normally the active tab is the page under the popup. When the popup is opened
 * as a tab itself, or the active tab is an extension page, fall back to the most
 * recently used real page in the window.
 */
function activeTab() {
  return new Promise((resolve) => {
    api.tabs.query({ currentWindow: true }, (tabs) => {
      const list = tabs || [];
      const active = list.find((tab) => tab.active);
      if (isPageTab(active)) {
        resolve(active);
        return;
      }
      const recent = list
        .filter(isPageTab)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      resolve(recent[0] || active || null);
    });
  });
}

function askFrames(tabId) {
  return sendMessage({ type: MSG.FRAME_LIST, tabId }).catch(() => null);
}

async function init() {
  $('version').textContent = `v${APP_VERSION}`;

  const snapshot = await sendMessage({ type: MSG.SNAPSHOT }).catch(() => null);
  const settings = snapshot?.data?.[STORAGE_KEYS.SETTINGS] || {};
  function showStatus(status) {
    const managed = status?.mode !== 'byok';
    $('model').textContent = managed ? 'Kareer AI' : settings.model || 'OpenRouter';
    $('credits').textContent = managed ? String(status?.total || 0) : 'Personal API key';
    const badge = $('key-status');
    badge.textContent = managed ? ({ ready: 'Ready', activationNeeded: 'Activation needed', outOfCredits: 'Out of credits', unavailable: 'Temporarily unavailable' }[status?.state] || 'Temporarily unavailable') : snapshot?.hasApiKey ? 'Key saved' : 'No key';
    badge.className = `badge ${status?.state === 'ready' ? 'ok' : 'warn'}`;
  }
  showStatus(snapshot?.aiStatus);
  void sendMessage({ type: MSG.AI_STATUS }).then(showStatus).catch(() => {});

  const tab = await activeTab();
  if (tab?.id !== undefined) {
    const response = await askFrames(tab.id);
    const frames = response?.frames || [];
    if (frames.length) {
      const withFields = frames.filter((f) => f.fieldCount > 0);
      const top = frames.find((f) => f.isTop);
      $('field-count').textContent = String(frames.reduce((sum, f) => sum + f.fieldCount, 0));
      if (withFields.length && !top?.fieldCount) {
        $('note').textContent = 'Open the panel to fill this application.';
      }
    } else {
      $('field-count').textContent = '0';
      $('note').textContent = 'Open a job application. Reload the page if the panel is missing.';
    }
  }

  $('toggle-panel').onclick = async () => {
    const current = await activeTab();
    if (current?.id === undefined) return;
    api.tabs.sendMessage(current.id, { type: MSG.TOGGLE_PANEL }, { frameId: 0 }, () => void api.runtime.lastError);
    window.close();
  };

  $('open-options').onclick = () => {
    api.runtime.openOptionsPage();
    window.close();
  };
  $('open-materials').onclick = async () => {
    await sendMessage({ type: MSG.MATERIALS, operation: 'open' });
    window.close();
  };
}

init().catch((err) => {
  $('note').textContent = `Error: ${err.message}`;
});
