import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { detectAdapter } from '../../src/core/adapters/index.js';
import { leverAdapter } from '../../src/core/adapters/lever.js';
import {
  leverCanonicalKey,
  leverFieldMetadata,
  leverValue,
  leverAnswer,
  leverOptionMatches,
} from '../../src/core/adapters/lever-fields.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { generateAutofillAnswers } from '../../src/core/ai.js';
import { saveProfile, saveApiKey } from '../../src/core/storage.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { isVisible } from '../../src/core/pageClassifier.js';
import { verifyField } from '../../src/core/fields/verify.js';

let dom;
function boot(html, url = 'https://jobs.lever.co/acme/12345/apply') {
  dom?.window.close();
  dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.CSS = { escape: value => value.replaceAll(':', '\\:') };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};

  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => storage.delete(key);
}

afterEach(() => dom?.window.close());

test('Lever checkbox lists are one owned question and touch only changed choices', async () => {
  boot(readFileSync(new URL('../../fixtures/lever-palantir-checkboxes-fixture.html', import.meta.url), 'utf8'));
  const fields = scanFormFields();
  const languages = fields.find(field => field.label === 'Language Skill(s) (Check all that apply)');
  const countries = fields.find(field => field.element.id === 'countries');
  assert.ok(languages, 'language options must be grouped');
  assert.equal(languages.label, 'Language Skill(s) (Check all that apply)');
  assert.equal(languages.required, true);
  assert.equal(languages.ats.multiple, true);
  assert.equal(languages.options.length, 33);
  assert.equal(fields.length, 5);
  assert.deepEqual(fields.filter(field => field.type === 'checkbox').map(field => field.id), ['consent', 'updates']);
  const normalized = normalizeFieldsForAI(fields);
  assert.equal(normalized.length, 5);
  assert.equal(normalized.find(field => field.fieldId === languages.id).ats.multiple, true);
  assert.equal(normalized.some(field => field.label === 'English (ENG)'), false);

  const changed = [];
  document.querySelector('form').addEventListener('change', event => changed.push(event.target.value));
  assert.equal(await fillField(languages, ['English (ENG)', 'Arabic (ARA)']), true);
  assert.deepEqual(changed, ['English (ENG)', 'Arabic (ARA)']);
  assert.equal((await verifyField(languages, ['English (ENG)', 'Arabic (ARA)'])).verified, true);
  changed.length = 0;
  assert.equal(await fillField(languages, ['English (ENG)', 'Arabic (ARA)']), true);
  assert.deepEqual(changed, []);
  assert.equal(await fillField(languages, ['Invented option']), false);
  assert.deepEqual(leverAdapter.readChoice(languages), ['English (ENG)', 'Arabic (ARA)']);
  assert.equal(await fillField(countries, ['Canada', 'United Kingdom']), true);
  assert.equal((await verifyField(countries, ['Canada', 'United Kingdom'])).verified, true);
  assert.equal(scanFormFields().find(field => field.id === languages.id).currentValue, 'English (ENG), Arabic (ARA)');
  assert.equal(document.querySelector('#consent').checked, false);
  assert.equal(document.querySelector('#updates').checked, false);

  saveProfile({ savedAnswers: { [countries.label]: ['Canada', 'United Kingdom'] } });
  saveApiKey('');
  const result = await generateAutofillAnswers(normalizeFieldsForAI([countries]));
  assert.deepEqual(result.answers[0].value, ['Canada', 'United Kingdom']);
});

test('Lever independent checkboxes in one question remain separate', () => {
  boot('<div class="application-question"><label><input id="privacy" name="privacy" type="checkbox">Privacy consent</label><label><input id="marketing" name="marketing" type="checkbox">Marketing consent</label></div>');
  assert.deepEqual(scanFormFields().map(field => [field.id, field.type]), [['privacy', 'checkbox'], ['marketing', 'checkbox']]);
});

