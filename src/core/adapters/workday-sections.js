import { ROW, rowRecords, rowBindings, workdayPromptContainer, workdayFieldMetadata, workdayAnswer, workdayNeedsFill, workdayOptionMatches } from './workday-fields.js';
import { gmGet, gmSet } from '../storage.js';
import { scanFormFields, harvestComboboxOptions } from '../fields/scanner.js';
import { fillField } from '../fields/fillers.js';
import { verifyField } from '../fields/verify.js';

const sections = [
  { selector: '[data-automation-id="workExperienceSection"], [aria-labelledby="Employment-Detail-section"], [aria-labelledby="Employment-History-section"], [aria-labelledby="Employment-History-List-section"], [aria-labelledby*="Experience"][aria-labelledby$="-section"], [aria-labelledby*="Work-History"][aria-labelledby$="-section"]', prefix: 'workExperience', records: p => p.workExperiences, identity: ['title', 'company'], anchor: 'company' },
  { selector: '[data-automation-id="educationSection"], [aria-labelledby*="Education"][aria-labelledby$="-section"], [aria-labelledby*="School"][aria-labelledby$="-section"]', prefix: 'education', records: p => p.education, identity: ['institution', 'degree'], anchor: 'institution' },
  { selector: '[data-automation-id="languageSection"], [data-automation-id="languagesSection"], [aria-labelledby*="Languages"][aria-labelledby$="-section"]', prefix: 'language', records: p => p.languageRecords, identity: ['language'] },
  { selector: '[data-automation-id="websiteSection"], [data-automation-id="websitesSection"], [aria-labelledby*="Websites"][aria-labelledby$="-section"]', prefix: 'websitePanelSet', records: p => ['linkedin', 'github', 'portfolio'].filter(key => p[key]).map(key => ({ id: key, url: p[key] })), identity: ['url'] },
];
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const progressKey = 'kr:workday-rows';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const rowKey = row => row.getAttribute('data-automation-id') || row.getAttribute('aria-labelledby');

function rows(section, prefix) {
  const selector = `[data-automation-id^="${prefix}-"], [aria-labelledby$="-panel"]`;
  return [...section.querySelectorAll(selector)].filter(row => row.querySelector('input,textarea,button[aria-haspopup="listbox"]') && !row.parentElement.closest(selector));
}
function values(row) {
  const result = {};
  for (const element of row.querySelectorAll('input:not([type="hidden"]),textarea,select,button[aria-haspopup="listbox"]')) {
    const canonical = workdayFieldMetadata(element).ats.canonicalKey;
    const prompt = workdayPromptContainer(element);
    const token = prompt?.querySelector('[data-automation-id="selectedItem"]');
    const value = prompt ? token?.getAttribute('title') || token?.textContent : element.type === 'checkbox' ? element.checked : element.tagName === 'SELECT' ? element.value && element.selectedOptions[0]?.textContent : element.value || (element.tagName === 'BUTTON' ? element.textContent : '');
    if (value && !/^(select|select one|choose)$/i.test(value.trim?.() || value)) result[canonical || `unknown:${element.id || element.name}`] = value;
  }
  return result;
}
function recordValue(record, key) {
  const date = /^(startDate|endDate)_(year|month)$/.exec(key);
  return date ? record[date[1]]?.split('-')[date[2] === 'year' ? 0 : 1] : record[key];
}
function same(key, actual, expected) {
  if (!actual || !expected) return false;
  if (/_(year|month)$/.test(key)) return Number(actual) === Number(expected);
  return normalize(actual) === normalize(expected) || workdayOptionMatches({ ats: { canonicalKey: key } }, actual, expected);
}
function associations(existing, records, recipe) {
  const matches = new Map();
  let candidates = existing.flatMap(row => {
    const actual = values(row);
    return records.flatMap(record => {
      const equal = recipe.identity.filter(key => same(key, actual[key], recordValue(record, key)));
      const conflict = recipe.identity.some(key => actual[key] && recordValue(record, key) && !same(key, actual[key], recordValue(record, key)));
      const strength = !equal.length ? 0 : !conflict ? equal.length + 1 : equal.includes(recipe.anchor) ? 1 : 0;
      if (!strength) return [];
      const dates = ['startDate_year', 'startDate_month', 'endDate_year', 'endDate_month'].filter(key => same(key, actual[key], recordValue(record, key))).length;
      return [{ row, record, strength, dates }];
    });
  });
  const best = entries => entries.filter(entry => !entries.some(other => other.strength > entry.strength || other.strength === entry.strength && other.dates > entry.dates));
  while (candidates.length) {
    const unique = candidates.filter(entry => {
      const forRow = best(candidates.filter(other => other.row === entry.row));
      const forRecord = best(candidates.filter(other => other.record === entry.record));
      return forRow.length === 1 && forRow[0] === entry && forRecord.length === 1 && forRecord[0] === entry;
    });
    if (!unique.length) throw new Error(`Workday ${recipe.prefix}: ambiguous parsed rows or saved records. Review matching records manually.`);
    for (const { record, row } of unique) matches.set(record, row);
    candidates = candidates.filter(entry => !unique.some(match => match.row === entry.row || match.record === entry.record));
  }
  return matches;
}

