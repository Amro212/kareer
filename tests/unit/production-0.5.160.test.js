// Investigation only: TODO assertions intentionally describe unfixed behavior.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { classifyPage, controlLabel } from '../../src/core/pageClassifier.js';
import { inspectSubmit, workflowLabel } from '../../src/core/navigation.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { workdayAnswer } from '../../src/core/adapters/workday-fields.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { saveProfile, saveSettings } from '../../src/core/storage.js';

let dom, engine;
const fixture = name => readFileSync(`fixtures/${name}-2026-11-08-captured.html`, 'utf8');
function boot(html, url = 'https://jobs.lever.co/qa/apply') {
  dom = new JSDOM(html, { url, pretendToBeVisual: true });
  for (const key of ['window','document','location','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Event','KeyboardEvent','MouseEvent','MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  document.head.insertAdjacentHTML('beforeend', '<style>*{opacity:1}</style>');
  const values = new Map();
  globalThis.GM_getValue = (key, fallback) => structuredClone(values.has(key) ? values.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => values.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => values.delete(key);
  globalThis.GM_getTab = undefined;
  setPlatform(createGmHost());
  saveProfile({ fullName:'Test Applicant', email:'qa@example.test' });
  saveSettings({ autoContinue:true, autoSubmit:false });
}
afterEach(async () => {
  engine?.destroy(); engine = null;
  await new Promise(resolve => setTimeout(resolve, 30));
  dom?.window.close(); dom = null;
});

test('captured DoorDash contains distinct entry and native submit buttons', () => {
  boot(fixture('greenhouse-doordash'), 'https://job-boards.greenhouse.io/doordashcanada/jobs/8176003');
  const buttons = [...document.querySelectorAll('button')];
  assert.equal(buttons.find(button => button.textContent.trim() === 'Apply').type, 'button');
  assert.equal(buttons.find(button => button.textContent.trim() === 'Submit application').type, 'submit');
  assert.equal(inspectSubmit().count, 2, 'characterization of the recorded defect');
});

test('QA-160-02 entry Apply must not compete with actual submission', {todo:'Unfixed; reproduced on captured DoorDash DOM'}, () => {
  boot(fixture('greenhouse-doordash'), 'https://job-boards.greenhouse.io/doordashcanada/jobs/8176003');
  assert.equal(inspectSubmit().count, 1);
});

test('QA-160-04 unlabeled controls must not look up an empty ID', {todo:'Unfixed Firefox warning source'}, () => {
  boot('<button>Next</button><input aria-label="Question">');
  const calls = [], original = document.getElementById.bind(document);
  document.getElementById = id => { calls.push(id); return original(id); };
  controlLabel(document.querySelector('button'));
  workflowLabel({element:document.querySelector('input'),type:'text',label:'Question'});
  assert.deepEqual(calls, []);
});

test('QA-160-05 unsupported Workday source must remain available for contextual fallback', {todo:'Unfixed hardcoded LinkedIn/empty deterministic answer'}, () => {
  boot(fixture('workday-clio-source'), 'https://clio.wd3.myworkdayjobs.com/en-US/ClioCareerSite/job/Toronto/Software-Developer--Toronto-_REQ-4630/apply/applyManually');
  const field = scanFormFields().find(field => field.ats?.canonicalKey === 'source');
  assert.ok(field, 'captured source question must be detected');
  field.options = [{value:'corporate',label:'Corporate Website'}];
  assert.equal(workdayAnswer(field, {}), null, 'no supported deterministic answer should suppress fallback');
});

test('QA-160-06 Workday upload-only step must classify as application', {todo:'Unfixed hidden upload visibility mismatch'}, () => {
  boot(fixture('workday-clio-upload'), 'https://clio.wd3.myworkdayjobs.com/en-US/ClioCareerSite/job/Toronto/Software-Developer--Toronto-_REQ-4630/apply/applyManually');
  // Save Page did not retain Workday's runtime CSS; restore the observed hidden native input.
  document.querySelector('input[type=file]').style.display = 'none';
  assert.ok(scanFormFields().some(field => field.type === 'file'), 'scanner finds the real upload');
  assert.equal(classifyPage().type, 'application');
});

test('QA-160-03 clearing required Lever answer must invalidate review state', {todo:'Unfixed; engine-level reproduction; live panel evidence in action log'}, async () => {
  boot(fixture('lever-shyftlabs'), 'https://jobs.lever.co/qa');
  // Retain the captured required text control and submit semantics; isolate other questions.
  const input = [...document.querySelectorAll('input')].find(input => /How soon can you join/.test(input.closest('li')?.textContent || ''));
  assert.ok(input, 'captured joining timeline input must exist');
  document.body.replaceChildren(input);
  input.required = true; input.setAttribute('aria-label','Joining Timeline'); input.value = 'QA preservation test';
  document.body.insertAdjacentHTML('beforeend','<button type="button">Submit application</button>');
  engine = createApplicationEngine({settleMs:0});
  await engine.initialize();
  engine.ensureSession({title:'QA',listingUrl:location.href,applicationUrl:location.href});
  const field = scanFormFields()[0];
  await engine.reviewFilledPage(new Map([[field.id,{status:'verified',value:input.value}]]));
  assert.equal(engine.session.status, 'review');
  input.value = ''; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.notEqual(engine.session.status, 'review');
});

test('QA-160-07 manual Back from Workday final review must invalidate submission state', {todo:'Unfixed; captures real earlier-step upload DOM'}, async () => {
  boot('<h2>Review your application</h2><button>Submit</button>', 'https://clio.wd3.myworkdayjobs.com/en-US/ClioCareerSite/job/Toronto/Software-Developer--Toronto-_REQ-4630/apply/applyManually');
  engine = createApplicationEngine({settleMs:0});
  await engine.initialize();
  await engine.reviewFilledPage(new Map());
  assert.equal(engine.session.status,'review');
  const capture = new JSDOM(fixture('workday-clio-upload'));
  document.body.innerHTML = capture.window.document.body.innerHTML;
  capture.window.close();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.notEqual(engine.session.status, 'review');
});

test('QA-160-09 accepted SmartRecruiters resume must verify after native FileList clears', {todo:'Unfixed; captured files attribute, no ATS scripts executed'}, async () => {
  boot(fixture('smartrecruiters-uhn'), 'https://jobs.smartrecruiters.com/oneclick-ui/company/UniversityHealthNetwork/publication/qa');
  const upload = document.querySelector('spl-dropzone[data-test="resume-upload"]');
  assert.equal(JSON.parse(upload.getAttribute('files'))[0].fileName,'QA-Resume.pdf');
  assert.equal((await verifyField({type:'file',element:upload}, 'QA-Resume.pdf')).verified, true);
});

test.todo('QA-160-08 SmartRecruiters duplicate shadow controls and field identity errors: native reproduction in regression-cases.md; saved HTML excludes open shadow internals');
test.todo('QA-160-10 SmartRecruiters first-run phone clearing: native reproduction in regression-cases.md; first-run occurrence, corrected phone survived retry');
