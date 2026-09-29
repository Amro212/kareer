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
  assert.equal(leverValue({ ats: { canonicalKey: 'sponsorship' } }, profile), 'No');
  assert.equal(leverValue({ ats: { canonicalKey: 'notice_period' } }, profile), 'Two weeks');

  const ans = leverAnswer({ id: 'full_name', ats: { canonicalKey: 'full_name' } }, profile);
  assert.equal(ans.value, 'Jane Doe');
  assert.equal(ans.provenance, 'saved');
});

test('Lever EEO disclosures leave optional unset fields blank and fill required with Decline', () => {
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

  // Required gender field with no profile value -> selects decline option
  const requiredGender = {
    ...optionalGender,
    required: true,
  };
  const reqAns = leverAnswer(requiredGender, emptyProfile);
  assert.equal(reqAns.value, 'decline');
  assert.equal(reqAns.inferred, true);
  assert.equal(reqAns.provenance, 'inferred');

  // When profile HAS gender, matches candidate selection
  const filledAns = leverAnswer(requiredGender, { gender: 'Woman' });
  assert.equal(filledAns.value, 'female');
  assert.equal(filledAns.provenance, 'saved');
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

