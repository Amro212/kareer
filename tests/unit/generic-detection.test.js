import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { isJobPage, captureJob, activateJobPage } from '../../src/core/jobs.js';
import { observeJobPage } from '../../src/core/jobObserver.js';
import { classifyPage, visibleText } from '../../src/core/pageClassifier.js';
import { build } from 'esbuild';

let dom;
afterEach(() => dom?.window.close());
function page(html, url = 'https://example.org/candidate/42') {
  dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return document;
}
for (const file of ['brim.clearcompany.com-2026-10-07-21-51.html', 'jobs.smartrecruiters.com-2026-10-07-21-49.html']) {
  test(`generic detection recognizes captured ${file} on an unknown domain`, () => {
    assert.equal(isJobPage(page(fs.readFileSync(`fixtures/${file}`, 'utf8'))), true);
  });
}
test('generic non-form application uses text email semantics and an h3 heading', () => {
  assert.equal(isJobPage(page('<h3>Apply for a position</h3><label>Full name<input></label><label>Email address<input type=text></label>')), true);
});
test('neutral-URL Application Contact form retains candidate evidence', () => {
  assert.equal(isJobPage(page('<h1>Application · Contact</h1><form><label>Full name<input autocomplete=name></label><label>Email<input type=email></label></form>')), true);
});
test('candidate and resume semantics identify a custom application without a form', () => {
  assert.equal(isJobPage(page('<section><h3>Personal information</h3><label>Full name<input></label><label>Email<input></label><div><h4>Resume</h4><button aria-haspopup=listbox label="Upload resume">Choose file</button></div></section>')), true);
});
test('generic application recognizes a labeled upload action with candidate fields', () => {
  assert.equal(isJobPage(page('<section><h3>Personal information</h3><label>Name<input></label><label>Email<input></label><button>Upload resume</button></section>')), true);
});
test('generic submit-application action establishes intent with candidate fields', () => {
  assert.equal(isJobPage(page('<section><h3>Personal information</h3><label>Name<input></label><label>Email<input></label><button>Submit application</button></section>')), true);
});
test('open shadow application is recognized', () => {
  page('<candidate-portal></candidate-portal>');
  document.querySelector('candidate-portal').attachShadow({mode:'open'}).innerHTML = '<h3>Job application</h3><label>Email<input autocomplete=email></label>';
  assert.equal(isJobPage(document), true);
});
for (const [name, html] of [
  ['hidden heading', '<h1 hidden>Job Application</h1><h2>Contact us</h2><form><input type=email></form>'],
  ['resume service contact', '<h1>Contact us</h1><form>Questions about our resume service?<input type=email></form>'],
  ['loan Easy Apply', '<title>Easy Apply</title><h1>Loan application</h1><form><input type=email></form>'],
  ['loan candidate controls', '<title>Easy Apply</title><h1>Loan application</h1><form><label>Full name<input></label><label>Email<input type=email></label></form>'],
  ['advice article', '<h1>How to apply for a job</h1><article>Advice</article>'],
  ['advice with newsletter', '<h1>How to apply for a job</h1><article>Advice</article><form><label>Name<input></label><label>Email<input type=email></label></form>'],
  ['account profile', '<h3>Personal information</h3><label>Full name<input></label><label>Email<input type=email></label>'],
  ['unrelated schema mention', '<script type="application/ld+json">{"@type":"Article","name":"JobPosting"}</script>'],
  ['Kareer UI evidence', '<div id="kareer-root"><h1>Job application</h1><input type=email></div>'],
  ['Kareer UI metadata', '<div id="kareer-root"><script type="application/ld+json">{"@type":"JobPosting"}</script></div>'],
]) test(`generic detection excludes ${name}`, () => assert.equal(isJobPage(page(html)), false));
test('schema graph and type arrays establish a listing', () => {
  assert.equal(isJobPage(page('<script type="application/ld+json">{"@graph":[{"@type":["Thing","JobPosting"],"title":"Engineer"}]}</script>')), true);
});
test('captured document does not carry eligibility into an unrelated SPA URL', () => {
  page('<h1>Job Application</h1><input type=email>');
  captureJob(document);
  dom.reconfigure({url:'https://example.org/education'});
  document.body.innerHTML = '<h1>Education</h1><article>Learning resources</article>';
  assert.equal(isJobPage(document), false);
});
test('captured same-URL application retains later step headings', () => {
  page('<h1>Job Application</h1><input type=email>');
  captureJob(document);
  document.body.innerHTML = '<h3>Education</h3>';
  assert.equal(isJobPage(document), true);
});
test('application classification includes accessible shadow controls', () => {
  page('<candidate-portal></candidate-portal>');
  document.querySelector('candidate-portal').attachShadow({mode:'open'}).innerHTML = '<h3>Job application</h3><label>Email<input type=email></label>';
  assert.equal(classifyPage(document).type, 'application');
  assert.match(visibleText(document.body), /Job application/);
  document.querySelector('candidate-portal').hidden = true;
  assert.equal(classifyPage(document).type, 'unrelated');
});
test('userscript eligibility observes same-origin embedded application changes', async () => {
  page('<iframe></iframe>');
  let changes = 0;
  const observer = observeJobPage(document, () => changes++);
  try {
    document.querySelector('iframe').contentDocument.body.innerHTML = '<h3>Job application</h3><input type=email>';
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(changes > 0, 'parent should observe child application evidence');
    assert.equal(isJobPage(document), true);
  } finally { observer.disconnect(); }
});