for (const saved of [['English'], ['1'], 'English', []]) {
  test(`Lever grouped saved selections ${JSON.stringify(saved)} use owned values`, async () => {
    boot('<form><div class="application-question"><div class="application-label">Languages (Check all that apply)</div><label><input type="checkbox" name="languages" value="1">English</label><label><input type="checkbox" name="languages" value="2">French</label></div></form>');
    const [field] = scanFormFields();
    saveProfile({ savedAnswers: { [field.label]: saved } });
    saveApiKey('');
    const { answers } = await generateAutofillAnswers(normalizeFieldsForAI([field]));
    const expected = Array.isArray(saved) ? saved.length ? ['1'] : [] : '1';
    assert.deepEqual(answers[0]?.value, expected);
    assert.equal(answers[0].source, 'saved');
    assert.equal(await fillField(field, answers[0].value), true);
    assert.equal((await verifyField(field, expected)).verified, true);
  });
}

test('Lever captured checkbox question needs one page answer rather than 33 booleans', async () => {
  boot(readFileSync(new URL('../../fixtures/lever-palantir-checkboxes-fixture.html', import.meta.url), 'utf8'));
  saveProfile({ fullName: 'Test Applicant' });
  saveApiKey('synthetic-key');
  const fields = scanFormFields().filter(field => field.widget === 'ats-choice');
  const requests = [];
  const originalRequest = globalThis.GM_xmlhttpRequest;
  globalThis.GM_xmlhttpRequest = request => {
    const requestedFields = JSON.parse(JSON.parse(request.data).messages.at(-1).content).fieldsToFill;
    requests.push(requestedFields);
    request.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: requestedFields.map(field => ({
      fieldId: field.fieldId, value: field.options.filter(option => ['English (ENG)', 'Arabic (ARA)', 'Canada'].includes(option.label)).map(option => option.label),
    })) }) } }] }) });
  };
  try {
    const result = await generateAutofillAnswers(normalizeFieldsForAI(fields));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].length, 2);
    assert.equal(requests[0][0].options.length, 33);
    assert.equal(result.answers.length, 2);
    for (const answer of result.answers) {
      const field = fields.find(field => field.id === answer.fieldId);
      assert.equal(await fillField(field, answer.value), true);
      assert.equal((await verifyField(field, answer.value)).verified, true);
    }
  } finally {
    globalThis.GM_xmlhttpRequest = originalRequest;
  }
});

test('select scanning excludes hidden controls and follows Select2 presentation visibility', () => {
  const select = id => `<select id="${id}"><option value="">Choose</option><option>Waterloo</option></select>`;
  const select2 = id => `<select id="${id}" class="select2-hidden-accessible" aria-hidden="true"><option>Waterloo</option></select>`;
  boot(`<form>
    ${select('visible')}
    <section hidden>${select('hidden-section')}</section>
    <section aria-hidden="true">${select('aria-hidden-section')}</section>
    <section style="display:none">${select('css-hidden-section')}</section>
    <select id="hidden-self" hidden><option>Waterloo</option></select>
    <select id="aria-hidden-self" aria-hidden="true"><option>Waterloo</option></select>
    <select id="css-hidden-self" style="visibility:hidden"><option>Waterloo</option></select>
    ${select2('select2-visible')}<span class="select2-container"><span role="combobox"></span></span>
    ${select2('select2-hidden')}<span class="select2-container" style="display:none"><span role="combobox"></span></span>
    ${select2('select2-missing')}
  </form>`);
  assert.deepEqual(scanFormFields().map(field => field.id), ['visible', 'select2-visible']);
  assert.equal(isVisible(document.getElementById('select2-visible')), true);
  assert.equal(isVisible(document.getElementById('select2-hidden')), false);
  assert.equal(isVisible(document.getElementById('select2-missing')), false);
});

test('Lever institution recognition leaves GPA, graduation, and project questions contextual', () => {
  boot('<form></form>');
  for (const label of ['What is your university GPA?', 'What year did you graduate from college?', 'Describe a project you completed at school']) {
    const field = { id: 'education-question', type: 'text', label };
    assert.equal(leverCanonicalKey(field), '', label);
    assert.equal(leverAnswer(field, { education: [{ institution: 'University of Waterloo' }] }), null, label);
  }
});

test('Lever recognizes institution-name questions and unlabelled university widgets', () => {
  boot('<select id="university-picker-1" data-qa="university-dropdown"></select>');
  for (const label of ['School', 'School name', 'University or college', 'Name of your institution', 'Which university do you attend?', 'What Post-Secondary institution do you attend? *']) {
    assert.equal(leverCanonicalKey({ type: 'text', label }), 'school', label);
  }
  assert.equal(leverCanonicalKey(document.querySelector('select')), 'school');
});

