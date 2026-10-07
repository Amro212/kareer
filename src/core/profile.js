import { isResidenceLabel, locationMatches } from './location.js';
import { countryCode, countryNames, countryCodes, workAuthorizationValue, eligibilityCanonicalKey } from './adapters/canonical.js';

const yesNo = ['Yes', 'No'];
const disclosure = ['Yes', 'No', 'Prefer not to answer'];

export const PROFILE_SECTIONS = [
  { title: 'Work eligibility', description: 'Authorization and sponsorship answers apply only to this work country. Leave unknown answers unset.', fields: [
    { name: 'workCountry', label: 'Work country', placeholder: 'e.g. Canada' },
    { name: 'workAuthorization', label: 'Authorized to work in this country?', options: yesNo },
    { name: 'sponsorshipNow', label: 'Require sponsorship now?', options: yesNo },
    { name: 'sponsorshipFuture', label: 'Require sponsorship in the future?', options: yesNo },
  ] },
  { title: 'Work preferences', description: 'Save answers you want reused across applications.', fields: [
    { name: 'workArrangement', label: 'Preferred work arrangement', options: ['Remote', 'Hybrid', 'Onsite', 'Flexible'] },
    { name: 'willingToRelocate', label: 'Willing to relocate?', options: [...yesNo, 'Depends on the opportunity'] },
    { name: 'travelAvailability', label: 'Willingness to travel', placeholder: 'e.g. Up to 25%' },
    { name: 'startDate', label: 'Earliest start date', type: 'date' },
    { name: 'noticePeriod', label: 'Notice period', placeholder: 'e.g. Two weeks or available immediately' },
  ] },
  { title: 'Compensation', description: 'Include currency and pay period so your expectations are unambiguous.', fields: [
    { name: 'expectedSalary', label: 'Expected salary or range', placeholder: 'e.g. 90000–110000' },
    { name: 'salaryCurrency', label: 'Currency', placeholder: 'e.g. CAD, USD, GBP' },
    { name: 'salaryPeriod', label: 'Pay period', options: ['Annual', 'Monthly', 'Hourly'] },
  ] },
  { title: 'Background', description: 'General background and experience level.', fields: [
    { name: 'educationLevel', label: 'Highest education level', options: ['High school', 'Associate degree', "Bachelor's degree", "Master's degree", 'Doctorate', 'Professional degree', 'Other'] },
    { name: 'yearsExperience', label: 'Total years of professional experience', type: 'number', placeholder: 'e.g. 3', min: '0', step: '0.5' },
    { name: 'languages', label: 'Languages and proficiency', placeholder: 'e.g. English (fluent), French (intermediate)' },
  ] },
  { title: 'Demographics & disclosures', description: 'Saved answers take priority. Unset answers use your notes and context; inferred or guessed answers are marked in the panel. Choose “Prefer not to answer” to decline disclosure.', fields: [
    { name: 'gender', label: 'Gender', options: ['Woman', 'Man', 'Non-binary', 'Self-describe', 'Prefer not to answer'] },
    { name: 'genderDescription', label: 'Gender self-description (if selected)', placeholder: 'Your own description' },
    { name: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her, he/him, they/them, Prefer not to answer' },
    { name: 'raceEthnicity', label: 'Race / ethnicity', placeholder: 'Your self-description or Prefer not to answer' },
    { name: 'disabilityStatus', label: 'Disability (current or past)', options: disclosure },
    { name: 'veteranStatus', label: 'Veteran status', options: disclosure },
    { name: 'hispanic', label: 'Hispanic / Latino', options: disclosure },
    { name: 'lgbtStatus', label: 'LGBTQ+', options: disclosure },
    { name: 'visibleMinority', label: 'Visible minority', options: disclosure },
    { name: 'armedForces', label: 'Armed forces service', options: disclosure },
    { name: 'transgender', label: 'Transgender', options: disclosure },
  ] },
];

export const CORE_PROFILE_DEFAULTS = {
  twitter: '', behance: '', dribbble: '', website: '', additionalUrl: '',
  firstName: '',
  middleName: '',
  lastName: '',
  preferredName: '',
  preferredLastName: '',
  phoneCountry: '',
  phoneType: '',
  phoneExtension: '',
  birthDate: '',
  addressLine3: '',
};

export const PROFILE_FIELDS = PROFILE_SECTIONS.flatMap(section => section.fields);
export const STRUCTURED_PROFILE_DEFAULTS = {
  ...CORE_PROFILE_DEFAULTS,
  ...Object.fromEntries(PROFILE_FIELDS.map(field => [field.name, ''])),
};

export function createLanguage(data = {}) {
  const result = {
    id: data.id || `language_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: data.enabled !== false,
    language: data.language || '',
    fluent: data.fluent ?? '',
    reading: data.reading || '',
    writing: data.writing || '',
    speaking: data.speaking || '',
  };
  if (data._collapsed !== undefined) result._collapsed = Boolean(data._collapsed);
  return result;
}

export function createWorkExperience(data = {}) {
  const result = {
    id: data.id || `work_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: data.enabled !== false,
    title: data.title || '',
    company: data.company || '',
    location: data.location || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    current: Boolean(data.current),
    description: data.description || '',
  };
  if (data._collapsed !== undefined) result._collapsed = Boolean(data._collapsed);
  return result;
}

export function createEducation(data = {}) {
  const result = {
    id: data.id || `edu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: data.enabled !== false,
    institution: data.institution || '',
    degree: data.degree || '',
    fieldOfStudy: data.fieldOfStudy || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    current: Boolean(data.current),
    gpa: data.gpa || '',
    description: data.description || '',
  };
  if (data._collapsed !== undefined) result._collapsed = Boolean(data._collapsed);
  return result;
}

export function createProject(data = {}) {
  const result = {
    id: data.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: data.enabled !== false,
    name: data.name || '',
    role: data.role || '',
    url: data.url || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    current: Boolean(data.current),
    description: data.description || '',
  };
  if (data._collapsed !== undefined) result._collapsed = Boolean(data._collapsed);
  return result;
}

export function createWorkEligibility(data = {}) {
  const result = {
    id: data.id || `elig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    enabled: data.enabled !== false,
    country: data.country || '',
    workAuthorization: data.workAuthorization || '',
    sponsorshipNow: data.sponsorshipNow || '',
    sponsorshipFuture: data.sponsorshipFuture || '',
  };
  if (data._collapsed !== undefined) result._collapsed = Boolean(data._collapsed);
  return result;
}

function formatRangeDate(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.startsWith('--')) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(str.slice(2), 10) - 1;
    return monthNames[idx] || str;
  }
  const parts = str.split('-');
  if (parts.length >= 2) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = parseInt(parts[1], 10) - 1;
    const m = monthNames[idx] || parts[1];
    return `${m} ${parts[0]}`;
  }
  return str;
}

