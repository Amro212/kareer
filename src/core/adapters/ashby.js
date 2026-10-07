/**
 * Ashby: custom selects without always exposing ARIA, plus dynamic sections
 * that appear after a radio choice. Detection is hostname + distinctive markup.
 */
import { applicationMetadata, applicationProfileValue, applicationAnswer, applicationNeedsFill, checkboxQuestions, fillCheckboxQuestion, applicationUploadState } from './application-fields.js';
import { prepareApplicationSections, prepareApplicationDependencies } from './application-sections.js';
import { applicationOptionMatches, DISCLOSURES } from './application-fields.js';

const FORM = '.ashby-application-form,form[data-ashby-root],[aria-labelledby="job-application-form"]';
const ROW = '[class*="repeatableEducationEntry"]';
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const ashbyAdapter = {
  id: 'ashby',
  label: 'Ashby',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)ashbyhq\.com$/i.test(host)) return true;
    return Boolean(doc?.querySelector?.('#ashby_embed, [data-ashby-root], .ashby-application-form, .ashby-select-input, .ashby-application-form-field-entry'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: false,
  },
  applicationRoot: doc => doc.querySelector(FORM),
  excludeField: element => Boolean(element.closest('[role=listbox],.ashby-select-menu,[class*="jobFilter"]')),
  profileValue: applicationProfileValue,
  resolveAnswer: applicationAnswer,
  searchQuery: (field, value) => DISCLOSURES.has(field.ats?.canonicalKey) || ['work_auth','sponsorship'].includes(field.ats?.canonicalKey) ? '' : value,
  optionMatches: applicationOptionMatches,
  needsFill: applicationNeedsFill,
  prepareSections(doc, profile, options) { return prepareApplicationSections(doc, profile, this, [
    {section:':is(div,fieldset,section):has(> button[class*="repeatableEducationAddButton"]),.ashby-application-form-field-entry:has([class*="repeatableEducationAddButton"])',row:ROW,add:'button[class*="repeatableEducationAddButton"]',records:'education',identity:['institution','degree']},
  ], options); },
  prepareFields: prepareApplicationDependencies,
  applyControl: doc => doc.querySelector('a[href$="/application"],a[href*="/application?"]'),
  submitControl: doc => doc.querySelector('.ashby-application-form-submit-button'),
  confirmation: doc => Boolean(doc.querySelector('[class*="application-form-success-container"]')),
  fieldMetadata(element) {
    // Ashby nests texting consent inside the phone entry; it is its own question.
    const consent = element?.closest?.('.ashby-application-form-texting-consent-description');
    if (consent && element.matches('input[type="radio"][name="communicationConsent"]')) {
      return {
        id: element.name,
        label: (consent.querySelector('p')?.textContent || 'Receive text message updates about this application?').replace(/\s+/g, ' ').trim(),
        description: '',
        required: Boolean(element.required || element.getAttribute('aria-required') === 'true'),
        ats: { adapter: 'ashby', version: 1, canonicalKey: '', multiple: false },
      };
    }
    const container = element?.closest?.('.ashby-application-form-field-entry,[class*="fieldEntry"],fieldset');
    const row = element.closest(ROW);
    let owner = element.parentElement;
    while (row && owner !== row && !owner?.querySelector('.ashby-application-form-question-title')) owner = owner.parentElement;
    let title = (row ? owner : container)?.querySelector('.ashby-application-form-question-title');
    if (row && element.type==='checkbox' && /isCurrent/i.test(element.id)) {
      title=element.ownerDocument.createElement('label');
      title.textContent=element.parentElement.parentElement.textContent.trim();
    }
    if (row && element.matches('select') && /^(Month|Year)/i.test(element.options[0]?.textContent || '')) {
      const dateTitle = title?.textContent.trim() || '';
      title = element.ownerDocument.createElement('label');
      title.textContent = `${dateTitle} ${/^Month/i.test(element.options[0].textContent) ? 'Month' : 'Year'}`;
    }
    const metadata = applicationMetadata(element, 'ashby', {container,title,rowSelector:ROW});
    if (!title) {
      const parser = element.closest('.ashby-application-form-autofill-input-root');
      return parser ? { ...metadata, label: parser.querySelector('.ashby-application-form-autofill-input-title')?.textContent.trim() || 'Autofill from resume' } : metadata;
    }
    return {
      ...metadata,
      id: metadata.id || container.getAttribute('data-field-path') || container.getAttribute('data-field-entry-id') || title.getAttribute('for') || element.id || element.name,
      label: title.textContent.trim(),
      description: container.querySelector('.ashby-application-form-question-description')?.textContent.trim() || '',
      required: Boolean(element.required || element.getAttribute('aria-required') === 'true' || /(?:^|\s)_required_/.test(title.className)),
    };
  },
  choiceGroups(root) {
    return [...checkboxQuestions(root, this), ...Array.from(root.querySelectorAll('.ashby-application-form-input-yesno')).map(container => {
      const elements = Array.from(container.querySelectorAll('button[data-option]'));
      const field = {
        ...this.fieldMetadata(container), type: 'radio', widget: 'ashby-yesno', element: container, elements,
        options: elements.map(el => ({ value: el.textContent.trim(), label: el.textContent.trim() })),
        constraints: {}, isNarrative: false,
      };
      field.currentValue = this.readChoice(field).join(', ');
      return field;
    }).filter(field => field.id && field.options.length)];
  },
  readChoice(field) {
    if (field.widget === 'ats-choice') return field.elements.flatMap((element,index) => element.checked ? [field.options[index].value] : []);
    if (field.widget !== 'ashby-yesno') return null;
    return field.elements.filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.textContent.trim());
  },
  fillChoice(field, value, actions) {
    if (field.widget === 'ats-choice') return fillCheckboxQuestion(field, value, actions);
    const {click} = actions;
    if (field.widget !== 'ashby-yesno') return null;
    const target = field.elements.find(el => el.textContent.trim() === value && !el.disabled);
    if (!target) return false;
    click(target);
    return true;
  },
  isSectionHeading() {
    return false;
  },
  uploadState(element) {
    const parser = element?.closest('.ashby-application-form-autofill-input-root');
    if (parser && /autofill completed/i.test(parser.textContent)) {
      // Ashby's parser uploader hands the document to the separate Resume
      // attachment widget. It does not retain a filename of its own.
      const resumes = [...element.ownerDocument.querySelectorAll('.ashby-application-form-input-file input[type="file"]')]
        .filter(input => !parser.contains(input) && this.fieldMetadata(input).ats?.canonicalKey === 'resume');
      if (resumes.length === 1) return this.uploadState(resumes[0]);
    }
    const root = element?.closest('.ashby-application-form-input-file');
    if (!root) return applicationUploadState(element, '.ashby-application-form-field-entry,[class*="fieldEntry"],.ashby-application-form-autofill-input-root,.field,.form-group', '.filename,[class*="fileName"],[class*="filename"],[data-file-name],.uploaded-file');
    const busy = root.getAttribute('aria-busy') === 'true' ||
      /^(?:loading|uploading|processing|parsing)$/.test(root.getAttribute('data-state') || '') ||
      Boolean(root.querySelector('[role="progressbar"], [aria-busy="true"]'));
    const failed = Boolean(root.querySelector('[role="alert"], [aria-invalid="true"]'));
    const filename = root.querySelector('.ashby-application-form-input-file-item-name, .ashby-application-form-input-file-filename, [class*="_fileName_"], [class*="_filename_"]');
    // Ashby clears FileList after persisting an upload. Its filename and Replace
    // control belong to this widget, not a neighboring cover-letter upload.
    const replace = Array.from(root.querySelectorAll('button')).some(button => /^replace$/i.test(button.textContent.trim()));
    const name = filename?.textContent.trim() || (replace ? root.textContent.match(/([^\n<>]+\.(?:pdf|docx?|odt|rtf|txt|md))\b/i)?.[1]?.trim() : '') || '';
    return { name, accepted: Boolean(name && replace && !busy && !failed), busy };
  },
  isCombobox(element) {
    return Boolean(element?.matches?.('.ashby-select-input, .ashby-application-form-input-autocomplete, [data-ashby-field]'));
  },
  comboboxToggle(element) {
    return element?.parentElement?.querySelector('button[class*="_toggleButton_"]') || null;
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element) return null;
    const root = element.closest('.ashby-select, .ashby-application-form-field-entry, fieldset') || element.parentElement;
    const menus = root ? Array.from(root.querySelectorAll('.ashby-select-menu, [role="listbox"]')) : [];
    return menus.length ? menus : null;
  },
  comboboxOptionSelector() {
    return '.ashby-select-option, [role="option"]';
  },
};
