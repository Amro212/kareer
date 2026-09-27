/**
 * Workday: step identity from the progress bar, Continue that stays disabled
 * while a slow save finishes, and custom dropdowns that roll back on Escape.
 */
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const workdayAdapter = {
  id: 'workday',
  label: 'Workday',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)myworkdayjobs\.com$|(?:^|\.)workday\.com$/i.test(host)) return true;
    return Boolean(doc?.querySelector?.(
      '[data-automation-id="bottom-navigation-next-button"], [data-automation-id="progressBar"], [data-automation-id="pageFooterNextButton"], [data-automation-id="page-footer-next-button"], [data-automation-id="saveAndContinueButton"], [data-automation-id="save-and-continue-button"]',
    ));
  },
  quirks: {
    waitForContinueEnabled: true,
    continueReadyTimeoutMs: 15000,
    comboboxEscapeRollback: true,
    placesLocation: false,
    stepReviewPause: true,
  },
  isSectionHeading() {
    return false;
  },
  isCombobox(element) {
    return Boolean(element?.matches?.(
      '[data-automation-id][aria-haspopup="listbox"], [data-automation-id$="Dropdown"], [data-automation-id$="Select"], [data-automation-id="promptInput"], input[data-automation-id*="search" i][role="combobox"]',
    ));
  },
  continueControl(doc) {
    return doc?.querySelector?.(
      '[data-automation-id="bottom-navigation-next-button"], [data-automation-id="pageFooterNextButton"], [data-automation-id="saveAndContinueButton"], button[data-automation-id*="next" i], button[data-automation-id*="continue" i]',
    ) || null;
  },
  stepMarker(doc) {
    if (!doc) return '';
    const current = doc.querySelector(
      '[data-automation-id="progressBar"] [aria-current="step"], [data-automation-id="progressBar"] [aria-current="true"], [data-automation-id="currentPage"], [data-automation-id="activeStep"], [data-automation-id="stepTitle"]',
    );
    return (current?.textContent || '').replace(/\s+/g, ' ').trim();
  },
  comboboxMenus() {
    return null;
  },
  comboboxOptionSelector() {
    return '[data-automation-id="promptOption"], [data-automation-id$="ListItem"], [data-automation-id="select-item"]';
  },
};
