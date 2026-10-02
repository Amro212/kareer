import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { countryCode, explicitCountryCode, countryCodes, countryNames, eligibilityCanonicalKey, eligibilityOptionMatches } from './canonical.js';
import { fixedProfileAnswer } from '../profile.js';
import { optionKey, findExactOption, readComboboxSelection } from '../fields/combobox.js';
import { locationMatches } from '../location.js';

// Local recipes authored from the public Greenhouse/Ashby inventory. They map
// controls to existing profile facts; they do not interpret remote action code.
const profileKeys = {
  first_name: 'firstName', last_name: 'lastName', full_name: 'fullName',
  preferred_first_name: 'preferredName', preferred_last_name: 'preferredLastName',
  email: 'email', phone: 'phone', location: 'location', city: 'city', state: 'stateProvince',
  country: 'country', address: 'streetAddress', address_2: 'addressLine2', postal_code: 'postalCode',
  linkedin: 'linkedin', github: 'github', portfolio: 'portfolio', twitter: 'twitter', behance: 'behance',
  dribbble: 'dribbble', website: 'website', additional_url: 'additionalUrl', highestDegree: 'educationLevel',
  gender: 'gender', pronouns: 'pronouns', ethnicity: 'raceEthnicity', veteran_v2: 'veteranStatus',
  disability_v2: 'disabilityStatus', transgender: 'transgender', lgbt_v2: 'lgbtStatus', hispanic: 'hispanic',
};
export const DISCLOSURES = new Set(['gender', 'pronouns', 'ethnicity', 'veteran_v2', 'disability_v2', 'transgender', 'lgbt_v2', 'hispanic']);
export const rowBindings = new WeakMap();

export function applicationOptionMatches(field, actual, expected) {
  const key=field.ats?.canonicalKey;
  if (['location','city_state'].includes(key)) return locationMatches(actual,expected);
  if (['country','phone_country'].includes(key)) return Boolean(countryCode(actual.replace(/\s*\(?\+\d+\)?$/,'')) && countryCode(actual.replace(/\s*\(?\+\d+\)?$/,'')) === countryCode(expected));
  if (/_month$/.test(key || '')) {
    const month=value=>/^\d+$/.test(value) ? Number(value) : ['january','february','march','april','may','june','july','august','september','october','november','december'].findIndex(name=>name===optionKey(value) || name.slice(0,3)===optionKey(value))+1;
    return Boolean(month(actual) && month(actual)===month(expected));
  }
  if (['work_auth','sponsorship'].includes(key)) return eligibilityOptionMatches(key, actual, expected);
  return false;
}
const aliases = { name: 'full_name', legal_name: 'full_name', preferred_name: 'preferred_first_name', first_name_preferred: 'preferred_first_name', last_name_preferred: 'preferred_last_name', phone_number: 'phone', candidate_name: 'full_name', candidate_email: 'email', candidate_phone: 'phone', race: 'ethnicity', veteran: 'veteran_v2', veteran_status: 'veteran_v2', disability: 'disability_v2', disability_status: 'disability_v2', lgbt: 'lgbt_v2', hispanic_ethnicity: 'hispanic', authorization: 'work_auth', sponsorship: 'sponsorship', resume: 'resume', cover_letter: 'coverLetter', cover_letter_text: 'coverLetter' };

