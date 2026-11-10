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

test('accepted upload metadata belongs to each native shadow file input', async () => {
  boot();
  const files = scanFormFields().filter(field => field.type === 'file');
  assert.equal(files.length, 2);
  for (const field of files) {
    assert.equal(field.currentValue, 'QA-Resume.pdf');
    assert.equal((await verifyField(field, 'QA-Resume.pdf')).verified, true);
    assert.equal((await verifyField(field, 'Different.pdf')).verified, false);
  }
  document.querySelector('[data-test="resume-upload"]').setAttribute('files', '{bad JSON');
  assert.equal((await verifyField(files.find(field => field.id === 'resume-upload'), 'QA-Resume.pdf')).verified, false);
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
  for (const element of [...document.querySelector('main').children]) if (!element.matches('oc-apply-with-resume,section')) element.remove();
  uploads.forEach(upload => upload.setAttribute('files', '[]'));
  let deliveries = 0;
  for (const upload of uploads) upload.shadowRoot.querySelector('input').onchange = () => {
    deliveries++;
    uploads[0].setAttribute('disabled', '');
    setTimeout(() => {
      uploads.forEach(owner => owner.setAttribute('files', '[{"fileName":"QA-Resume.pdf"}]'));
      uploads[0].removeAttribute('disabled');
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
  assert.equal(deliveries, 1, 'the parser already populated the second upload');
  panel.querySelector('#kr-autofill-btn').click();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(deliveries, 1, 'overwrite-off retry must preserve both uploads');
});
