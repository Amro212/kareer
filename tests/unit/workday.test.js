import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { detectAdapter } from '../../src/core/adapters/index.js';
import { scanFormFields, harvestComboboxOptions, refreshField } from '../../src/core/fields/scanner.js';
import { readComboboxSelection, setComboboxSearch, openCombobox, discoverComboboxOptions, waitForComboboxOptions } from '../../src/core/fields/combobox.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { saveProfile, saveApiKey } from '../../src/core/storage.js';
import { generateAutofillAnswers } from '../../src/core/ai.js';
import { findContinue } from '../../src/core/navigation.js';
import { prepareWorkdaySections, prepareWorkdayDependencies } from '../../src/core/adapters/workday-sections.js';
import { workdayAnswer, workdayValue, workdayOptionMatches, workdayNeedsFill } from '../../src/core/adapters/workday-fields.js';
import { inspectValidation } from '../../src/core/validation.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';

let dom;
function boot(html) {
  dom?.window.close();
  dom = new JSDOM(html, { url: 'https://cbc.wd3.myworkdayjobs.com/en-US/careers/job/apply', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value.replaceAll(':', '\\:') };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => storage.delete(key);
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com', phone: '+14165551234', country: 'Canada' });
}
afterEach(() => dom?.window.close());

function prompt() {
  boot(`<main><form><div data-automation-id="sourceSection"><div data-automation-id="formField-source"><label for="source--source">How did you hear about us? *</label><div data-automation-id="multiSelectContainer"><input id="source--source" placeholder="Search" data-uxi-widget-type="selectinput"></div></div></div></form></main><div data-automation-id="activeListContainer" hidden></div>`);
  const input = document.querySelector('input'), menu = document.querySelector('[data-automation-id="activeListContainer"]');
  const accepted = [];
  let enters = 0, submits = 0;
  document.querySelector('form').onsubmit = event => { submits++; event.preventDefault(); };
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    enters++;
    if (!event.defaultPrevented) document.querySelector('form').requestSubmit();
    menu.hidden = false;
    menu.innerHTML = '<div data-automation-id="promptMessage">Search results</div><div data-automation-id="promptLeafNode"><div data-automation-id="promptOption" data-automation-label="LinkedIn">LinkedIn</div></div>';
    menu.firstElementChild.nextElementSibling.onmousedown = event => event.preventDefault();
    menu.firstElementChild.nextElementSibling.onclick = () => {
      if (!accepted.includes('LinkedIn')) accepted.push('LinkedIn');
      input.parentElement.insertAdjacentHTML('afterbegin', '<div data-automation-id="selectedItem" title="LinkedIn">LinkedIn</div>');
      input.value = '';
      menu.hidden = true;
    };
  });
  return { input, menu, accepted, counts: () => ({ enters, submits }) };
}

test('Workday plain prompt search is a required combobox with stable question metadata', () => {
  const { input } = prompt();
  const field = scanFormFields().find(field => field.element === input);
  assert.equal(field.type, 'combobox');
  assert.equal(field.required, true);
  assert.equal(field.ats.canonicalKey, 'source');
  assert.equal(field.label, 'How did you hear about us?');
});

test('Workday search dispatches Enter without implicit submit and query text is never committed', () => {
  const { input, counts } = prompt();
  input.focus();
  setComboboxSearch(input, 'LinkedIn');
  assert.equal(counts().enters, 1);
  assert.equal(counts().submits, 0);
  assert.deepEqual(readComboboxSelection(input), []);
});

test('Workday harvest selects only owned leaves and fill verifies committed token after query clears', async () => {
  const { input, accepted, counts } = prompt();
  const field = scanFormFields().find(field => field.element === input);
  await harvestComboboxOptions([field], new Map([[field.id, 'LinkedIn']]));
  assert.deepEqual(field.options, [{ value: 'LinkedIn', label: 'LinkedIn' }]);
  assert.deepEqual(accepted, [], 'discovery must not select');
  assert.equal(await fillField(field, 'LinkedIn'), true);
  assert.deepEqual(accepted, ['LinkedIn']);
  assert.equal(counts().submits, 0);
  assert.deepEqual(readComboboxSelection(input), ['LinkedIn']);
  refreshField(field);
  assert.equal((await verifyField(field, 'LinkedIn')).verified, true);
});

test('Workday committed token is read even when search is empty and placeholders are rejected', () => {
  const { input } = prompt();
  input.parentElement.insertAdjacentHTML('afterbegin', '<div data-automation-id="selectedItem" title="Canada (+1)">Canada (+1)</div>');
  assert.deepEqual(readComboboxSelection(input), ['Canada (+1)']);
  input.parentElement.firstElementChild.textContent = 'No Items';
  input.parentElement.firstElementChild.removeAttribute('title');
  assert.deepEqual(readComboboxSelection(input), []);
});