export function canonicalField(element, label, row = false) {
  const identifiers = [element.id, element.name, element.getAttribute('data-candidate-field'), element.getAttribute('autocomplete'), element.closest('[data-field-path]')?.getAttribute('data-field-path')]
    .filter(Boolean).map(value => value.replace(/^s2id_/, '').replace(/^_systemfield_/, '').replace(/^job_application\[([^\]]+)\]$/, '$1').replace(/-/g, '_'));
  for (const identifier of identifiers) {
    const auxiliary={source:'source',work_auth:'work_auth',current_company_name:'current_company_name',phone_country:'phone_country',phone_stripped:'phone_stripped',country_location:'country',city_state_full:'location',city_state:'city_state'};
    if (auxiliary[identifier]) return auxiliary[identifier];
    if (profileKeys[identifier] || aliases[identifier]) return aliases[identifier] || identifier;
  }
  const text = optionKey(label).replace(/[\s*:]+$/, '');
  if (row) {
    const identity = identifiers.join(' ');
    if (/currently|current(?:ly)? work|still (?:work|student)|isCurrent/i.test(text + identity) && element.type === 'checkbox') return 'current';
    const date = /\b(start|end|grad(?:uation)?)(?:\s+date)?\s+(month|year)\b/i.exec(text) || /(?:start|end|grad)[_-](?:date[_-])?(month|year)/i.exec(identity);
    if (date) {
      const side = /^(start)/i.test(date[0]) ? 'startDate' : 'endDate';
      return `${side}_${date.at(-1).toLowerCase()}`;
    }
    if (/start.*date/i.test(text + identity)) return 'startDate';
    if (/(?:end|grad).*date/i.test(text + identity)) return 'endDate';
    if (/^(?:company(?: name)?|employer)$/.test(text) || /employment_company_name/.test(identity)) return 'company';
    if (/^(?:job |position )?title$/.test(text) || /employment_title/.test(identity)) return 'title';
    if (/^(?:school(?: name)?|institution|university)$/.test(text) || /education[_-](?:history[_-])?school/.test(identity)) return 'institution';
    if (/^(?:degree|degree type)$/.test(text) || /education.*degree/.test(identity)) return 'degree';
    if (/^(?:major|field of study|discipline)$/.test(text) || /education.*(?:major|discipline)/.test(identity)) return 'fieldOfStudy';
    if (/^(?:gpa|grade point average)$/.test(text)) return 'gpa';
  }
  if (/^(?:first name|given name)$/.test(text)) return 'first_name';
  if (/^(?:last name|family name|surname)$/.test(text)) return 'last_name';
  if (/^(?:name|full name|legal name)$/.test(text)) return 'full_name';
  if (/^(?:preferred (?:first )?name|nickname)$/.test(text)) return 'preferred_first_name';
  if (/^preferred last name$/.test(text)) return 'preferred_last_name';
  if (/^(?:email|email address)$/.test(text)) return 'email';
  if (/^(?:phone|phone number|mobile|mobile number)$/.test(text)) return 'phone';
  if (/^(?:location(?: \(city\))?|current location|where do you live\??(?: \(city and state\/province\))?)$/.test(text) || identifiers.includes('candidate_location')) return 'location';
  if (/^city(?:,? (?:state|province)(?:\/province)?(?:,? country)?)?$/.test(text)) return text === 'city' ? 'city' : 'city_state';
  if (/^(?:country|country of residence|where are you located\?)$/.test(text)) return 'country';
  if (/^(?:state|province|state\s*\/\s*province)$/.test(text)) return 'state';
  if (/^(?:address|street address|mailing address|address line 1)$/.test(text)) return 'address';
  if (/^(?:address line 2|apartment|apt, suite, unit)$/.test(text)) return 'address_2';
  if (/^(?:zip(?: code)?|postal(?: code)?|postal\/zip code)$/.test(text)) return 'postal_code';
  for (const key of ['linkedin', 'github', 'portfolio', 'twitter', 'behance', 'dribbble', 'website']) if (new RegExp(`^(?:your )?${key}(?: (?:url|link|profile|profile url))?$`).test(text)) return key;
  if (/^(?:additional|other) (?:url|website|link)$/.test(text)) return 'additional_url';
  if (/^(?:current company(?: name)?|current employer)$/.test(text)) return 'current_company_name';
  if (/highest (?:degree|level of education)|^education level$/.test(text)) return 'highestDegree';
  if (/^(?:how (?:did|do) you (?:hear|learn)|where did you (?:hear|find)|(?:application|referral) source|source)/.test(text)) return 'source';
  const choice = element.matches('select,button,input[type=checkbox],input[type=radio],[role=combobox],input[aria-autocomplete],.ashby-application-form-input-yesno,.select2-container');
  const eligibility = choice && eligibilityCanonicalKey(text);
  if (eligibility) return eligibility;
  if (choice || element.matches('input') && text.length < 50) {
    if (/transgender/.test(text)) return 'transgender';
    if (/^(?:what (?:is|are) your |your |please (?:select|indicate) your )?(?:gender(?: identity)?|sex)(?: \(optional\))?$/.test(text) || /^i identify my gender as/.test(text)) return 'gender';
    if (/^pronouns(?: \(optional\))?$/.test(text)) return 'pronouns';
    if (/^(?:race(?:\s*(?:and|\/|&)\s*ethnicity)?|ethnicity)(?: \(optional\))?$/.test(text)) return 'ethnicity';
    if (/veteran/.test(text)) return 'veteran_v2';
    if (/disabilit/.test(text)) return 'disability_v2';
    if (/hispanic|latino/.test(text)) return 'hispanic';
    if (/lgbt|sexual orientation/.test(text)) return 'lgbt_v2';
  }
  return '';
}