test('Lever school choices do not substitute institutions sharing a substring', () => {
  boot('<form></form>');
  for (const [saved, offered] of [
    ['An unlisted university', 'TED University'],
    ['University of Toronto', 'University of Toronto Scarborough'],
  ]) {
    const field = {
      id: 'school', type: 'select', label: 'School',
      ats: { adapter: 'lever', canonicalKey: 'school' },
      options: [{ value: offered, label: offered }],
    };
    assert.equal(leverAnswer(field, { education: [{ institution: saved }] }).value, '', `${saved} must not select ${offered}`);
  }
});

test('Lever adapter detection matches hostname and DOM signature', () => {
  assert.equal(detectAdapter({ hostname: 'jobs.lever.co' }, null).id, 'lever');
  assert.equal(detectAdapter({ hostname: 'boards.lever.co' }, null).id, 'lever');

  // Custom domain with Lever location signature
  boot(`
    <form>
      <input class="location-input" name="location">
      <input type="hidden" name="selectedLocation" value="">
    </form>
  `, 'https://careers.acme.com/apply');
  assert.equal(detectAdapter(location, document).id, 'lever');
});

test('Lever canonical key mapping identifies built-in and URL inputs', () => {
  boot(`
    <form>
      <input id="name" name="name">
      <input id="email" name="email">
      <input id="phone" name="phone">
      <input id="org" name="org">
      <input class="location-input" name="location">
      <input name="urls[LinkedIn]">
      <input name="urls[GitHub]">
      <input name="urls[Portfolio]">
      <input name="urls[Twitter]">
      <input name="urls[Other]">
      <textarea name="comments"></textarea>
      <input type="file" name="resume">
    </form>
  `);

  assert.equal(leverCanonicalKey(document.querySelector('#name')), 'full_name');
  assert.equal(leverCanonicalKey(document.querySelector('#email')), 'email');
  assert.equal(leverCanonicalKey(document.querySelector('#phone')), 'phone');
  assert.equal(leverCanonicalKey(document.querySelector('#org')), 'company');
  assert.equal(leverCanonicalKey(document.querySelector('.location-input')), 'location');
  assert.equal(leverCanonicalKey(document.querySelector('input[name="urls[LinkedIn]"]')), 'linkedin');
  assert.equal(leverCanonicalKey(document.querySelector('input[name="urls[GitHub]"]')), 'github');
  assert.equal(leverCanonicalKey(document.querySelector('input[name="urls[Portfolio]"]')), 'portfolio');
  assert.equal(leverCanonicalKey(document.querySelector('input[name="urls[Twitter]"]')), 'twitter');
  assert.equal(leverCanonicalKey(document.querySelector('input[name="urls[Other]"]')), 'website');
  assert.equal(leverCanonicalKey(document.querySelector('textarea[name="comments"]')), 'comments');
  assert.equal(leverCanonicalKey(document.querySelector('input[type="file"]')), 'resume');
});

