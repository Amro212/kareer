/**
 * SmartRecruiters Experience/Education rows, following the public Simplify
 * recipe: Add prepends one inline editor, fields are filled, then Save turns
 * it into a summary card. Existing cards and parsed editors are matched by
 * identity and never deleted or edited.
 */
import { scanFormFields, harvestComboboxOptions } from '../fields/scanner.js';
import { fillField } from '../fields/fillers.js';
import { clickFieldControl, findExactOption, optionKey } from '../fields/combobox.js';
import { getSettings } from '../storage.js';
import { logger } from '../debug.js';

export const entryRecords = new WeakMap();
// Owning oc-* host data-test -> canonical row key.
export const ROW_FIELDS = {
  'job-title-autocomplete': 'title', 'company-autocomplete': 'company', 'experience-form-location': 'location',
  'experience-description': 'description', 'experience-date-from': 'startDate', 'experience-date-to': 'endDate', 'experience-current': 'current',
  'institution-autocomplete': 'institution', 'education-major': 'fieldOfStudy', 'education-degree': 'degree', 'education-form-location': 'location',
  'education-description': 'description', 'education-date-from': 'startDate', 'education-date-to': 'endDate', 'education-current': 'current',
};
const RECIPES = [
  { label: 'experience', records: 'workExperiences', entry: 'oc-experience-entry', form: 'oc-experience-edit-form', add: 'add-experience', save: 'experience-save',
    identity: ['title', 'company'], card: { title: 'experience-entry-title', company: 'experience-entry-company' } },
  { label: 'education', records: 'education', entry: 'oc-education-entry', form: 'oc-education-edit-form', add: 'add-education', save: 'education-save',
    identity: ['institution', 'degree'], card: { institution: 'education-entry-institution', degree: 'education-entry-degree' } },
];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const parentOf = node => node.parentElement || node.getRootNode?.()?.host || null;

