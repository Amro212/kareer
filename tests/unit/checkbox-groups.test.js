import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { inspectValidation } from '../../src/core/validation.js';
import { generateAutofillAnswers } from '../../src/core/ai.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { createFieldAgent } from '../../src/core/agent.js';
import { saveProfile, saveSettings, saveApiKey } from '../../src/core/storage.js';

let dom;
function boot(html, url = 'https://example.com/jobs/application') {
  dom?.window.close();
  dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const key of ['window','document','location','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Event','InputEvent','KeyboardEvent','MouseEvent','MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value.replace(/[\[\]]/g, '\\$&') };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => storage.delete(key);
  saveProfile({ fullName: 'Test Applicant' });
  saveSettings({ autoContinue: false, autoSubmit: false });
}
afterEach(() => { dom?.window.close(); });
const fixture = file => readFileSync(new URL(`../../fixtures/${file}`, import.meta.url), 'utf8');
const group = (id, required = '') => `<fieldset id="${id}" ${required}><legend>Which ${id}? Select all that apply</legend><label><input type="checkbox" name="${id}" value="a">Alpha</label><label><input type="checkbox" name="${id}" value="b">Beta</label><label><input type="checkbox" name="${id}" value="c">Gamma</label></fieldset>`;

test('captured PayPay required options become two questions and keep consent separate', async () => {
  boot(fixture('greenhouse-paypay-checkboxes-captured.html'), 'https://job-boards.greenhouse.io/pay2dc/jobs/4047588006');
  const fields = scanFormFields();
  const groups = fields.filter(field => field.ats?.multiple);
  assert.equal(fields.length, 3);
  assert.deepEqual(groups.map(field => field.options.length), [4, 5]);
  assert.ok(groups.every(field => field.required));
  assert.equal(fields.filter(field => field.type === 'checkbox').length, 1);
  assert.match(groups[0].label, /^Which programming languages/);
  assert.match(groups[1].label, /^Which test automation frameworks/);
  for (const field of groups) {
    const changes = [], focused = [];
    field.elements.forEach(element => {
      element.addEventListener('change', () => changes.push(element.value));
      element.addEventListener('focus', () => focused.push(element.value));
    });
    const values = [field.options[0].value, field.options[2].value];
    assert.equal(await fillField(field, values), true);
    assert.deepEqual(changes, values);
    assert.deepEqual([...new Set(focused)], values);
    assert.equal((await verifyField(field, values)).verified, true);
    assert.deepEqual(inspectValidation([field]).filter(error => error.fieldId === field.id), []);
    changes.length = 0;
    assert.equal(await fillField(field, values), true);
    assert.deepEqual(changes, []);
    assert.equal(scanFormFields().find(candidate => candidate.id === field.id).currentValue, values.join(', '));
  }
  assert.equal(document.querySelector('input').checked, false);
});

test('captured RiverRun differently named options group by question, excluding hidden choices', async () => {
  boot(fixture('generic-riverrun-checkboxes-captured.html'));
  const fields = scanFormFields();
  assert.equal(fields.length, 3);
  assert.deepEqual(fields.map(field => field.options.length), [2, 7, 4]);
  assert.ok(fields.every(field => field.required && field.ats.multiple));
  assert.match(fields[0].label, /^Hours available to work/);
  assert.match(fields[1].label, /^Days available to work/);
  assert.equal(await fillField(fields[1], ['Monday', 'Friday']), true);
  assert.equal((await verifyField(fields[1], ['Monday', 'Friday'])).verified, true);
  assert.deepEqual(inspectValidation([fields[1]]), []);
});

test('shared checkbox grouping works on unknown ATS and preserves separate questions and other text', async () => {
  boot(`<form>${group('countries')}<div role="group" aria-labelledby="skills-title"><h3 id="skills-title">Skills (check all that apply)</h3><label><input type="checkbox" name="skill_one" value="x">X</label><label><input type="checkbox" name="skill_two" value="y">Y</label><label>Other details<input id="details"></label></div><fieldset><legend>Agreements</legend><label><input id="privacy" name="privacy" type="checkbox" required>Privacy</label><label><input id="updates" name="updates" type="checkbox">Updates</label></fieldset></form>`);
  const fields = scanFormFields();
  assert.equal(fields.length, 5);
  assert.equal(fields.filter(field => field.ats?.multiple).length, 2);
  assert.deepEqual(fields.filter(field => field.type === 'checkbox').map(field => field.id), ['privacy', 'updates']);
  assert.ok(fields.some(field => field.id === 'details'));
  assert.equal(await fillField(fields.find(field => field.id === 'countries'), ['a', 'c']), true);
});

test('separate forms, repeated names and shadow roots retain question ownership', () => {
  boot(`<form>${group('one').replaceAll('name="one"', 'name="choices"')}${group('two').replaceAll('name="two"', 'name="choices"')}</form><form>${group('three').replaceAll('name="three"', 'name="choices"')}</form><div id="shadow"></div>`);
  document.querySelector('#shadow').attachShadow({ mode: 'open' }).innerHTML = group('shadow-choice');
  const fields = scanFormFields();
  assert.equal(fields.length, 4);
  assert.deepEqual(fields.map(field => field.id).sort(), ['one', 'two', 'three', 'shadow-choice'].sort());
  assert.ok(fields.every(field => field.options.length === 3));
});

test('optional checkbox group accepts an explicit empty AI answer without touching options', async () => {
  boot(`<form>${group('optional')}</form>`);
  saveApiKey('synthetic-key');
  const [field] = scanFormFields();
  let requests = 0, changes = 0;
  document.addEventListener('change', () => changes++);
  const previous = globalThis.GM_xmlhttpRequest;
  globalThis.GM_xmlhttpRequest = request => {
    requests++;
    request.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: [{ fieldId: field.id, value: [] }] }) } }] }) });
  };
  try {
    const response = await generateAutofillAnswers(normalizeFieldsForAI([field]));
    assert.equal(requests, 1);
    assert.deepEqual(response.answers[0]?.value, []);
    assert.equal(await fillField(field, []), true);
    assert.equal((await verifyField(field, [])).verified, true);
    assert.equal(changes, 0);
  } finally { globalThis.GM_xmlhttpRequest = previous; }
});

