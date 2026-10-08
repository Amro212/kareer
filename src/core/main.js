import { APP_NAME, APP_VERSION, UI_IDS } from './constants.js';
import { initializeStorage, resetAll } from './storage.js';
import { platform, getHostName } from './platform.js';
import { logger } from './debug.js';
import { mountUI, unmountUI, syncJobContext, toggleUIVisibility, exportUserBackup } from './ui.js';
import { captureJob, detectJobPage } from './jobs.js';
import { restoreSession } from './sessions.js';
import { observeJobPage } from './jobObserver.js';
import { accessibleRoots } from './domRoots.js';
import { isVisible } from './pageClassifier.js';

let pageObserver = null;
let pageTimer = null;
let unsubscribePageNavigation = null;
let scheduleReconciliation = null;

export function refreshPageDetection() {
  scheduleReconciliation?.();
}

function registerMenuCommands() {
  if (!platform.capabilities.menuCommands) return;

  platform.menu.register(`Toggle ${APP_NAME} Panel`, () => {
    toggleUIVisibility();
  });

  platform.menu.register(`Export ${APP_NAME} backup`, () => {
    exportUserBackup();
  });

  platform.menu.register(`Reset ${APP_NAME} Storage`, () => {
    if (confirm(`Reset all ${APP_NAME} profile data, settings, and secrets?`)) {
      resetAll();
      logger.warn('All storage reset to defaults via menu command.');
      window.location.reload();
    }
  });
}

/**
 * Mounts the panel. Callers must await platform.storage.ready() first: core
 * reads storage synchronously, so a host with async storage has to be hydrated.
 */
export function bootstrap() {
  // Only mount the main floating UI in the top-level window (not hidden sub-iframes)
  if (window.self !== window.top) {
    return;
  }

  try {
    initializeStorage();
    registerMenuCommands();
    let reconciliation = 0;
    let lastEvidence = '';
    const reconcile = async () => {
      const token = ++reconciliation;
      const url = document.location.href;
      let evidence = detectJobPage();
      if (!evidence.eligible) {
        const session = await restoreSession(url).catch(() => null);
        evidence = detectJobPage(document, Boolean(session));
      }
      if (!evidence.eligible && platform.capabilities.crossFrame) {
        const iframes = accessibleRoots(document).flatMap(root => [...root.querySelectorAll('iframe')]).filter(isVisible);
        if (iframes.length) {
          const frames = await platform.frames.list().catch(() => []);
          if (iframes.some(iframe => iframe.isConnected && isVisible(iframe) &&
            frames.some(frame => !frame.isTop && frame.applicationEvidence?.eligible && frame.url === iframe.src))) {
            evidence = { eligible: true, reasons: ['embedded-application'] };
          }
        }
      }
      if (token !== reconciliation || document.location.href !== url) return;
      // A user can activate the panel while a frame/session lookup is pending.
      const currentEvidence = detectJobPage();
      if (currentEvidence.eligible) evidence = currentEvidence;
      const signature = JSON.stringify(evidence);
      if (signature !== lastEvidence) {
        lastEvidence = signature;
        logger.info('Page detection', evidence);
      }
      if (!evidence.eligible) {
        unmountUI();
        const root = document.getElementById(UI_IDS.CONTAINER);
        if (root?.getAttribute('data-kr-host') === getHostName()) root.remove();
        return;
      }
      const job = captureJob();
      mountUI();
      syncJobContext(job);
      job.pendingHydration?.then(() => {
        if (document.location.href === job.applicationUrl || document.location.href === job.listingUrl) syncJobContext(job);
      });
    };
    const schedule = () => {
      // Continuous hydration must not postpone detection indefinitely.
      if (pageTimer) return;
      pageTimer = setTimeout(() => { pageTimer = null; void reconcile(); }, 250);
    };
    clearTimeout(pageTimer);
    pageTimer = null;
    scheduleReconciliation = schedule;
    pageObserver?.disconnect();
    pageObserver = observeJobPage(document, schedule);
    unsubscribePageNavigation?.();
    unsubscribePageNavigation = platform.navigation.onChange(schedule);
    reconcile();
    logger.info(`${APP_NAME} v${APP_VERSION} initialized on ${window.location.hostname}`);
  } catch (err) {
    console.error(`[${APP_NAME}] Initialization error:`, err);
  }
}

export function bootstrapWhenReady() {
  const start = () => platform.storage.ready().then(bootstrap);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