test('Workday harvests and corrects a populated custom degree dropdown', async () => {
  boot('<main><div data-automation-id="educationSection"><div data-automation-id="education-1"><input id="a--school" value="University"><div data-automation-id="formField-degree"><label for="a--degree">Degree</label><button type="button" id="a--degree" data-automation-id="degree" aria-haspopup="listbox">Bachelor of Arts</button></div></div></div><div data-automation-id="activeListContainer" hidden><div data-automation-id="promptLeafNode">Master of Science</div></div></main>');
  const profile = { education: [{ id: 'edu', institution: 'University', degree: "Master's degree" }] };
  saveProfile(profile);
  const button = document.querySelector('button');
  const menu = document.querySelector('[data-automation-id="activeListContainer"]');
  button.onclick = () => { menu.hidden = false; };
  menu.firstElementChild.onclick = () => { button.textContent = 'Master of Science'; menu.hidden = true; };
  await prepareWorkdaySections(document, profile);
  const field = scanFormFields().find(field => field.ats.canonicalKey === 'degree');
  assert.equal(workdayNeedsFill(field, profile), true);
  await harvestComboboxOptions([field]);
  assert.equal(button.textContent, 'Bachelor of Arts', 'harvesting must not change the selection');
  assert.equal(workdayAnswer(field, profile).value, 'Master of Science');
  assert.equal(await fillField(field, workdayAnswer(field, profile).value), true);
  assert.equal((await verifyField(field, 'Master of Science')).verified, true);
  assert.equal(workdayNeedsFill(scanFormFields().find(field => field.ats.canonicalKey === 'degree'), profile), false);
});

test('Workday reuses a nested school prompt with its selected token beside the input container', async () => {
  boot('<div data-automation-id="educationSection"><div data-automation-id="education-1"><div data-automation-id="formField-school"><label for="school">School</label><div data-automation-id="multiSelectContainer"><div data-automation-id="selectedItem" title="University">University</div><div data-automation-id="multiselectInputContainer"><input id="school" data-automation-id="schoolName" placeholder="Search" value="Uncommitted search"></div></div></div><input id="gpa" value="3.8"></div><button type="button" data-automation-id="add-button">Add</button></div>');
  let adds = 0;
  document.querySelector('button').onclick = () => {
    adds++;
    document.querySelector('button').insertAdjacentHTML('beforebegin', '<div data-automation-id="education-2"><input id="school2" data-automation-id="schoolName"></div>');
  };
  const profile = { education: [{ id: 'edu', institution: 'University' }] };
  await prepareWorkdaySections(document, profile);
  assert.equal(adds, 0);
  const field = scanFormFields().find(field => field.element.id === 'school');
  assert.equal(field.ats.record.id, 'edu');
  assert.deepEqual(readComboboxSelection(field.element), ['University']);
  assert.equal(workdayNeedsFill(field, profile), false);
  await prepareWorkdaySections(document, profile);
  assert.equal(adds, 0);
  field.element.closest('[data-automation-id="multiSelectContainer"]').querySelector('[data-automation-id="selectedItem"]').title = 'Other school';
  assert.equal(scanFormFields().find(field => field.element.id === 'school').ats.record, undefined);
});

test('Workday accepts myworkdaysite and never reports Submit as Continue', () => {
  boot('<main><div data-automation-id="applyFlowReviewPage"></div><button data-automation-id="bottom-navigation-next-button">Submit</button></main>');
  assert.equal(detectAdapter({ hostname: 'acme.wd1.myworkdaysite.com' }, { querySelector: () => null }).id, 'workday');
  assert.equal(findContinue(), null);
});

test('Workday manual verification rejects wrong nonempty text', async () => {
  boot('<div data-automation-id="formField-city"><label for="city">City</label><input id="city" data-automation-id="addressSection_city" value="Wrong city"></div>');
  assert.equal((await verifyField(scanFormFields()[0], 'Toronto')).verified, false);
});

test('Workday deterministic profile fields bypass AI and unresolved questions share one request', async () => {
  boot('<main></main>');
  saveProfile({ firstName: 'Test', lastName: 'Applicant', fullName: 'Test Applicant', country: 'Canada' });
  saveApiKey('fixture-key');
  let requests = 0;
  globalThis.GM_xmlhttpRequest = options => {
    requests++;
    options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: [{ fieldId: 'why', value: 'I built useful tools.', inferred: true }, { fieldId: 'custom', value: 'Yes' }] }) } }] }) });
  };
  const first = { fieldId: 'first', type: 'text', label: 'Prénom', ats: { adapter: 'workday', canonicalKey: 'first_name' } };
  assert.equal((await generateAutofillAnswers([first])).answers[0].value, 'Test');
  assert.equal(requests, 0);
  const response = await generateAutofillAnswers([first, { fieldId: 'why', type: 'textarea', label: 'Why this role?', ats: { adapter: 'workday' } }, { fieldId: 'custom', type: 'text', label: 'Custom question', ats: { adapter: 'workday' } }]);
  assert.equal(requests, 1);
  assert.equal(response.answers.length, 3);
});

test('Workday country phone code comes from phone rather than residence and unmatched choices stay unresolved', () => {
  boot('<main></main>');
  const field = { fieldId: 'dial', type: 'combobox', ats: { adapter: 'workday', canonicalKey: 'phone_country' }, options: [{ value: 'ca', label: 'Canada (+1)' }, { value: 'gb', label: 'United Kingdom (+44)' }] };
  assert.equal(workdayAnswer(field, { phone: '+442079460123', country: 'Canada' }).value, 'United Kingdom (+44)');
  assert.equal(workdayValue({ ats: { canonicalKey: 'phone_stripped' } }, { phone: '+442079460123', country: 'Canada' }), '2079460123');
  assert.equal(workdayAnswer(field, { phone: 'invalid', country: 'Canada' }), null);
  assert.equal(workdayAnswer({ ...field, options: [] }, { phone: '+442079460123' }).value, '');
});