export function owningWidget(element, selector) {
  for (let node = element; node; node = parentOf(node)) if (node.matches?.(selector)) return node;
  return null;
}
const within = (node, container) => { for (let current = node; current; current = parentOf(current)) if (current === container) return true; return false; };
const innerButton = host => host?.querySelector('spl-button')?.shadowRoot?.querySelector('button') || null;
// Card titles also contain a date span; only the element's own text is identity.
const ownText = node => node ? [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';

function rowFields(doc, row) {
  return scanFormFields(doc).filter(field => field.ats?.canonicalKey && within(field.element, row));
}
function identity(doc, row, recipe) {
  if (!row.querySelector(recipe.form)) return Object.fromEntries(Object.entries(recipe.card).map(([key, test]) => [key, ownText(row.querySelector(`[data-test="${test}"]`))]));
  return Object.fromEntries(rowFields(doc, row).filter(field => recipe.identity.includes(field.ats.canonicalKey)).map(field => [field.ats.canonicalKey, String(field.element.value || '').trim()]));
}
// The institution card appends the school location to the name.
const same = (key, actual, expected) => Boolean(optionKey(actual) && optionKey(expected) &&
  (optionKey(actual) === optionKey(expected) || key === 'institution' && optionKey(actual).startsWith(`${optionKey(expected)} `)));
const matches = (actual, record, recipe) => same(recipe.identity[0], actual[recipe.identity[0]], record[recipe.identity[0]]) &&
  recipe.identity.slice(1).every(key => !actual[key] || !record[key] || same(key, actual[key], record[key]));

function rowValue(record, key) {
  if (key === 'endDate' && record.current) return '';
  // The month-year picker accepts YYYY-MM; other formats silently become January.
  if (key === 'startDate' || key === 'endDate') return /^\d{4}-\d{2}/.test(record[key] || '') ? record[key].slice(0, 7) : '';
  if (key === 'current') return record.current ? true : '';
  return record[key] ?? '';
}

async function fillRow(doc, row, record, overwrite, isCurrent) {
  // "Currently" first: it can remove the end date from the editor.
  const ordered = fields => fields.sort((a, b) => (b.ats.canonicalKey === 'current') - (a.ats.canonicalKey === 'current'));
  const done = new Set();
  for (let pass = 0; pass < 2; pass++) {
    for (const field of ordered(rowFields(doc, row))) {
      if (!isCurrent()) throw new Error('SmartRecruiters row preparation cancelled.');
      const key = field.ats.canonicalKey, value = rowValue(record, key);
      if (done.has(key) || value === '' || field.currentValue && field.currentValue !== 'false' && !overwrite) { done.add(key); continue; }
      done.add(key);
      let target = value;
      if (field.type === 'combobox') {
        await harvestComboboxOptions([field], new Map([[field.id, String(value)]]));
        target = findExactOption(field.options || [], String(value), field)?.label;
        if (!target) { logger.warn(`SmartRecruiters ${key}: no matching option for the saved value.`); continue; }
      }
      if (!await fillField(field, target)) logger.warn(`SmartRecruiters ${key}: the editor did not accept the saved value.`);
      if (key === 'current') break;
    }
  }
}

async function addRow(doc, recipe, rows, isCurrent) {
  const button = innerButton(doc.querySelector(`oc-button[data-test="${recipe.add}"]`));
  if (!button) throw new Error(`SmartRecruiters ${recipe.label}: Add is unavailable. Add the entry manually.`);
  const before = new Set(rows());
  clickFieldControl(button);
  const deadline = Date.now() + 5000;
  do {
    if (!isCurrent()) throw new Error('SmartRecruiters row preparation cancelled.');
    const added = rows().filter(row => !before.has(row));
    if (added.length > 1) throw new Error(`SmartRecruiters ${recipe.label}: Add created several entries. Review manually.`);
    if (added.length === 1 && added[0].querySelector(recipe.form)) return added[0];
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`SmartRecruiters ${recipe.label}: Add did not open an editor. Add the entry manually.`);
}

async function saveRow(row, recipe) {
  const button = innerButton(row.querySelector(`${recipe.form} oc-button[data-test="${recipe.save}"]`));
  if (!button) return false;
  clickFieldControl(button);
  const deadline = Date.now() + 3000;
  do {
    if (!row.querySelector(recipe.form)) return true;
    await delay(100);
  } while (Date.now() < deadline);
  return false;
}

export async function prepareSmartRecruitersSections(doc, profile, { isCurrent = () => true } = {}) {
  const overwrite = getSettings().overwriteExisting;
  for (const recipe of RECIPES) {
    const rows = () => [...doc.querySelectorAll(recipe.entry)];
    const records = (profile[recipe.records] || []).filter(record => record?.enabled !== false && record[recipe.identity[0]]);
    if (!records.length || !doc.querySelector(`oc-button[data-test="${recipe.add}"]`)) continue;
    const claimed = new Set(), work = [];
    for (const record of records) {
      const row = rows().find(candidate => !claimed.has(candidate) && matches(identity(doc, candidate, recipe), record, recipe));
      if (row) claimed.add(row);
      // A saved card is complete; only a matching open editor still needs work.
      if (!row || row.querySelector(recipe.form)) work.push({ record, row });
    }
    // Add prepends, so creating in reverse keeps the saved profile order.
    for (const item of work.reverse()) {
      let row = item.row || rows().find(candidate => !claimed.has(candidate) && candidate.querySelector(recipe.form) &&
        !Object.values(identity(doc, candidate, recipe)).some(Boolean));
      row ||= await addRow(doc, recipe, rows, isCurrent);
      claimed.add(row);
      entryRecords.set(row, item.record);
      await fillRow(doc, row, item.record, overwrite, isCurrent);
      // A rejected Save leaves the editor open and bound for review.
      if (!await saveRow(row, recipe)) logger.warn(`SmartRecruiters ${recipe.label}: Save was not accepted. Review the open entry.`);
    }
  }
}
