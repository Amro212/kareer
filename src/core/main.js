import { APP_NAME, APP_VERSION, UI_IDS } from './constants.js';
import { initializeStorage, resetAll } from './storage.js';
import { platform, getHostName } from './platform.js';
import { logger } from './debug.js';
import { mountUI, unmountUI, syncJobContext, toggleUIVisibility, exportUserBackup } from './ui.js';
import { captureJob, isJobPage } from './jobs.js';

let pageObserver = null;
let pageTimer = null;
let unsubscribePageNavigation = null;

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
    const reconcile = () => {
      if (!isJobPage()) {
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
      clearTimeout(pageTimer);
      pageTimer = setTimeout(reconcile, 250);
    };
    pageObserver?.disconnect();
    pageObserver = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (element?.closest(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}`)) return false;
        if (element?.closest('title,script[type="application/ld+json"],h1,h2,[role="heading"],.job__location,.job-location,.ashby-job-posting-left-pane,[data-testid="job-location"],.job-description,.job__description')) return true;
        if (mutation.type === 'characterData') return false;
        return Array.from([...mutation.addedNodes, ...mutation.removedNodes]).some(node => node.nodeType === 1 &&
          !node.matches(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}`) &&
          (node.matches('main,h1,h2,form,input,textarea,iframe,script[type="application/ld+json"],.job__location,.job-description,.job__description') || node.querySelector('h1,h2,form,input,textarea,iframe,script[type="application/ld+json"]')));
      });
      if (relevant) schedule();
    });
    pageObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
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
