import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { scanFormFields, refreshField } from '../../src/core/fields/scanner.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { waitForResumeParsing } from '../../src/core/resume.js';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { isResumeField } from '../../src/core/resume.js';
import {getComboboxMenus,discoverComboboxOptions,readComboboxSelection,optionData} from '../../src/core/fields/combobox.js';
import {smartrecruitersAdapter} from '../../src/core/adapters/smartrecruiters.js';
import {entryRecords,prepareSmartRecruitersSections} from '../../src/core/adapters/smartrecruiters-sections.js';
import { summarizeFieldResults, getAllDetectedFields } from '../../src/core/ui.js';

let dom;
function hydrate(root) {
  for (const template of root.querySelectorAll('template[shadowrootmode]')) {
    const shadow = template.parentElement.attachShadow({ mode: 'open' });
    shadow.append(template.content); template.remove(); hydrate(shadow);
  }
}
function boot() {
  dom = new JSDOM(readFileSync('fixtures/smartrecruiters-uhn-shadow-fixture.html', 'utf8'), {
    url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/qa/publication/qa', pretendToBeVisual: true, runScripts: 'outside-only',
  });
  for (const key of ['window','document','location','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent','KeyboardEvent']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  globalThis.GM_getValue = (key, fallback) => fallback;
  globalThis.GM_setValue = () => {};
  setPlatform(createGmHost());
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { get: () => 20 });
  document.head.innerHTML = '<style>*{opacity:1}</style>';
  hydrate(document);
}
afterEach(() => dom?.window.close());

test('SmartRecruiters scans one native descriptor per nested logical control', () => {
  boot();
  const fields = scanFormFields();
  assert.equal(fields.filter(field => field.label === 'City').length, 1);
  assert.equal(fields.filter(field => field.label === 'Phone number').length, 1);
  assert.equal(fields.filter(field => field.label === 'Institution').length, 1);
  assert.ok(fields.every(field => !field.element.localName.startsWith('spl-')));
});

test('overwrite-off filling preserves an existing compound phone value', async () => {
  boot();
  const host = document.querySelector('spl-phone-field');
  const before = host.getAttribute('value');
  host.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input').value = '4165550123';
  for (const field of scanFormFields().filter(field => field.type === 'tel' && !field.currentValue)) await fillField(field, '4165550123');
  assert.equal(host.getAttribute('value'), before);
});

test('accepted upload metadata belongs to the Resume widget shadow file input', async () => {
  boot();
  const files = scanFormFields().filter(field => field.type === 'file');
  assert.deepEqual(files.map(field => field.id), ['resume-upload']);
  assert.equal(files[0].currentValue, 'QA-Resume.pdf');
  assert.equal((await verifyField(files[0], 'QA-Resume.pdf')).verified, true);
  assert.equal((await verifyField(files[0], 'Different.pdf')).verified, false);
  document.querySelector('[data-test="resume-upload"]').setAttribute('files', '{bad JSON');
  assert.equal((await verifyField(files[0], 'QA-Resume.pdf')).verified, false);
});

test('the top resume parser is never a scanned field or resume target, even on a fresh form', () => {
  boot(); document.querySelector('oc-education-entry').remove();
  const files = scanFormFields().filter(field => field.type === 'file');
  assert.equal(files.some(field => field.element.getRootNode().host?.matches('[data-test="apply-with-resume-container"]')), false);
  assert.deepEqual(files.filter(field => isResumeField(field, files)).map(field => field.id), ['resume-upload']);
});

test('stable SmartRecruiters ids and labels map to Simplify canonical keys', () => {
  boot();
  document.querySelector('main').insertAdjacentHTML('beforeend', `<sr-screening-questions-form><template shadowrootmode="open">
    <spl-autocomplete aria-label="Are you legally authorized to work in Canada?"><template shadowrootmode="open"><spl-input><template shadowrootmode="open"><input id="q-auth" role="combobox"></template></spl-input></template></spl-autocomplete>
    <spl-autocomplete aria-label="Gender"><template shadowrootmode="open"><spl-input><template shadowrootmode="open"><input id="q-gender" role="combobox"></template></spl-input></template></spl-autocomplete>
  </template></sr-screening-questions-form>`); hydrate(document);
  const keys = Object.fromEntries(scanFormFields().map(field => [field.element.id, field.ats?.canonicalKey]));
  assert.equal(keys['first-name-input'], 'first_name');
  assert.equal(keys['confirm-email-input'], 'email');
  assert.equal(keys.city, 'location');
  assert.equal(keys.phone, 'phone_stripped');
  assert.equal(keys['resume-file'], 'resume');
  assert.equal(keys['q-auth'], 'work_auth');
  assert.equal(keys['q-gender'], 'gender');
  assert.equal(keys['institution-before'], 'institution');
});