export function formatStructuredBackground(profile) {
  const lines = [];
  const experiences = (profile.workExperiences || []).filter(e => e && e.enabled !== false);
  if (experiences.length > 0) {
    lines.push('WORK EXPERIENCE:');
    for (const exp of experiences) {
      const dates = [formatRangeDate(exp.startDate), exp.current ? 'Present' : formatRangeDate(exp.endDate)].filter(Boolean).join(' – ');
      lines.push(`• ${exp.title || 'Role'} at ${exp.company || 'Company'}${exp.location ? ` (${exp.location})` : ''}${dates ? ` [${dates}]` : ''}`);
      if (exp.description) lines.push(`  ${exp.description.replace(/\n+/g, '\n  ')}`);
    }
  }

  const education = (profile.education || []).filter(e => e && e.enabled !== false);
  if (education.length > 0) {
    lines.push('\nEDUCATION:');
    for (const edu of education) {
      const dates = [formatRangeDate(edu.startDate), edu.current ? 'Present' : formatRangeDate(edu.endDate)].filter(Boolean).join(' – ');
      lines.push(`• ${edu.degree || 'Degree'} in ${edu.fieldOfStudy || 'Field'} – ${edu.institution || 'Institution'}${dates ? ` [${dates}]` : ''}${edu.gpa ? ` (GPA: ${edu.gpa})` : ''}`);
      if (edu.description) lines.push(`  ${edu.description.replace(/\n+/g, '\n  ')}`);
    }
  }

  const projects = (profile.projects || []).filter(e => e && e.enabled !== false);
  if (projects.length > 0) {
    lines.push('\nPROJECTS:');
    for (const proj of projects) {
      const dates = [formatRangeDate(proj.startDate), proj.current ? 'Present' : formatRangeDate(proj.endDate)].filter(Boolean).join(' – ');
      lines.push(`• ${proj.name || 'Project'}${proj.role ? ` (${proj.role})` : ''}${proj.url ? ` – ${proj.url}` : ''}${dates ? ` [${dates}]` : ''}`);
      if (proj.description) lines.push(`  ${proj.description.replace(/\n+/g, '\n  ')}`);
    }
  }

  const skills = (profile.skills || []).filter(Boolean);
  if (skills.length > 0) {
    lines.push(`\nSKILLS:\n• ${skills.join(', ')}`);
  }

  return lines.join('\n').trim();
}

