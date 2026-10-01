/**
 * Greenhouse: classic job-board embeds (often cross-origin) with Places `.pac-container`
 * location inputs, and job-boards.greenhouse.io React-select fields inside `.select-shell`
 * (including async Location (City) typeaheads and multi-select chips).
 */
import { applicationMetadata, applicationProfileValue, applicationAnswer, applicationNeedsFill, checkboxQuestions, fillCheckboxQuestion, applicationUploadState } from './application-fields.js';
import { applicationOptionMatches, DISCLOSURES } from './application-fields.js';
import { prepareApplicationSections, prepareApplicationDependencies } from './application-sections.js';

const placesSelections = new WeakMap();
const FORM = 'form#application_form,form#application-form,#grnhse_app,form[action*="greenhouse.io"],form.job__form';
const ROW = '#employment_section .employment,[data-name="employments"] > ul > li,.experience--form,.experience-form,.employment--form,.employment-form,#education_section .education,[data-name="educations"] > ul > li,.education--form,.education-form';
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const greenhouseAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)greenhouse\.io$|(?:^|\.)greenhouse\.com$/i.test(host)) return true;
    if (/(?:^|\.)(?:lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com)$/i.test(host)) return false;
    return Boolean(doc?.querySelector?.('#grnhse_app, form#application_form, #job_application_location, input[name="action"][value="gh_application_submission"], input[name="action"][value="greenhouse/applications/submit"], form[action*="greenhouse.io"]'));
  },
  applicationRoot: doc => doc.querySelector(FORM),
  excludeField: element => Boolean(element.closest('.filters,[class^="filters"],.contact-modal_component')) || element.matches('select') && Boolean(element.previousElementSibling?.matches('.select2-container')),
  fieldMetadata(element) {
    if (!element) return {};
    const container = element.closest('.field,.form-group,.control-group,.select-shell,.select__container,.text-input-wrapper,fieldset,.demographic_question');
    const title = container?.querySelector('legend') || container?.querySelector('label:not(.select__option)');
    const meta = applicationMetadata(element, 'greenhouse', {container,title,rowSelector:ROW});
    if (meta.ats.canonicalKey === 'phone' && element.closest('.phone-input')) meta.ats.canonicalKey = 'phone_stripped';
    if (meta.ats.canonicalKey === 'country' && element.closest('.phone-input')) meta.ats.canonicalKey = 'phone_country';
    return meta;
  },
  profileValue: applicationProfileValue,
  resolveAnswer: applicationAnswer,
  searchQuery: (field, value) => DISCLOSURES.has(field.ats?.canonicalKey) ? '' : value,
  needsFill: applicationNeedsFill,
  prepareSections(doc, profile, options) { return prepareApplicationSections(doc, profile, this, [
    {section:'#employment_section,[data-name="employments"],.experience--container,.experience-container,.employment--container,.employment-container',row:'.employment,ul > li,.experience--form,.experience-form,.employment--form,.employment-form',add:'#add_employment,.form-multifield__add,.add-another-button',records:'workExperiences',identity:['company','title']},
    {section:'#education_section,[data-name="educations"],.education--container,.education-container',row:'.education,ul > li,.education--form,.education-form',add:'#add_education,.form-multifield__add,.add-another-button',records:'education',identity:['institution','degree']},
  ], options); },
  prepareFields: prepareApplicationDependencies,
  uploadState: element => applicationUploadState(element, '.field,.form-group,.upload,.file-upload,.resume-input', '.filename,.file-name,[class*="fileName"],[class*="filename"],[data-file-name],.uploaded-file'),
  choiceGroups(root) { return checkboxQuestions(root, this); },
  readChoice: field => field.widget === 'ats-choice' ? field.elements.filter(element => element.checked).map(element => element.value) : null,
  fillChoice: fillCheckboxQuestion,
  optionMatches: applicationOptionMatches,
  applyControl: doc => doc.querySelector('#apply_button'),
  submitControl: doc => doc.querySelector('input[type=submit][data-trackingid="job-application-submit"],button[type=submit].submit-step'),
  confirmation: doc => Boolean(doc.querySelector('.confirmation__content')),
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: true,
  },
  isSectionHeading() {
    return false;
  },
  isCombobox(element) {
    if (element?.matches('.select2-container')) return true;
    if (!element?.matches?.('input:not([type="hidden"])')) return false;
    const parent = element.parentElement;
    if (!parent) return false;
    if (parent.querySelector(':scope > .pac-container')) return true;
    return Boolean(element.nextElementSibling?.classList?.contains('pac-container'));
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element) return null;
    if (element.matches('.select2-container')) {
      const dropdown = element.ownerDocument.querySelector('.select2-drop-active');
      return dropdown && dropdown.getAttribute('data-kareer-owner') === element.id ? [dropdown] : [];
    }
    const parent = element.parentElement;
    const local = parent ? Array.from(parent.querySelectorAll(':scope > .pac-container')) : [];
    if (local.length) return local;
    const next = element.nextElementSibling;
    if (next?.classList?.contains('pac-container')) return [next];
    const shell = element.closest('.select-shell, .select__container');
    const menus = shell ? Array.from(shell.querySelectorAll('.select__menu, :scope [role="listbox"]')) : [];
    return menus.length ? menus : null;
  },
  comboboxOptionSelector(element) {
    // Places locations and ordinary React-select fields coexist on Greenhouse.
    return element.matches('.select2-container') ? '.select2-result-selectable .select2-result-label' : element.matches('input') && this.isCombobox(element) ? '.pac-item' : '';
  },
  comboboxParts(element) {
    if (!element.matches('.select2-container')) return null;
    const menu = element.ownerDocument.querySelector('.select2-drop-active');
    return {container:element.parentElement,input:menu?.getAttribute('data-kareer-owner') === element.id ? menu.querySelector('.select2-input') : null,controlBox:element.querySelector('.select2-choice') || element,toggleBtn:null};
  },
  afterComboboxOpen(element) {
    if (element.matches('.select2-container')) element.ownerDocument.querySelector('.select2-drop-active')?.setAttribute('data-kareer-owner', element.id);
  },
  recordComboboxSelection(element, label) { if (element.matches('input') && this.isCombobox(element)) placesSelections.set(element, label); },
  readComboboxSelection(element) {
    if (element.matches('.select2-container')) return [...element.querySelectorAll('.select2-chosen,.select2-search-choice > div')].map(node => node.textContent.trim()).filter(value => value && !/^select|^choose/i.test(value));
    if (!element.matches('input') || !this.isCombobox(element)) return null;
    const selected = placesSelections.get(element);
    return selected && element.value === selected ? [selected] : [];
  },
};
