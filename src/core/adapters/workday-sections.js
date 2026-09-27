import { rowRecords, rowBindings, workdayFieldMetadata, workdayAnswer, workdayOptionMatches } from './workday-fields.js';
import { gmGet, gmSet } from '../storage.js';
import { scanFormFields, harvestComboboxOptions } from '../fields/scanner.js';
import { fillField } from '../fields/fillers.js';
import { verifyField } from '../fields/verify.js';

const sections = [
  { selector: '[data-automation-id="workExperienceSection"], [aria-labelledby="Employment-Detail-section"], [aria-labelledby="Employment-History-section"], [aria-labelledby="Employment-History-List-section"], [aria-labelledby*="Experience"][aria-labelledby$="-section"], [aria-labelledby*="Work-History"][aria-labelledby$="-section"]', prefix: 'workExperience', records: p => p.workExperiences, identity: ['title', 'company', 'startDate_year'] },
  { selector: '[data-automation-id="educationSection"], [aria-labelledby*="Education"][aria-labelledby$="-section"], [aria-labelledby*="School"][aria-labelledby$="-section"]', prefix: 'education', records: p => p.education, identity: ['institution', 'degree', 'startDate_year'] },
  { selector: '[data-automation-id="languageSection"], [data-automation-id="languagesSection"], [aria-labelledby*="Languages"][aria-labelledby$="-section"]', prefix: 'language', records: p => p.languageRecords, identity: ['language'] },
  { selector: '[data-automation-id="websiteSection"], [data-automation-id="websitesSection"], [aria-labelledby*="Websites"][aria-labelledby$="-section"]', prefix: 'websitePanelSet', records: p => ['linkedin', 'github', 'portfolio'].filter(key => p[key]).map(key => ({ id: key, url: p[key] })), identity: ['url'] },
];
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const progressKey = 'kr:workday-rows';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function rows(section, prefix) {
  const selector = `[data-automation-id^="${prefix}-"], [aria-labelledby$="-panel"]`;
  return [...section.querySelectorAll(selector)].filter(row => row.querySelector('input,textarea,button[aria-haspopup="listbox"]') && !row.parentElement.closest(selector));
}
function values(row) {
  const result = {};
  for (const element of row.querySelectorAll('input:not([type="hidden"]),textarea,select,button[aria-haspopup="listbox"]')) {
    const canonical = workdayFieldMetadata(element).ats.canonicalKey;
    const value = element.type === 'checkbox' ? element.checked : element.tagName === 'SELECT' ? element.selectedOptions[0]?.textContent : element.value || (element.tagName === 'BUTTON' ? element.textContent : '');
    if (value && !/^(select|select one|choose)$/i.test(value)) result[canonical || `unknown:${element.id || element.name}`] = value;
  }
  for (const token of row.querySelectorAll('[data-automation-id="selectedItem"]')) {
    const input = token.parentElement.querySelector('input');
    if (input) result[workdayFieldMetadata(input).ats.canonicalKey] = token.getAttribute('title') || token.textContent;
  }
  return result;
}
function recordValue(record, key) {
  return key === 'startDate_year' ? record.startDate?.split('-')[0] : record[key];
}
function compatible(actual, record, identity) {
  const known = identity.filter(key => actual[key]);
  return known.length > 0 && known.every(key => recordValue(record, key) && (normalize(actual[key]) === normalize(recordValue(record, key)) || workdayOptionMatches({ ats: { canonicalKey: key } }, actual[key], recordValue(record, key))));
}

