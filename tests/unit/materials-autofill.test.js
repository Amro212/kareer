import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform, platform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { saveSettings, saveProfile } from '../../src/core/storage.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { applyGeneratedMaterials, snapshotMaterials } from '../../src/core/materials.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { createFieldAgent } from '../../src/core/agent.js';

let dom, records;
const file = name => ({ name, type: 'application/pdf', size: 3, buffer: new Uint8Array([1, 2, 3]).buffer });
const materials = () => ({
  resume: { revision: 'resume-v1', files: { pdf: file('tailored-resume.pdf') } },
  coverLetter: { revision: 'letter-v1', model: { kind: 'coverLetter', paragraphs: ['Generated letter.'] }, files: { pdf: file('tailored-letter.pdf') } },
});
const render = html => { document.querySelector('main').innerHTML = html; };
const job = () => ({ title: 'Engineer', company: 'Example', listingUrl: window.location.href, applicationUrl: window.location.href });
const letterField = '<label for="letter">Cover letter</label><textarea id="letter" required></textarea>';
const resumeField = '<label for="resume">Resume</label><input id="resume" type="file" accept=".pdf" required>';
function attach(id, name) {
  Object.defineProperty(document.getElementById(id), 'files', { configurable: true, value: [new File(['original'], name, { type: 'application/pdf' })] });
}

beforeEach(() => {
  dom = new JSDOM('<body><main></main></body>', { url: 'https://example.com/jobs/42/apply' });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'File']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};
  records = materials();
  const host = createGmHost();
  setPlatform({ ...host, capabilities: { ...host.capabilities, fileUpload: true, materials: true },
    materialsRequest: async operation => operation === 'snapshot' ? { records, refs: { resume: { id: 'selected-resume' } }, tasks: {}, runRef: { id: 'frozen-run' } } : {},
  });
  saveSettings({ autoContinue: false, autoSubmit: false, overwriteExisting: false });
  saveProfile({ fullName: 'Test Applicant' });
});
afterEach(() => { dom.window.close(); setPlatform(createGmHost()); });

for (const type of ['textarea', 'text', 'contenteditable']) {
  test(`generated cover letters preserve existing ${type} text unless overwrite is enabled`, async () => {
    const control = type === 'textarea' ? '<textarea id="letter">My letter.</textarea>'
      : type === 'text' ? '<input id="letter" value="My letter.">'
      : '<div id="letter" contenteditable="true">My letter.</div>';
    render(`<label for="letter">Cover letter</label>${control}`);
    const fields = scanFormFields();
    assert.equal(fields.length, 1);
    const element = document.getElementById('letter');
    const read = () => type === 'contenteditable' ? element.textContent : element.value;
    assert.deepEqual(await applyGeneratedMaterials(fields, records), []);
    assert.equal(read(), 'My letter.');
    const results = await applyGeneratedMaterials(fields, records, { overwriteExisting: true });
    assert.equal(read(), 'Generated letter.');
    assert.equal(results[0].status, 'verified');
  });
}

test('generated files preserve both existing attachments unless overwrite is enabled', async () => {
  render(`${resumeField}<label for="cover">Cover letter</label><input type="file" id="cover" accept=".pdf">`);
  attach('resume', 'my-resume.pdf'); attach('cover', 'my-letter.pdf');
  assert.deepEqual(await applyGeneratedMaterials(scanFormFields(), records), []);
  assert.equal(document.getElementById('resume').files[0].name, 'my-resume.pdf');
  assert.equal(document.getElementById('cover').files[0].name, 'my-letter.pdf');
  const results = await applyGeneratedMaterials(scanFormFields(), records, { overwriteExisting: true });
  assert.equal(document.getElementById('resume').files[0].name, 'tailored-resume.pdf');
  assert.equal(document.getElementById('cover').files[0].name, 'tailored-letter.pdf');
  assert.ok(results.every(result => result.status === 'verified'));
});

test('empty fields still receive generated materials with overwrite disabled', async () => {
  render(resumeField + letterField);
  const results = await applyGeneratedMaterials(scanFormFields(), records);
  assert.equal(document.getElementById('resume').files[0].name, 'tailored-resume.pdf');
  assert.equal(document.getElementById('letter').value, 'Generated letter.');
  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.status === 'verified'));
});

test('snapshot omits unavailable records while retaining valid documents and session references', async () => {
  records.resume = { error: 'Selected document is unavailable.' };
  const session = { id: 'session-42' };
  const snapshot = await snapshotMaterials(session);
  assert.equal(snapshot.resume, undefined);
  assert.equal(snapshot.coverLetter, records.coverLetter);
  assert.equal(session.materialRefs.resume.id, 'selected-resume');
  assert.equal(session.materialRunRef.id, 'frozen-run');
});

test('unavailable selected materials fall back to AI cover letter and stored original resume', async () => {
  render(`<h1>Engineer application</h1>${resumeField}${letterField}<button>Continue</button>`);
  records = { resume: { error: 'Missing resume.' }, coverLetter: { error: 'Missing cover letter.' } };
  await platform.documents.put(file('original-resume.pdf'));
  const requests = [];
  const engine = createApplicationEngine({ settleMs: 0, answer: async fields => {
    requests.push(fields);
    return { answers: fields.map(field => ({ fieldId: field.fieldId, value: 'AI fallback letter.' })) };
  } });
  try {
    await engine.start(job());
    assert.equal(document.getElementById('resume').files[0]?.name, 'original-resume.pdf');
    assert.equal(document.getElementById('letter').value, 'AI fallback letter.');
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0].fieldId, 'letter');
  } finally { engine.destroy(); }
});

for (const overwriteExisting of [false, true]) {
  test(`engine forwards overwriteExisting=${overwriteExisting} to material filling`, async () => {
    render(`<h1>Engineer application</h1>${letterField}<button>Continue</button>`);
    document.getElementById('letter').value = 'My letter.';
    saveSettings({ overwriteExisting });
    const engine = createApplicationEngine({ settleMs: 0, answer: async () => { throw new Error('Selected material must not require AI.'); } });
    try {
      await engine.start(job());
      assert.equal(document.getElementById('letter').value, overwriteExisting ? 'Generated letter.' : 'My letter.');
    } finally { engine.destroy(); }
  });
  test(`frame agent forwards overwriteExisting=${overwriteExisting} to material filling`, async () => {
    render(`<h1>Engineer application</h1>${resumeField}${letterField}`);
    attach('resume', 'my-resume.pdf');
    document.getElementById('letter').value = 'My letter.';
    const result = await createFieldAgent().handle({ action: 'uploadResume', overwriteExisting, materials: records });
    assert.equal(result.error, undefined);
    assert.equal(document.getElementById('resume').files[0].name, overwriteExisting ? 'tailored-resume.pdf' : 'my-resume.pdf');
    assert.equal(document.getElementById('letter').value, overwriteExisting ? 'Generated letter.' : 'My letter.');
  });
}