test('Workday fills missing skills while preserving existing tokens and verifies every requested token', async () => {
  const { input, menu } = prompt();
  input.closest('[data-automation-id="formField-source"]').setAttribute('data-automation-id', 'formField-skills');
  input.id = 'skills';
  input.parentElement.insertAdjacentHTML('afterbegin', '<div data-automation-id="selectedItem" title="Python">Python</div>');
  const field = scanFormFields()[0];
  field.options = [{ value: 'Python', label: 'Python' }, { value: 'LinkedIn', label: 'LinkedIn' }];
  assert.equal(await fillField(field, ['Python', 'LinkedIn']), true);
  assert.deepEqual(readComboboxSelection(input).sort(), ['LinkedIn', 'Python']);
  assert.equal((await verifyField(field, ['Python', 'LinkedIn'])).verified, true);
  assert.equal((await verifyField(field, ['Python', 'Missing'])).verified, false);
});

test('Workday repeaters match parsed rows, add missing records once, retain user rows and bind canonical row values', async () => {
  boot('<main><div data-automation-id="workExperienceSection"><div data-automation-id="workExperience-1"><div data-automation-id="formField-jobTitle"><label>Job title</label><input id="workExperience-1--jobTitle" value="Engineer"></div><input id="workExperience-1--company" value="Acme"></div><div data-automation-id="workExperience-2"><input id="workExperience-2--jobTitle" value="User role"><input id="workExperience-2--company" value="Other"></div><button type="button" data-automation-id="add-button">Add</button></div></main>');
  let adds = 0;
  document.querySelector('button').onclick = () => { adds++; document.querySelector('button').insertAdjacentHTML('beforebegin', `<div data-automation-id="workExperience-${adds + 2}"><div data-automation-id="formField-jobTitle"><label>Job title</label><input id="workExperience-${adds + 2}--jobTitle"></div><input id="workExperience-${adds + 2}--company"></div>`); };
  const profile = { workExperiences: [{ id: 'a', title: 'Engineer', company: 'Acme', description: 'Built tools.' }, { id: 'b', title: 'Tutor', company: 'Paper' }] };
  await prepareWorkdaySections(document, profile);
  await prepareWorkdaySections(document, profile);
  assert.equal(adds, 1);
  const fields = scanFormFields();
  assert.equal(fields.find(field => field.element.id === 'workExperience-1--jobTitle').id, 'workday:a:title');
  assert.equal(workdayValue(fields.find(field => field.element.id === 'workExperience-3--jobTitle'), profile), 'Tutor');
  assert.equal(document.querySelector('#workExperience-2--jobTitle').value, 'User role');
});

test('Workday repeaters refuse ambiguous parsed matches and bounded row caps', async () => {
  boot('<div data-automation-id="workExperienceSection"><div data-automation-id="workExperience-1"><input id="a--jobTitle" value="Engineer"><input id="a--company" value="Acme"></div><div data-automation-id="workExperience-2"><input id="b--jobTitle" value="Engineer"><input id="b--company" value="Acme"></div><button data-automation-id="add-button" disabled>Add</button></div>');
  await assert.rejects(prepareWorkdaySections(document, { workExperiences: [{ id: 'x', title: 'Engineer', company: 'Acme' }] }), /ambiguous/i);
  await assert.rejects(prepareWorkdaySections(document, { workExperiences: [{ id: 'y', title: 'Other', company: 'Other' }] }), /limit|manual/i);
});

test('Workday does not borrow a stale global popup from another question', async () => {
  const { input, menu } = prompt();
  menu.hidden = false;
  menu.innerHTML = '<div data-automation-id="promptOption">Unrelated stale option</div>';
  await openCombobox(input);
  assert.deepEqual(discoverComboboxOptions(input), []);
  setComboboxSearch(input, 'LinkedIn');
  assert.equal(discoverComboboxOptions(input).length, 1);
});

test('Workday virtual menus advance only their owned viewport to find exact saved values', async () => {
  const { input, menu } = prompt();
  input.setAttribute('aria-controls', 'owned-menu'); menu.id = 'owned-menu';
  setComboboxSearch(input, 'LinkedIn');
  menu.innerHTML = '<div class="ReactVirtualized__Grid"><div data-automation-id="promptOption">Other</div></div>';
  const grid = menu.firstElementChild;
  Object.defineProperty(grid, 'scrollHeight', { value: 1200 });
  Object.defineProperty(grid, 'clientHeight', { value: 200 });
  grid.addEventListener('scroll', () => { if (grid.scrollTop >= 200) grid.innerHTML = '<div data-automation-id="promptOption">LinkedIn</div>'; });
  assert.equal((await waitForComboboxOptions(input, 1000)).length, 1);
  assert.equal(grid.scrollTop, 200);
});

