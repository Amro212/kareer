import { rowBindings, applicationProfileValue } from './application-fields.js';
import { scanFormFields } from '../fields/scanner.js';
import { readComboboxSelection, clickFieldControl, optionKey } from '../fields/combobox.js';
import { fillField } from '../fields/fillers.js';
import { getSettings, gmGet, gmSet } from '../storage.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const key = 'kr:application-rows';
function values(row, adapter) {
  const actual = {};
  for (const element of row.querySelectorAll('input:not([type=hidden]),select,textarea,[role=combobox],.select2-container')) {
    const canonical = adapter.fieldMetadata(element)?.ats?.canonicalKey;
    if (!canonical || element.type === 'checkbox') continue;
    const value = element.matches('[role=combobox],.select2-container') ? readComboboxSelection(element).join(', ') : element.matches('select') ? element.value && element.selectedOptions[0]?.textContent : element.value;
    if (value?.trim()) actual[canonical] = value.trim();
  }
  return actual;
}

export async function prepareApplicationSections(doc, profile, adapter, recipes, {session=null,isCurrent=()=>true} = {}) {
  const stored = gmGet(key, {});
  const applicationKey = `${adapter.id}:${doc.location.origin}${doc.location.pathname}`;
  const progress = session ? (session.rowProgress ||= {}) : (stored[applicationKey] ||= {});
  for (const recipe of recipes) {
    const section = doc.querySelector(recipe.section);
    if (!section) continue;
    const rows = () => [...section.querySelectorAll(recipe.row)];
    for (const row of rows()) rowBindings.delete(row);
    const records = (profile[recipe.records] || []).filter(record => record?.enabled !== false && recipe.identity.some(name => record[name]));
    if (!records.length) continue;
    if (records.length > 50 || records.some(record => !record.id) || new Set(records.map(record => record.id)).size !== records.length) throw new Error(`${adapter.label}: invalid saved record count or duplicate IDs. Review profile.`);
    const matched = new Map(), assigned = new Set();
    // Plan the entire section before any Add. Partial rows cannot consume a
    // stronger match; contradictory user identities are never overwritten.
    for (const record of records) {
      const candidates = rows().filter(row => {
        const actual = values(row, adapter);
        return recipe.identity.every(name => actual[name] && optionKey(actual[name]) === optionKey(record[name]));
      });
      if (candidates.length > 1 || candidates.some(row => assigned.has(row))) throw new Error(`${adapter.label}: ambiguous ${recipe.records} matches. Review existing rows.`);
      if (candidates.length) { matched.set(record, candidates[0]); assigned.add(candidates[0]); }
    }
    const completeRows = new Set(assigned);
    for (const record of records) {
      if (matched.has(record)) continue;
      let candidates = rows().filter(row => {
        if (completeRows.has(row)) return false;
        const actual = values(row, adapter);
        return recipe.identity.some(name => actual[name]) && recipe.identity.every(name => !actual[name] || optionKey(actual[name]) === optionKey(record[name]));
      });
      const primary=recipe.identity[0];
      if (!candidates.length && records.filter(saved=>optionKey(saved[primary])===optionKey(record[primary])).length===1) {
        candidates=rows().filter(row=>!completeRows.has(row) && optionKey(values(row,adapter)[primary])===optionKey(record[primary]));
      }
      const previous=progress[`${recipe.records}:${record.id}`];
      if (!candidates.length && previous && Number.isInteger(previous.index)) {
        const row=rows()[previous.index];
        if (row && !Object.keys(values(row,adapter)).length) candidates=[row];
      }
      if (candidates.length > 1 || candidates.some(row => assigned.has(row))) throw new Error(`${adapter.label}: ambiguous ${recipe.records} matches. Review existing rows.`);
      if (candidates.length) { matched.set(record, candidates[0]); assigned.add(candidates[0]); }
    }
    const cap = Number(section.getAttribute('data-max-rows') || section.getAttribute('data-row-limit'));
    const missing = records.length - matched.size;
    const empty = rows().filter(row => !Object.keys(values(row, adapter)).length).length;
    if (cap > 0 && rows().length + Math.max(0,missing-empty) > cap) throw new Error(`${adapter.label}: row limit ${cap}. Select fewer enabled records in Profile before retrying.`);
    for (const record of records) {
      if (!isCurrent()) throw new Error(`${adapter.label}: row preparation cancelled.`);
      let row = matched.get(record);
      if (!row) row = rows().find(candidate => !assigned.has(candidate) && !Object.keys(values(candidate, adapter)).length);
      if (!row) {
        const add = section.querySelector(recipe.add);
        if (!add || add.disabled || add.getAttribute('aria-disabled') === 'true') throw new Error(`${adapter.label}: Add unavailable or row limit reached. Select records or add manually.`);
        const before = rows(), snapshots=before.map(row=>JSON.stringify(values(row,adapter)));
        clickFieldControl(add);
        const deadline = Date.now() + 5000;
        do {
          if (!isCurrent()) throw new Error(`${adapter.label}: row preparation cancelled.`);
          const after=rows();
          if (after.length>before.length+1) throw new Error(`${adapter.label}: Add created ambiguous rows. Review manually.`);
          if (after.length===before.length+1) {
            // Evidence-backed append also handles frameworks replacing every node.
            if (snapshots.some((snapshot,index)=>JSON.stringify(values(after[index],adapter))!==snapshot)) throw new Error(`${adapter.label}: Add changed or reordered existing rows. Review manually.`);
            for (let index=0;index<before.length;index++) {
              const binding=rowBindings.get(before[index]);
              if (binding) rowBindings.set(after[index],binding);
              if (assigned.delete(before[index])) assigned.add(after[index]);
              for (const [saved,old] of matched) if(old===before[index]) matched.set(saved,after[index]);
            }
            row=after.at(-1);break;
          }
          await delay(100);
        } while (Date.now() < deadline);
        if (!row) throw new Error(`${adapter.label}: Add did not produce a row. Review before retrying.`);
      }
      assigned.add(row);
      row.setAttribute('data-kareer-row', record.id);
      rowBindings.set(row, {record});
      progress[`${recipe.records}:${record.id}`] = {index:rows().indexOf(row)};
    }
  }
  if (!session) gmSet(key, Object.fromEntries(Object.entries(stored).slice(-20)));
}

export async function prepareApplicationDependencies(doc, profile, {overwrite=getSettings().overwriteExisting,isCurrent=()=>true} = {}) {
  for (const field of scanFormFields(doc).filter(field => field.ats?.canonicalKey === 'current' && field.ats.record)) {
    if (!isCurrent()) throw new Error('Application dependency preparation cancelled.');
    const expected = applicationProfileValue(field, profile);
    if (field.element.checked && !overwrite || field.element.checked === Boolean(expected)) continue;
    await fillField(field, expected);
  }
}