for (const attribute of ['name', 'id']) {
  test(`generic eligibility observes control ${attribute} hydration`, async () => {
    page('<section><label>Full name<input></label><input type=file></section>');
    let changes = 0;
    const observer = observeJobPage(document, () => changes++);
    try {
      assert.equal(isJobPage(document), false);
      const upload = document.querySelector('input[type=file]');
      upload.setAttribute(attribute, 'resume');
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(isJobPage(document), true);
      assert.ok(changes > 0, 'semantic attribute hydration must notify the reconciler');
      const previous = changes;
      upload.removeAttribute(attribute);
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(isJobPage(document), false);
      assert.ok(changes > previous, 'removing semantic evidence must notify the reconciler');
    } finally { observer.disconnect(); }
  });
}
test('manual eligibility expires on navigation and does not revive on return', () => {
  page('<h3>Contact us</h3><input type=email>');
  activateJobPage(document);
  assert.equal(isJobPage(document), true);
  dom.reconfigure({url:'https://example.org/other'});
  assert.equal(isJobPage(document), false);
  dom.reconfigure({url:'https://example.org/candidate/42'});
  assert.equal(isJobPage(document), false);
});
test('pending remote eligibility cannot remove a newly activated manual panel', async () => {
  dom = new JSDOM('<h3>Contact us</h3><input type=email><iframe src="https://ad.example.org/"></iframe>', {url:'https://example.org/contact',runScripts:'dangerously',pretendToBeVisual:true});
  dom.window.CSS = {escape:value=>value};
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', {get:()=>200});
  const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`
    import {setPlatform} from './src/core/platform.js';
    import {createGmHost} from './src/core/hosts/gm.js';
    import {bootstrap} from './src/core/main.js';
    import {toggleUIVisibility} from './src/core/ui.js';
    const host = createGmHost();
    host.capabilities.crossFrame = true;
    const pending = new Promise(resolve => window.releaseFrames = () => resolve([]));
    host.framesList = () => { window.waitingForFrames = true; return pending; };
    setPlatform(host);
    window.openManualPanel = toggleUIVisibility;
    bootstrap();
  `},bundle:true,format:'iife',write:false});
  dom.window.eval(bundle.outputFiles[0].text);
  for (let i=0; i<100 && !dom.window.waitingForFrames; i++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(dom.window.waitingForFrames, true);
  dom.window.openManualPanel();
  assert.ok(dom.window.document.querySelector('#kareer-root'));
  dom.window.releaseFrames();
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.ok(dom.window.document.querySelector('#kareer-root'), 'stale eligibility must not unmount the manual panel');
});