export function profileForAI(profile) {
  const keys = [
    'fullName', 'email', 'phone',
    'streetAddress', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'country',
    'location', 'linkedin', 'github', 'portfolio',
    ...PROFILE_FIELDS.map(field => field.name)
  ];
  const synthesizedLoc = (profile?.location?.trim() || [profile?.city, profile?.stateProvince, profile?.country].filter(Boolean).join(', ')).trim();
  const known = Object.fromEntries(keys.map(key => [key, key === 'location' ? (synthesizedLoc || profile?.[key] || '') : (profile?.[key] || '')]));
  const { resumeContext, applicantNotes, _collapsed, workEligibilities, workExperiences, education, projects, skills, ...extra } = profile || {};
  return {
    ...extra,
    ...known,
    location: synthesizedLoc,
    workEligibilities: (profile?.workEligibilities || []).filter(e => e && e.enabled !== false).map(e => ({
      country: e.country,
      workAuthorization: e.workAuthorization,
      sponsorshipNow: e.sponsorshipNow,
      sponsorshipFuture: e.sponsorshipFuture,
    })),
    workExperiences: (profile?.workExperiences || []).filter(e => e && e.enabled !== false),
    education: (profile?.education || []).filter(e => e && e.enabled !== false),
    projects: (profile?.projects || []).filter(e => e && e.enabled !== false),
    skills: (profile?.skills || []).filter(Boolean),
  };
}

const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
const isDecline = value => /^(prefer not to (?:answer|say|disclose)|(?:i )?(?:do not|dont) (?:wish|want) to (?:answer|disclose)|decline(?: to (?:state|answer|identify|disclose))?)$/.test(normalize(value));

function matchesDemographicOption(key, value, label) {
  const option = normalize(label);
  if (key === 'gender') {
    return (value === 'Woman' && option === 'female') || (value === 'Man' && option === 'male');
  }
  if (key === 'disabilityStatus') {
    return (value === 'Yes' && /^yes i have a disability\b/.test(option)) ||
      (value === 'No' && /^no i (?:do not|dont) have a disability\b/.test(option));
  }
  return false;
}

