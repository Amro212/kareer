import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile, saveProfile, saveApiKey, gmSet, parseLegacyLocation, splitFullName } from '../../src/core/storage.js';
import { generateAutofillAnswers, rewriteNarrativeField } from '../../src/core/ai.js';
import { fixedProfileAnswer } from '../../src/core/profile.js';

let payload;
function respond(answers) {
  globalThis.GM_xmlhttpRequest = options => {
    payload = JSON.parse(options.data);
    options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers }) } }] }) });
  };
}
beforeEach(() => {
  globalThis.window = { location: { href: 'https://example.com/apply', hostname: 'example.com' } };
  saveProfile({});
  saveApiKey('fixture-key');
  respond([]);
});

test('legacy profiles gain unset fields without losing their context', () => {
  gmSet('kr:profile', { fullName: 'Sample Applicant', resumeContext: 'Detailed history', applicantNotes: 'Personal notes' });
  const profile = getProfile();
  assert.equal(profile.workAuthorization, '');
  assert.equal(profile.gender, '');
  assert.equal(profile.resumeContext, 'Detailed history');
  assert.equal(profile.applicantNotes, 'Personal notes');
});

test('residence grounding recognizes Canadian abbreviations without choosing another Toronto', async () => {
  saveProfile({ location: 'Toronto, Ontario' });
  const field = { fieldId: 'residence', label: 'Current location', type: 'combobox', options: [
    { label: 'Toronto, OH, USA' }, { label: 'Toronto, ON, CAN' }, { label: 'Toronto, Durham, England, GBR' },
  ] };
  const { answers } = await generateAutofillAnswers([field]);
  assert.equal(answers[0].value, 'Toronto, ON, CAN');
  saveProfile({ location: 'Toronto' });
  const ambiguous = await generateAutofillAnswers([field]);
  assert.equal(ambiguous.answers[0].value, '');
});

test('Location (City) uses profile location like other residence questions', async () => {
  saveProfile({ location: 'Toronto, Ontario, Canada' });
  const { answers } = await generateAutofillAnswers([{
    fieldId: 'candidate-location', label: 'Location (City)', type: 'combobox',
    options: [{ label: 'Toronto, Ontario, Canada' }, { label: 'Toronto, Ohio, United States' }],
  }]);
  assert.equal(answers[0].value, 'Toronto, Ontario, Canada');
});

test('explicit current location uses full profile location and rejects other cities', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'residence', value: 'London, UK' }]);
  const { answers } = await generateAutofillAnswers([{ fieldId: 'residence', label: 'Current location', type: 'combobox', options: [{ value: 'uk', label: 'London, UK' }] }]);
  assert.equal(answers[0].value, '');
  assert.equal(answers[0].searchQuery, 'London, Ontario, Canada');
});

test('location grounding chooses one complete match and leaves employer location to context', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'employer', value: 'Ottawa' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'residence', label: 'Current location', type: 'combobox', options: [{ value: 'ca', label: 'London, Ontario, Canada' }, { value: 'uk', label: 'London, UK' }] },
    { fieldId: 'employer', label: 'Employer location', type: 'text' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'residence')?.value, 'London, Ontario, Canada');
  assert.equal(answers.find(a => a.fieldId === 'employer')?.value, 'Ottawa');
});

test('location grounding leaves duplicate matches and exhausted searches unresolved', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'residence', value: 'London, UK' }]);
  const field = { fieldId: 'residence', label: 'Current location', type: 'combobox' };
  const duplicate = { value: 'ca', label: 'London, Ontario, Canada' };
  const first = await generateAutofillAnswers([{ ...field, options: [duplicate, { ...duplicate, value: 'ca2' }] }]);
  assert.equal(first.answers[0].value, '');
  assert.equal(first.answers[0].searchQuery, undefined);
  const final = await generateAutofillAnswers([{ ...field, options: [{ value: 'uk', label: 'London, UK' }] }], { allowSearch: false });
  assert.equal(final.answers[0].value, '');
  assert.equal(final.answers[0].searchQuery, undefined);
});