test('Lever custom question cards are heuristically classified into canonical keys', () => {
  boot(`
    <form>
      <div class="application-question custom-question">
        <div class="application-label text"><div class="text">Where do you live? (City and State/Province)<span class="required">✱</span></div></div>
        <input class="card-field-input" name="cards[residence][field0]" required>
      </div>
      <div class="application-question custom-question">
        <div class="application-label text"><div class="text">What is your desired total compensation range for this role?<span class="required">✱</span></div></div>
        <input class="card-field-input" name="cards[salary][field0]" required>
      </div>
      <div class="application-question custom-question">
        <div class="application-label textarea"><div class="text">LinkedIn Link<span class="required">✱</span></div></div>
        <textarea class="card-field-input" name="cards[linkedin][field0]" required></textarea>
      </div>
      <div class="application-question custom-question">
        <div class="application-label text"><div class="text">Are you legally authorized to work in the United States?<span class="required">✱</span></div></div>
        <select name="cards[work_auth][field0]">
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
      <div class="application-question custom-question">
        <div class="application-label text"><div class="text">Will you now or in the future require visa sponsorship?<span class="required">✱</span></div></div>
        <select name="cards[sponsor][field0]">
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </div>
      <div class="application-question custom-question">
        <div class="application-label text"><div class="text">What is your notice period?<span class="required">✱</span></div></div>
        <input name="cards[notice][field0]">
      </div>
    </form>
  `);

  const residence = document.querySelector('input[name="cards[residence][field0]"]');
  const salary = document.querySelector('input[name="cards[salary][field0]"]');
  const linkedin = document.querySelector('textarea[name="cards[linkedin][field0]"]');
  const auth = document.querySelector('select[name="cards[work_auth][field0]"]');
  const sponsor = document.querySelector('select[name="cards[sponsor][field0]"]');
  const notice = document.querySelector('input[name="cards[notice][field0]"]');

  assert.equal(leverCanonicalKey(residence), 'location');
  assert.equal(leverCanonicalKey(salary), 'salary');
  assert.equal(leverCanonicalKey(linkedin), 'linkedin');
  assert.equal(leverCanonicalKey(auth), 'work_auth');
  assert.equal(leverCanonicalKey(sponsor), 'sponsorship');
  assert.equal(leverCanonicalKey(notice), 'notice_period');

  const meta = leverFieldMetadata(salary);
  assert.equal(meta.required, true);
  assert.equal(meta.ats.canonicalKey, 'salary');
  assert.match(meta.label, /desired total compensation/i);
});

test('Lever does not classify narrative text as a demographic disclosure', () => {
  const field = {
    type: 'textarea',
    label: 'Describe your experience building products for people with disabilities',
  };

  assert.equal(leverCanonicalKey(field), '');
});

test('Lever deterministic answer resolution binds candidate profile values', () => {
  const profile = {
    fullName: 'Jane Doe',
    email: 'jane.doe@example.com',
    phone: '+1 415 555 2671',
    location: 'San Francisco, CA, USA',
    city: 'San Francisco',
    linkedin: 'https://linkedin.com/in/janedoe',
    github: 'https://github.com/janedoe',
    expectedSalary: '140,000',
    salaryCurrency: 'USD',
    workAuthorization: 'Yes',
    sponsorshipFuture: 'No',
    noticePeriod: 'Two weeks',
  };

  assert.equal(leverValue({ ats: { canonicalKey: 'full_name' } }, profile), 'Jane Doe');
  assert.equal(leverValue({ ats: { canonicalKey: 'email' } }, profile), 'jane.doe@example.com');
  assert.equal(leverValue({ ats: { canonicalKey: 'phone' } }, profile), '+1 415 555 2671');
  assert.equal(leverValue({ ats: { canonicalKey: 'location' } }, profile), 'San Francisco, CA, USA');
  assert.equal(leverValue({ ats: { canonicalKey: 'linkedin' } }, profile), 'https://linkedin.com/in/janedoe');
  assert.equal(leverValue({ ats: { canonicalKey: 'salary' } }, profile), '140,000 USD');
  assert.equal(leverValue({ ats: { canonicalKey: 'work_auth' } }, profile), 'Yes');
  assert.equal(leverValue({ ats: { canonicalKey: 'sponsorship_future' } }, profile), 'No');
  assert.equal(leverValue({ ats: { canonicalKey: 'notice_period' } }, profile), 'Two weeks');

  const ans = leverAnswer({ id: 'full_name', ats: { canonicalKey: 'full_name' } }, profile);
  assert.equal(ans.value, 'Jane Doe');
  assert.equal(ans.provenance, 'saved');
});

test('Lever deterministic salary keeps the saved pay period', () => {
  const value = leverValue({ ats: { canonicalKey: 'salary' } }, {
    expectedSalary: '60',
    salaryCurrency: 'USD',
    salaryPeriod: 'Hourly',
  });

  assert.equal(value, '60 USD Hourly');
});