test('navigation uses the footer Next shadow button and the success heading', () => {
  boot();
  const next = document.querySelector('oc-button[data-test="footer-next"] spl-button').shadowRoot.querySelector('button');
  assert.equal(smartrecruitersAdapter.continueControl(document), next);
  assert.equal(smartrecruitersAdapter.submitControl(document), null);
  assert.equal(smartrecruitersAdapter.confirmation(document), false);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<h2 data-test="success-page-confirmation">Thanks</h2>');
  assert.equal(smartrecruitersAdapter.confirmation(document), true);
});

test('native City input resolves its ancestor shadow menu and only reads committed options',()=>{
  boot(); const owner=document.querySelector('spl-autocomplete');
  const input=owner.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input');
  const menu=owner.shadowRoot.querySelector('[role=listbox]'); menu.hidden=false;
  assert.deepEqual(getComboboxMenus(input),[menu]);
  assert.equal(discoverComboboxOptions(input).length,1);
  input.value='Milton, Ontario, Canada';
  assert.deepEqual(readComboboxSelection(input),[], 'typed search text is not a selection');
  menu.querySelector('spl-select-option').shadowRoot.querySelector('spl-dropdown-item').setAttribute('selected','');
  assert.deepEqual(readComboboxSelection(input),['Milton, Ontario, Canada']);
  input.value='Toronto'; assert.deepEqual(readComboboxSelection(input),[]);
});

test('selected country code is read through its assigned trigger slot',()=>{
  boot(); document.querySelector('main').insertAdjacentHTML('beforeend','<spl-select><span slot="triggerPrefix">+1</span><template shadowrootmode="open"><button role="combobox" aria-label="Country code"><slot name="triggerPrefix"></slot></button></template></spl-select>'); hydrate(document);
  const field=scanFormFields().find(field=>field.label==='Country code');
  assert.equal(field.currentValue,'+1');
});

test('City fill activates the native option target across both component shadows',async()=>{
  boot(); const owner=document.querySelector('spl-autocomplete');
  const input=owner.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input');
  const menu=owner.shadowRoot.querySelector('[role=listbox]');
  const option=menu.querySelector('spl-select-option');
  const item=option.shadowRoot.querySelector('spl-dropdown-item');
  input.onclick=input.oninput=()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');};
  item.shadowRoot.querySelector('[role=option]').onclick=()=>{
    item.setAttribute('selected','');input.value='Milton, Ontario, Canada';menu.hidden=true;input.setAttribute('aria-expanded','false');
  };
  const field=scanFormFields().find(field=>field.label==='City');
  field.options=[{value:'CA_ON_CITY_milton',label:'Milton, Ontario, Canada'}];
  assert.equal(await fillField(field,'Milton, Ontario, Canada'),true);
  assert.deepEqual(readComboboxSelection(input),['Milton, Ontario, Canada']);
});

test('personal City uses saved facts; row fields resolve only from their bound saved record',()=>{
  boot(); const fields=scanFormFields(); const city=fields.find(field=>field.label==='City');
  const profile={city:'Milton',stateProvince:'Ontario',country:'Canada',education:[{id:'degree',institution:'University of Guelph'}]};
  assert.equal(city.ats?.canonicalKey,'location');
  assert.equal(smartrecruitersAdapter.profileValue(city,profile),'Milton, Ontario, Canada');
  assert.equal(smartrecruitersAdapter.searchQuery(city,'Milton, Ontario, Canada'),'Milton');
  city.options=[{label:'Milton, Ontario, Canada',value:'ca'},{label:'Milton, GA, US',value:'us'}];
  assert.equal(smartrecruitersAdapter.resolveAnswer(city,profile).value,'Milton, Ontario, Canada');
  let school=fields.find(field=>field.label==='Institution');
  assert.equal(school.ats.record,undefined);
  assert.equal(smartrecruitersAdapter.needsFill(school,profile),false,'an unbound parsed editor is not filled from the profile');
  entryRecords.set(document.querySelector('oc-education-entry'),profile.education[0]);
  school=scanFormFields().find(field=>field.label==='Institution');
  assert.equal(school.id,'smartrecruiters:degree:institution');
  assert.equal(smartrecruitersAdapter.profileValue(school,profile),'University of Guelph');
});