export function applicationMetadata(element, adapter, { container, title, rowSelector } = {}) {
  const row = rowSelector && element.closest(rowSelector);
  const binding = row && rowBindings.get(row);
  const wrapped = element.closest('label')?.cloneNode(true);
  wrapped?.querySelectorAll('input,select,textarea,button,[role=listbox]').forEach(node => node.remove());
  const label = (title?.textContent || element.getAttribute('aria-label') || element.ownerDocument.querySelector(`label[for="${CSS.escape(element.id || '')}"]`)?.textContent || wrapped?.textContent || '').replace(/[\s*:]+$/, '').trim();
  const canonical = canonicalField(element, label, Boolean(row));
  const multiple = element.getAttribute('aria-multiselectable') === 'true' || Boolean(element.closest('.select__value-container--is-multi, .select__control--is-multi,.select2-container-multi')) || Boolean(container?.querySelector('.select__value-container--is-multi,select[multiple]'));
  const metadata = { ats: { adapter, version: 1, canonicalKey: canonical, multiple,
    ...(row ? { rowId: binding?.record.id || row.id || row.getAttribute('data-kareer-row') || `unbound-${[...row.parentElement.querySelectorAll(rowSelector)].indexOf(row)}`, record: binding?.record } : {}) } };
  if (row && /^(startDate|endDate)$/.test(canonical)) {
    const placeholder=element.getAttribute('placeholder') || '';
    metadata.ats.dateFormat=element.type==='date'?'date':element.type==='month'?'month':/MM\s*\/\s*YYYY/i.test(placeholder)?'month/year':element.matches('select') && [...element.options].filter(option=>option.value).every(option=>/^\d{4}$/.test(option.textContent.trim()))?'year':'';
  }
  if (label) metadata.label = label;
  if (title) metadata.required = Boolean(element.required || element.getAttribute('aria-required') === 'true' || /\*\s*$/.test(title.textContent) || /(?:^|\s)_required_/.test(title.className));
  if (container?.querySelector('.ashby-application-form-question-description')) metadata.description = container.querySelector('.ashby-application-form-question-description').textContent.trim();
  if (row && canonical) metadata.id = `${adapter}:${metadata.ats.rowId}:${canonical}`;
  return metadata;
}