test('Lever eligibility answers use the question country and combined sponsorship timing', () => {
  const options = [
    { value: 'Yes', label: 'Yes' },
    { value: 'No', label: 'No' },
  ];
  const profile = {
    workAuthorization: 'Yes',
    sponsorshipNow: 'No',
    sponsorshipFuture: 'No',
    workEligibilities: [
      { enabled: true, country: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'No' },
      { enabled: true, country: 'United States', workAuthorization: 'No', sponsorshipNow: 'Yes', sponsorshipFuture: 'No' },
    ],
  };

  const usAuthorization = leverAnswer({
    id: 'us-auth',
    label: 'Are you legally authorized to work in the United States?',
    type: 'select',
    ats: { canonicalKey: 'work_auth' },
    options,
  }, profile);
  assert.equal(usAuthorization.value, 'No');

  const missingCountry = leverAnswer({
    id: 'mx-auth',
    label: 'Are you legally authorized to work in Mexico?',
    type: 'select',
    ats: { canonicalKey: 'work_auth' },
    options,
  }, profile);
  assert.equal(missingCountry, null);

  const unsetUsAuthorization = leverAnswer({
    id: 'unset-us-auth',
    label: 'Are you legally authorized to work in the United States?',
    type: 'select',
    ats: { canonicalKey: 'work_auth' },
    options,
  }, {
    ...profile,
    workEligibilities: [
      profile.workEligibilities[0],
      { enabled: true, country: 'United States', workAuthorization: '', sponsorshipNow: '', sponsorshipFuture: '' },
    ],
  });
  assert.equal(unsetUsAuthorization, null);

  const combinedSponsorship = leverAnswer({
    id: 'us-sponsorship',
    label: 'Will you now or in the future require visa sponsorship in the United States?',
    type: 'select',
    ats: { canonicalKey: 'sponsorship' },
    options,
  }, profile);
  assert.equal(combinedSponsorship.value, 'Yes');
});

test('Lever unset EEO disclosures remain unresolved instead of overriding contextual answers with Decline', () => {
  const emptyProfile = {};

  // Optional gender field -> leaves blank
  const optionalGender = {
    id: 'gender',
    type: 'select',
    required: false,
    ats: { canonicalKey: 'gender' },
    options: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'decline', label: 'Decline to self-identify' },
    ],
  };
  const optAns = leverAnswer(optionalGender, emptyProfile);
  assert.equal(optAns.value, '');

  // Required gender field with no profile value -> remains available to page AI
  const requiredGender = {
    ...optionalGender,
    required: true,
  };
  const reqAns = leverAnswer(requiredGender, emptyProfile);
  assert.equal(reqAns.value, '');
  assert.equal(reqAns.inferred, false);
  assert.equal(reqAns.provenance, 'saved');

  // When profile HAS gender, matches candidate selection
  const filledAns = leverAnswer(requiredGender, { gender: 'Woman' });
  assert.equal(filledAns.value, 'female');
  assert.equal(filledAns.provenance, 'saved');
});

test('Lever exact saved answers replace empty deterministic answers', async () => {
  boot('<form></form>');
  saveProfile({ savedAnswers: { Gender: 'Female' } });
  saveApiKey('');

  const { answers } = await generateAutofillAnswers([{
    fieldId: 'gender',
    type: 'select',
    label: 'Gender',
    required: false,
    currentValue: '',
    isAlreadyFilled: false,
    ats: { adapter: 'lever', canonicalKey: 'gender' },
    options: [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
    ],
  }]);

  assert.deepEqual(answers[0], {
    fieldId: 'gender',
    value: 'female',
    inferred: false,
    provenance: 'saved',
    source: 'saved',
  });
});

test('Lever pronouns widget reads and fills custom and standard choices', () => {
  const html = readFileSync(new URL('../../fixtures/lever-hardening-fixture.html', import.meta.url), 'utf8');
  boot(html);

  const groups = leverAdapter.choiceGroups(document, { pronouns: 'They/them' });
  assert.equal(groups.length, 1);
  const pronounsField = groups[0];
  assert.equal(pronounsField.widget, 'lever-pronouns');
  assert.equal(pronounsField.name, 'pronouns');

  // Fill standard choice
  const filled = leverAdapter.fillChoice(pronounsField, 'They/them', {
    checkbox: (el, val) => { el.checked = val; },
    text: (el, val) => { el.value = val; },
  });
  assert.equal(filled, true);
  assert.deepEqual(leverAdapter.readChoice(pronounsField), ['They/them']);

  // Fill custom choice
  const customGroups = leverAdapter.choiceGroups(document, { pronouns: 'ze/zir' });
  const customField = customGroups[0];
  const customFilled = leverAdapter.fillChoice(customField, 'ze/zir', {
    checkbox: (el, val) => { el.checked = val; },
    text: (el, val) => { el.value = val; },
  });
  assert.equal(customFilled, true);
  assert.deepEqual(leverAdapter.readChoice(customField), ['ze/zir']);
});