test('group filling rejects unknown or disabled changes before mutating any checkbox', async () => {
  boot(`<form>${group('skills', 'aria-required="true"')}</form>`);
  const [field] = scanFormFields();
  assert.equal(await fillField(field, ['a', 'invented']), false);
  assert.equal(document.querySelectorAll(':checked').length, 0);
  document.querySelector('[value="c"]').disabled = true;
  assert.equal(await fillField(field, ['a', 'c']), false);
  assert.equal(document.querySelectorAll(':checked').length, 0);
  assert.equal((await verifyField(field, [])).verified, false);
});

for (const saved of [['Alpha','Gamma'], []]) test(`generic group reuses saved selections ${JSON.stringify(saved)} without AI`, async () => {
  boot(`<form>${group('skills')}</form>`);
  const [field] = scanFormFields();
  saveProfile({ fullName: 'Test Applicant', savedAnswers: { [field.label]: saved } });
  saveApiKey('');
  const response = await generateAutofillAnswers(normalizeFieldsForAI([field]));
  const expected = saved.length ? ['a','c'] : [];
  assert.deepEqual(response.answers[0]?.value, expected);
  assert.equal(await fillField(field, response.answers[0].value), true);
  assert.equal((await verifyField(field, expected)).verified, true);
});

test('same-name checkbox lists without framework classes remain separate from other form fields', () => {
  boot('<form><label><input type="checkbox" name="languages" value="en">English</label><label><input type="checkbox" name="languages" value="fr">French</label><label for="name">Full name</label><input id="name"></form><form><label><input type="checkbox" name="languages" value="ar">Arabic</label><label><input type="checkbox" name="languages" value="it">Italian</label></form>');
  const fields = scanFormFields();
  assert.equal(fields.length, 3);
  const groups = fields.filter(field => field.ats?.multiple);
  assert.deepEqual(groups.map(field => field.options.map(option => option.value)), [['en','fr'],['ar','it']]);
  assert.ok(groups.every(field => field.label === 'Languages'));
  assert.ok(fields.some(field => field.id === 'name'));
});

test('unnamed independent acknowledgments stay separate inside a shared fieldset', () => {
  boot('<form><fieldset><legend>Agreements</legend><label><input id="privacy" type="checkbox" required>Privacy consent</label><label><input id="updates" type="checkbox">Email updates</label></fieldset></form>');
  const fields = scanFormFields();
  assert.equal(fields.length, 2);
  assert.ok(fields.every(field => field.type === 'checkbox' && !field.widget));
  assert.equal(fields.find(field => field.id === 'privacy').required, true);
});

for (const url of ['https://example.com/jobs/application', 'https://job-boards.greenhouse.io/acme/jobs/1']) {
  test(`same-name required agreements retain native validation on ${new URL(url).hostname}`, async () => {
    boot('<form id="application_form"><fieldset id="agreements" aria-required="true"><legend>Agreements</legend><label><input type="checkbox" name="agreements[]" value="privacy" required>Privacy consent</label><label><input type="checkbox" name="agreements[]" value="terms" required>Terms of service</label></fieldset></form>', url);
    const [field] = scanFormFields();
    assert.equal(await fillField(field, ['privacy']), true);
    assert.equal(document.querySelector('form').checkValidity(), false);
    assert.ok(inspectValidation([field]).some(error => error.fieldId === field.id));
    assert.equal(await fillField(field, ['privacy', 'terms']), true);
    assert.equal(document.querySelector('form').checkValidity(), true);
    assert.deepEqual(inspectValidation([field]), []);
  });
}