test('Workday source hierarchy expands exact known groups without choosing the group as an answer', async () => {
  const { input, menu } = prompt();
  input.setAttribute('aria-controls', 'owned-menu'); menu.id = 'owned-menu';
  setComboboxSearch(input, 'LinkedIn');
  menu.innerHTML = '<div data-automation-id="promptTitle" role="button">Job Boards</div>';
  menu.firstElementChild.onclick = () => { menu.innerHTML = '<div data-automation-id="promptLeafNode"><div data-automation-id="promptOption">LinkedIn</div></div>'; };
  const options = await waitForComboboxOptions(input, 1000);
  assert.equal(options.length, 1);
  assert.equal(options[0].textContent, 'LinkedIn');
  assert.deepEqual(readComboboxSelection(input), []);
});

test('Workday segmented dates and framework-replaced rows keep record identity', async () => {
  boot('<div data-automation-id="workExperienceSection"><div data-automation-id="workExperience-1"><input id="a--jobTitle"><div data-automation-id="formField-startDate"><label>From</label><input data-automation-id="dateSectionMonth-input" aria-label="Month"><input data-automation-id="dateSectionYear-input" aria-label="Year"></div></div></div>');
  const profile = { workExperiences: [{ id: 'a', title: 'Engineer', startDate: '2023-09' }] };
  await prepareWorkdaySections(document, profile);
  const row = document.querySelector('[data-automation-id="workExperience-1"]');
  row.replaceWith(row.cloneNode(true));
  const fields = scanFormFields();
  const month = fields.find(field => field.ats.canonicalKey === 'startDate_month');
  assert.equal(month.id, 'workday:a:startDate_month');
  assert.equal(workdayValue(month, profile), '09');
  assert.equal(workdayValue(fields.find(field => field.ats.canonicalKey === 'startDate_year'), profile), '2023');
});

test('Workday inputError belongs to its question and blocks validation', () => {
  boot('<div data-automation-id="formField-city"><label for="city">City</label><input id="city" value="Toronto"><div data-automation-id="inputError">Please enter a valid city.</div></div>');
  const errors = inspectValidation(scanFormFields());
  assert.equal(errors.length, 1);
  assert.equal(errors[0].fieldId, 'city');
});

test('Workday disability checkbox choices commit the exact saved option as one question', async () => {
  boot('<div data-automation-id="formField-disability"><fieldset><legend>Disability *</legend><div><label for="yes">Yes, I have a disability</label><input id="yes" type="checkbox" value="yes"></div><div><label for="no">No, I do not have a disability</label><input id="no" type="checkbox" value="no"></div></fieldset></div>');
  const fields = scanFormFields();
  assert.equal(fields.length, 1);
  const answer = workdayAnswer({ ...fields[0], fieldId: fields[0].id }, { disabilityStatus: 'No' });
  assert.equal(answer.value, 'no');
  assert.equal(await fillField(fields[0], answer.value), true);
  assert.equal((await verifyField(fields[0], answer.value)).verified, true);
  assert.equal(document.querySelector('#yes').checked, false);
  assert.equal(document.querySelector('#no').checked, true);
});

test('Workday optional disclosure answers remain empty and unsupported option values are never inferred', async () => {
  boot('<main></main>');
  const field = { fieldId: 'gender', type: 'combobox', label: 'Gender', ats: { adapter: 'workday', canonicalKey: 'gender' }, options: [{ value: 'female', label: 'Female' }] };
  assert.equal(workdayAnswer(field, {}).value, '');
  assert.equal(workdayAnswer(field, { gender: 'Woman' }).value, 'Female');
  const result = await generateAutofillAnswers([field]);
  assert.equal(result.answers[0].value, '');
});

test('Workday country dependencies settle before region discovery and respect existing country', async () => {
  boot('<main><div data-automation-id="formField-country"><label>Country</label><select id="country--country"><option value="">Select one</option><option value="ca">Canada</option><option value="us">United States</option></select></div><div id="region"></div></main>');
  const country = document.querySelector('select');
  country.onchange = () => { document.querySelector('#region').innerHTML = '<div data-automation-id="formField-addressSection_countryRegion"><label>Province</label><input data-automation-id="addressSection_countryRegion"></div>'; };
  await prepareWorkdayDependencies(document, { country: 'Canada', stateProvince: 'Ontario' });
  assert.equal(country.value, 'ca');
  assert.equal(scanFormFields().some(field => field.ats.canonicalKey === 'state'), true);
  await prepareWorkdayDependencies(document, { country: 'United States' });
  assert.equal(country.value, 'ca');
});

test('Workday resume verification requires the accepted upload item, not only an assigned FileList', async () => {
  boot('<div data-automation-id="resumeUpload"><label>Resume</label><input type="file" data-automation-id="file-upload-input-ref"></div>');
  const field = scanFormFields()[0];
  Object.defineProperty(field.element, 'files', { value: [{ name: 'Resume.pdf' }], configurable: true });
  assert.equal((await verifyField(field, 'Resume.pdf')).verified, false);
  field.element.parentElement.insertAdjacentHTML('beforeend', '<div data-automation-id="file-upload-item"><span data-automation-id="file-upload-file-name">Resume.pdf</span><div data-automation-id="file-upload-successful">Uploaded</div></div>');
  assert.equal((await verifyField(field, 'Resume.pdf')).verified, true);
});

