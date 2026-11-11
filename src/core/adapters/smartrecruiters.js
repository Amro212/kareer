/**
 * SmartRecruiters one-click form (Angular + open-shadow spl-* components).
 * Local recipes authored from the public Simplify SmartRecruiters inventory;
 * see docs/plans/2026-11-10-smartrecruiters-coverage.md. The top resume parser
 * is never used: the resume goes to the Resume widget and rows come from the
 * saved profile.
 */
import { genericAdapter } from './generic.js';
import { applicationAnswer, applicationProfileValue, applicationOptionMatches, applicationNeedsFill, canonicalField, DISCLOSURES } from './application-fields.js';
import { owningWidget, entryRecords, ROW_FIELDS, prepareSmartRecruitersSections } from './smartrecruiters-sections.js';

const PERSONAL = { 'first-name-input': 'first_name', 'last-name-input': 'last_name', 'email-input': 'email', 'confirm-email-input': 'email' };
const LINKS = { linkedin: 'linkedin', website: 'portfolio', twitter: 'twitter' };
const ROW_HOST = Object.keys(ROW_FIELDS).map(test => `[data-test="${test}"]`).join(',');
const PARSER = 'spl-dropzone[data-test="apply-with-resume-container"]';
const ats = canonicalKey => ({ ats: { adapter: 'smartrecruiters', version: 1, canonicalKey, multiple: false } });
const footerButton = (doc, test) => doc.querySelector(`oc-button[data-test="${test}"] spl-button`)?.shadowRoot?.querySelector('button') || null;

export const smartrecruitersAdapter = {
  ...genericAdapter,
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  detect(loc, doc) {
    return /(?:^|\.)smartrecruiters\.com$/i.test(loc?.hostname || '') ||
      Boolean(doc?.querySelector('oc-oneclick-form,spl-dropzone[data-test="resume-upload"]'));
  },
  excludeField: element => Boolean(owningWidget(element, PARSER)),
  fieldMetadata(element) {
    if (!element) return null;
    const entry = owningWidget(element, 'oc-experience-entry,oc-education-entry');
    if (entry) {
      const canonicalKey = ROW_FIELDS[owningWidget(element, ROW_HOST)?.getAttribute('data-test')] || '';
      const record = entryRecords.get(entry);
      const rowId = record?.id || `${entry.localName}-${[...entry.parentElement.children].indexOf(entry)}`;
      return { ats: { ...ats(canonicalKey).ats, rowId, record }, ...(canonicalKey ? { id: `smartrecruiters:${rowId}:${canonicalKey}` } : {}) };
    }
    if (PERSONAL[element.id]) return ats(PERSONAL[element.id]);
    if (owningWidget(element, 'spl-phone-field')) {
      return element.matches('input[type="tel"]') ? ats('phone_stripped') : element.matches('[aria-label="Country code"]') ? ats('phone_country') : null;
    }
    const location = owningWidget(element, 'spl-autocomplete[data-test="location-autocomplete"]');
    if (location && owningWidget(location, 'oc-personal-information')) return ats(/postal|post ?code|zip/i.test(location.getAttribute('label') || '') ? 'postal_code' : 'location');
    const link = owningWidget(element, '[data-test^="web-profiles-"]')?.getAttribute('data-test').slice('web-profiles-'.length);
    if (LINKS[link]) return ats(LINKS[link]);
    if (owningWidget(element, 'spl-dropzone[data-test="resume-upload"]')) return { id: 'resume-upload', label: 'Resume', ...ats('resume') };
    if (owningWidget(element, 'sr-screening-questions-form')) {
      const host = owningWidget(element, ':is(spl-autocomplete,spl-multiselect-autocomplete,spl-select,spl-input,spl-textarea,spl-checkbox,spl-radio-group):is([aria-label],[label])');
      const label = (host?.getAttribute('aria-label') || host?.getAttribute('label') || '').trim();
      return label ? { label, ...ats(canonicalField(element, label)) } : null;
    }
    return null;
  },
  profileValue: applicationProfileValue,
  resolveAnswer: applicationAnswer,
  needsFill: applicationNeedsFill,
  optionMatches: applicationOptionMatches,
  searchQuery(field, value) {
    const key = field.ats?.canonicalKey;
    if (DISCLOSURES.has(key) || ['work_auth', 'sponsorship'].includes(key)) return '';
    return key === 'location' ? value.split(',')[0].trim() : value;
  },
  prepareSections: (doc, profile, options) => prepareSmartRecruitersSections(doc, profile, options),
  applyControl: doc => doc.querySelector('a.js-oneclick[href*="/oneclick-ui/"]'),
  continueControl: doc => footerButton(doc, 'footer-next'),
  submitControl: doc => footerButton(doc, 'footer-submit'),
  confirmation: doc => Boolean(doc.querySelector('h2[data-test="success-page-confirmation"]')),
  comboboxOptionSelector(element) {
    return owningWidget(element, 'spl-autocomplete,spl-select') ? 'spl-select-option' : '';
  },
  optionLabel(option) {
    return option.shadowRoot?.querySelector('spl-truncate[title]')?.getAttribute('title') || option.textContent.trim();
  },
  afterComboboxOptionClick(element, option) {
    // The component listens on its native dropdown item, not the outer host.
    option.element.shadowRoot?.querySelector('spl-dropdown-item')?.shadowRoot?.querySelector('[role="option"]')?.click();
  },
  readComboboxSelection(element) {
    const autocomplete = owningWidget(element, 'spl-autocomplete');
    if (autocomplete) {
      return [...(autocomplete.shadowRoot?.querySelectorAll('spl-select-option') || [])]
        .filter(option => option.shadowRoot?.querySelector('spl-dropdown-item[selected]'))
        .map(option => this.optionLabel(option)).filter(label => label && label === element.value);
    }
    if (owningWidget(element, 'spl-select')) {
      return [...(element.querySelector('slot[name="triggerPrefix"]')?.assignedElements({ flatten: true }) || [])]
        .map(node => node.textContent.trim()).filter(Boolean);
    }
    return null;
  },
  uploadState(element) {
    const owner = owningWidget(element, 'spl-dropzone');
    if (!owner) return null;
    let files;
    try { files = JSON.parse(owner.getAttribute('files') || '[]'); } catch { files = []; }
    const names = Array.isArray(files) ? files.map(file => file?.fileName || file?.name).filter(name => typeof name === 'string' && name.trim()) : [];
    const name = names.length === 1 ? names[0] : '';
    const busy = owner.hasAttribute('disabled') || owner.getAttribute('aria-busy') === 'true';
    const rejected = owner.getAttribute('aria-invalid') === 'true';
    return { name, busy, accepted: Boolean(name && !busy && !rejected) };
  },
  uploadBusy(doc) {
    // A parse the applicant starts manually disables this host while it runs.
    return Boolean(doc.querySelector(`${PARSER}[disabled]`));
  },
};