// Restrict overrides to recognizable questions; narrative experience and referral
// questions remain grounded by the AI rather than being replaced by a short value.
export function fixedProfileAnswer(field, profile, { allowSearch = true } = {}) {
  const label = normalize(field.label);
  const synthesizedLocation = (profile.location?.trim() || [profile.city, profile.stateProvince, profile.country].filter(Boolean).join(', ')).trim();

  const identityKey = /^(?:your )?(?:full name|legal name|name)$/.test(label) ? 'fullName'
    : /^(?:legal )?first name$/.test(label) ? 'firstName'
    : /^(?:legal )?last name$/.test(label) ? 'lastName'
    : /^(?:your )?e ?mail(?: address)?$/.test(label) ? 'email'
    : /^(?:your )?(?:phone|phone number|telephone|mobile number)$/.test(label) ? 'phone' : null;
  if (identityKey && ['text', 'email', 'tel'].includes(field.type) && profile[identityKey]) {
    return { fieldId: field.fieldId, value: profile[identityKey], inferred: false, source: 'profile' };
  }

  if (['text', 'textarea', 'url'].includes(field.type)) {
    let addressKey = null;
    if (/^(?:street address|address line 1|address 1|street|mailing address)$/i.test(label)) {
      addressKey = 'streetAddress';
    } else if (/^(?:address line 2|address 2|apartment)$/i.test(label) || /^(?:apt|suite|unit)\b/i.test(label)) {
      addressKey = 'addressLine2';
    } else if (/^(?:city|town)$/i.test(label)) {
      addressKey = 'city';
    } else if (/^(?:state|province|state province|state and province|region)$/i.test(label)) {
      addressKey = 'stateProvince';
    } else if (/^(?:postal code|zip code|zip postal code|zip and postal code|zip|postcode)$/i.test(label)) {
      addressKey = 'postalCode';
    } else if (/^(?:country|country of residence)$/i.test(label)) {
      addressKey = 'country';
    }
    if (addressKey && profile[addressKey]?.trim()) {
      return { fieldId: field.fieldId, value: profile[addressKey].trim(), inferred: false, source: 'profile' };
    }

    if (isResidenceLabel(field.label) && synthesizedLocation) {
      return { fieldId: field.fieldId, value: synthesizedLocation, inferred: false, source: 'profile' };
    }

    const key = /^(?:your )?linkedin(?: (?:url|link|profile|profile url|profile link))?$/.test(label) ? 'linkedin' : null;
    if (key && profile[key]?.trim()) return { fieldId: field.fieldId, value: profile[key].trim(), inferred: false, source: 'profile' };
  }

  // Only explicit residence questions: bare "Location" can refer to an employer.
  if (field.type === 'combobox' && isResidenceLabel(field.label) && synthesizedLocation) {
    const matches = (field.options || []).filter(option => locationMatches(option.label, synthesizedLocation));
    return { fieldId: field.fieldId, value: matches.length === 1 ? matches[0].label : '', inferred: false, source: 'profile',
      ...(!matches.length && allowSearch ? { searchQuery: synthesizedLocation } : {}) };
  }
  const source = /^(?:how (?:did|do) you (?:hear|learn) about\b|where did you (?:hear about|find|learn about|see) (?:us|this (?:job|role|position|opportunity|opening)|(?:the|our) (?:job|company|role|position|opportunity|opening))\b|(?:application|applicant|referral|recruitment|job) source$|source$)/.test(label);
  let key;
  if (/^(?:what (?:is|are) your |your |please (?:select|specify|indicate) your )?(?:gender(?: identity)?|pronouns|race(?: (?:and )?ethnicity)?|ethnicity|disability(?: status)?|veteran(?: status)?)(?: optional)?$/.test(label)) {
    if (/\bgender\b/.test(label)) key = 'gender';
    else if (/\bpronouns\b/.test(label)) key = 'pronouns';
    else if (/\b(?:race|ethnicity)\b/.test(label)) key = 'raceEthnicity';
    else if (/\bdisability\b/.test(label)) key = 'disabilityStatus';
    else if (/\bveteran\b/.test(label)) key = 'veteranStatus';
  }
  if (/^do you have (?:a |any )?disabilit(?:y|ies)$/.test(label)) key = 'disabilityStatus';
  if (!source && !key) return null;
  let value = source ? 'LinkedIn' : profile[key] || '';
  if (key === 'gender' && value === 'Self-describe') value = profile.genderDescription || '';
  if (key && !value) return null;
  const answer = { fieldId: field.fieldId, value, inferred: false, source: 'profile' };
  if (!value || !['select', 'combobox', 'radio', 'checkbox'].includes(field.type)) return answer;
  const options = field.options || [];
  const matches = options.filter(option => normalize(option.label) === normalize(value) || normalize(option.value) === normalize(value) ||
    (source && /^(?:linkedin jobs|linkedincom)$/.test(normalize(option.label))) ||
    (isDecline(value) && isDecline(option.label)) || matchesDemographicOption(key, value, option.label));
  // Ambiguous or absent options must remain unanswered. Combobox discovery can
  // search for LinkedIn, but a search string is never treated as a selection.
  const match = matches.length === 1 ? matches[0] : null;
  answer.value = match ? field.type === 'combobox' ? match.label : match.value : '';
  if (source && !match && field.type === 'combobox' && allowSearch) answer.searchQuery = 'LinkedIn';
  return answer;

}

// Eligibility is country scoped even when the question itself omits a country.
// Empty/ambiguous scope must not be replaced by an AI or saved-answer guess.
export function workEligibilityAnswer(field, profile, job) {
  const text = `${field.label || ''} ${field.description || ''}`;
  if (field.isNarrative || field.type === 'textarea' || /\b(?:explain|describe|elaborate|details)\b/i.test(text)) return null;
  const sponsorship = /\b(?:visa|immigration|employment) sponsorship\b|\brequire.*sponsor/i.test(text);
  const authorization = /\b(?:authorized|eligible|authorization|legal right)\b.*\bwork\b|\bwork (?:authorization|eligibility)\b/i.test(text);
  if (!sponsorship && !authorization) return null;
  const normalized = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const countries = Array.from(countryCodes).filter(code => normalized.includes(` ${countryNames.of(code).toLowerCase()} `));
  if (/\bUS\b/.test(text) || /\b(?:u s|u s a|usa)\b/.test(normalized)) countries.push('US');
  if (/\b(?:u k|uk)\b/.test(normalized)) countries.push('GB');
  const explicit = [...new Set(countries)];
  const target = explicit.length === 1 ? explicit[0] : explicit.length ? '' : countryCode(job?.workCountry);
  const records = (profile.workEligibilities || []).filter(record => record?.enabled !== false);
  const record = target ? records.find(record => countryCode(record.country) === target)
    || (countryCode(profile.workCountry) === target ? profile : null) : null;
  let value = '';
  if (record) {
    if (authorization && (!sponsorship || eligibilityCanonicalKey(text) === 'work_auth')) value = workAuthorizationValue(record, text);
    else if (sponsorship) {
      const now = record.sponsorshipNow, future = record.sponsorshipFuture;
      value = /\bnow\b.*\bfuture\b|\bfuture\b.*\bnow\b/i.test(text)
        ? now === 'Yes' || future === 'Yes' ? 'Yes' : now === 'No' && future === 'No' ? 'No' : ''
        : /\bfuture\b/i.test(text) ? future : now;
    }
    if (authorization && /\blive\b|\breside\b/i.test(text) && value !== 'No') value = '';
  }
  if (value && ['select', 'radio', 'combobox'].includes(field.type)) {
    const choices = (field.options || []).filter(option => new RegExp(`^${value}\\b`, 'i').test(option.label));
    value = choices.length === 1 ? field.type === 'combobox' ? choices[0].label : choices[0].value : '';
  }
  if (field.type === 'checkbox') value = '';
  return { fieldId: field.fieldId || field.id, value: value || '', inferred: false, source: 'profile', provenance: value ? 'saved' : 'unresolved' };
}