export function eligibilityValue(field, profile, jobContext) {
  const label = `${field.label || ''} ${field.description || ''}`;
  const normalized = ` ${optionKey(label).replace(/[^\p{L}\p{N}]+/gu,' ')} `;
  const countries = [...countryCodes].filter(code => normalized.includes(` ${optionKey(countryNames.of(code)).replace(/[^\p{L}\p{N}]+/gu,' ')} `));
  if (/\b(?:u\.s\.(?:a\.)?|USA|US)\b/.test(label) || /\b(?:u s|u s a|usa)\b/.test(normalized)) countries.push('US');
  if (/\b(?:u k|uk)\b/.test(normalized)) countries.push('GB');
  if (/\b(?:uae|u a e)\b/.test(normalized)) countries.push('AE');
  const uniqueCountries = [...new Set(countries)];
  if (uniqueCountries.length > 1) return '';
  // An unrecognized explicit work country is not an implicit-country question.
  if (!uniqueCountries.length && /\b(?:work|employment|sponsorship)(?: authorization| eligibility)? (?:in|within) (?!(?:(?:the|a) )?(?:(?:job |work )?country|future)\b|(?:this|that)\b)/.test(normalized)) return '';
  const jobCountry = typeof jobContext?.workCountry === 'string' ? countryCode(jobContext.workCountry) : explicitCountryCode(jobContext?.location?.split(',').at(-1)?.trim());
  const target = uniqueCountries.length === 1 ? uniqueCountries[0] : jobCountry;
  const records = (profile.workEligibilities?.length ? profile.workEligibilities : [{ country:profile.workCountry, workAuthorization:profile.workAuthorization, sponsorshipNow:profile.sponsorshipNow, sponsorshipFuture:profile.sponsorshipFuture }]).filter(record => record.enabled !== false && (!target || countryCode(record.country) === target));
  if (records.length !== 1) return '';
  const record = records[0];
  if (field.ats?.canonicalKey === 'work_auth') {
    if (!/\bwithout\b.*(?:sponsor|visa)|\b(?:do not|not) (?:require|need).*sponsor/i.test(label)) return record.workAuthorization || '';
    const sponsorship = /future|ever/i.test(label)
      ? /now|current/i.test(label) ? [record.sponsorshipNow,record.sponsorshipFuture] : [record.sponsorshipFuture]
      : [record.sponsorshipNow];
    if (record.workAuthorization === 'No' || sponsorship.includes('Yes')) return 'No';
    return record.workAuthorization === 'Yes' && sponsorship.every(value => value === 'No') ? 'Yes' : '';
  }
  if (field.ats?.canonicalKey === 'sponsorship_now') return record.sponsorshipNow || '';
  if (field.ats?.canonicalKey === 'sponsorship_future') return record.sponsorshipFuture || '';
  if (/future|ever/i.test(label)) return /now|current/i.test(label) ? record.sponsorshipNow === 'Yes' || record.sponsorshipFuture === 'Yes' ? 'Yes' : record.sponsorshipNow === 'No' && record.sponsorshipFuture === 'No' ? 'No' : '' : record.sponsorshipFuture || '';
  if (/now|current/i.test(label)) return record.sponsorshipNow || '';
  return record.sponsorshipNow === record.sponsorshipFuture ? record.sponsorshipNow || '' : '';
}

export function applicationProfileValue(field, profile, { jobContext } = {}) {
  const key = field.ats?.canonicalKey;
  if (!key) return undefined;
  if (field.ats.rowId) {
    const record = field.ats.record;
    if (!record) return '';
    const date = /^(startDate|endDate)_(month|year)$/.exec(key);
    if (date) return date[1] === 'endDate' && record.current ? '' : record[date[1]]?.split('-')[date[2] === 'year' ? 0 : 1] || '';
    if (key === 'endDate' && record.current) return '';
    if (/^(startDate|endDate)$/.test(key) && record[key]) {
      const [year,month,day]=record[key].split('-');
      if (field.ats.dateFormat==='year') return year;
      if (field.ats.dateFormat==='month/year') return month && year ? `${month}/${year}` : '';
      if (field.ats.dateFormat==='date') return day ? record[key] : ''; // Never invent a missing day.
      if (field.ats.dateFormat==='month') return month ? `${year}-${month}` : '';
    }
    return record[key] ?? '';
  }
  if (key === 'source') return 'LinkedIn';
  if (['work_auth', 'sponsorship'].includes(key)) return eligibilityValue(field, profile, jobContext) || profile.savedAnswers?.[field.label] || '';
  if (key === 'current_company_name') {
    const current = profile.workExperiences?.filter(record => record.enabled !== false && record.current);
    return current?.length === 1 ? current[0].company || '' : '';
  }
  if (key === 'city_state') return [profile.city, profile.stateProvince].filter(Boolean).join(', ');
  if (key === 'phone_country' || key === 'phone_stripped') {
    const parsed = parsePhoneNumberFromString(profile.phone || '', { defaultCountry: countryCode(profile.phoneCountry || profile.country) || undefined, extract:false });
    const explicit = countryCode(profile.phoneCountry);
    if (!parsed?.isPossible() || explicit && parsed.country && explicit !== parsed.country) return '';
    const code = explicit || parsed.country;
    return key === 'phone_stripped' ? parsed.nationalNumber : code ? new Intl.DisplayNames(['en'], {type:'region'}).of(code) : '';
  }
  if (key === 'location') return profile.location || [profile.city, profile.stateProvince, profile.country].filter(Boolean).join(', ');
  if (key === 'gender' && profile.gender === 'Self-describe') return profile.genderDescription || '';
  return profileKeys[key] ? profile[profileKeys[key]] || '' : undefined;
}