test('Workday public selector inventory discovers flat, segmented date, and all four repeatable record families', async () => {
  boot(readFileSync(new URL('../../fixtures/workday-fields-fixture.html', import.meta.url), 'utf8'));
  const profile = { workExperiences: [{ id: 'work', title: 'Engineer', company: 'Acme' }], education: [{ id: 'edu', institution: 'University', degree: "Bachelor's degree" }], languageRecords: [{ id: 'lang', language: 'English', fluent: 'Yes', reading: 'Advanced' }], linkedin: 'https://linkedin.com/in/test' };
  await prepareWorkdaySections(document, profile);
  const fields = scanFormFields();
  const byElement = new Map(fields.map(field => [field.element.id, field]));
  const expected = {
    resume: 'resume', 'country--country': 'country', 'legal-first': 'first_name', 'legal-last': 'last_name', 'legal-middle': 'middle_name', preferredCheck: 'preferred_check',
    'preferred-first': 'preferred_name', 'preferred-last': 'preferred_last_name', 'full-name': 'full_name', 'contact-email': 'email', 'phoneNumber--phoneType': 'phone_type', 'phone-number': 'phone_stripped', 'phoneNumber--countryPhoneCode': 'phone_country', extension: 'phone_extension',
    region: 'state', 'address-one': 'address', 'address-two': 'address_2', 'address-three': 'address_3', city: 'city', postal: 'postal_code', highest: 'highestDegree', 'languages-text': 'languages_text', linkedin: 'linkedin', age: 'over18', gender: 'gender', orientation: 'lgbt_v2', minority: 'visible_minority', race: 'ethnicity', hispanic: 'hispanic', veteran: 'veteran_v2', armed: 'armed_forces', disability: 'disability_v2',
    'today-year': 'current_date_year', 'today-month': 'current_date_month', 'today-day': 'current_date_day', 'birth-year': 'birthday_year', 'birth-month': 'birthday_month', 'birth-day': 'birthday_day', 'source--source': 'source', skills: 'skill',
    'work-title': 'title', 'work-company': 'company', 'work-current': 'current', 'work-description': 'description', 'work-start-month': 'startDate_month', school: 'institution', degree: 'degree', major: 'fieldOfStudy', gpa: 'gpa', 'education-firstYear': 'startDate_year', 'education-lastYear': 'endDate_year', language: 'language', fluent: 'fluent', reading: 'reading', writing: 'writing', speaking: 'speaking', website: 'url',
  };
  for (const [id, canonical] of Object.entries(expected)) assert.equal(byElement.get(id)?.ats.canonicalKey, canonical, id);
  assert.equal(byElement.get('school').ats.record.id, 'edu');
  assert.equal(byElement.get('language').ats.record.id, 'lang');
  assert.equal(workdayValue(byElement.get('website'), profile), profile.linkedin);
  assert.equal(fields.some(field => field.element.matches('[data-automation-id="dateIcon"]')), false, 'calendar buttons are not answer fields');
});

function experienceRow(number, title, company, year = '', month = '') {
  return `<div data-automation-id="workExperience-${number}"><div class="field"><label>Job title</label><input id="workExperience-${number}--jobTitle" value="${title}"></div><div class="field"><label>Company</label><input id="workExperience-${number}--company" value="${company}"></div><div data-automation-id="formField-startDate"><label>From</label><input data-automation-id="dateSectionMonth-input" aria-label="Month" value="${month}"><input data-automation-id="dateSectionYear-input" aria-label="Year" value="${year}"></div></div>`;
}

test('Workday reconciliation reuses a unique employer despite wrong title and date through rerender and correction', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Developer', ' ACME ', '2020', '01')}<button data-automation-id="add-button" disabled>Add</button></div>`);
  const profile = { workExperiences: [{ id: 'saved', company: 'Acme', title: 'Senior Developer', startDate: '2023-09' }] };
  await prepareWorkdaySections(document, profile);
  const row = document.querySelector('[data-automation-id="workExperience-1"]');
  row.replaceWith(row.cloneNode(true));
  for (const field of scanFormFields()) {
    assert.equal(field.ats.record?.id, 'saved');
    if (!workdayNeedsFill(field, profile)) continue;
    const answer = workdayAnswer(field, profile);
    assert.equal(await fillField(field, answer.value), true);
    assert.equal((await verifyField(field, answer.value)).verified, true);
  }
  assert.equal(document.querySelector('[id$="--jobTitle"]').value, 'Senior Developer');
  assert.equal(document.querySelector('[aria-label="Year"]').value, '2023');
  assert.equal(document.querySelector('[aria-label="Month"]').value, '9');
  await prepareWorkdaySections(document, profile);
  assert.equal(scanFormFields().every(field => workdayNeedsFill(field, profile) === false), true);
});

