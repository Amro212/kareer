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
import { locationMatches } from '../location.js';

export const canonicalNorm = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

export const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const frenchCountries = new Intl.DisplayNames(['fr'], { type: 'region' });
export const countryCodes = new Set(getCountries());

export function countryCode(name) {
  if (!name) return '';
  if (/^[a-z]{2}$/i.test(name)) return countryCodes.has(name.toUpperCase()) ? name.toUpperCase() : '';
  for (const code of getCountries()) {
    if ([countryNames.of(code), frenchCountries.of(code)].some(value => canonicalNorm(value) === canonicalNorm(name))) return code;
  }
  return { usa: 'US', uk: 'GB', 'united states of america': 'US' }[canonicalNorm(name)] || '';
}

export const CANONICAL_PROFILE_KEYS = {
  first_name: 'firstName',
  last_name: 'lastName',
  middle_name: 'middleName',
  preferred_name: 'preferredName',
  preferred_last_name: 'preferredLastName',
  full_name: 'fullName',
  email: 'email',
  phone_type: 'phoneType',
  phone_extension: 'phoneExtension',
  country: 'country',
  state: 'stateProvince',
  address: 'streetAddress',
  address_2: 'addressLine2',
  address_3: 'addressLine3',
  city: 'city',
  postal_code: 'postalCode',
  location: 'location',
  highestDegree: 'educationLevel',
  gender: 'gender',
  ethnicity: 'raceEthnicity',
  pronouns: 'pronouns',
  disability_v2: 'disabilityStatus',
  veteran_v2: 'veteranStatus',
  hispanic: 'hispanic',
  lgbt_v2: 'lgbtStatus',
  visible_minority: 'visibleMinority',
  armed_forces: 'armedForces',
  birthday: 'birthDate',
  linkedin: 'linkedin',
  github: 'github',
  portfolio: 'portfolio',
  twitter: 'twitter',
  languages_text: 'languages',
  work_auth: 'workAuthorization',
  sponsorship: 'sponsorshipFuture',
  sponsorship_now: 'sponsorshipNow',
  sponsorship_future: 'sponsorshipFuture',
  salary: 'expectedSalary',
  start_date: 'startDate',
  notice_period: 'noticePeriod',
  relocation: 'willingToRelocate',
};

export const OPTIONAL_DISCLOSURE_KEYS = new Set([
  'gender', 'ethnicity', 'pronouns', 'disability_v2', 'veteran_v2',
  'lgbt_v2', 'hispanic', 'visible_minority', 'armed_forces',
]);

export function canonicalProfileValue(canonical, profile, record) {
  if (!canonical || !profile) return undefined;

  const date = /^(startDate|endDate|birthday|current_date)_(year|month|day)$/.exec(canonical);
  if (date) {
    const value = date[1] === 'birthday' ? profile.birthDate : date[1] === 'current_date' ? new Date().toLocaleDateString('en-CA') : record?.[date[1]];
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(value || '')) return undefined;
    if (date[1] === 'endDate' && record?.current) return undefined;
    return value.split('-')[{ year: 0, month: 1, day: 2 }[date[2]]];
  }

  if (record && Object.hasOwn(record, canonical)) return record[canonical];
  if (canonical === 'source') return 'LinkedIn';
  if (canonical === 'current_date') return new Date().toLocaleDateString('en-CA');
  if (canonical === 'preferred_check') return Boolean(profile.preferredName || profile.preferredLastName);

  if (canonical === 'over18' || canonical === 'under18') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate || '')) return '';
    const now = new Date(), [year, month, day] = profile.birthDate.split('-').map(Number);
    const age = now.getFullYear() - year - (now.getMonth() + 1 < month || now.getMonth() + 1 === month && now.getDate() < day ? 1 : 0);
    return (canonical === 'under18' ? age < 18 : age >= 18) ? 'Yes' : 'No';
  }

  if (['first_name', 'last_name'].includes(canonical) && !profile[CANONICAL_PROFILE_KEYS[canonical]] && profile.fullName?.trim()) {
    const parts = profile.fullName.trim().split(/\s+/);
    return parts.length >= 2 ? canonical === 'first_name' ? parts[0] : parts.at(-1) : undefined;
  }

  if (canonical === 'full_name') {
    if (profile.fullName?.trim()) return profile.fullName.trim();
    const joined = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    if (joined) return joined;
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

  if (canonical === 'phone') {
    return profile.phone || undefined;
  }

  if (canonical === 'location') {
    if (profile.location?.trim()) return profile.location.trim();
    const parts = [profile.city, profile.stateProvince, profile.country].filter(Boolean);
    if (parts.length) return parts.join(', ');
  }

  if (canonical === 'url') return profile.linkedin || undefined;

  if (canonical === 'pronouns') {
    const val = profile.pronouns;
    if (!val) return '';
    return val;
  }

  if (canonical === 'work_auth') {
    return profile.workAuthorization || undefined;
  }

  if (canonical === 'sponsorship' || canonical === 'sponsorship_future') {
    return profile.sponsorshipFuture || profile.sponsorshipNow || undefined;
  }

  if (canonical === 'sponsorship_now') {
    return profile.sponsorshipNow || profile.sponsorshipFuture || undefined;
  }

  if (canonical === 'salary') {
    if (profile.expectedSalary) {
      const curr = profile.salaryCurrency ? ` ${profile.salaryCurrency}` : '';
      return `${profile.expectedSalary}${curr}`;
    }
  }

  const directKey = CANONICAL_PROFILE_KEYS[canonical];
  const value = directKey ? profile[directKey] : undefined;
  if (value) return value;

  // Optional disclosures have no factual fallback; unset means leave blank.
  if (OPTIONAL_DISCLOSURE_KEYS.has(canonical)) return '';

  return undefined;
}