for (const url of ['https://example.com/jobs/application', 'https://job-boards.greenhouse.io/acme/jobs/1', 'https://jobs.ashbyhq.com/acme/1/application']) {
  test(`option wrappers retain the shared disclosure question on ${new URL(url).hostname}`, async () => {
    boot('<form id="application_form"><fieldset id="ethnicity"><legend>Race / ethnicity</legend><div class="form-group"><label><input type="checkbox" name="ethnicity" value="asian"><span class="label">Asian</span></label></div><div class="form-group"><input id="white" type="checkbox" name="ethnicity" value="white"><label for="white" class="form-label"><span class="label">White</span></label></div></fieldset></form>', url);
    saveProfile({ fullName: 'Test Applicant', raceEthnicity: ['Asian'] });
    saveApiKey('');
    const fields = scanFormFields();
    assert.equal(fields.length, 1);
    const [field] = fields;
    assert.equal(field.label, 'Race / ethnicity');
    assert.equal(field.ats.multiple, true);
    assert.deepEqual(field.options.map(option => option.value), ['asian', 'white']);
    const { answers } = await generateAutofillAnswers(normalizeFieldsForAI(fields));
    assert.equal(await fillField(field, answers[0].value), true);
    assert.equal((await verifyField(field, ['asian'])).verified, true);
    assert.equal(scanFormFields()[0].id, field.id);
  });
}

test('option-wrapper discovery preserves nested question boundaries', () => {
  boot(`<form><fieldset><legend>Background</legend><div class="form-group" id="first"><h3>First question</h3><label><input type="checkbox" name="same" value="a">Alpha</label><label><input type="checkbox" name="same" value="b">Beta</label></div><div class="form-group" id="second"><h3>Second question</h3><label><input type="checkbox" name="same" value="c">Gamma</label><label><input type="checkbox" name="same" value="d">Delta</label></div><div class="form-group"><h3>Receive updates?</h3><label><input id="updates" type="checkbox" name="same" value="updates">Yes</label></div></fieldset></form>`);
  const fields = scanFormFields();
  assert.equal(fields.length, 3);
  assert.deepEqual(fields.filter(field => field.ats?.multiple).map(field => field.options.map(option => option.value)), [['a', 'b'], ['c', 'd']]);
  assert.equal(fields.find(field => field.id === 'updates').type, 'checkbox');
});

test('group validation preserves explicit option errors and custom validity', async () => {
  boot(`<form>${group('skills', 'aria-required="true"')}</form>`);
  const [field] = scanFormFields();
  await fillField(field, ['a']);
  assert.deepEqual(inspectValidation([field]), []);
  const option = document.querySelector('[value="b"]');
  option.setCustomValidity('Rejected selection');
  assert.equal(inspectValidation([field]).length, 1);
  option.setCustomValidity('');
  option.setAttribute('aria-invalid', 'true');
  assert.equal(inspectValidation([field]).length, 1);
});

test('optional empty group answer causes no scrolling or repair requests', async () => {
  boot(`<h1>Job application</h1><form>${group('optional')}</form>`);
  let calls = 0, scrolls = 0;
  HTMLElement.prototype.scrollIntoView = () => scrolls++;
  const engine = createApplicationEngine({ settleMs: 0, answer: async fields => {
    calls++;
    return { answers: fields.map(field => ({ fieldId: field.fieldId, value: [] })) };
  } });
  try {
    await engine.start();
    assert.equal(calls, 1);
    assert.equal(engine.session.reason, 'Page filled. Auto Continue is off.');
    assert.equal(scrolls, 0);
  } finally { engine.destroy(); }
});

for (const file of ['greenhouse-paypay-checkboxes-captured.html','generic-riverrun-checkboxes-captured.html']) {
  test(`application engine fills ${file} once per question without false repairs`, async () => {
    boot(fixture(file), file.startsWith('greenhouse') ? 'https://job-boards.greenhouse.io/pay2dc/jobs/4047588006' : undefined);
    let calls = 0;
    const scrolled = [];
    HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
    const engine = createApplicationEngine({ settleMs: 0, answer: async fields => {
      calls++;
      return { answers: fields.map(field => ({ fieldId: field.fieldId, value: field.ats?.multiple ? [field.options[0].value] : true, source: 'ai', inferred: true })) };
    } });
    try {
      await engine.start();
      assert.equal(calls, 1);
      assert.equal(engine.session.reason, 'Page filled. Auto Continue is off.');
      assert.equal(scrolled.length, 3);
      assert.deepEqual(inspectValidation(scanFormFields()), []);
    } finally { engine.destroy(); }
  });
}

test('embedded field agent fills one group without per-option fields or required errors', async () => {
  boot(`<h1>Job application</h1><form>${group('countries', 'aria-required="true"')}</form>`);
  const agent = createFieldAgent();
  const scanned = await agent.handle({ action: 'scan' });
  assert.equal(scanned.fields.length, 1);
  const result = await agent.handle({ action: 'fill', answers: [{ fieldId: scanned.fields[0].fieldId, value: ['a', 'c'] }] });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, 'verified');
  assert.deepEqual(inspectValidation(scanFormFields()), []);
});