test('Workday reconciliation reserves complete matches before assigning partial rows regardless of profile order', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, '', 'Acme')}${experienceRow(2, 'Engineer', 'Acme')}<button data-automation-id="add-button" disabled>Add</button></div>`);
  const profile = { workExperiences: [{ id: 'tutor', title: 'Tutor', company: 'Acme' }, { id: 'engineer', title: 'Engineer', company: 'Acme' }] };
  await prepareWorkdaySections(document, profile);
  const titles = scanFormFields().filter(field => field.ats.canonicalKey === 'title');
  assert.deepEqual(titles.map(field => field.ats.record?.id), ['tutor', 'engineer']);
});

test('Workday reconciliation distinguishes reordered identical roles using dates', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Engineer', 'Acme', '2023', '09')}${experienceRow(2, 'Engineer', 'Acme', '2021', '02')}<button data-automation-id="add-button" disabled>Add</button></div>`);
  const profile = { workExperiences: [{ id: 'old', title: 'Engineer', company: 'Acme', startDate: '2021-02' }, { id: 'new', title: 'Engineer', company: 'Acme', startDate: '2023-09' }] };
  await prepareWorkdaySections(document, profile);
  assert.deepEqual(scanFormFields().filter(field => field.ats.canonicalKey === 'title').map(field => field.ats.record?.id), ['new', 'old']);
});

test('Workday reconciliation survives Add replacing every existing row', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Engineer', 'Acme')}<button data-automation-id="add-button">Add</button></div>`);
  let adds = 0;
  document.querySelector('button').onclick = () => {
    adds++;
    for (const row of document.querySelectorAll('[data-automation-id^="workExperience-"]')) row.replaceWith(row.cloneNode(true));
    document.querySelector('button').insertAdjacentHTML('beforebegin', experienceRow(2, '', ''));
  };
  const profile = { workExperiences: [{ id: 'missing', title: 'Tutor', company: 'Paper' }, { id: 'existing', title: 'Engineer', company: 'Acme' }] };
  await prepareWorkdaySections(document, profile);
  await prepareWorkdaySections(document, profile);
  assert.equal(adds, 1);
  assert.deepEqual(scanFormFields().filter(field => field.ats.canonicalKey === 'title').map(field => field.ats.record?.id), ['existing', 'missing']);
});

test('Workday reconciliation stops on a tied employer before adding any other records', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Parsed title', 'Acme')}<button data-automation-id="add-button">Add</button></div>`);
  let adds = 0;
  document.querySelector('button').onclick = () => { adds++; document.querySelector('button').insertAdjacentHTML('beforebegin', experienceRow(2, '', '')); };
  const profile = { workExperiences: [{ id: 'missing', title: 'Tutor', company: 'Other' }, { id: 'a', title: 'Engineer', company: 'Acme' }, { id: 'b', title: 'Manager', company: 'Acme' }] };
  await assert.rejects(prepareWorkdaySections(document, profile), /ambiguous|review/i);
  assert.equal(adds, 0);
});

test('Workday reconciliation corrects a unique school degree but preserves blank saved values and unmatched rows', async () => {
  boot('<div data-automation-id="educationSection"><div data-automation-id="education-1"><div class="field"><label>School</label><input id="a--school" value="University"></div><div class="field"><label>Degree</label><select id="a--degree"><option>Bachelor of Arts</option><option>Master of Science</option></select></div><div class="field"><label>GPA</label><input id="a--gpa" value="3.8"></div></div></div><div data-automation-id="websiteSection"><div data-automation-id="websitePanelSet-1"><div class="field"><label>Website</label><input id="a--url" value="https://user.example"></div></div><div data-automation-id="websitePanelSet-2"><div class="field"><label>Website</label><input id="b--url"></div></div></div>');
  const profile = { education: [{ id: 'edu', institution: 'University', degree: "Master's degree", gpa: '' }], linkedin: 'https://linkedin.com/in/test' };
  await prepareWorkdaySections(document, profile);
  const fields = scanFormFields();
  const degree = fields.find(field => field.ats.canonicalKey === 'degree');
  assert.equal(workdayNeedsFill(degree, profile), true);
  const answer = workdayAnswer(degree, profile);
  assert.equal(await fillField(degree, answer.value), true);
  assert.equal((await verifyField(degree, answer.value)).verified, true);
  assert.equal(workdayNeedsFill(fields.find(field => field.ats.canonicalKey === 'gpa'), profile), false);
  const unmatched = fields.find(field => field.element.id === 'a--url');
  assert.equal(workdayNeedsFill(unmatched, profile), false);
  assert.equal(workdayValue(unmatched, profile), undefined);
});

test('Workday reconciliation drops previous bindings when a saved record is disabled', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Engineer', 'Acme')}</div>`);
  const record = { id: 'saved', title: 'Engineer', company: 'Acme' };
  await prepareWorkdaySections(document, { workExperiences: [record] });
  await prepareWorkdaySections(document, { workExperiences: [{ ...record, enabled: false }] });
  const field = scanFormFields().find(field => field.ats.canonicalKey === 'title');
  assert.equal(field.ats.record, undefined);
  assert.equal(workdayNeedsFill(field, { workExperiences: [] }), false);
});

test('Workday reconciliation keeps empty custom questions on bound rows available for contextual AI', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Engineer', 'Acme')}</div>`);
  document.querySelector('[data-automation-id="workExperience-1"]').insertAdjacentHTML('beforeend', '<div class="field"><label for="impact">Explain your impact</label><textarea id="impact" required></textarea></div>');
  const profile = { workExperiences: [{ id: 'saved', title: 'Engineer', company: 'Acme' }] };
  await prepareWorkdaySections(document, profile);
  const custom = scanFormFields().find(field => field.element.id === 'impact');
  assert.equal(custom.ats.record.id, 'saved');
  assert.equal(workdayNeedsFill(custom, profile), null);
  custom.element.value = 'User-written impact';
  assert.equal(workdayNeedsFill(scanFormFields().find(field => field.element.id === 'impact'), profile), false);
});