test('Lever zero-AI profile autofill resolves all known application fields offline', async () => {
  const html = readFileSync(new URL('../../fixtures/lever-application-fixture.html', import.meta.url), 'utf8');
  boot(html);

  saveProfile({
    fullName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    phone: '+1 415 555 1234',
    location: 'Toronto, ON, CAN',
    city: 'Toronto',
    linkedin: 'https://linkedin.com/in/alexmorgan',
  });
  saveApiKey(''); // Explicitly zero API key

  const fields = scanFormFields();
  const nameField = fields.find(f => f.element.id === 'name');
  const locField = fields.find(f => f.element.classList.contains('location-input'));
  const linkedinField = fields.find(f => f.element.id === 'linkedin');

  assert.ok(nameField);
  assert.ok(locField);
  assert.ok(linkedinField);

  assert.equal(nameField.ats?.canonicalKey, 'full_name');
  assert.equal(locField.ats?.canonicalKey, 'location');
  assert.equal(linkedinField.ats?.canonicalKey, 'linkedin');

  const normalized = normalizeFieldsForAI(fields);
  const result = await generateAutofillAnswers(normalized);

  assert.ok(result.answers.length > 0);
  const nameAns = result.answers.find(a => a.fieldId === nameField.id);
  const linkedinAns = result.answers.find(a => a.fieldId === linkedinField.id);

  assert.equal(nameAns?.value, 'Alex Morgan');
  assert.equal(nameAns?.provenance, 'saved');
  assert.equal(linkedinAns?.value, 'https://linkedin.com/in/alexmorgan');
  assert.equal(linkedinAns?.provenance, 'saved');

  // Fill field verification
  assert.equal(await fillField(nameField, nameAns.value), true);
  assert.equal(nameField.element.value, 'Alex Morgan');
  assert.equal(await fillField(linkedinField, linkedinAns.value), true);
  assert.equal(linkedinField.element.value, 'https://linkedin.com/in/alexmorgan');
});

test('Lever hardening fixture with custom cards fills residence, salary, and linkedin', async () => {
  const html = readFileSync(new URL('../../fixtures/lever-hardening-fixture.html', import.meta.url), 'utf8');
  boot(html);

  saveProfile({
    fullName: 'Jordan Taylor',
    email: 'jordan@example.com',
    location: 'Toronto, ON, CAN',
    city: 'Toronto',
    expectedSalary: '135,000',
    salaryCurrency: 'CAD',
    linkedin: 'https://linkedin.com/in/jordantaylor',
  });
  saveApiKey('');

  const fields = scanFormFields();
  const name = fields.find(f => f.element.name === 'name');
  const residence = fields.find(f => f.element.name === 'cards[residence][field0]');
  const salary = fields.find(f => f.element.name === 'cards[salary][field0]');
  const linkedin = fields.find(f => f.element.name === 'cards[linkedin][field0]');

  assert.ok(name);
  assert.ok(residence);
  assert.ok(salary);
  assert.ok(linkedin);

  assert.equal(name.ats?.canonicalKey, 'full_name');
  assert.equal(residence.ats?.canonicalKey, 'location');
  assert.equal(salary.ats?.canonicalKey, 'salary');
  assert.equal(linkedin.ats?.canonicalKey, 'linkedin');

  const normalized = normalizeFieldsForAI(fields);
  const result = await generateAutofillAnswers(normalized);

  const resAns = result.answers.find(a => a.fieldId === residence.id);
  const salAns = result.answers.find(a => a.fieldId === salary.id);
  const linkAns = result.answers.find(a => a.fieldId === linkedin.id);

  assert.equal(resAns?.value, 'Toronto, ON, CAN');
  assert.equal(salAns?.value, '135,000 CAD');
  assert.equal(linkAns?.value, 'https://linkedin.com/in/jordantaylor');

  assert.equal(await fillField(residence, resAns.value), true);
  assert.equal(residence.element.value, 'Toronto, ON, CAN');

  assert.equal(await fillField(salary, salAns.value), true);
  assert.equal(salary.element.value, '135,000 CAD');

  assert.equal(await fillField(linkedin, linkAns.value), true);
  assert.equal(linkedin.element.value, 'https://linkedin.com/in/jordantaylor');
});