test('primary and repair requests carry explicit country-scoped answers', async () => {
  saveProfile({ workCountry: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'Yes', gender: 'Woman', expectedSalary: '95000', salaryCurrency: 'CAD', applicantNotes: 'Older conflicting notes' });
  await generateAutofillAnswers([], { repairErrors: [{ message: 'Required answer' }] });
  const content = JSON.parse(payload.messages[1].content);
  assert.equal(content.applicantProfile.workCountry, 'Canada');
  assert.equal(content.applicantProfile.sponsorshipFuture, 'Yes');
  assert.equal(content.applicantProfile.gender, 'Woman');
  assert.equal(content.applicantProfile.salaryCurrency, 'CAD');
  assert.match(payload.messages[0].content, /explicit.*(?:priority|precedence)/i);
  assert.doesNotMatch(payload.messages[0].content, /standard is Yes|standard is No|select a standard valid option/);
});

test('LinkedIn source overrides model answers, including omissions, without altering referrals', async () => {
  respond([{ fieldId: 'source', value: 'Indeed' }, { fieldId: 'referral', value: 'Pat' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'source', label: 'How did you hear about us?', type: 'text' },
    { fieldId: 'otherSource', label: 'Where did you find this job?', type: 'text' },
    { fieldId: 'referral', label: 'Employee referral name', type: 'text' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'source').value, 'LinkedIn');
  assert.equal(answers.find(a => a.fieldId === 'otherSource').value, 'LinkedIn');
  assert.equal(answers.find(a => a.fieldId === 'referral').value, 'Pat');
});

test('source dropdowns use only owned LinkedIn options; missing option stays empty', async () => {
  respond([{ fieldId: 'found', value: 'indeed' }, { fieldId: 'missing', value: 'Other' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'found', label: 'How did you hear about this position?', type: 'select', options: [{ value: 'li', label: 'LinkedIn' }, { value: 'indeed', label: 'Indeed' }] },
    { fieldId: 'missing', label: 'How did you hear about us?', type: 'combobox', options: [{ value: 'other', label: 'Other' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'found').value, 'li');
  assert.equal(answers.find(a => a.fieldId === 'missing').value, '');
  assert.equal(answers.find(a => a.fieldId === 'missing').searchQuery, 'LinkedIn');
});

test('unset demographics accept contextual AI while explicit decline maps to the offered choice', async () => {
  saveProfile({ disabilityStatus: 'Prefer not to answer' });
  respond([{ fieldId: 'gender', value: 'Man' }, { fieldId: 'disability', value: 'No' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'gender', label: 'Gender', type: 'text' },
    { fieldId: 'disability', label: 'Disability status', type: 'select', options: [{ value: 'no', label: 'No' }, { value: 'decline', label: 'I do not wish to answer' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'gender').value, 'Man');
  assert.equal(answers.find(a => a.fieldId === 'disability').value, 'decline');
});

test('rewrite receives structured profile as well as both context sections', async () => {
  saveProfile({ workCountry: 'Canada', noticePeriod: 'Two weeks', resumeContext: 'Resume detail', applicantNotes: 'Extra notes' });
  await rewriteNarrativeField({ fieldLabel: 'When can you start?', currentValue: '' });
  assert.match(payload.messages[1].content, /Two weeks/);
  assert.match(payload.messages[1].content, /Canada/);
  assert.match(payload.messages[1].content, /Resume detail/);
  assert.match(payload.messages[1].content, /Extra notes/);
});

test('explicit demographics map common long labels without borrowing unrelated options', async () => {
  saveProfile({ gender: 'Woman', disabilityStatus: 'No', veteranStatus: 'Prefer not to answer' });
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'gender', label: 'Gender', type: 'radio', options: [{ value: 'f', label: 'Female' }, { value: 'm', label: 'Male' }] },
    { fieldId: 'disability', label: 'Do you have a disability?', type: 'select', options: [{ value: 'yes', label: 'Yes, I have a disability, or have had one in the past' }, { value: 'no', label: 'No, I do not have a disability and have not had one in the past' }] },
    { fieldId: 'veteran', label: 'Veteran status', type: 'combobox', options: [{ value: 'decline', label: "I don't wish to answer" }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'gender').value, 'f');
  assert.equal(answers.find(a => a.fieldId === 'disability').value, 'no');
  assert.equal(answers.find(a => a.fieldId === 'veteran').value, "I don't wish to answer");
});

test('identity overrides do not turn adjacent narrative or birth-sex questions into demographic answers', async () => {
  saveProfile({ gender: 'Woman', raceEthnicity: 'Asian' });
  respond([{ fieldId: 'birth', value: '' }, { fieldId: 'narrative', value: 'My project experience.' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'birth', label: 'Gender assigned at birth', type: 'text' },
    { fieldId: 'narrative', label: 'Race and ethnicity research experience', type: 'textarea' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'birth').value, '');
  assert.equal(answers.find(a => a.fieldId === 'narrative').value, 'My project experience.');
});

test('final source search never invents options or requests another search', async () => {
  const { answers } = await generateAutofillAnswers([{ fieldId: 'source', label: 'How did you hear about us?', type: 'combobox', options: [{ value: 'other', label: 'Other' }] }], { allowSearch: false });
  assert.equal(answers[0].value, '');
  assert.equal(answers[0].searchQuery, undefined);
});

test('source recognizes LinkedIn Jobs and LinkedIn.com labels', async () => {
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'jobs', label: 'How did you hear about us?', type: 'select', options: [{ value: 'li', label: 'LinkedIn Jobs' }] },
    { fieldId: 'domain', label: 'Where did you see this position?', type: 'radio', options: [{ value: 'web', label: 'LinkedIn.com' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'jobs').value, 'li');
  assert.equal(answers.find(a => a.fieldId === 'domain').value, 'web');
});

test('source does not overwrite unrelated questions that share a discovery prefix', async () => {
  respond([{ fieldId: 'experience', value: 'While working on a compiler project.' }]);
  const { answers } = await generateAutofillAnswers([{ fieldId: 'experience', label: 'Where did you find the most challenging technical problem in your previous role?', type: 'textarea' }]);
  assert.equal(answers[0].value, 'While working on a compiler project.');
});

test('structured profile factories generate IDs and default values', async () => {
  const { createWorkExperience, createEducation, createProject, createWorkEligibility } = await import('../../src/core/profile.js');
  const work = createWorkExperience({ title: 'Staff Engineer', company: 'Acme' });
  assert.ok(work.id.startsWith('work_'));
  assert.equal(work.title, 'Staff Engineer');
  assert.equal(work.company, 'Acme');
  assert.equal(work.enabled, true);
  assert.equal(work.current, false);

  const edu = createEducation({ institution: 'Stanford', degree: "Master's" });
  assert.ok(edu.id.startsWith('edu_'));
  assert.equal(edu.institution, 'Stanford');
  assert.equal(edu.enabled, true);

  const proj = createProject({ name: 'Kareer', role: 'Maintainer' });
  assert.ok(proj.id.startsWith('proj_'));
  assert.equal(proj.name, 'Kareer');
  assert.equal(proj.enabled, true);

  const elig = createWorkEligibility({ country: 'Canada', workAuthorization: 'Yes' });
  assert.ok(elig.id.startsWith('elig_'));
  assert.equal(elig.country, 'Canada');
  assert.equal(elig.workAuthorization, 'Yes');
  assert.equal(elig.sponsorshipNow, '');
  assert.equal(elig.sponsorshipFuture, '');
  assert.equal(elig.enabled, true);
});

test('getProfile provides array defaults for repeatable collections on legacy objects', () => {
  gmSet('kr:profile', { fullName: 'Legacy User' });
  const profile = getProfile();
  assert.deepEqual(profile.workExperiences, []);
  assert.deepEqual(profile.education, []);
  assert.deepEqual(profile.projects, []);
  assert.deepEqual(profile.skills, []);
  assert.deepEqual(profile.workEligibilities, []);
});

test('formatStructuredBackground formats active entries and excludes disabled ones', async () => {
  const { formatStructuredBackground } = await import('../../src/core/profile.js');
  const profile = {
    workExperiences: [
      { enabled: true, title: 'Lead Engineer', company: 'Stripe', startDate: '2022-01', current: true, description: 'Scaled payments' },
      { enabled: false, title: 'Intern', company: 'OldCo', startDate: '2020-05', endDate: '2020-08' },
    ],
    education: [
      { enabled: true, institution: 'MIT', degree: 'BS', fieldOfStudy: 'CS', startDate: '2018-09', endDate: '2022-05', gpa: '3.9' },
    ],
    projects: [
      { enabled: true, name: 'TaskEngine', role: 'Creator', url: 'https://github.com/demo', description: 'Distributed queue' },
    ],
    skills: ['TypeScript', 'Rust', 'Docker'],
  };

  const text = formatStructuredBackground(profile);
  assert.match(text, /WORK EXPERIENCE:/);
  assert.match(text, /Lead Engineer at Stripe/);
  assert.match(text, /Present/);
  assert.match(text, /Scaled payments/);
  assert.doesNotMatch(text, /OldCo/);
  assert.match(text, /EDUCATION:/);
  assert.match(text, /BS in CS – MIT/);
  assert.match(text, /PROJECTS:/);
  assert.match(text, /TaskEngine \(Creator\)/);
  assert.match(text, /SKILLS:\n• TypeScript, Rust, Docker/);
});

test('profileForAI includes enabled repeatable entries and filters out disabled ones', async () => {
  const { profileForAI } = await import('../../src/core/profile.js');
  const profile = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    workEligibilities: [
      { id: 'el1', enabled: true, country: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'No' },
      { id: 'el2', enabled: false, country: 'Mars', workAuthorization: 'No', sponsorshipNow: 'Yes', sponsorshipFuture: 'Yes' },
    ],
    workExperiences: [
      { id: 'w1', enabled: true, title: 'Engineer' },
      { id: 'w2', enabled: false, title: 'Intern' },
    ],
    education: [
      { id: 'e1', enabled: true, degree: 'BS' },
    ],
    projects: [
      { id: 'p1', enabled: true, name: 'Proj1' },
      { id: 'p2', enabled: false, name: 'Secret' },
    ],
    skills: ['JavaScript'],
  };

  const aiProfile = profileForAI(profile);
  assert.equal(aiProfile.fullName, 'Jane Doe');
  assert.equal(aiProfile.workEligibilities.length, 1);
  assert.equal(aiProfile.workEligibilities[0].country, 'Canada');
  assert.equal(aiProfile.workExperiences.length, 1);
  assert.equal(aiProfile.workExperiences[0].id, 'w1');
  assert.equal(aiProfile.education.length, 1);
  assert.equal(aiProfile.projects.length, 1);
  assert.equal(aiProfile.projects[0].name, 'Proj1');
  assert.deepEqual(aiProfile.skills, ['JavaScript']);
});

test('saveProfile preserves and persists repeatable entries', () => {
  const profile = saveProfile({
    fullName: 'Bob Smith',
    workExperiences: [{ id: 'w1', title: 'Developer', enabled: true }],
    education: [{ id: 'e1', degree: 'MS', enabled: true }],
    projects: [{ id: 'p1', name: 'OpenSource', enabled: true }],
    skills: ['Python', 'SQL'],
  });

  assert.equal(profile.fullName, 'Bob Smith');
  assert.equal(profile.workExperiences.length, 1);
  assert.equal(profile.workExperiences[0].title, 'Developer');
  assert.equal(profile.education.length, 1);
  assert.equal(profile.projects.length, 1);
  assert.deepEqual(profile.skills, ['Python', 'SQL']);

  const loaded = getProfile();
  assert.equal(loaded.workExperiences[0].title, 'Developer');
  assert.deepEqual(loaded.skills, ['Python', 'SQL']);
});

test('getProfile and saveProfile handle multi-country work eligibilities and synchronize with legacy root fields', () => {
  const profile = saveProfile({
    fullName: 'Global Candidate',
    workEligibilities: [
      { country: 'United States', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'No', enabled: true },
      { country: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'Yes', enabled: true },
      { country: 'United Kingdom', workAuthorization: 'No', sponsorshipNow: 'Yes', sponsorshipFuture: 'Yes', enabled: true },
    ],
  });

  assert.equal(profile.workEligibilities.length, 3);
  assert.equal(profile.workCountry, 'United States');
  assert.equal(profile.workAuthorization, 'Yes');
  assert.equal(profile.sponsorshipNow, 'No');
  assert.equal(profile.sponsorshipFuture, 'No');

  const loaded = getProfile();
  assert.equal(loaded.workEligibilities.length, 3);
  assert.equal(loaded.workEligibilities[1].country, 'Canada');
  assert.equal(loaded.workEligibilities[1].sponsorshipFuture, 'Yes');
  assert.equal(loaded.workCountry, 'United States');
  assert.equal(loaded.workAuthorization, 'Yes');
});

test('saveProfile auto-populates workEligibilities from legacy workCountry and workAuthorization', () => {
  const profile = saveProfile({
    workCountry: 'Canada',
    workAuthorization: 'Yes',
    sponsorshipNow: 'No',
    sponsorshipFuture: 'Yes',
  });

  assert.equal(profile.workCountry, 'Canada');
  assert.equal(profile.workAuthorization, 'Yes');
  assert.equal(profile.workEligibilities.length, 1);
  assert.equal(profile.workEligibilities[0].country, 'Canada');
  assert.equal(profile.workEligibilities[0].workAuthorization, 'Yes');
  assert.equal(profile.workEligibilities[0].sponsorshipNow, 'No');
  assert.equal(profile.workEligibilities[0].sponsorshipFuture, 'Yes');
});

test('calculateProfileStrength and getMissingCoreProfileFields correctly evaluate MVP and strength tiers', async () => {
  const { calculateProfileStrength, getMissingCoreProfileFields } = await import('../../src/core/profile.js');

  // Empty profile
  const empty = {};
  assert.deepEqual(getMissingCoreProfileFields(empty), ['Full Name', 'Email', 'Phone', 'City', 'Country']);
  const emptyStrength = calculateProfileStrength(empty);
  assert.equal(emptyStrength.percentage, 0);
  assert.equal(emptyStrength.isMvpComplete, false);
  assert.deepEqual(emptyStrength.missingCore, ['Full Name', 'Email', 'Phone', 'City', 'Country']);
  assert.equal(emptyStrength.tierLabel, 'Incomplete');

  // Partial MVP (name + email only)
  const partial = { fullName: 'Alex Rivera', email: 'alex@example.com' };
  assert.deepEqual(getMissingCoreProfileFields(partial), ['Phone', 'City', 'Country']);
  const partialStrength = calculateProfileStrength(partial);
  assert.equal(partialStrength.percentage, 20);
  assert.equal(partialStrength.isMvpComplete, false);

  // Exact MVP complete
  const mvp = {
    fullName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '555-123-4567',
    location: 'Austin, TX',
  };
  assert.deepEqual(getMissingCoreProfileFields(mvp), []);
  const mvpStrength = calculateProfileStrength(mvp);
  assert.equal(mvpStrength.percentage, 40);
  assert.equal(mvpStrength.isMvpComplete, true);
  assert.equal(mvpStrength.tierLabel, 'Basic MVP Ready');

  // MVP + Work + Education + 2 Skills
  const mid = {
    ...mvp,
    workExperiences: [{ id: 'w1', title: 'Software Engineer', enabled: true }],
    education: [{ id: 'e1', degree: 'BS Computer Science', enabled: true }],
    skills: ['JavaScript', 'Python'],
  };
  const midStrength = calculateProfileStrength(mid);
  // 40 (core) + 20 (work) + 15 (edu) + 10 (2 skills) = 85
  assert.equal(midStrength.percentage, 85);
  assert.equal(midStrength.isMvpComplete, true);
  assert.equal(midStrength.tierLabel, 'Flight-Deck Ready');

  // Complete profile with projects and links
  const full = {
    ...mid,
    skills: ['JavaScript', 'Python', 'Go'],
    projects: [{ id: 'p1', name: 'Kareer Copilot', enabled: true }],
    linkedin: 'https://linkedin.com/in/alexrivera',
  };
  const fullStrength = calculateProfileStrength(full);
  // 40 + 20 + 15 + 15 (3 skills) + 5 (project) + 5 (link) = 100
  assert.equal(fullStrength.percentage, 100);
  assert.equal(fullStrength.isMvpComplete, true);
  assert.equal(fullStrength.tierLabel, 'Flight-Deck Ready');

  // Decomposed address fields fulfill MVP requirements
  const splitMvp = {
    fullName: 'Alex Rivera',
    email: 'alex@example.com',
    phone: '555-123-4567',
    city: 'Austin',
    country: 'United States',
  };
  assert.deepEqual(getMissingCoreProfileFields(splitMvp), []);
  const splitStrength = calculateProfileStrength(splitMvp);
  assert.equal(splitStrength.percentage, 40);
  assert.equal(splitStrength.isMvpComplete, true);
});

test('parseLegacyLocation correctly decomposes comma-separated location strings', () => {
  assert.deepEqual(parseLegacyLocation('Toronto, Ontario, Canada'), {
    city: 'Toronto',
    stateProvince: 'Ontario',
    country: 'Canada',
  });
  assert.deepEqual(parseLegacyLocation('San Francisco, USA'), {
    city: 'San Francisco',
    country: 'USA',
  });
  assert.deepEqual(parseLegacyLocation('London'), {
    city: 'London',
  });
  assert.deepEqual(parseLegacyLocation(''), {});
});

test('getProfile migrates legacy location and synthesizes missing location string', () => {
  gmSet('kr:profile', {
    fullName: 'Jane Doe',
    location: 'Vancouver, BC, Canada',
  });
  const profile = getProfile();
  assert.equal(profile.city, 'Vancouver');
  assert.equal(profile.stateProvince, 'BC');
  assert.equal(profile.country, 'Canada');
  assert.equal(profile.location, 'Vancouver, BC, Canada');

  // When saved with split address, location is synthesized
  saveProfile({
    fullName: 'Jane Doe',
    streetAddress: '100 Main St',
    addressLine2: 'Suite 400',
    city: 'Seattle',
    stateProvince: 'WA',
    postalCode: '98101',
    country: 'United States',
  });
  const updated = getProfile();
  assert.equal(updated.streetAddress, '100 Main St');
  assert.equal(updated.addressLine2, 'Suite 400');
  assert.equal(updated.city, 'Seattle');
  assert.equal(updated.stateProvince, 'WA');
  assert.equal(updated.postalCode, '98101');
  assert.equal(updated.country, 'United States');
  assert.equal(updated.location, 'Seattle, WA, United States');
});

test('fixedProfileAnswer deterministically resolves decomposed address fields', () => {
  const profile = {
    streetAddress: '742 Evergreen Terrace',
    addressLine2: 'Apt 2',
    city: 'Springfield',
    stateProvince: 'Oregon',
    postalCode: '97477',
    country: 'United States',
  };

  const street = fixedProfileAnswer({ fieldId: 'f1', label: 'Street Address', type: 'text' }, profile);
  assert.equal(street?.value, '742 Evergreen Terrace');

  const apt = fixedProfileAnswer({ fieldId: 'f2', label: 'Apt, Suite, Unit', type: 'text' }, profile);
  assert.equal(apt?.value, 'Apt 2');

  const city = fixedProfileAnswer({ fieldId: 'f3', label: 'City', type: 'text' }, profile);
  assert.equal(city?.value, 'Springfield');

  const state = fixedProfileAnswer({ fieldId: 'f4', label: 'State / Province', type: 'text' }, profile);
  assert.equal(state?.value, 'Oregon');

  const zip = fixedProfileAnswer({ fieldId: 'f5', label: 'Zip / Postal Code', type: 'text' }, profile);
  assert.equal(zip?.value, '97477');

  const country = fixedProfileAnswer({ fieldId: 'f6', label: 'Country', type: 'text' }, profile);
  assert.equal(country?.value, 'United States');

  // Single residence question resolves to synthesized location
  const residence = fixedProfileAnswer({ fieldId: 'f7', label: 'Current location', type: 'text' }, profile);
  assert.equal(residence?.value, 'Springfield, Oregon, United States');
});

test('splitFullName parses single, two-part, and multi-part names', () => {
  assert.deepEqual(splitFullName(''), { firstName: '', middleName: '', lastName: '' });
  assert.deepEqual(splitFullName('Madonna'), { firstName: 'Madonna', middleName: '', lastName: '' });
  assert.deepEqual(splitFullName('Jane Doe'), { firstName: 'Jane', middleName: '', lastName: 'Doe' });
  assert.deepEqual(splitFullName('Mary Jane Watson'), { firstName: 'Mary', middleName: 'Jane', lastName: 'Watson' });
  assert.deepEqual(splitFullName('John Philip Sousa III'), { firstName: 'John', middleName: 'Philip Sousa', lastName: 'III' });
});

test('saveProfile synchronizes name parts when fullName changes with existing parts', () => {
  // Initial save establishes explicit firstName and lastName
  saveProfile({ firstName: 'Alice', middleName: 'Marie', lastName: 'Smith', fullName: 'Alice Marie Smith' });
  let current = getProfile();
  assert.equal(current.firstName, 'Alice');
  assert.equal(current.middleName, 'Marie');
  assert.equal(current.lastName, 'Smith');

  // Panel edit: updates only fullName, preserving stale parts in object
  const panelEdit = { ...current, fullName: 'Bob Jones' };
  const updated = saveProfile(panelEdit);
  assert.equal(updated.fullName, 'Bob Jones');
  assert.equal(updated.firstName, 'Bob');
  assert.equal(updated.middleName, '');
  assert.equal(updated.lastName, 'Jones');

  // Clearing fullName clears component parts
  const cleared = saveProfile({ ...updated, fullName: '' });
  assert.equal(cleared.fullName, '');
  assert.equal(cleared.firstName, '');
  assert.equal(cleared.middleName, '');
  assert.equal(cleared.lastName, '');

  // Updating parts directly in Options updates fullName
  const partsEdit = saveProfile({ ...cleared, firstName: 'Charlie', lastName: 'Brown' });
  assert.equal(partsEdit.fullName, 'Charlie Brown');
  assert.equal(partsEdit.firstName, 'Charlie');
  assert.equal(partsEdit.lastName, 'Brown');
});