test('Institution catalog country decoration is excluded from search and committed school identity',async()=>{
  boot(); const owner=document.querySelector('[data-test="institution-autocomplete"]');
  const input=owner.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input');
  const menu=owner.shadowRoot.querySelector('[role=listbox]');
  input.onclick=input.oninput=()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');};
  menu.hidden=false;
  const record={id:'degree',institution:'University of Guelph'};
  entryRecords.set(document.querySelector('oc-education-entry'),record);
  const field=scanFormFields().find(field=>field.label==='Institution');
  field.options=discoverComboboxOptions(input).map(optionData);
  assert.deepEqual(field.options.map(option=>option.label),['University of Guelph','University of Guelph']);
  const answer=smartrecruitersAdapter.resolveAnswer(field,{education:[record]});
  assert.equal(answer.value,'University of Guelph');
  const real=menu.querySelector('spl-select-option[value="University of Guelph"]');
  const item=real.shadowRoot.querySelector('spl-dropdown-item');
  item.shadowRoot.querySelector('[role=option]').onclick=()=>{item.setAttribute('selected','');input.value='University of Guelph';input.setAttribute('aria-expanded','false');menu.hidden=true;};
  assert.equal(await fillField(field,answer.value),true);
  assert.equal((await verifyField(field,answer.value)).verified,true);
});

test('missing Transcript cannot borrow an accepted resume or become a resume target', async () => {
  boot();
  document.querySelector('main').insertAdjacentHTML('beforeend', '<spl-dropzone data-test="transcript-upload" label="Transcript" files="[]"><template shadowrootmode="open"><input type="file" id="transcript"></template></spl-dropzone>');
  hydrate(document);
  const files = scanFormFields().filter(field => field.type === 'file');
  const transcript = files.find(field => field.id === 'transcript');
  assert.ok(transcript);
  assert.equal(transcript.currentValue, '');
  assert.equal(isResumeField(transcript, files), false);
  assert.equal((await verifyField(transcript, 'QA-Resume.pdf')).verified, false);
});

test('waits for parser-disabled state and shadow editor replacement before choosing targets', async () => {
  boot();
  const parser = document.querySelector('[data-test="apply-with-resume-container"]');
  const file = parser.shadowRoot.querySelector('input');
  const old = scanFormFields().find(field => field.label === 'Degree');
  parser.setAttribute('disabled', '');
  setTimeout(() => {
    const editor = document.querySelector('oc-education-edit-form');
    editor.innerHTML = '<spl-input id="edu-degree-after" label="Degree"><template shadowrootmode="open"><input id="edu-degree-after"></template></spl-input>';
    hydrate(editor); parser.removeAttribute('disabled');
  }, 35);
  await waitForResumeParsing({ uploadElement: file, minimumMs: 0, quietMs: 25, pollMs: 5, timeoutMs: 600 });
  const current = scanFormFields().find(field => field.label === 'Degree');
  assert.equal(old.element.isConnected, false);
  assert.equal(current.id, 'edu-degree-after');
  assert.equal(refreshField(current), current.element);
  assert.throws(() => refreshField(old), /changed or disappeared/);
});

test('parser wait observes late shadow property changes through the quiet window', async () => {
  boot();
  const input = document.querySelector('spl-phone-field').shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input');
  let changedAt;
  setTimeout(() => { input.value = '4165550123'; changedAt = Date.now(); }, 25);
  await waitForResumeParsing({ minimumMs: 0, quietMs: 50, pollMs: 5, timeoutMs: 600 });
  assert.ok(changedAt && Date.now() - changedAt >= 45, 'shadow value changes must restart settling');
});