export const MVP_PROFILE_FIELDS = [
  { key: 'fullName', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
];

export function getMissingCoreProfileFields(profile = {}) {
  return MVP_PROFILE_FIELDS
    .filter(f => {
      if (f.key === 'fullName') {
        const hasFullName = Boolean(String(profile.fullName || '').trim() || (String(profile.firstName || '').trim() && String(profile.lastName || '').trim()));
        if (hasFullName) return false;
      }
      if (f.key === 'city' && !String(profile.city || '').trim() && String(profile.location || '').trim()) return false;
      if (f.key === 'country' && !String(profile.country || '').trim() && String(profile.location || '').trim()) return false;
      return !String(profile[f.key] || '').trim();
    })
    .map(f => f.label);
}

export function calculateProfileStrength(profile = {}) {
  let score = 0;
  const missingCore = getMissingCoreProfileFields(profile);

  // 1. Core Identity (40% total: 10% each for Name, Email, Phone; 5% each for City, Country)
  const hasName = Boolean(String(profile.fullName || '').trim() || (String(profile.firstName || '').trim() && String(profile.lastName || '').trim()));
  if (hasName) score += 10;
  if (String(profile.email || '').trim()) score += 10;
  if (String(profile.phone || '').trim()) score += 10;
  const hasCity = Boolean(String(profile.city || '').trim() || String(profile.location || '').trim());
  const hasCountry = Boolean(String(profile.country || '').trim() || String(profile.location || '').trim());
  if (hasCity) score += 5;
  if (hasCountry) score += 5;

  // 2. Work History (20% total: >= 1 active role)
  const activeWork = (profile.workExperiences || []).filter(w => w && w.enabled !== false && String(w.title || '').trim());
  if (activeWork.length > 0) score += 20;

  // 3. Education (15% total: >= 1 active degree/institution)
  const activeEdu = (profile.education || []).filter(e => e && e.enabled !== false && (String(e.institution || '').trim() || String(e.degree || '').trim()));
  if (activeEdu.length > 0) score += 15;

  // 4. Skills (15% total: 1 skill = 5%, 2 skills = 10%, >= 3 skills = 15%)
  const skillsCount = Array.isArray(profile.skills) ? profile.skills.filter(s => String(s || '').trim()).length : 0;
  if (skillsCount >= 3) score += 15;
  else if (skillsCount === 2) score += 10;
  else if (skillsCount === 1) score += 5;

  // 5. Projects & Links (10% total: >= 1 project = 5%, >= 1 link = 5%)
  const activeProjects = (profile.projects || []).filter(p => p && p.enabled !== false && String(p.name || '').trim());
  if (activeProjects.length > 0) score += 5;

  const hasLink = Boolean(String(profile.linkedin || '').trim() || String(profile.github || '').trim() || String(profile.portfolio || '').trim());
  if (hasLink) score += 5;

  const percentage = Math.min(100, Math.round(score));
  const isMvpComplete = missingCore.length === 0;

  let tierLabel = 'Incomplete';
  if (percentage >= 85) tierLabel = 'Flight-Deck Ready';
  else if (percentage >= 60) tierLabel = 'Strong';
  else if (isMvpComplete) tierLabel = 'Basic MVP Ready';

  return {
    score: percentage,
    percentage,
    isMvpComplete,
    missingCore,
    tierLabel,
  };
}