test('Workday reconciliation changes current-job state before discovering missing end dates', async () => {
  boot(`<div data-automation-id="workExperienceSection">${experienceRow(1, 'Engineer', 'Acme')}<div id="current-field"></div></div>`);
  const row = document.querySelector('[data-automation-id="workExperience-1"]');
  row.insertAdjacentHTML('beforeend', '<div class="field"><label>Currently work here</label><input id="a--currentlyWorkHere" type="checkbox" checked></div><div id="end"></div>');
  document.querySelector('[type="checkbox"]').onchange = () => { row.querySelector('#end').innerHTML = '<div data-automation-id="formField-endDate"><label>To</label><input data-automation-id="dateSectionMonth-input" aria-label="Month"><input data-automation-id="dateSectionYear-input" aria-label="Year"></div>'; };
  const profile = { workExperiences: [{ id: 'saved', title: 'Engineer', company: 'Acme', current: false, endDate: '2024-12' }] };
  await prepareWorkdaySections(document, profile);
  const current = scanFormFields().find(field => field.ats.canonicalKey === 'current');
  assert.equal(workdayNeedsFill(current, profile), true);
  assert.equal(workdayAnswer(current, profile).value, false);
  await prepareWorkdayDependencies(document, profile);
  assert.equal(document.querySelector('[type="checkbox"]').checked, false);
  const endYear = scanFormFields().find(field => field.ats.canonicalKey === 'endDate_year');
  assert.equal(workdayValue(endYear, profile), '2024');
});

test('Workday no longer applies a saved record when a rerendered row changes identity', async () => {
  boot('<div data-automation-id="workExperienceSection"><div data-automation-id="workExperience-1"><input id="a--jobTitle"><input id="a--company"></div></div>');
  const profile = { workExperiences: [{ id: 'saved', title: 'Engineer', company: 'Acme' }] };
  await prepareWorkdaySections(document, profile);
  document.querySelector('#a--jobTitle').value = 'User role';
  const field = scanFormFields().find(field => field.element.id === 'a--company');
  assert.equal(field.ats.record, undefined);
  assert.notEqual(field.id, 'workday:saved:company');
});

test('Workday month verification accepts a zero-padded value but rejects a different month', async () => {
  boot('<div data-automation-id="formField-todaysDate"><input data-automation-id="dateSectionMonth-input" value="09"></div>');
  const field = scanFormFields()[0];
  assert.equal((await verifyField(field, '9')).verified, true);
  assert.equal((await verifyField(field, '10')).verified, false);
});

test('Workday narrative questions mentioning demographics are not disclosure fields', () => {
  boot('<div class="field"><label for="story">Describe your work with disabled veterans</label><textarea id="story"></textarea></div><div class="field"><label for="gender-story">Explain your gender inclusion project</label><textarea id="gender-story"></textarea></div>');
  assert.deepEqual(scanFormFields().map(field => field.ats.canonicalKey), ['', '']);
});

test('Workday multi-checkbox disclosures survive normalization and use option values without removing prior choices', async () => {
  boot('<div data-automation-id="ethnicityMulti"><fieldset><legend>Race / ethnicity</legend><label><input type="checkbox" value="old" checked>Other</label><label><input type="checkbox" value="black-code">Black</label><label><input type="checkbox" value="asian-code">Asian</label></fieldset></div>');
  const field = scanFormFields()[0];
  const answer = workdayAnswer(normalizeFieldsForAI([field])[0], { raceEthnicity: ['Black', 'Asian'] });
  assert.deepEqual(answer.value, ['black-code', 'asian-code']);
  assert.equal(await fillField(field, answer.value), true);
  assert.equal((await verifyField(field, answer.value)).verified, true);
  assert.equal(document.querySelector('[value="old"]').checked, true);
});

test('Workday scanned fields follow chronological DOM document order instead of artificial key priority', () => {
  boot(`
    <main>
      <div data-automation-id="sourceSection">
        <label for="source">How did you hear about us? *</label>
        <div data-automation-id="multiSelectContainer"><input id="source" placeholder="Search" data-uxi-widget-type="selectinput"></div>
      </div>
      <div data-automation-id="formField-previousWorker">
        <label>Have you previously worked for CBC/Radio-Canada? *</label>
        <input type="radio" name="worked" id="worked-yes" value="Yes"><label for="worked-yes">Yes</label>
        <input type="radio" name="worked" id="worked-no" value="No"><label for="worked-no">No</label>
      </div>
      <div data-automation-id="formField-country">
        <label>Country *</label>
        <select id="country"><option value="CA">Canada</option></select>
      </div>
      <div data-automation-id="legalNameSection">
        <label for="firstName">First Name *</label>
        <input id="firstName">
        <label for="pref">I have a preferred name</label>
        <input type="checkbox" id="pref" data-automation-id="formField-usePreferredName">
      </div>
    </main>
  `);
  const fields = scanFormFields();
  assert.deepEqual(fields.map(f => f.label), [
    'How did you hear about us?',
    'Have you previously worked for CBC/Radio-Canada?',
    'Country',
    'First Name',
    'I have a preferred name',
  ]);
});