// No deletion or reordering. A failed Add stops the run; retry never clicks Add
// repeatedly while a prior row may still be arriving.
export async function prepareWorkdaySections(doc, profile, { session = null, isCurrent = () => true } = {}) {
  const page = doc.location.href;
  const stored = gmGet(progressKey, {});
  const progress = session ? (session.workdayRows ||= {}) : (stored[page] ||= {});
  if (!rowBindings.has(doc)) rowBindings.set(doc, new Map());
  for (const recipe of sections) {
    const section = doc.querySelector(recipe.selector);
    const records = (recipe.records(profile) || []).filter(record => record && record.enabled !== false && recipe.identity.some(key => recordValue(record, key))).map((record, index) => ({ ...record, id: record.id || `${recipe.prefix}:${index}` }));
    if (!section || !records.length) continue;
    if (records.length > 50 || new Set(records.map(record => record.id)).size !== records.length) throw new Error(`Workday ${recipe.prefix}: invalid record count or duplicate saved IDs. Review profile.`);
    const assigned = new Set();
    for (const record of records) {
      if (!isCurrent()) throw new Error('Workday row preparation cancelled.');
      const candidates = rows(section, recipe.prefix).filter(row => !assigned.has(row));
      if (candidates.some(row => records.filter(saved => compatible(values(row), saved, recipe.identity)).length > 1)) throw new Error(`Workday ${recipe.prefix}: ambiguous saved records for parsed row. Review manually.`);
      const exact = candidates.filter(row => compatible(values(row), record, recipe.identity));
      if (exact.length > 1) throw new Error(`Workday ${recipe.prefix}: ambiguous parsed rows. Review matching records manually.`);
      let row = exact[0];
      // Saved associations survive a reload only when the row's identity still
      // matches, or it remains empty. Index alone is never a factual match.
      if (!row) row = candidates.find(candidate => {
        const rowKey = candidate.getAttribute('data-automation-id') || candidate.getAttribute('aria-labelledby');
        return progress[`${recipe.prefix}:${record.id}`] === rowKey && !Object.keys(values(candidate)).length;
      });
      if (!row) row = candidates.find(candidate => !Object.keys(values(candidate)).length);
      if (!row) {
        const add = section.querySelector('[data-automation-id="add-button"]');
        if (!add || add.disabled || add.getAttribute('aria-disabled') === 'true') throw new Error(`Workday ${recipe.prefix}: row limit or Add unavailable. Select fewer saved records or add manually.`);
        const before = new Set(rows(section, recipe.prefix));
        const event = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
        if (add.type === 'submit') event.preventDefault();
        add.dispatchEvent(event);
        const deadline = Date.now() + 5000;
        do {
          if (!isCurrent()) throw new Error('Workday row preparation cancelled.');
          const added = rows(section, recipe.prefix).filter(candidate => !before.has(candidate));
          if (added.length > 1) throw new Error('Workday Add created ambiguous rows. Review manually.');
          if (added.length === 1) { row = added[0]; break; }
          await delay(100);
        } while (Date.now() < deadline);
        if (!row) throw new Error(`Workday ${recipe.prefix}: Add did not produce a row. Review before retrying.`);
      }
      assigned.add(row);
      rowRecords.set(row, { record });
      rowBindings.get(doc).set(row.getAttribute('data-automation-id') || row.getAttribute('aria-labelledby'), { record });
      progress[`${recipe.prefix}:${record.id}`] = row.getAttribute('data-automation-id') || row.getAttribute('aria-labelledby');
    }
  }
  if (!session) gmSet(progressKey, Object.fromEntries(Object.entries(stored).slice(-20)));
}

// Resolve only the three known dependency controls before discovering answers.
// This makes country-specific address fields and preferred-name inputs visible
// in the primary scan, and applies current-job state before end-date discovery.
export async function prepareWorkdayDependencies(doc, profile, { overwrite = false, isCurrent = () => true } = {}) {
  const controls = scanFormFields(doc).filter(field => ['country', 'preferred_check', 'current'].includes(field.ats?.canonicalKey));
  for (const original of controls) {
    if (!isCurrent()) throw new Error('Workday dependency preparation cancelled.');
    const field = scanFormFields(doc).find(candidate => candidate.id === original.id);
    if (!field || field.element.disabled || field.element.readOnly || !overwrite && field.currentValue && field.currentValue !== 'false') continue;
    const value = workdayAnswer(field, profile);
    if (!value || value.value === undefined || value.value === false && field.currentValue === 'false') continue;
    if (field.type === 'combobox') await harvestComboboxOptions([field]);
    const answer = workdayAnswer(field, profile);
    if (!answer || answer.value === '') throw new Error(`Workday ${field.label}: saved dependency value has no exact option. Review manually.`);
    if (!await fillField(field, answer.value) || !(await verifyField(field, answer.value)).verified) throw new Error(`Workday ${field.label}: dependency was not accepted.`);
    const deadline = Date.now() + 3000;
    let prior = '', stable = Date.now();
    do {
      if (!isCurrent()) throw new Error('Workday dependency preparation cancelled.');
      const signature = JSON.stringify(scanFormFields(doc).map(field => [field.id, field.label, field.element.disabled]));
      if (signature !== prior) { prior = signature; stable = Date.now(); }
      if (Date.now() - stable >= 300 && !doc.querySelector('main [aria-busy="true"]')) break;
      if (Date.now() >= deadline) throw new Error('Workday dependent fields did not settle. Review manually.');
      await delay(100);
    } while (true);
  }
}