// No deletion or reordering. A failed Add stops the run; retry never clicks Add
// repeatedly while a prior row may still be arriving.
export async function prepareWorkdaySections(doc, profile, { session = null, isCurrent = () => true } = {}) {
  const page = doc.location.href;
  const stored = gmGet(progressKey, {});
  const progress = session ? (session.workdayRows ||= {}) : (stored[page] ||= {});
  // Reconcile against the current profile, including records disabled since
  // the last run; a stale binding must not keep filling an unmatched row.
  rowBindings.set(doc, new Map());
  for (const row of doc.querySelectorAll(ROW)) rowRecords.delete(row);
  for (const recipe of sections) {
    const section = doc.querySelector(recipe.selector);
    const records = (recipe.records(profile) || []).filter(record => record && record.enabled !== false && recipe.identity.some(key => recordValue(record, key))).map((record, index) => ({ ...record, id: record.id || `${recipe.prefix}:${index}` }));
    if (!section || !records.length) continue;
    if (records.length > 50 || new Set(records.map(record => record.id)).size !== records.length) throw new Error(`Workday ${recipe.prefix}: invalid record count or duplicate saved IDs. Review profile.`);
    const assigned = new Set();
    // Resolve the whole section before Add: profile order must not consume a
    // partial row ahead of a stronger match, or mutate an ambiguous section.
    const matched = associations(rows(section, recipe.prefix), records, recipe);
    for (const row of matched.values()) assigned.add(rowKey(row));
    for (const record of records) {
      if (!isCurrent()) throw new Error('Workday row preparation cancelled.');
      const liveRows = rows(section, recipe.prefix);
      const candidates = liveRows.filter(row => !assigned.has(rowKey(row)));
      let row = matched.get(record);
      if (row && !row.isConnected) {
        row = liveRows.find(candidate => rowKey(candidate) === rowKey(row));
        if (!row) throw new Error(`Workday ${recipe.prefix}: a matched row disappeared. Review before retrying.`);
      }
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
        const before = new Set(rows(section, recipe.prefix).map(rowKey));
        const event = new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true });
        if (add.type === 'submit') event.preventDefault();
        add.dispatchEvent(event);
        const deadline = Date.now() + 5000;
        do {
          if (!isCurrent()) throw new Error('Workday row preparation cancelled.');
          const added = rows(section, recipe.prefix).filter(candidate => !before.has(rowKey(candidate)));
          if (added.length > 1) throw new Error('Workday Add created ambiguous rows. Review manually.');
          if (added.length === 1) { row = added[0]; break; }
          await delay(100);
        } while (Date.now() < deadline);
        if (!row) throw new Error(`Workday ${recipe.prefix}: Add did not produce a row. Review before retrying.`);
      }
      assigned.add(rowKey(row));
      const binding = { record, original: values(row) };
      rowRecords.set(row, binding);
      rowBindings.get(doc).set(row.getAttribute('data-automation-id') || row.getAttribute('aria-labelledby'), binding);
      progress[`${recipe.prefix}:${record.id}`] = row.getAttribute('data-automation-id') || row.getAttribute('aria-labelledby');
    }
  }
  if (!session) gmSet(progressKey, Object.fromEntries(Object.entries(stored).slice(-20)));
}

// Resolve only the three known dependency controls before discovering answers.
// This makes country-specific address fields and preferred-name inputs visible
// in the primary scan, and applies current-job state before end-date discovery.
export async function prepareWorkdayDependencies(doc, profile, { overwrite = false, isCurrent = () => true } = {}) {
  const priority = { country: 1, preferred_check: 2, current: 3 };
  const controls = scanFormFields(doc)
    .filter(field => ['country', 'preferred_check', 'current'].includes(field.ats?.canonicalKey))
    .sort((a, b) => (priority[a.ats?.canonicalKey] || 9) - (priority[b.ats?.canonicalKey] || 9));
  for (const original of controls) {
    if (!isCurrent()) throw new Error('Workday dependency preparation cancelled.');
    const field = scanFormFields(doc).find(candidate => candidate.id === original.id);
    if (!field || field.element.disabled || field.element.readOnly) continue;
    const needs = workdayNeedsFill(field, profile);
    if (needs === false || needs == null && !overwrite && field.currentValue && field.currentValue !== 'false') continue;
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
