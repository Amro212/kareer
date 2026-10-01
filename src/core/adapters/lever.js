/**
 * Lever ATS adapter: uppercase section headers (LOCATION, PERSONAL INFORMATION),
 * `.dropdown-location` typeahead with backing JSON hidden input, pronouns checkbox widget,
 * and canonical profile field matching.
 */
import {
  leverFieldMetadata,
  leverValue,
  leverAnswer,
  leverOptionMatches,
  leverNeedsFill,
  leverCanonicalKey,
} from './lever-fields.js';

function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

function lettersOnly(text) {
  return String(text || '').replace(/[^A-Za-z]/g, '');
}

export function isAllCapsHeading(text) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  const letters = lettersOnly(trimmed);
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase();
}

function visible(element) {
  if (!element || !(element instanceof element.ownerDocument?.defaultView?.Element || element instanceof Element)) return false;
  if (element.closest?.('[hidden], [aria-hidden="true"]')) return false;
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const view = node.ownerDocument?.defaultView;
    const style = view?.getComputedStyle ? view.getComputedStyle(node) : node.style;
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}


export const leverAdapter = {
  id: 'lever',
  label: 'Lever',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)lever\.co$/i.test(host)) return true;
    const input = doc?.querySelector?.('input.location-input[name="location"]');
    return Boolean(input?.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: false,
  },
  fieldMetadata: leverFieldMetadata,
  profileValue: leverValue,
  resolveAnswer: leverAnswer,
  optionMatches: leverOptionMatches,
  needsFill: leverNeedsFill,
  searchQuery(field, value) {
    return value;
  },
  choiceGroups(root, profile = {}) {
    return Array.from(root.querySelectorAll('#candidatePronounsCheckboxes')).map(container => {
      const elements = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      const customInput = container.querySelector('#customPronounsTextField');
      const explicit = profile.pronouns?.trim() || '';
      const standard = elements.filter(el => el.id !== 'customPronounsOption');
      const customValue = explicit && !standard.some(el => el.value.toLowerCase() === explicit.toLowerCase()) &&
        !/prefer not|decline|[,;]/i.test(explicit) && explicit.length <= (customInput?.maxLength || 40) ? explicit : '';
      const field = {
        id: container.id, name: 'pronouns', type: 'radio', widget: 'lever-pronouns',
        element: container, elements, customInput, customValue,
        label: 'Pronouns', description: container.querySelector('.description')?.textContent.trim() || '',
        required: false, constraints: {}, isNarrative: false,
        ats: { adapter: 'lever', canonicalKey: 'pronouns' },
        options: elements.map(el => ({ value: el.id === 'customPronounsOption' && customValue ? customValue : el.value,
          label: el.id === 'customPronounsOption' && customValue ? customValue : el.value })),
      };
      field.currentValue = this.readChoice(field).join(', ');
      return field;
    });
  },
  readChoice(field) {
    if (field.widget !== 'lever-pronouns') return null;
    return field.elements.filter(el => el.checked).map(el => el.id === 'customPronounsOption'
      ? field.customInput?.value.trim() || 'Custom' : el.value);
  },
  fillChoice(field, value, { checkbox, text }) {
    if (field.widget !== 'lever-pronouns') return null;
    const target = field.elements.find(el => (el.id === 'customPronounsOption' ? field.customValue : el.value) === value);
    if (!target) return false;
    for (const el of field.elements) if (el !== target && el.checked) checkbox(el, false);
    if (!target.checked) checkbox(target, true);
    if (target.id === 'customPronounsOption') text(field.customInput, value);
    return true;
  },
  afterComboboxSearch(input, value) {
    if (!this.isCombobox(input)) return;
    input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', {
      key: value ? value.slice(-1) : 'Backspace', bubbles: true, composed: true,
    }));
  },
  isSectionHeading(text, node) {
    if (!isAllCapsHeading(text)) return false;
    if (!node) return true;
    const tag = node.tagName || '';
    if (/^H[1-6]$/.test(tag)) return true;
    return /(section|heading|header|category)/i.test(node.className || '');
  },
  isCombobox(element) {
    return Boolean(
      element?.matches?.('input.location-input[name="location"]') &&
      element.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]'),
    );
  },
  readComboboxSelection(element) {
    if (this.isCombobox(element)) {
      const hidden = element.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]');
      if (hidden?.value) {
        try {
          const parsed = JSON.parse(hidden.value);
          if (parsed?.name) return [parsed.name];
        } catch {}
      }
      return [];
    }
    return [];
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element?.parentElement) return null;
    const menus = Array.from(element.parentElement.querySelectorAll('.dropdown-container'));
    return menus.length ? menus : null;
  },
  comboboxOptionSelector() {
    return '.dropdown-results > .dropdown-location';
  },
  uploadState(element) {
    if (element?.type !== 'file') return null;
    const attached = element.files?.[0]?.name || '';
    const container = element.closest('.application-question, .custom-question, form') || element.parentElement;
    const nameEl = container?.querySelector('.filename, .resume-upload-filename');
    const statusEl = container?.querySelector('.resume-upload-status');
    const name = nameEl?.textContent?.trim() || statusEl?.textContent?.trim() || attached;
    const busyEls = Array.from(container?.querySelectorAll('.analyzing-resume, .resume-upload-working, [aria-busy="true"]') || []);
    const busy = busyEls.some(visible);
    const failureEls = Array.from(container?.querySelectorAll('.resume-upload-failure, .resume-upload-oversize, [aria-invalid="true"]') || []);
    const failure = failureEls.some(visible);
    const successEls = Array.from(container?.querySelectorAll('.resume-upload-success') || []);
    const success = successEls.some(visible) || Boolean(container?.querySelector('.visible-resume-upload.has-file'));
    const accepted = Boolean(name && !busy && !failure && (success || !successEls.length));
    return { name, accepted };
  },
  uploadBusy(doc) {
    const busyEls = Array.from(doc?.querySelectorAll?.('.analyzing-resume, .resume-upload-working, [aria-busy="true"]') || []);
    if (busyEls.some(visible)) return true;
    return Array.from(doc?.querySelectorAll?.('input[type="file"]') || []).some(
      el => el.files?.length && this.uploadState(el)?.accepted === false
    );
  },
};