test('CBC Workday disclosure controls are distinct fields with exact saved-choice matching', () => {
  boot(`<main>
    <div data-automation-id="formField-gender" data-fkit-id="personalInfoPerson--gender"><label for="personalInfoPerson--gender">Gender</label><div><button aria-haspopup="listbox" type="button" value="" aria-label="Gender Select One" name="gender" id="personalInfoPerson--gender">Select One</button><input type="text" value=""></div></div>
    <div data-automation-id="formField-ethnicities" data-fkit-id="personalInfoPerson--ethnicities"><label for="personalInfoPerson--ethnicities">Ethnicity</label><div data-automation-id="multiSelectContainer" data-uxi-widget-type="multiselect"><div data-automation-id="multiselectInputContainer"><input enterkeyhint="search" placeholder="Search" data-uxi-widget-type="selectinput" id="personalInfoPerson--ethnicities"><div data-automation-id="promptSelectionLabel"></div><div data-automation-id="promptAriaInstruction">0 items selected</div></div></div></div>
    <div data-automation-id="formField-pronouns" data-fkit-id="personalInfoPerson--pronouns"><label for="personalInfoPerson--pronouns">Pronoun</label><div data-automation-id="multiSelectContainer" data-uxi-widget-type="multiselect"><div data-automation-id="multiselectInputContainer"><input enterkeyhint="search" placeholder="Search" data-uxi-widget-type="selectinput" id="personalInfoPerson--pronouns"><div data-automation-id="promptAriaInstruction">0 items selected</div></div></div></div>
    <div data-automation-id="formField-disabilities" data-fkit-id="personalInfoPerson--disabilities"><label for="personalInfoPerson--disabilities">Disability</label><div data-automation-id="multiSelectContainer" data-uxi-widget-type="multiselect"><div data-automation-id="multiselectInputContainer"><input enterkeyhint="search" placeholder="Search" data-uxi-widget-type="selectinput" id="personalInfoPerson--disabilities"><div data-automation-id="promptAriaInstruction">0 items selected</div></div></div></div>
  </main>`);
  const fields = scanFormFields();
  assert.equal(fields.length, 4);
  assert.deepEqual(fields.map(field => field.ats.canonicalKey), ['gender', 'ethnicity', 'pronouns', 'disability_v2']);
  assert.deepEqual(fields.map(field => field.type), ['combobox', 'combobox', 'combobox', 'combobox']);
  assert.equal(fields.find(field => field.ats.canonicalKey === 'ethnicity').ats.multiple, true);
  assert.equal(fields.find(field => field.ats.canonicalKey === 'pronouns').ats.multiple, true);
  assert.equal(fields.find(field => field.ats.canonicalKey === 'disability_v2').ats.multiple, true);
  const disability = fields.find(field => field.ats.canonicalKey === 'disability_v2');
  disability.options = [{ value: 'No - I don\'t have any disability (Canada)', label: 'No - I don\'t have any disability (Canada)' }, { value: 'Rather not answer (Canada)', label: 'Rather not answer (Canada)' }];
  assert.equal(workdayAnswer(disability, { disabilityStatus: 'No' }).value, disability.options[0].label);
  assert.equal(workdayAnswer(disability, { disabilityStatus: 'Prefer not to answer' }).value, disability.options[1].label);
  const gender = fields.find(field => field.ats.canonicalKey === 'gender');
  gender.options = [{ value: 'Non binary', label: 'Non binary' }];
  assert.equal(workdayAnswer(gender, { gender: 'Non-binary' }).value, 'Non binary');
  assert.equal(workdayOptionMatches(fields[1], 'Arab and/or Maghrebi Heritage (Canada)', 'Middle Eastern'), true);
  const ethnicity = fields[1];
  ethnicity.options = [{ value: 'Arab and/or Maghrebi Heritage (Canada)', label: 'Arab and/or Maghrebi Heritage (Canada)' }];
  const ethAnswer = workdayAnswer(ethnicity, { raceEthnicity: 'Middle Eastern' });
  assert.equal(ethAnswer.value, ethnicity.options[0].label);
  assert.equal(ethAnswer.provenance, 'guessed');
  assert.equal(ethAnswer.inferred, true);
});

test('CBC gender opens from its single-select button rather than its filter input', async () => {
  boot('<div data-automation-id="formField-gender"><label for="personalInfoPerson--gender">Gender</label><div><button type="button" aria-haspopup="listbox" id="personalInfoPerson--gender">Select One</button><input type="text"></div></div><div data-automation-id="activeListContainer" hidden><div data-automation-id="promptLeafNode">Male</div></div>');
  const button = document.querySelector('button');
  button.onclick = () => { document.querySelector('[data-automation-id="activeListContainer"]').hidden = false; };
  await openCombobox(button);
  assert.equal(document.querySelector('[data-automation-id="activeListContainer"]').hidden, false);
  assert.equal(discoverComboboxOptions(button).length, 1);
  assert.equal((await waitForComboboxOptions(button, 350, 'Man')).length, 1, 'saved Man must not hide visible Male');
});