test('panel preserves both accepted widgets after parsing and on retry', async () => {
  const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
    import { createGmHost } from './src/core/hosts/gm.js';
    import { setPlatform } from './src/core/platform.js';
    import { bootstrapWhenReady } from './src/core/main.js';
    const host = createGmHost(); host.capabilities.fileUpload = true;
    host.documentsGet = async () => ({name:'QA-Resume.pdf',type:'application/pdf',buffer:new Uint8Array([1]).buffer});
    host.documentsMeta = async () => ({name:'QA-Resume.pdf'});
    setPlatform(host); bootstrapWhenReady();
  ` }, bundle: true, format: 'iife', write: false });
  boot();
  const uploads = [...document.querySelectorAll('spl-dropzone')];
  for (const element of [...document.querySelector('main').children]) if (!element.matches('oc-easy-apply,oc-resume-upload')) element.remove();
  uploads.forEach(upload => upload.setAttribute('files', '[]'));
  let deliveries = 0, deliveredTo = '';
  for (const upload of uploads) upload.shadowRoot.querySelector('input').onchange = () => {
    deliveries++;
    deliveredTo=upload.getAttribute('data-test');
    upload.setAttribute('disabled', '');
    setTimeout(() => {
      upload.setAttribute('files', '[{"fileName":"QA-Resume.pdf"}]');
      upload.removeAttribute('disabled');
    }, 35);
  };
  const storage = new Map([['kr:profile',{fullName:'Test Applicant',email:'qa@example.test'}],['kr:settings',{autoContinue:true,autoSubmit:false,overwriteExisting:false}]]);
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  dom.window.CSS = {escape:value=>value};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(bundle.outputFiles[0].text);
  await new Promise(resolve => setTimeout(resolve, 100));
  const panel = document.querySelector('#kareer-root').shadowRoot;
  panel.querySelector('#kr-toggle-btn').click();
  panel.querySelector('#kr-autofill-btn').click();
  for (let i = 0; i < 90 && !panel.textContent.includes('Autofill complete.'); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(panel.textContent.includes('Autofill complete.'));
  assert.equal(deliveries, 1);
  assert.equal(deliveredTo,'resume-upload','the parser is never used');
  assert.equal(uploads[0].getAttribute('files'),'[]');
  assert.equal(panel.textContent.includes('MANUAL'),false,'automatic parsing/filling is not a manual edit');
  panel.querySelector('#kr-autofill-btn').click();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(deliveries, 1, 'overwrite-off retry must preserve the accepted upload');
});

// Reproduces the live editor behaviour observed on 2026-11-10: Add prepends an
// entry editor; autocompletes offer a custom option echoing the query; the
// month-year picker commits YYYY-MM on blur as YYYY-MM-01; Save validates the
// required fields and turns the editor into a summary card.
const option = label => `<spl-select-option value="#spl-custom-option">${label}<template shadowrootmode="open"><spl-dropdown-item><template shadowrootmode="open"><div role="option"></div></template><spl-truncate title="${label}"></spl-truncate></spl-dropdown-item></template></spl-select-option>`;
const autocomplete = (test, label, id) => `<spl-autocomplete data-test="${test}" label="${label}"><template shadowrootmode="open"><spl-input label="${label}"><template shadowrootmode="open"><input id="${id}" role="combobox" aria-controls="${id}-menu"></template></spl-input><div id="${id}-menu" role="listbox" hidden></div></template></spl-autocomplete>`;
const date = (test, label) => `<oc-datepicker data-test="${test}"><spl-date-field label="${label}" type="month-year"><template shadowrootmode="open"><spl-date-picker><template shadowrootmode="open"><input type="text" aria-label="${label}" placeholder="Pick a date"></template></spl-date-picker></template></spl-date-field></oc-datepicker>`;
const button = (test, label) => `<oc-button data-test="${test}"><spl-button aria-label="${label}"><template shadowrootmode="open"><button type="button"><slot></slot></button></template><span>${label}</span></spl-button></oc-button>`;
let ids = 0;
function wireAutocomplete(host) {
  const input = host.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input');
  const menu = host.shadowRoot.querySelector('[role=listbox]');
  const dynamic = !menu.children.length;
  const show = () => { if (menu.children.length) { menu.hidden = false; input.setAttribute('aria-expanded', 'true'); } };
  input.addEventListener('click', show);
  input.addEventListener('input', () => {
    if (dynamic) { menu.innerHTML = input.value.trim().length >= 2 ? option(input.value.trim()) : ''; hydrate(menu); }
    menu.hidden = true; show();
  });
  menu.addEventListener('click', event => {
    const chosen = event.composedPath().find(node => node.localName === 'spl-select-option');
    if (!chosen) return;
    menu.querySelectorAll('spl-select-option').forEach(item => item.shadowRoot.querySelector('spl-dropdown-item').removeAttribute('selected'));
    chosen.shadowRoot.querySelector('spl-dropdown-item').setAttribute('selected', '');
    input.value = chosen.shadowRoot.querySelector('spl-truncate').getAttribute('title');
    menu.hidden = true; input.setAttribute('aria-expanded', 'false');
  });
}
function wireEditor(entry, kind) {
  for (const host of entry.querySelectorAll('spl-autocomplete')) wireAutocomplete(host);
  for (const field of entry.querySelectorAll('spl-date-field')) {
    const input = field.shadowRoot.querySelector('spl-date-picker').shadowRoot.querySelector('input');
    input.addEventListener('blur', () => { if (/^\d{4}-\d{2}$/.test(input.value)) { input.value += '-01'; field.setAttribute('value', input.value); } });
  }
  const committed = test => {
    const host = entry.querySelector(`[data-test="${test}"]`);
    const selected = [...(host?.shadowRoot.querySelectorAll('spl-select-option') || [])].some(item => item.shadowRoot.querySelector('spl-dropdown-item[selected]'));
    return selected ? host.shadowRoot.querySelector('spl-input').shadowRoot.querySelector('input').value : '';
  };
  entry.querySelector(`oc-button[data-test="${kind}-save"] spl-button`).shadowRoot.querySelector('button').onclick = () => {
    const first = kind === 'experience' ? committed('job-title-autocomplete') : committed('institution-autocomplete');
    const from = entry.querySelector(`[data-test="${kind}-date-from"] spl-date-field`)?.getAttribute('value');
    if (!first || kind === 'experience' && !from) return;
    const second = kind === 'experience' ? committed('company-autocomplete') : entry.querySelector('[data-test="education-degree"] spl-input').shadowRoot.querySelector('input').value;
    entry.innerHTML = kind === 'experience'
      ? `<div data-test="experience-entry"><p data-test="experience-entry-title"> ${first} <span data-test="experience-entry-date">2021 - 2023</span></p><p data-test="experience-entry-company"> ${second} </p></div>`
      : `<div data-test="education-entry"><p data-test="education-entry-institution"> ${first} Guelph, ON <span data-test="education-entry-date"></span></p><p data-test="education-entry-degree"> ${second} </p></div>`;
  };
}
function wireRows() {
  const adds = { experience: 0, education: 0 };
  for (const kind of ['experience', 'education']) {
    document.querySelector(`oc-button[data-test="add-${kind}"] spl-button`).shadowRoot.querySelector('button').onclick = () => {
      adds[kind]++;
      const id = ++ids;
      const entry = document.createElement(`oc-${kind}-entry`);
      entry.innerHTML = `<oc-${kind}-edit-form><div data-test="${kind}-edit-form">${kind === 'experience'
        ? autocomplete('job-title-autocomplete', 'Title', `title-${id}`) + autocomplete('company-autocomplete', 'Company', `company-${id}`) + date('experience-date-from', 'From') + date('experience-date-to', 'To') +
          `<oc-checkbox data-test="experience-current"><spl-checkbox><template shadowrootmode="open"><input type="checkbox" aria-label="I currently work here"></template></spl-checkbox></oc-checkbox>`
        : autocomplete('institution-autocomplete', 'Institution', `school-${id}`) + `<oc-input data-test="education-degree"><spl-input label="Degree"><template shadowrootmode="open"><input id="degree-${id}" type="text"></template></spl-input></oc-input>` + date('education-date-from', 'From')
      }${button(`${kind}-save`, 'Save')}</div></oc-${kind}-edit-form>`;
      hydrate(entry);
      document.querySelector(`oc-${kind} .entries`).prepend(entry);
      wireEditor(entry, kind);
    };
  }
  const parsed = document.querySelector('oc-education-entry');
  if (parsed) wireEditor(parsed, 'education');
  return adds;
}
const cards = kind => [...document.querySelectorAll(`oc-${kind}-entry`)].map(entry => entry.querySelector(`oc-${kind}-edit-form`) ? 'EDITOR'
  : [...entry.querySelectorAll('p')].map(node => [...node.childNodes].filter(child => child.nodeType === 3).map(child => child.textContent).join('').trim()).join(' @ '));
const rowProfile = () => ({
  workExperiences: [
    { id: 'w1', title: 'Software Developer', company: 'Acme Robotics', startDate: '2022-05', endDate: '2023-08' },
    { id: 'w2', title: 'IT Technician', company: 'County of Dufferin', startDate: '2021-01-15', current: true },
  ],
  education: [{ id: 'e1', institution: 'University of Guelph', degree: 'Bachelor of Computing', startDate: '2021-09' }],
});

test('rows are created from the saved profile in order, saved, and never duplicated on retry', async () => {
  boot(); const adds = wireRows(); const profile = rowProfile();
  await prepareSmartRecruitersSections(document, profile);
  assert.deepEqual(cards('experience'), ['Software Developer @ Acme Robotics', 'IT Technician @ County of Dufferin']);
  assert.deepEqual(cards('education'), ['University of Guelph Guelph, ON @ Bachelor of Computing'], 'the empty parsed editor is reused, not duplicated');
  assert.deepEqual(adds, { experience: 2, education: 0 });
  await prepareSmartRecruitersSections(document, profile);
  assert.deepEqual(adds, { experience: 2, education: 0 }, 'saved cards match their records on retry');
  assert.equal(cards('experience').length, 2);
  const review = summarizeFieldResults(getAllDetectedFields(), new Map());
  assert.deepEqual(review.verified.filter(item => item.field.type === 'section').map(item => `${item.field.label}: ${item.result.value}`),
    ['Experience: Software Developer · Acme Robotics', 'Experience: IT Technician · County of Dufferin', 'Education: University of Guelph · Bachelor of Computing'],
    'saved rows stay reviewable after their editors close');
});

test('existing matching cards are preserved and only missing records are added', async () => {
  boot(); const adds = wireRows(); document.querySelector('oc-education-entry').remove();
  document.querySelector('oc-experience .entries').insertAdjacentHTML('beforeend', '<oc-experience-entry><div><p data-test="experience-entry-title"> IT Technician <span data-test="experience-entry-date">2021 - 2025</span></p><p data-test="experience-entry-company"> County of Dufferin </p></div></oc-experience-entry><oc-experience-entry><div><p data-test="experience-entry-title"> Parsed Unrelated Role </p></div></oc-experience-entry>');
  await prepareSmartRecruitersSections(document, rowProfile());
  assert.deepEqual(adds, { experience: 1, education: 1 });
  assert.deepEqual(cards('experience'), ['Software Developer @ Acme Robotics', 'IT Technician @ County of Dufferin', 'Parsed Unrelated Role'], 'unmatched parsed rows are never removed');
});

test('a rejected Save leaves the editor open and bound for review without a second Add', async () => {
  boot(); const adds = wireRows(); document.querySelector('oc-education-entry').remove();
  const profile = { workExperiences: [{ id: 'w1', title: 'Software Developer', company: 'Acme Robotics' }] };
  await prepareSmartRecruitersSections(document, profile);
  assert.deepEqual(cards('experience'), ['EDITOR'], 'From is required, so Save is rejected');
  assert.deepEqual(summarizeFieldResults(getAllDetectedFields(), new Map()).failed.filter(item => item.field.type === 'section').map(item => item.result.value), ['Software Developer · Acme Robotics']);
  const title = scanFormFields().find(field => field.label === 'Title');
  assert.equal(title.ats.record, profile.workExperiences[0]);
  await prepareSmartRecruitersSections(document, profile);
  assert.equal(adds.experience, 1, 'retry completes the open editor instead of adding another');
});