export function canonicalOptionMatches(canonical, actual, expected) {
  const normActual = canonicalNorm(actual);
  const normExpected = canonicalNorm(expected);
  if (normActual === normExpected) return true;

  if (canonical === 'location') {
    return locationMatches(actual, expected);
  }

  if (canonical === 'source') {
    return normExpected === 'linkedin' && /^(?:linkedin jobs|linkedin\.com)$/.test(normActual);
  }

  if (canonical === 'phone_country') {
    const cleaned = actual.replace(/\s*\(?\+\d+\)?\s*$/, '');
    if (canonicalNorm(cleaned) === normExpected) return true;
    return countryCode(cleaned) && countryCode(cleaned) === countryCode(expected);
  }

  if (canonical === 'country') {
    return countryCode(actual) && countryCode(actual) === countryCode(expected);
  }

  if (canonical === 'disability_v2') {
    if (normExpected === 'no') return /^no(?:\s*[-,]\s*|\s+)i (?:do not|don't) have (?:a|any) disabilit(?:y|ies)(?:\s*\(.*\))?$/i.test(actual);
    if (normExpected === 'yes') return /^yes(?:\s*[-,]\s*|\s+)i have (?:a|any) disabilit(?:y|ies)(?:\s*\(.*\))?$/i.test(actual);
  }

  if (canonical === 'gender') {
    if (normExpected.replace(/[\s-]/g, '') === 'nonbinary' && normActual.replace(/[\s-]/g, '') === 'nonbinary') return true;
    const aliases = { female: 'woman', male: 'man' };
    if (aliases[normActual] === normExpected || aliases[normExpected] === normActual) return true;
  }

  if (canonical === 'ethnicity') {
    if (/middle eastern|mena/i.test(normExpected)) return /arab|maghrebi|middle eastern/i.test(actual);
    if (/black|african/i.test(normExpected)) return /black|african/i.test(actual);
    if (/asian/i.test(normExpected)) return /asian|chinese|filipino|japanese|korean/i.test(actual);
    if (/white|caucasian/i.test(normExpected)) return /white|caucasian/i.test(actual);
    if (/hispanic|latino/i.test(normExpected)) return /hispanic|latino/i.test(actual);
    if (/indigenous|first nation|native/i.test(normExpected)) return /first nation|inuk|inuit|indigenous|aboriginal|native/i.test(actual);
  }

  if (canonical === 'pronouns') {
    if (normActual === normExpected) return true;
    const parts = normExpected.split(/[\/\s,]+/);
    if (parts.includes(normActual)) return true;
    const actualParts = normActual.split(/[\/\s,]+/);
    if (actualParts.includes(normExpected)) return true;
  }

  if (normExpected === 'prefer not to answer' || normExpected === 'decline') {
    return isDeclineOption(actual);
  }

  const aliases = {
    female: 'woman',
    male: 'man',
    'bachelor of science': "bachelor's degree",
    'bachelor of arts': "bachelor's degree",
    'master of science': "master's degree",
    'master of arts': "master's degree",
    'ph.d.': 'doctorate',
  };
  return aliases[normActual] === normExpected;
}

export function isDeclineOption(text) {
  return /^(?:(?:i )?(?:do not wish to answer|don't wish to answer|prefer not to (?:answer|say|disclose)|decline to (?:answer|disclose|state|self-identify))|rather not answer|choose not to disclose|prefer not to state)(?:\s*\([^)]*\))?$/i.test(canonicalNorm(text));
}
