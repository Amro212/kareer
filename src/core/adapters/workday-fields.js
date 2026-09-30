/*! @license libphonenumber-js (MIT)
Copyright (c) 2016 @catamphetamine <purecatamphetamine@gmail.com>
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { parsePhoneNumberFromString, getCountries } from 'libphonenumber-js/min';

export const WORKDAY_RECIPE_VERSION = 1;
export const PROMPT = '[data-automation-id="multiSelectContainer"], [data-automation-id="multiselectInputContainer"], [data-uxi-widget-type="multiselect"]';
export const ROW = '[data-automation-id^="workExperience-"], [data-automation-id^="education-"], [data-automation-id^="language-"], [data-automation-id^="websitePanelSet-"], [aria-labelledby$="-panel"]';
export const rowRecords = new WeakMap();
export const rowBindings = new WeakMap();
export const workdayPromptContainer = element => element.closest('[data-automation-id="multiSelectContainer"], [data-uxi-widget-type="multiselect"]') || element.closest(PROMPT);
const mappings = [
  ['first_name', 'legalName--firstName,legalName-firstName,firstName'],
  ['last_name', 'legalName--lastName,legalName-lastName,lastName'],
  ['middle_name', 'legalName--middleName,legalName--middle-name,middleName'],
  ['preferred_name', 'preferredName--firstName'], ['preferred_last_name', 'preferredName--lastName'],
  ['preferred_check', 'preferredCheck'], ['full_name', 'name,legalName'], ['email', 'email,emailAddress'],
  ['phone_type', 'phone-device-type,phoneNumber--phoneType'], ['phone_stripped', 'phone-number,phoneNumber--phoneNumber,phoneNumber'],
  ['phone_country', 'countryPhoneCode,phoneNumber--countryPhoneCode'], ['phone_extension', 'extension,phoneExtension,phoneNumber--extension'],
  ['country', 'countryDropdown,country--country'], ['state', 'addressSection_countryRegion,address--countryRegion'],
  ['address', 'addressLine1,addressSection_addressLine1'], ['address_2', 'addressLine2,addressSection_addressLine2'],
  ['address_3', 'addressLine3,addressSection_addressLine3'], ['city', 'city,addressSection_city'], ['postal_code', 'postalCode'],
  ['source', 'source,source--source,sourceSection'], ['highestDegree', 'highestDegree'], ['skill', 'skills,skillsSection'],
  ['gender', 'gender,genderPrompt'], ['ethnicity', 'ethnicity,ethnicityPrompt,ethnicityMulti,ethnicities'],
  ['pronouns', 'pronoun,pronouns'],
  ['disability_v2', 'disability,disabilities'], ['veteran_v2', 'veteran,veteranStatus'], ['hispanic', 'hispanic'],
  ['lgbt_v2', 'lgbt,lgbtq'], ['visible_minority', 'visibleMinority'], ['armed_forces', 'armedForces'],
  ['birthday', 'birthday,dateOfBirth'], ['current_date', 'todaysDate,currentDate,dateSignedOn'],
  ['linkedin', 'linkedinQuestion,linkedInAccount'],
];
const profileKeys = {
  first_name: 'firstName', last_name: 'lastName', middle_name: 'middleName', preferred_name: 'preferredName', preferred_last_name: 'preferredLastName',
  full_name: 'fullName', email: 'email', phone_type: 'phoneType', phone_extension: 'phoneExtension', country: 'country', state: 'stateProvince',
  address: 'streetAddress', address_2: 'addressLine2', address_3: 'addressLine3', city: 'city', postal_code: 'postalCode', highestDegree: 'educationLevel',
  gender: 'gender', ethnicity: 'raceEthnicity', pronouns: 'pronouns', disability_v2: 'disabilityStatus', veteran_v2: 'veteranStatus',
  hispanic: 'hispanic', lgbt_v2: 'lgbtStatus', visible_minority: 'visibleMinority', armed_forces: 'armedForces', birthday: 'birthDate',
  linkedin: 'linkedin', languages_text: 'languages',
};
const key = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const frenchCountries = new Intl.DisplayNames(['fr'], { type: 'region' });
const countryCodes = new Set(getCountries());

export function countryCode(name) {
  if (!name) return '';
  if (/^[a-z]{2}$/i.test(name)) return countryCodes.has(name.toUpperCase()) ? name.toUpperCase() : '';
  for (const code of getCountries()) {
    if ([countryNames.of(code), frenchCountries.of(code)].some(value => key(value) === key(name))) return code;
  }
  return { usa: 'US', uk: 'GB', 'united states of america': 'US' }[key(name)] || '';
}

function canonicalKey(element, container) {
  const identifiers = [element.id, element.name, element.getAttribute('data-automation-id'), container?.getAttribute('data-automation-id')]
    .filter(Boolean).map(value => value.replace(/^formField-/, ''));
  for (const [canonical, names] of mappings) if (names.split(',').some(name => identifiers.includes(name) || identifiers.some(value => value.endsWith('--' + name)))) return canonical;
  const automation = container?.getAttribute('data-automation-id') || '';
  if (/legalName/.test(automation)) {
    if (/firstName/.test(automation)) return 'first_name';
    if (/lastName/.test(automation)) return 'last_name';
    if (/middleName|middle-name/.test(automation)) return 'middle_name';
  }
  if (/preferredName/.test(automation)) return /lastName/.test(automation) ? 'preferred_last_name' : /firstName/.test(automation) ? 'preferred_name' : '';
  if (element.closest('[id="textInput.email"]')) return 'email';
  if (element.type === 'file' && element.closest('[data-automation-id="resumeUpload"], [data-automation-id="quickApplyUpload"], [data-fkit-id*="resume"]')) return 'resume';
  const row = element.closest(ROW);
  if (row) {
    const keys = { jobTitle: 'title', company: 'company', companyName: 'company', school: 'institution', schoolName: 'institution', degree: 'degree', fieldOfStudy: 'fieldOfStudy', 'field-of-study': 'fieldOfStudy', gpa: 'gpa', gradeAverage: 'gpa', location: 'location', description: 'description', roleDescription: 'description', currentlyWorkHere: 'current', url: 'url', website: 'url', language: 'language', fluent: 'fluent', native: 'fluent', reading: 'reading', writing: 'writing', speaking: 'speaking' };
    for (const [fragment, canonical] of Object.entries(keys)) if (identifiers.some(value => value === fragment || value.endsWith('--' + fragment))) return canonical;
    if (identifiers.some(value => /firstYear/.test(value))) return 'startDate_year';
    if (identifiers.some(value => /lastYear/.test(value))) return 'endDate_year';
  }
  const label = container?.querySelector('label,legend')?.textContent || element.getAttribute('aria-label') || '';
  if (/how (?:did|do) you hear|where did you|comment.*(?:connu|entendu)/i.test(label)) return 'source';
  if (/highest degree/i.test(label)) return 'highestDegree';
  if (/language.*speak/i.test(label) && element.matches('input,textarea') && !element.closest(PROMPT)) return 'languages_text';
  // Public disclosure recipes target choices. A narrative mentioning gender,
  // disability, or veterans is still an open-ended question.
  if (!element.matches('select,button,input[type="checkbox"],input[type="radio"]') && !element.closest(PROMPT)) return '';
  if (/\b(?:gender|sex)\b/i.test(label) && !/pronoun/i.test(label)) return 'gender';
  if (/\b(?:race|ethnicity)\b/i.test(label)) return 'ethnicity';
  if (/sexual orientation|lgbt/i.test(label)) return 'lgbt_v2';
  if (/visible minority/i.test(label)) return 'visible_minority';
  if (/hispanic|latino/i.test(label)) return 'hispanic';
  if (/veteran/i.test(label)) return 'veteran_v2';
  if (/armed forces|have you served|are you serving/i.test(label)) return 'armed_forces';
  if (/disabilit/i.test(label)) return 'disability_v2';
  if (/18 (?:years|or older)|(?:over|under) 18|age of 18/i.test(label)) return /under/i.test(label) ? 'under18' : 'over18';
  return '';
}

export function workdayFieldMetadata(element) {
  const container = element.closest('[data-automation-id^="formField"],.field,fieldset');
  const row = element.closest(ROW);
  const rowKey = row?.getAttribute('data-automation-id') || row?.getAttribute('aria-labelledby');
  let binding = row && (rowRecords.get(row) || rowBindings.get(element.ownerDocument)?.get(rowKey));
  if (binding && !recordStillMatches(row, binding)) {
    rowRecords.delete(row); rowBindings.get(element.ownerDocument)?.delete(rowKey); binding = null;
  }
  let canonical = canonicalKey(element, container);
  const date = element.closest('[data-automation-id*="Date"], [id*="Date"], [id*="dateOfBirth"]');
  const component = /year|month|day/i.exec(element.getAttribute('data-automation-id') || element.getAttribute('aria-label') || '');
  if (date && component) {
    const dateKey = /startDate/i.test(date.id + date.getAttribute('data-automation-id')) ? 'startDate' : /endDate/i.test(date.id + date.getAttribute('data-automation-id')) ? 'endDate' : /dateOfBirth/i.test(date.id) ? 'birthday' : canonical;
    if (dateKey) canonical = `${dateKey}_${component[0].toLowerCase()}`;
  }
  const labelNode = container?.querySelector('label,legend');
  const label = labelNode?.textContent?.replace(/\s+/g, ' ').replace(/[\s*:]+$/, '').trim();
  const rowId = binding?.record.id || row?.getAttribute('data-automation-id') || row?.getAttribute('aria-labelledby');
  const metadata = {
    ats: { adapter: 'workday', version: WORKDAY_RECIPE_VERSION, canonicalKey: canonical, rowId, record: binding?.record,
      multiple: element.closest('[data-automation-id*="skills"], [data-automation-id*="ethnicit"], [data-automation-id*="pronoun"], [data-automation-id*="disabilit"]') != null || element.getAttribute('aria-multiselectable') === 'true' },
  };
  if (label) metadata.label = label;
  if (labelNode) metadata.required = /\*\s*$/.test(labelNode.textContent) || container?.getAttribute('aria-required') === 'true' || element.required || element.getAttribute('aria-required') === 'true';
  if (rowId && canonical) metadata.id = `workday:${rowId}:${canonical}`;
  if (row || element.closest(PROMPT)) metadata.description = '';
  return metadata;
}

function recordStillMatches(row, { record, original = {} }) {
  for (const element of row.querySelectorAll('input:not([type="hidden"]),select,button[aria-haspopup="listbox"]')) {
    const canonical = canonicalKey(element, element.closest('[data-automation-id^="formField"],.field,fieldset'));
    if (!['title', 'company', 'institution', 'degree', 'language', 'url'].includes(canonical)) continue;
    const prompt = workdayPromptContainer(element);
    const token = prompt?.querySelector('[data-automation-id="selectedItem"]');
    const actual = prompt ? token?.getAttribute('title') || token?.textContent : element.tagName === 'SELECT' ? element.value && element.selectedOptions[0]?.textContent : element.value || element.textContent;
    if (!actual || /^(select(?: one)?|choose)$/i.test(actual.trim())) continue;
    const field = { ats: { canonicalKey: canonical } };
    if (!workdayOptionMatches(field, actual, record[canonical]) && !workdayOptionMatches(field, actual, original[canonical])) return false;
  }
  return true;
}

export function workdayNeedsFill(field, profile) {
  if (field.ats?.rowId) {
    if (!field.ats.record) return false;
    if (!field.ats.canonicalKey) return field.hasExistingValue || field.currentValue ? false : null;
    const expected = workdayValue(field, profile);
    if (expected == null || expected === '' || typeof expected === 'string' && !expected.trim()) return false;
    if (field.type === 'checkbox' && !field.widget) return field.element.checked !== (expected === true || /^(true|yes|1)$/i.test(String(expected)));
    if (!Array.isArray(expected)) {
      const actual = field.type === 'select' ? field.element.value && field.element.selectedOptions[0]?.textContent : field.currentValue;
      if (/_(year|month|day)$/.test(field.ats.canonicalKey) && /^\d+$/.test(String(actual)) && /^\d+$/.test(String(expected))) return Number(actual) !== Number(expected);
      return !workdayOptionMatches(field, actual, expected);
    }
  }
  if (!field.ats?.multiple) return null;
  const expected = workdayValue(field, profile);
  if (!Array.isArray(expected)) return null;
  const container = workdayPromptContainer(field.element);
  const actual = field.widget === 'workday-choice' ? field.elements.filter(element => element.checked).map(element => field.options.find(option => option.value === element.value)?.label || element.value) : [...(container?.querySelectorAll('[data-automation-id="selectedItem"]') || [])].map(node => node.getAttribute('title') || node.textContent);
  return expected.some(value => !actual.some(label => workdayOptionMatches(field, label, value)));
}

export function workdayValue(field, profile) {
  const canonical = field.ats?.canonicalKey;
  const record = field.ats?.record;
  if (!canonical) return undefined;
  if (field.ats?.rowId && !record) return undefined;
  const date = /^(startDate|endDate|birthday|current_date)_(year|month|day)$/.exec(canonical);
  if (date) {
    const value = date[1] === 'birthday' ? profile.birthDate : date[1] === 'current_date' ? new Date().toLocaleDateString('en-CA') : record?.[date[1]];
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value || '')) return undefined;
    if (date[1] === 'endDate' && record?.current) return undefined;
    return value.split('-')[{ year: 0, month: 1, day: 2 }[date[2]]];
  }
  if (record && Object.hasOwn(record, canonical)) return record[canonical];
  if (canonical === 'source') return 'LinkedIn';
  if (canonical === 'over18' || canonical === 'under18') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate || '')) return '';
    const now = new Date(), [year, month, day] = profile.birthDate.split('-').map(Number);
    const age = now.getFullYear() - year - (now.getMonth() + 1 < month || now.getMonth() + 1 === month && now.getDate() < day ? 1 : 0);
    return (canonical === 'under18' ? age < 18 : age >= 18) ? 'Yes' : 'No';
  }
  if (canonical === 'current_date') return new Date().toLocaleDateString('en-CA');
  if (canonical === 'preferred_check') return Boolean(profile.preferredName || profile.preferredLastName);
  if (['first_name', 'last_name'].includes(canonical) && !profile[profileKeys[canonical]] && profile.fullName?.trim()) {
    const parts = profile.fullName.trim().split(/\s+/);
    return parts.length >= 2 ? canonical === 'first_name' ? parts[0] : parts.at(-1) : undefined;
  }
  if (canonical === 'skill') return profile.skills?.filter(Boolean);
  if (canonical === 'phone_country' || canonical === 'phone_stripped') {
    const parsed = parsePhoneNumberFromString(profile.phone || '', { defaultCountry: countryCode(profile.phoneCountry || profile.country) || undefined, extract: false });
    if (!parsed?.isPossible()) return undefined;
    const explicit = countryCode(profile.phoneCountry);
    if (explicit && parsed.country && explicit !== parsed.country) return undefined;
    if (canonical === 'phone_stripped') return parsed.nationalNumber;
    const code = explicit || parsed.country;
    return code ? countryNames.of(code) : undefined;
  }
  if (canonical === 'url') return profile.linkedin || undefined;
  if (canonical === 'pronouns') {
    const val = profile.pronouns;
    if (!val) return '';
    if (field.ats?.multiple) {
      const parts = String(val).split(/[\/\s,]+/).map(p => p.trim()).filter(Boolean);
      return parts.length >= 2 ? parts : [val];
    }
    return val;
  }
  const value = profile[profileKeys[canonical]];
  if (value) return value;
  // Optional disclosures have no factual fallback; unset means leave unanswered.
  if (['gender', 'ethnicity', 'pronouns', 'disability_v2', 'veteran_v2', 'lgbt_v2', 'hispanic', 'visible_minority', 'armed_forces'].includes(canonical)) return '';
  return undefined;
}

export function workdayAnswer(field, profile) {
  const value = workdayValue(field, profile);
  if (value === undefined || Array.isArray(value) && !value.length) return null;
  const answer = { fieldId: field.fieldId || field.id, value, inferred: false, provenance: 'saved' };
  if (['first_name', 'last_name'].includes(field.ats?.canonicalKey) && !profile[profileKeys[field.ats.canonicalKey]]) Object.assign(answer, { inferred: true, provenance: 'guessed' });
  if (field.ats?.canonicalKey === 'source' || field.ats?.canonicalKey?.startsWith('current_date')) answer.provenance = 'inferred';
  if (field.ats?.canonicalKey?.match(/_(?:month|day)$/) && /^\d+$/.test(String(value)) && ['number', 'text'].includes(field.type)) answer.value = String(Number(value));
  const choice = field.widget || ['combobox', 'select', 'radio'].includes(field.type) || field.type === 'checkbox' && field.ats?.multiple;
  if (!choice || value === '' || field.type === 'checkbox' && !field.widget && !field.ats?.multiple) return answer;
  const values = Array.isArray(value) ? value : [value];
  const matched = values.map(target => {
    const matches = (field.options || []).filter(option => workdayOptionMatches(field, option.label, target) || key(option.value) === key(target));
    return matches.length === 1 ? matches[0] : null;
  });
  if (matched.some(option => !option)) {
    const unrec = values.find((_, index) => !matched[index]);
    const query = field.ats?.canonicalKey === 'ethnicity' && /middle eastern|mena/i.test(unrec) ? 'Arab' : String(unrec);
    return { ...answer, value: '', ...(field.type === 'combobox' ? { searchQuery: query } : {}) };
  }
  const answers = matched.map(option => field.type === 'combobox' ? option.label : option.value);
  if (field.ats?.canonicalKey === 'ethnicity' && matched.some((option, index) => key(option.label) !== key(values[index]) && key(option.value) !== key(values[index]))) {
    answer.provenance = 'guessed';
    answer.inferred = true;
  }
  return { ...answer, value: Array.isArray(value) ? answers : answers[0] };
}

export function workdayOptionMatches(field, actual, expected) {
  if (key(actual) === key(expected)) return true;
  const canonical = field.ats?.canonicalKey;
  if (canonical === 'source') return key(expected) === 'linkedin' && /^(?:linkedin jobs|linkedin\.com)$/.test(key(actual));
  if (canonical === 'phone_country') actual = actual.replace(/\s*\(?\+\d+\)?\s*$/, '');
  if (key(actual) === key(expected)) return true;
  if (canonical === 'country' || canonical === 'phone_country') return countryCode(actual) && countryCode(actual) === countryCode(expected);
  if (canonical === 'disability_v2') {
    if (key(expected) === 'no') return /^no(?:\s*[-,]\s*|\s+)i (?:do not|don't) have (?:a|any) disabilit(?:y|ies)(?:\s*\(.*\))?$/i.test(actual);
    if (key(expected) === 'yes') return /^yes(?:\s*[-,]\s*|\s+)i have (?:a|any) disabilit(?:y|ies)(?:\s*\(.*\))?$/i.test(actual);
  }
  if (canonical === 'gender') {
    if (key(expected).replace(/[\s-]/g, '') === 'nonbinary' && key(actual).replace(/[\s-]/g, '') === 'nonbinary') return true;
    const aliases = { female: 'woman', male: 'man' };
    if (aliases[key(actual)] === key(expected) || aliases[key(expected)] === key(actual)) return true;
  }
  if (canonical === 'ethnicity') {
    if (/middle eastern|mena/i.test(key(expected))) return /arab|maghrebi|middle eastern/i.test(actual);
    if (/black|african/i.test(key(expected))) return /black|african/i.test(actual);
    if (/asian/i.test(key(expected))) return /asian|chinese|filipino|japanese|korean/i.test(actual);
    if (/white|caucasian/i.test(key(expected))) return /white|caucasian/i.test(actual);
    if (/hispanic|latino/i.test(key(expected))) return /hispanic|latino/i.test(actual);
    if (/indigenous|first nation|native/i.test(key(expected))) return /first nation|inuk|inuit|indigenous|aboriginal|native/i.test(actual);
  }
  if (canonical === 'pronouns') {
    if (key(actual) === key(expected)) return true;
    const parts = key(expected).split(/[\/\s,]+/);
    if (parts.includes(key(actual))) return true;
    const actualParts = key(actual).split(/[\/\s,]+/);
    if (actualParts.includes(key(expected))) return true;
  }
  if (key(expected) === 'prefer not to answer') return /^(?:(?:i )?(?:do not wish to answer|don't wish to answer|prefer not to (?:answer|say|disclose)|decline to (?:answer|disclose))|rather not answer)(?:\s*\([^)]*\))?$/i.test(actual);
  const aliases = { female: 'woman', male: 'man', 'bachelor of science': "bachelor's degree", 'bachelor of arts': "bachelor's degree", 'master of science': "master's degree", 'master of arts': "master's degree", 'ph.d.': 'doctorate' };
  return aliases[key(actual)] === key(expected);
}