test('Lever uploadState and uploadBusy handle hidden indicators correctly', () => {
  boot(`
    <li class="application-question resume">
      <div class="application-field">
        <a class="visible-resume-upload has-file">
          <span class="filename">resume.pdf</span>
          <input id="resume-upload-input" type="file" name="resume">
        </a>
        <span class="resume-upload-working" style="display: none;">Analyzing resume...</span>
        <span class="resume-upload-success" style="display: inline;">Success!</span>
      </div>
    </li>
  `);

  const fileInput = document.getElementById('resume-upload-input');
  assert.equal(leverAdapter.uploadBusy(document), false);
  assert.deepEqual(leverAdapter.uploadState(fileInput), { name: 'resume.pdf', accepted: true });

  // When working indicator is active (visible)
  document.querySelector('.resume-upload-working').style.display = 'inline';
  assert.equal(leverAdapter.uploadBusy(document), true);
  assert.equal(leverAdapter.uploadState(fileInput).accepted, false);
});

test('Lever live fixture (jobs.lever.co-2026-09-28-05-26.html) does not hang on uploadBusy and accepts parsed resume', () => {
  const html = readFileSync(new URL('../../fixtures/jobs.lever.co-2026-09-28-05-26.html', import.meta.url), 'utf8');
  boot(html, 'https://jobs.lever.co/xsolla/8ff694d3-1018-4f2a-9bb9-96818398a19a/apply');

  assert.equal(detectAdapter(location, document).id, 'lever');

  const fileInput = document.getElementById('resume-upload-input');
  assert.ok(fileInput, 'Resume upload input must exist');

  // Must NOT hang waiting for resume parsing
  assert.equal(leverAdapter.uploadBusy(document), false);

  // Must accurately detect accepted resume.pdf from Lever's DOM
  const upload = leverAdapter.uploadState(fileInput);
  assert.deepEqual(upload, { name: 'resume.pdf', accepted: true });

  // Verify form scanning discovers fields
  const fields = scanFormFields();
  assert.ok(fields.length >= 10, `Expected at least 10 fields, scanned ${fields.length}`);
});

test('Lever university dropdown fixture (jobs.lever.co-2026-09-30-21-49.html) scans backing select, maps canonical school key, and fills exact option', async () => {
  const html = readFileSync(new URL('../../fixtures/jobs.lever.co-2026-09-30-21-49.html', import.meta.url), 'utf8');
  boot(html, 'https://jobs.lever.co/kepler/2ad02ce3-1d56-4aee-9f1d-5199c780c0c1/apply');

  assert.equal(detectAdapter(location, document).id, 'lever');

  saveProfile({
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    education: [
      { institution: 'University of Waterloo', degree: "Bachelor's degree" }
    ],
  });
  saveApiKey('');

  const fields = scanFormFields();
  const uniField = fields.find(f => /institution|university|school/i.test(f.label) || f.ats?.canonicalKey === 'school');
  assert.ok(uniField, 'University field must be scanned');
  assert.equal(uniField.type, 'select');
  assert.equal(uniField.required, true);
  assert.equal(uniField.ats?.canonicalKey, 'school');
  assert.ok(uniField.options.length > 2000, `Expected thousands of university options, got ${uniField.options.length}`);
  assert.ok(uniField.id && uniField.id !== 'undefined');

  // Verify Select2 presentation combobox was not duplicated as an extra field
  const comboboxes = fields.filter(f => f.type === 'combobox' && /institution|university/i.test(f.label));
  assert.equal(comboboxes.length, 0, 'Select2 presentation combobox should not be scanned as a separate field');

  // Deterministic answer resolution
  const answer = leverAnswer(uniField, {
    education: [{ institution: 'University of Waterloo' }]
  });
  assert.ok(answer, 'Should resolve deterministic answer for school');
  assert.equal(answer.value, 'University of Waterloo');

  // Fill and verify
  const filled = await fillField(uniField, answer.value);
  assert.equal(filled, true, 'fillField should succeed on backing select');
  assert.equal(uniField.element.value, 'University of Waterloo');
});


