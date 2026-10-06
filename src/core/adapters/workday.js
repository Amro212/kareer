/**
 * Workday: step identity from the progress bar, Continue that stays disabled
 * while a slow save finishes, and custom dropdowns that roll back on Escape.
 */
import { PROMPT, workdayPromptContainer, workdayFieldMetadata, workdayValue, workdayAnswer, workdayNeedsFill, workdayOptionMatches } from './workday-fields.js';
import { prepareWorkdaySections, prepareWorkdayDependencies } from './workday-sections.js';
import { extractOptionLabel } from '../fields/labels.js';

const owners = new WeakMap();
const activated = new WeakMap();
const searches = new WeakMap();
const POPUPS = '[data-automation-activepopup="true"], [visibility="opened"], [data-automation-id="activeListContainer"]';
const visible = node => !node.closest('[hidden],[aria-hidden="true"]') && node.ownerDocument.defaultView.getComputedStyle(node).display !== 'none' && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden';
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
const placeholder = text => /^(?:select(?: one| an? option)?|choose(?: one| an? option)?|no (?:items|results|matches)|sélectionner(?: un)?|--.*--)$/i.test(clean(text));
function enter(input) {
  for (const type of ['keydown', 'keyup']) {
    const event = new input.ownerDocument.defaultView.KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true, cancelable: true });
    event.preventDefault();
    input.dispatchEvent(event);
  }
}
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const workdayAdapter = {
  id: 'workday',
  label: 'Workday',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)(?:myworkdayjobs|myworkdaysite|workday)\.com$/i.test(host)) return true;
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
    return Boolean(element?.matches?.('input:not([type="hidden"])') && element.closest(PROMPT)) || Boolean(element?.matches?.(
      '[data-automation-id][aria-haspopup="listbox"], [data-automation-id$="Dropdown"], [data-automation-id$="Select"], [data-automation-id="promptInput"], input[data-automation-id*="search" i][role="combobox"]',
    ));
  },
  continueControl(doc) {
    const control = doc?.querySelector?.(
      '[data-automation-id="bottom-navigation-next-button"], [data-automation-id="pageFooterNextButton"], [data-automation-id="saveAndContinueButton"], button[data-automation-id*="next" i], button[data-automation-id*="continue" i]',
    ) || null;
    return control && !/submit|send application|soumettre|envoyer/i.test(control.textContent) ? control : null;
  },
  stepMarker(doc) {
    if (!doc) return '';
    const current = doc.querySelector(
      '[data-automation-id="progressBar"] [aria-current="step"], [data-automation-id="progressBar"] [aria-current="true"], [data-automation-id="currentPage"], [data-automation-id="activeStep"], [data-automation-id="stepTitle"]',
    );
    return (current?.textContent || '').replace(/\s+/g, ' ').trim();
  },
  fieldMetadata: workdayFieldMetadata,
  profileValue: workdayValue,
  resolveAnswer: workdayAnswer,
  optionMatches: workdayOptionMatches,
  searchQuery(field, value) {
    const canonical = field?.ats?.canonicalKey || workdayFieldMetadata(field?.element || field).ats?.canonicalKey;
    if (canonical === 'ethnicity' && /middle eastern|mena/i.test(value)) return 'Arab';
    return value;
  },
  needsFill: workdayNeedsFill,
  prepareSections: prepareWorkdaySections,
  prepareFields: prepareWorkdayDependencies,
  uploadState(element) {
    const container = element.closest('[data-automation-id="resumeUpload"], [data-automation-id="quickApplyUpload"], [data-fkit-id*="resume"]');
    if (!container) return null;
    const attached = element.files?.[0]?.name || '';
    const items = [...container.querySelectorAll('[data-automation-id="file-upload-item"]')].filter(visible);
    const names = items.map(item => clean(item.querySelector('[data-automation-id="file-upload-file-name"], [data-automation-id="file-upload-name"]')?.textContent || (attached && item.textContent.includes(attached) ? attached : ''))).filter(Boolean);
    const busy = container.querySelector('[aria-busy="true"], [role="progressbar"]');
    const rejected = container.querySelector('[data-automation-id="inputError"], [aria-invalid="true"]');
    return { name: names.length === 1 ? names[0] : '', accepted: names.length === 1 && !busy && !rejected };
  },
  uploadBusy(doc) {
    return [...doc.querySelectorAll('input[type="file"]')].some(element => element.files?.length && this.uploadState(element)?.accepted === false);
  },
  choiceGroups(root) {
    return [...root.querySelectorAll('[data-automation-id*="ethnicity"], [data-automation-id*="ethnicities"], [data-automation-id="formField-disability"], [data-automation-id="formField-disabilities"], [data-automation-id="formField-veteran"]')].flatMap(container => {
      const elements = [...container.querySelectorAll('input[type="checkbox"], input[type="radio"]')];
      if (elements.length < 2 || elements.some(element => !visible(element))) return [];
      const metadata = workdayFieldMetadata(elements[0]);
      if (!['ethnicity', 'disability_v2', 'veteran_v2'].includes(metadata.ats.canonicalKey)) return [];
      const multiple = metadata.ats.canonicalKey === 'ethnicity' && elements.every(element => element.type === 'checkbox');
      const field = { ...metadata, id: container.id || container.getAttribute('data-automation-id'), ats: { ...metadata.ats, multiple },
        type: multiple ? 'checkbox' : 'radio', widget: 'workday-choice', element: container, elements, constraints: {},
        options: elements.map(element => ({ value: element.value, label: extractOptionLabel(element) })), isNarrative: false };
      field.currentValue = this.readChoice(field).join(', ');
      return [field];
    }).filter((field, index, fields) => !fields.some((other, otherIndex) => otherIndex < index && other.element.contains(field.element)));
  },
  readChoice(field) {
    return field.elements.filter(element => element.checked).map(element => element.value);
  },
  fillChoice(field, value, { checkbox }) {
    const values = Array.isArray(value) ? value : [value];
    if (!field.ats.multiple && values.length !== 1) return false;
    if (values.some(value => !field.options.some(option => option.value === value))) return false;
    for (const element of field.elements) {
      if (element.disabled) { if (values.includes(element.value) && !element.checked) return false; continue; }
      const wanted = values.includes(element.value);
      if (field.ats.multiple && !wanted) continue;
      if (element.checked !== wanted) checkbox(element, wanted);
    }
    return true;
  },
  comboboxParts(element) {
    const container = workdayPromptContainer(element);
    if (container) {
      const input = element.matches('input') ? element : container.querySelector('input:not([type="hidden"])');
      return { container, input, controlBox: input || element, toggleBtn: container.querySelector('button[aria-label*="open" i]') };
    }
    // Single-select button listbox (e.g. Gender): no searchable input, button is the control.
    if (element.matches('button[aria-haspopup="listbox"]')) {
      return { container: element.closest('[data-automation-id^="formField"]') || element.parentElement, input: null, controlBox: element, toggleBtn: null };
    }
    return null;
  },
  beforeComboboxOpen(element) {
    const prior = owners.get(element.ownerDocument);
    if (prior?.element === element) return;
    owners.set(element.ownerDocument, { element, before: new Map([...element.ownerDocument.querySelectorAll(POPUPS)].filter(visible).map(menu => [menu, menu.innerHTML])) });
  },
  comboboxMenus(element) {
    const container = workdayPromptContainer(element) || element.closest('[data-automation-id^="formField"],.field');
    const local = container && [...container.querySelectorAll('[role="listbox"], [data-automation-id="activeListContainer"]')];
    if (local?.length) return local;
    const owner = owners.get(element.ownerDocument);
    if (owner?.element !== element && owner?.element !== this.comboboxParts(element)?.input) return [];
    const active = element.ownerDocument.activeElement;
    const inPopup = [...element.ownerDocument.querySelectorAll(POPUPS)].some(p => p.contains(active));
    if (active !== element && !container?.contains(active) && !inPopup) return [];
    const menus = [...element.ownerDocument.querySelectorAll(POPUPS)].filter(menu => visible(menu) && (!owner.before.has(menu) || owner.before.get(menu) !== menu.innerHTML));
    const outer = menus.filter(menu => !menus.some(other => other !== menu && other.contains(menu)));
    return outer.length === 1 ? outer : [];
  },
  comboboxOptionSelector() {
    return '[data-automation-id="promptLeafNode"], [role="option"]:not([data-automation-id="promptLeafNode"] [role="option"]), [data-automation-id="promptOption"]:not([data-automation-id="promptLeafNode"] [data-automation-id="promptOption"]), [data-automation-id$="ListItem"], [data-automation-id="select-item"]';
  },
  readComboboxSelection(element) {
    const container = workdayPromptContainer(element);
    if (container) {
      const values = [...container.querySelectorAll('[data-automation-id="selectedItem"]')].map(node => clean(node.getAttribute('title') || node.textContent)).filter(value => value && !placeholder(value));
      return [...new Set(values)];
    }
    if (element.matches('input')) {
      const value = activated.get(element);
      return value && element.value === value ? [value] : [];
    }
    if (element.matches('button')) {
      const value = clean(element.textContent);
      return value && !placeholder(value) ? [value] : [];
    }
    return [];
  },
  recordComboboxSelection(element, label) {
    if (!element.closest(PROMPT) && element.matches('input')) {
      activated.set(element, label);
      element.addEventListener('input', () => activated.delete(element), { once: true });
    }
  },
  afterComboboxSearch(input, value) {
    searches.set(input, { groups: new Set(), advances: 0 });
    if (!value || !input.closest(PROMPT)) return;
    this.beforeComboboxOpen(input);
    enter(input);
  },
  afterComboboxOptionClick(element, option, options) {
    // Some skills prompts accept their first search result only with Enter.
    // Never choose another result or treat search text as a selected token.
    if (workdayFieldMetadata(element).ats.canonicalKey !== 'skill' || options[0] !== option.element || !option.element.isConnected || this.readComboboxSelection(element).some(value => clean(value) === clean(option.label))) return;
    const input = this.comboboxParts(element)?.input;
    if (input) { input.focus(); enter(input); }
  },
  advanceComboboxSearch(element, query, menus) {
    const input = this.comboboxParts(element)?.input || element;
    const state = searches.get(input) || { groups: new Set(), advances: 0 };
    searches.set(input, state);
    if (state.advances >= 20) return false;
    // Only the source recipe has a known group path. Never pick arbitrary
    // prompt groups or use a group label as the answer.
    const canonical = workdayFieldMetadata(element).ats.canonicalKey;
    if (canonical === 'source' && /^linkedin(?: jobs)?$/i.test(query)) {
      const groups = menus.flatMap(menu => [...menu.querySelectorAll('[data-automation-id="promptTitle"], [data-automation-id="promptOptionGroup"]')])
        .filter(node => /^(job boards?|social media|social networks?)$/i.test(clean(node.getAttribute('data-automation-label') || node.textContent)) && !state.groups.has(clean(node.textContent)));
      if (groups.length === 1) {
        const group = groups[0]; state.groups.add(clean(group.textContent)); state.advances++;
        const event = new element.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
        if (group.closest('button')?.type === 'submit') event.preventDefault();
        group.dispatchEvent(event); return true;
      }
    }
    const grids = menus.flatMap(menu => [...menu.querySelectorAll('.ReactVirtualized__Grid')]);
    if (grids.length !== 1) return false;
    const grid = grids[0], before = grid.scrollTop;
    const next = Math.min(grid.scrollHeight - grid.clientHeight, before + (grid.clientHeight || 200));
    if (next <= before) return false;
    state.advances++; grid.scrollTop = next;
    grid.dispatchEvent(new element.ownerDocument.defaultView.Event('scroll', { bubbles: true }));
    return true;
  },
  validationErrors(fields, doc) {
    return [...doc.querySelectorAll('[data-automation-id="inputError"]')].filter(node => visible(node) && clean(node.textContent)).map(node => {
      const container = node.closest('[data-automation-id^="formField"], .field');
      const candidates = fields.filter(field => container?.contains(field.element));
      return { fieldId: candidates.length === 1 ? candidates[0].id : null, kind: 'semantic', message: clean(node.textContent).slice(0, 500) };
    });
  },
};
