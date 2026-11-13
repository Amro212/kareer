import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

let bundle;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function panel(html, url = 'https://jobs.lever.co/qa/apply') {
  bundle ||= (await build({entryPoints:['src/targets/userscript/entry.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
  const dom = new JSDOM(`<title>Job Application</title><main>${html}</main>`, {url,runScripts:'outside-only',pretendToBeVisual:true});
  const storage = new Map([['kr:profile',{fullName:'Test Applicant',email:'qa@example.test'}],['kr:settings',{autoSubmit:false,autoContinue:true,overwriteExisting:false}]]);
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  dom.window.CSS = {escape:value => value};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', {get:() => 200});
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', {get:() => 20});
  dom.window.document.head.insertAdjacentHTML('beforeend','<style>*{opacity:1}</style>');
  dom.window.eval(bundle);
  await wait(100);
  const root = dom.window.document.querySelector('#kareer-root').shadowRoot;
  root.querySelector('#kr-pebble-toggle-btn')?.click();
  root.querySelector('#kr-toggle-btn').click();
  return {dom,root,storage};
}
async function until(check) {
  for (let i=0; i<60 && !check(); i++) await wait(100);
  assert.ok(check(), 'expected panel state within six seconds');
}
const emailForm = '<form id="application"><label for="email">Email</label><input id="email" name="email" type="email" required><button type="button">Submit application</button></form>';

test('rendered review card clears old answer and readiness after manual deletion', async () => {
  const {dom,root} = await panel(emailForm);
  try {
    root.querySelector('#kr-autofill-btn').click();
    await until(() => root.querySelector('#kr-autofill-btn')?.textContent.includes('Submit Application'));
    assert.equal(root.querySelector('.kr-review-value').textContent, 'qa@example.test');
    const input = dom.window.document.querySelector('#email');
    input.value = '';
    input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    await until(() => root.querySelector('.kr-review-value')?.textContent === 'Empty');
    assert.equal(root.querySelector('#kr-autofill-btn').textContent.includes('Submit Application'), false);
    assert.ok(root.textContent.includes('1 FAILED'));
    await wait(350);
    assert.equal(input.value, '', 'idle reconciliation must not refill');
  } finally {dom.window.close();}
});

test('rendered failed card becomes verified after manual correction without AI or execution', async () => {
  const {dom,root} = await panel('<form id="application"><label for="custom">Required choice *</label><select id="custom" required><option value="">Choose one</option><option value="other">Other</option></select><button type="button">Submit application</button></form>');
  try {
    root.querySelector('#kr-autofill-btn').click();
    await until(() => root.textContent.includes('1 FAILED'));
    const input = dom.window.document.querySelector('#custom');
    input.value = 'other';
    input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    await until(() => root.textContent.includes('1 VERIFIED'));
    assert.equal(root.textContent.includes('1 FAILED'), false);
    assert.equal(root.querySelector('.kr-review-value').textContent, 'other');
    assert.ok(root.textContent.includes('MANUAL'));
    assert.equal(input.value, 'other');
  } finally {dom.window.close();}
});

test('rendered Workday Back restores Autofill without continuing the earlier step', async () => {
  const {dom,root} = await panel(`<h2>Review your application</h2>${emailForm.replace('required>', 'required value="qa@example.test">')}`, 'https://acme.myworkdayjobs.com/en-US/job/apply');
  try {
    root.querySelector('#kr-autofill-btn').click();
    await until(() => root.querySelector('#kr-autofill-btn')?.textContent.includes('Submit Application'));
    dom.window.document.querySelector('main').innerHTML = '<h2>My Information</h2><label for="city">City</label><input id="city"><button data-automation-id="pageFooterNextButton">Next</button>';
    let nextClicks = 0;
    dom.window.document.querySelector('main button').onclick = () => nextClicks++;
    await until(() => /Autofill/.test(root.querySelector('#kr-autofill-btn')?.textContent));
    assert.equal(root.querySelector('#kr-autofill-btn').disabled, false);
    assert.equal(dom.window.document.querySelector('#city').value, '');
    assert.equal(nextClicks, 0);
  } finally {dom.window.close();}
});
