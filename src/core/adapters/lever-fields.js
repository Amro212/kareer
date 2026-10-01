/**
 * Lever canonical field recognition and deterministic answer resolution.
 */
import {
  canonicalNorm,
  canonicalProfileValue,
  canonicalOptionMatches,
  countryCode,
  countryCodes,
  countryNames,
  isDeclineOption,
  OPTIONAL_DISCLOSURE_KEYS,
} from './canonical.js';
import { isAllCapsHeading } from './lever.js';

export const LEVER_RECIPE_VERSION = 1;

const BUILTIN_MAPPINGS = [
  ['full_name', ['name']],
  ['email', ['email']],
  ['phone', ['phone']],
  ['company', ['org']],
  ['location', ['location']],
  ['comments', ['comments']],
  ['resume', ['resume']],
];

const URL_MAPPINGS = [
  ['linkedin', /linkedin/i],
  ['github', /github/i],
  ['portfolio', /portfolio/i],
  ['twitter', /twitter/i],
  ['website', /other|website|urls/i],
];

function questionCountryCode(field) {
  const raw = `${field.label || ''} ${field.description || ''}`;
  const normalized = ` ${canonicalNorm(raw).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  if (/\b(?:u s|u s a|usa)\b/.test(normalized)) return 'US';
  if (/\b(?:u k|uk)\b/.test(normalized)) return 'GB';
  for (const code of countryCodes) {
    const name = canonicalNorm(countryNames.of(code)).replace(/[^\p{L}\p{N}]+/gu, ' ');
    if (name && normalized.includes(` ${name} `)) return code;
  }
  return '';
}

function eligibilityRecord(field, profile) {
  const records = (profile.workEligibilities || []).filter(record => record?.enabled !== false && record.country);
  if (!records.length) return null;
  const target = questionCountryCode(field);
  if (target) return records.find(record => countryCode(record.country) === target);
  return records.length === 1 ? records[0] : undefined;
}

function combinedSponsorship(record, profile) {
  const now = record ? record.sponsorshipNow : profile.sponsorshipNow;
  const future = record ? record.sponsorshipFuture : profile.sponsorshipFuture;
  if (now === 'Yes' || future === 'Yes') return 'Yes';
  if (now === 'No' && future === 'No') return 'No';
  return undefined;
}

export function leverCanonicalKey(element, container) {
  const name = element?.name || '';
  const id = element?.id || '';

  // Built-in inputs
  for (const [canonical, identifiers] of BUILTIN_MAPPINGS) {
    if (identifiers.includes(name) || identifiers.includes(id)) {
      if (element.type === 'file' && canonical !== 'resume') continue;
      return canonical;
    }
  }

  // URLs pattern: urls[LinkedIn], urls[GitHub], etc.
  if (/^urls\[/i.test(name) || /url/i.test(name + id)) {
    for (const [canonical, regex] of URL_MAPPINGS) {
      if (regex.test(name) || regex.test(id)) return canonical;
    }
    return 'website';
  }

  if (element.type === 'file') return 'resume';

  if (element?.getAttribute?.('data-qa') === 'university-dropdown' || /^university-picker(?:-|$)/i.test(id)) return 'school';

  // Label text heuristics
  const labelText = extractQuestionText(element, container);
  if (!labelText) return '';

  if (/how (?:did|do) you hear|where did you hear/i.test(labelText)) return 'source';
  if (/desired.*(?:salary|compensation|comp|pay)|compensation.*range|salary.*range/i.test(labelText)) return 'salary';
  if (/where do you live|current location|city.*(?:and|,).*state/i.test(labelText)) return 'location';
  if (/authoriz.*(?:work|employment)|legally.*work/i.test(labelText)) return 'work_auth';
  if (/require.*sponsorship|visa.*sponsorship|sponsor.*employment/i.test(labelText)) return 'sponsorship';
  if (/notice.*period/i.test(labelText)) return 'notice_period';
  if (/when can you start|earliest.*start.*date|start.*date/i.test(labelText)) return 'start_date';
  if (/linkedin/i.test(labelText)) return 'linkedin';
  if (/github/i.test(labelText)) return 'github';
  if (/portfolio|website/i.test(labelText)) return 'portfolio';
  const schoolLabel = canonicalNorm(labelText).replace(/[\s?*:]+$/, '');
  if (/^(?:school|university|college|institution)(?: name)?$/.test(schoolLabel) ||
      /^(?:university or college|college or university)$/.test(schoolLabel) ||
      /^(?:name of|what is the name of) (?:your |the )?(?:school|university|college|institution)$/.test(schoolLabel) ||
      /^(?:what|which) (?:post[- ]secondary |educational )?(?:school|university|college|institution)(?: (?:or|and) (?:school|university|college))? (?:do|did) you (?:attend|graduate from)$/.test(schoolLabel)) return 'school';

  // Demographics / EEO heuristics
  const isChoice = Boolean(
    element.widget ||
    ['select', 'select-one', 'select-multiple', 'radio', 'checkbox', 'combobox'].includes(element.type) ||
    element.matches?.('select, input[type="radio"], input[type="checkbox"], [role="combobox"], button[aria-haspopup="listbox"]')
  );
  if (!isChoice) return '';
  if (/\b(?:gender|sex)\b/i.test(labelText) && !/pronoun/i.test(labelText)) return 'gender';
  if (/\b(?:race|ethnicity)\b/i.test(labelText)) return 'ethnicity';
  if (/sexual orientation|lgbt/i.test(labelText)) return 'lgbt_v2';
  if (/visible minority/i.test(labelText)) return 'visible_minority';
  if (/hispanic|latino/i.test(labelText)) return 'hispanic';
  if (/veteran/i.test(labelText)) return 'veteran_v2';
  if (/armed forces|have you served/i.test(labelText)) return 'armed_forces';
  if (/disabilit/i.test(labelText)) return 'disability_v2';
  if (/18 (?:years|or older)|(?:over|under) 18|age of 18/i.test(labelText)) return /under/i.test(labelText) ? 'under18' : 'over18';

  return '';
}

function extractQuestionText(element, container) {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (element.label && !isAllCapsHeading(element.label)) return element.label;
  const cont = container || (typeof element.closest === 'function' ? element.closest('.application-question, .custom-question, label') : null);
  const title = cont?.querySelector?.('.application-label, .text, label') ||
    (typeof element.closest === 'function' ? element.closest('label')?.querySelector?.('.application-label') : null);
  if (title) {
    const text = title.textContent.replace(/[✱*:]+\s*$/, '').trim();
    if (text && !isAllCapsHeading(text)) return text;
  }
  const ariaLabel = typeof element.getAttribute === 'function' ? element.getAttribute('aria-label') : null;
  if (ariaLabel && !isAllCapsHeading(ariaLabel)) return ariaLabel.trim();
  return '';
}

export function leverFieldMetadata(element) {
  if (!element) return null;
  const isDom = typeof element.getAttribute === 'function';
  const container = typeof element.closest === 'function'
    ? element.closest('.application-question, .custom-question, label')
    : null;
  const title = container?.querySelector?.('.application-label, .text') ||
    (typeof element.closest === 'function' ? element.closest('label')?.querySelector?.('.application-label') : null);
  const rawLabel = title
    ? title.textContent.replace(/[✱*:]+\s*$/, '').trim()
    : ((isDom ? element.getAttribute('aria-label') : null) || element.label || '');
  const label = isAllCapsHeading(rawLabel)
    ? ((isDom ? element.getAttribute('placeholder') : null) || '')
    : rawLabel;

  const canonical = element.ats?.canonicalKey || leverCanonicalKey(element, container);
  const required = Boolean(
    element.required ||
    (isDom && element.getAttribute('aria-required') === 'true') ||
    container?.querySelector?.('.required, .required-field') != null ||
    (title && /[✱*]/.test(title.textContent))
  );

  const metadata = {
    id: element.id || element.name || element.fieldId || undefined,
    label: label,
    description: container?.querySelector?.('.description')?.textContent.trim() || element.description || '',
    required,
    ats: {
      adapter: 'lever',
      version: LEVER_RECIPE_VERSION,
      canonicalKey: canonical,
    },
  };

  return metadata;
}

export function leverValue(field, profile) {
  const canonical = field.ats?.canonicalKey || leverCanonicalKey(field.element || field);
  if (!canonical) return undefined;
  if (['work_auth', 'sponsorship', 'sponsorship_now', 'sponsorship_future'].includes(canonical)) {
    const record = eligibilityRecord(field, profile);
    if (record === undefined) return undefined;
    if (canonical === 'sponsorship' && /\bnow\b.*\bfuture\b|\bfuture\b.*\bnow\b/i.test(field.label || '')) {
      return combinedSponsorship(record, profile);
    }
    if (record) return canonicalProfileValue(canonical, profile, record);
  }
  return canonicalProfileValue(canonical, profile);
}

export function leverAnswer(field, profile) {
  const canonical = field.ats?.canonicalKey || leverCanonicalKey(field.element || field);
  const value = leverValue(field, profile);
  const required = Boolean(field.required);

  // If unset disclosure is required, fall back to "Prefer not to say" / decline option
  if ((value === undefined || value === '') && OPTIONAL_DISCLOSURE_KEYS.has(canonical) && required && field.options?.length) {
    const declineOption = field.options.find(opt => isDeclineOption(opt.label) || isDeclineOption(opt.value));
    if (declineOption) {
      return {
        fieldId: field.fieldId || field.id,
        value: field.type === 'combobox' ? declineOption.label : declineOption.value,
        inferred: true,
        provenance: 'inferred',
        source: 'profile',
      };
    }
  }

  if (value === undefined) return null;

  const answer = {
    fieldId: field.fieldId || field.id,
    value,
    inferred: false,
    provenance: 'saved',
    source: 'profile',
  };


  const choice = field.widget || ['combobox', 'select', 'radio'].includes(field.type) || (field.type === 'checkbox' && field.ats?.multiple);
  if (!choice || value === '') return answer;

  const values = Array.isArray(value) ? value : [value];
  const matched = values.map(target => {
    const matches = (field.options || []).filter(opt =>
      leverOptionMatches(field, opt.label, target) ||
      canonicalNorm(opt.value) === canonicalNorm(target)
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const exactValue = matches.find(opt => canonicalNorm(opt.value) === canonicalNorm(target));
      if (exactValue) return exactValue;
      const exactLabel = matches.filter(opt => canonicalNorm(opt.label) === canonicalNorm(target));
      if (exactLabel.length >= 1) return exactLabel[0];
      if (matches.every(opt => canonicalNorm(opt.label) === canonicalNorm(matches[0].label))) {
        return matches[0];
      }
    }
    return null;
  });

  if (matched.some(opt => !opt)) {
    // If location combobox doesn't have options yet, set searchQuery to trigger async search
    if (field.type === 'combobox' || field.widget === 'lever-location') {
      const query = profile.city || (profile.location ? profile.location.split(',')[0].trim() : String(value));
      return { ...answer, value: '', searchQuery: query };
    }
    return { ...answer, value: '' };
  }

  const answers = matched.map(opt => field.type === 'combobox' ? opt.label : opt.value);
  return { ...answer, value: Array.isArray(value) ? answers : answers[0] };
}

export function leverOptionMatches(field, actual, expected) {
  const canonical = field.ats?.canonicalKey || leverCanonicalKey(field.element || field);
  return canonicalOptionMatches(canonical, actual, expected);
}

export function leverNeedsFill(field, profile) {
  if (field.widget === 'lever-pronouns' || field.id === 'candidatePronounsCheckboxes') {
    const checked = (field.elements || []).filter(el => el.checked);
    if (checked.length > 1) return true;
  }
  return null;
}