export function applicationAnswer(field, profile, options = {}) {
  let value = applicationProfileValue(field, profile, options);
  if (value === undefined) return null;
  if (value === '' && !field.ats.rowId) {
    value = profile.savedAnswers?.[field.label] ?? '';
  }
  const answer = { fieldId:field.fieldId || field.id, value, inferred:false, provenance:field.ats.canonicalKey === 'source' ? 'inferred' : 'saved' };
  if (field.type === 'checkbox' && !field.widget || value === '' || !['combobox','select','radio'].includes(field.type)) return answer;
  const values = Array.isArray(value) ? value : [value];
  const matches = values.map(item => findExactOption(field.options || [], item, field));
  if (matches.some(item => !item)) {
    // Resolve known aliases first; otherwise the page request handles this field.
    const labels={gender:'Gender',pronouns:'Pronouns',ethnicity:'Ethnicity',veteran_v2:'Veteran status',disability_v2:'Disability status',source:'Source'};
    const alias = labels[field.ats.canonicalKey] ? fixedProfileAnswer({...field,label:labels[field.ats.canonicalKey]}, profile, options) : null;
    return alias?.value ? { ...answer, ...alias, provenance:answer.provenance } : { ...answer, value:'', ...(field.type === 'combobox' && options.allowSearch !== false && !['work_auth','sponsorship'].includes(field.ats.canonicalKey) ? {searchQuery:String(value)} : {}) };
  }
  return { ...answer, value: Array.isArray(value) ? matches.map(item => field.type === 'combobox' ? item.label : item.value) : field.type === 'combobox' ? matches[0].label : matches[0].value };
}

export function applicationNeedsFill(field, profile) {
  if (field.ats?.rowId && !field.ats.record) return false;
  if (field.ats?.multiple) {
    const value = applicationProfileValue(field, profile);
    if (Array.isArray(value)) return value.some(expected => !readComboboxSelection(field.element).some(actual => optionKey(actual) === optionKey(expected)));
  }
  return null;
}

export function checkboxQuestions(root, adapter) {
  return [...root.querySelectorAll('fieldset,.demographic_question,.ashby-application-form-field-entry')].flatMap(container => {
    const elements = [...container.querySelectorAll('input[type=checkbox]')];
    if (!elements.length || container.querySelector('fieldset,.demographic_question,.ashby-application-form-field-entry')) return [];
    const metadata = adapter.fieldMetadata(elements[0]);
    if (!DISCLOSURES.has(metadata?.ats?.canonicalKey)) return [];
    const options = elements.map(element => ({value:element.value, label:element.closest('label')?.textContent.trim() || element.ownerDocument.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent.trim() || element.value}));
    return [{...metadata,id:container.id || elements[0].name || elements[0].id,type:'radio',widget:'ats-choice',element:container,elements,options,
      ats:{...metadata.ats,multiple:elements.length > 1},required:metadata.required || container.getAttribute('aria-required') === 'true',
      currentValue:elements.filter(element => element.checked).map(element => element.value).join(', '),constraints:{},isNarrative:false}];
  });
}

export function fillCheckboxQuestion(field, value, {checkbox}) {
  const values = Array.isArray(value) ? value : [value];
  if (values.some(item => !field.options.some(option => option.value === item))) return false;
  for (const element of field.elements) {
    const wanted = values.includes(element.value);
    if (element.checked !== wanted) checkbox(element, wanted);
  }
  return true;
}

export function applicationUploadState(element, containerSelector, nameSelector) {
  const container = element.closest(containerSelector) || element.parentElement;
  const visible = node => !node.closest('[hidden],[aria-hidden=true]') && node.ownerDocument.defaultView.getComputedStyle(node).display !== 'none';
  const attached = element.files?.[0]?.name;
  const names = [...container.querySelectorAll(nameSelector)].filter(visible)
    .map(node => node.getAttribute('data-file-name') || node.textContent.trim()).filter(Boolean);
  const name = [...new Set(names)].length === 1 ? names[0] : attached && names.some(value => value.includes(attached)) ? attached : '';
  const rejected = [...container.querySelectorAll('[aria-invalid=true],[role=alert],.error,.field-error')].some(node => visible(node) && /error|failed|invalid|rejected/i.test(node.textContent));
  const busy = [...container.querySelectorAll('[aria-busy=true],[role=progressbar]')].some(visible);
  return {name,accepted:Boolean(name && !busy && !rejected)};
}
