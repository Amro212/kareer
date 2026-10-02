import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { detectAdapter } from '../../src/core/adapters/index.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { generateAutofillAnswers } from '../../src/core/ai.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { saveProfile } from '../../src/core/storage.js';
import { createFieldAgent } from '../../src/core/agent.js';
import { classifyPage } from '../../src/core/pageClassifier.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { getProfile } from '../../src/core/storage.js';
import { saveSettings } from '../../src/core/storage.js';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { createApplicationEngine } from '../../src/core/application.js';
import {readFile} from 'node:fs/promises';
import {harvestComboboxOptions,assertUniqueFields} from '../../src/core/fields/scanner.js';
import {isResumeField} from '../../src/core/resume.js';
import {build} from 'esbuild';

let dom;
function boot(html, ats = 'greenhouse', scripts=false) {
  dom?.window.close();
  dom = new JSDOM(html, { url: ats === 'greenhouse' ? 'https://job-boards.eu.greenhouse.io/acme/jobs/1' : 'https://jobs.ashbyhq.com/acme/1/application', pretendToBeVisual: true,...(scripts?{runScripts:'dangerously'}:{}) });
  for (const name of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[name] = dom.window[name];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const store = new Map();
  globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => store.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => store.delete(key);
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com', phone: '+1 416 555 0199', country: 'Canada', city: 'Toronto', stateProvince: 'Ontario' });
}
afterEach(() => { dom?.window.close(); setPlatform(createGmHost()); });

for (const ats of ['greenhouse', 'ashby']) {
  test(`${ats} resolves canonical names and contact fields without an API key`, async () => {
    boot('<form><label for="first_name">First name</label><input id="first_name"><label for="email">Email</label><input id="email" type="email"></form>', ats);
    const fields = scanFormFields();
    assert.equal(fields[0].ats?.adapter, ats);
    assert.equal(fields[0].ats?.canonicalKey, 'first_name');
    const response = await generateAutofillAnswers(normalizeFieldsForAI(fields));
    assert.deepEqual(response.answers.map(a => a.value), ['Test', 'test@example.com']);
    assert.equal(response.latencyMs, 0);
  });
}

test('Greenhouse excludes job filters and unrelated forms', () => {
  boot('<div class="filters"><input aria-label="Search jobs"></div><form><input id="newsletter"></form><form id="application-form"><input id="first_name"></form>');
  assert.deepEqual(scanFormFields().map(f => f.id), ['first_name']);
});

test('canonical disclosures use exact saved answers when the dedicated profile value is unset', async () => {
  boot('<form id="application_form"><label for="gender">Gender</label><select id="gender"><option value="">Select</option><option>Man</option></select></form>');
  saveProfile({ fullName:'Test Applicant', savedAnswers: { Gender: 'Man' } });
  const response = await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
  assert.equal(response.answers[0].value, 'Man');
});

test('eligibility resolves only the question country and preserves sponsorship polarity', async () => {
  boot('<form id="application_form"><label for="authorization">Are you authorized to work in Canada?</label><select id="authorization"><option value="">Select</option><option>Yes</option><option>No</option></select><label for="sponsorship">Will you require sponsorship now or in the future in Canada?</label><select id="sponsorship"><option value="">Select</option><option>Yes</option><option>No</option></select></form>');
  saveProfile({ fullName:'Test Applicant', workEligibilities:[{id:'ca',country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'Yes'},{id:'us',country:'United States',workAuthorization:'No'}] });
  const response = await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
  assert.deepEqual(response.answers.map(a => a.value), ['Yes', 'Yes']);
  document.querySelector('label').textContent = 'Are you authorized to work in Germany?';
  const changed = await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
  assert.equal(changed.answers[0].value, '');
});

test('saved custom answers are reused without a model while factual narratives retain their question', async () => {
  boot('<form id="application_form"><label for="why">Why this company?</label><textarea id="why"></textarea></form>');
  saveProfile({ fullName:'Test Applicant', savedAnswers:{'Why this company?':'Saved response.'} });
  const response = await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
  assert.equal(response.answers[0].value, 'Saved response.');
});

for (const ats of ['greenhouse','ashby']) {
  test(`${ats} uses exact saved answers for empty canonical facts and preserves profile precedence`,async()=>{
    boot('<form><label for="preferred_first_name">Preferred First Name</label><input id="preferred_first_name"><label for="country">Country</label><select id="country"><option value="">Select</option><option value="CA">Canada</option></select></form>',ats);
    saveProfile({...getProfile(),country:'',savedAnswers:{'Preferred First Name':'Alex',Country:'Canada'}});
    let response=await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
    assert.deepEqual(response.answers.map(answer=>answer.value),['Alex','CA']);assert.equal(response.latencyMs,0);
    saveProfile({...getProfile(),preferredName:'Sam'});
    response=await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
    assert.equal(response.answers[0].value,'Sam');
    saveProfile({...getProfile(),savedAnswers:{Country:'Atlantis'}});
    response=await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
    assert.equal(response.answers[1].value,'');
  });
}

test('Greenhouse text verification rejects a wrong nonempty value', async () => {
  boot('<form id="application_form"><input id="email" value="wrong@example.com"></form>');
  assert.equal((await verifyField(scanFormFields()[0], 'test@example.com')).verified, false);
});

test('Greenhouse phone formatting verifies the saved national number without accepting different digits',async()=>{
  boot('<form id="application_form"><fieldset class="phone-input"><label for="phone">Phone</label><input id="phone" type="tel" value="(416) 555-0199"></fieldset></form>');
  const field=scanFormFields()[0];
  assert.equal((await verifyField(field,'4165550199')).verified,true);
  assert.equal((await verifyField(field,'4165550100')).verified,false);
});

test('mixed structured and narrative ATS questions make one primary AI request after saved answers',async()=>{
  boot('<form id="application_form"><input id="first_name"><label for="why">Why this role?</label><textarea id="why"></textarea><label for="custom">How many widgets?</label><input id="custom"><label for="saved">Known question</label><input id="saved"></form>');
  saveProfile({...getProfile(),savedAnswers:{'Known question':'Saved answer'}});
  const {saveApiKey}=await import('../../src/core/storage.js');saveApiKey('fixture-key');
  let requests=0;
  globalThis.GM_xmlhttpRequest=options=>{requests++;const fields=JSON.parse(JSON.parse(options.data).messages.at(-1).content).fieldsToFill;assert.deepEqual(fields.map(field=>field.fieldId),['why','custom']);options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answers:fields.map(field=>({fieldId:field.fieldId,value:'Grounded response.'}))})}}]})});};
  const response=await generateAutofillAnswers(normalizeFieldsForAI(scanFormFields()));
  assert.equal(requests,1);assert.equal(response.answers.length,4);assert.equal(response.answers.find(answer=>answer.fieldId==='saved').value,'Saved answer');
});

test('Greenhouse confirmation and Ashby success markup are recognized without fields', () => {
  boot('<div class="confirmation__content"><h2>We got your application</h2></div>');
  assert.equal(classifyPage().type, 'confirmation');
  boot('<div class="ashby-application-form-success-container">Success!</div>', 'ashby');
  assert.equal(classifyPage().type, 'confirmation');
});

test('frame navigation rejects a stale signature and fresh validation failures', async () => {
  boot('<form id="application_form"><input id="email" required><button type="button">Continue</button></form>');
  const agent = createFieldAgent();
  const state = await agent.handle({action:'stepState'});
  assert.equal(state.pageType, 'application');
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  assert.ok((await agent.handle({action:'continue',expectedSignature:'stale'})).error);
  assert.ok((await agent.handle({action:'continue',expectedSignature:state.signature})).error);
  assert.equal(clicks, 0);
});

test('frame agents scan and fill application fields alongside legal acknowledgments', async () => {
  boot('<form id="application_form"><p>I certify this information is true.</p><input id="email"></form>');
  const result = await createFieldAgent().handle({action:'scan'});
  assert.equal(result.pageType, 'application');
  assert.equal(result.fields[0].fieldId, 'email');
  const filled=await createFieldAgent();
  await filled.handle({action:'scan'});
  const response=await filled.handle({action:'fill',answers:[{fieldId:'email',value:'test@example.com'}]});
  assert.equal(response.results[0].status,'verified');
  assert.equal(document.querySelector('input').value,'test@example.com');
});

test('Greenhouse completes matching parsed records and adds only missing education rows', async () => {
  boot('<form id="application_form"><div id="education_section"><div class="education" id="education-0"><label for="school-0">School</label><input id="school-0" value="School A"><label for="degree-0">Degree</label><input id="degree-0"></div><button id="add_education" type="button">Add education</button></div></form>');
  saveProfile({fullName:'Test Applicant',education:[{id:'a',institution:'School A',degree:'Bachelor'},{id:'b',institution:'School B',degree:'Master'}]});
  let adds = 0;
  document.querySelector('#add_education').onclick = () => {
    adds++;
    document.querySelector('#add_education').insertAdjacentHTML('beforebegin',`<div class="education" id="education-${adds}"><label for="school-${adds}">School</label><input id="school-${adds}"><label for="degree-${adds}">Degree</label><input id="degree-${adds}"></div>`);
  };
  const agent = createFieldAgent();
  const scanned = await agent.handle({action:'scan'});
  const response = await generateAutofillAnswers(scanned.fields);
  await agent.handle({action:'fill',answers:response.answers});
  assert.equal(document.querySelector('#degree-0').value, 'Bachelor');
  assert.equal(document.querySelector('#school-1').value, 'School B');
  await agent.handle({action:'scan'});
  assert.equal(adds, 1);
});

test('ambiguous education matches stop before adding or mutating any row', async () => {
  boot('<form id="application_form"><div id="education_section"><div class="education" id="a"><label>School<input value="School A"></label></div><div class="education" id="b"><label>School<input value="School A"></label></div><button id="add_education" type="button">Add education</button></div></form>');
  saveProfile({fullName:'Test Applicant',education:[{id:'saved',institution:'School A'}]});
  await assert.rejects(createFieldAgent().handle({action:'scan'}), /ambiguous/i);
  assert.equal(document.querySelectorAll('.education').length, 2);
});

test('disclosure checkbox groups use the question and accept multiple saved choices', async () => {
  boot('<form id="application_form"><fieldset id="ethnicity"><legend>Race / ethnicity</legend><label><input type="checkbox" value="Asian">Asian</label><label><input type="checkbox" value="White">White</label></fieldset></form>');
  saveProfile({fullName:'Test Applicant',raceEthnicity:['Asian','White']});
  const fields = scanFormFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].ats.canonicalKey, 'ethnicity');
  const {answers} = await generateAutofillAnswers(normalizeFieldsForAI(fields));
  assert.equal(await fillField(fields[0], answers[0].value), true);
  assert.equal((await verifyField(fields[0], answers[0].value)).verified, true);
});

test('Ashby row IDs stay unique despite repeated tenant input IDs', async () => {
  boot('<form data-ashby-root><div class="educationHistory"><div class="repeatableEducationEntry"><label>School<input id="education_history-school" value="A"></label></div><div class="repeatableEducationEntry"><label>School<input id="education_history-school" value="B"></label></div><button class="repeatableEducationAddButton" type="button">Add</button></div></form>', 'ashby');
  saveProfile({fullName:'Test Applicant',education:[{id:'a',institution:'A'},{id:'b',institution:'B'}]});
  await createFieldAgent().handle({action:'scan'});
  assert.equal(new Set(scanFormFields().map(f=>f.id)).size, 2);
});

test('an unaccepted resume is not verified from FileList alone', async () => {
  boot('<form id="application_form"><div class="field"><label for="resume">Resume</label><input id="resume" type="file"></div></form>');
  Object.defineProperty(document.querySelector('input'), 'files', {value:[{name:'resume.pdf'}]});
  assert.equal((await verifyField(scanFormFields()[0], 'resume.pdf')).verified, false);
  document.querySelector('.field').insertAdjacentHTML('beforeend','<span class="filename">resume.pdf</span>');
  assert.equal((await verifyField(scanFormFields()[0], 'resume.pdf')).verified, true);
});

test('ATS upload classification never treats a first cover letter or other document as a resume',()=>{
  for (const markup of ['<input id="cover_letter" type="file">','<label>Supporting document<input type="file"></label>']) {
    boot(`<form id="application_form">${markup}</form>`);
    const fields=scanFormFields();assert.equal(isResumeField(fields[0],fields),false);
  }
  boot('<form class="ashby-application-form"><div class="ashby-application-form-autofill-input-root"><input type="file"></div></form>','ashby');
  const fields=scanFormFields();assert.equal(isResumeField(fields[0],fields),true);
});

test('optional links and transgender disclosure survive profile persistence without invented defaults', () => {
  assert.equal(getProfile().transgender, '');
  saveProfile({...getProfile(),twitter:'https://x.com/test',behance:'https://behance.net/test',dribbble:'https://dribbble.com/test',website:'https://test.example',additionalUrl:'https://other.example',transgender:'No'});
  for (const name of ['twitter','behance','dribbble','website','additionalUrl','transgender']) assert.ok(getProfile()[name]);
});

function embeddedHost({ambiguous=false, cancel=false, unanswered=false, hostBoundary=false, hostFields=false}={}) {
  boot(`<main>${hostFields ? '<form><input id="newsletter" type="email"><input id="site-search" type="search"></form>' : ''}<h1>Application</h1><iframe></iframe></main>`);
  dom.reconfigure({url:'https://careers.example.com/job'});
  const host = createGmHost(), commands=[];
  let filled=false,submitted=false,questionResolved=false;
  const state = () => ({adapter:'greenhouse',pageType:submitted?'confirmation':'application',reason:'Application received.',url:'https://boards.greenhouse.io/acme/1',signature:submitted?'done':'form',fieldCount:submitted?0:1,
    canSubmit:!submitted,canContinue:false,errors:unanswered && !questionResolved?[{fieldId:'why',message:'Required narrative'}]:filled?[]:[{fieldId:'email',message:'Required'}],
    fields:submitted?[]:[{fieldId:'email',label:'Email',type:'email',required:true,ats:{adapter:'greenhouse',canonicalKey:'email'}},...(unanswered?[{fieldId:'why',label:'Why this job?',type:'textarea',required:true,ats:{adapter:'greenhouse',canonicalKey:''}}]:[])]});
  setPlatform({...host,capabilities:{...host.capabilities,crossFrame:true},
    framesList:async()=> (ambiguous?[1,2]:[submitted?7:1]).map(frameId=>({frameId,isTop:false,fieldCount:submitted?0:1})),
    frameCommand:async(id,command)=>{commands.push(command); if(command.action==='stepState') return state();
      if(command.action==='scan') return {fields:filled?unanswered && !questionResolved?state().fields.filter(field=>field.fieldId==='why'):[]:state().fields};
      if(command.action==='fill'){filled=true;if(command.answers.some(answer=>answer.fieldId==='why' && answer.value))questionResolved=true;return {results:[{fieldId:'email',status:'verified',value:'test@example.com'}]};}
      if(command.action==='submit'){submitted=true;return {ok:true};} return {results:[]};}});
  saveSettings({autoSubmit:true,autoContinue:true});
  const engine=createApplicationEngine({settleMs:0,transitionMs:0,navigationTimeoutMs:30,submitCountdownMs:cancel?1000:0,onChange:({session})=>{
    if(cancel && session?.status==='submitting') queueMicrotask(()=>engine.pause());
    if(hostBoundary && session?.status==='submitting') document.querySelector('main').insertAdjacentHTML('beforeend','<p>I certify that all information in this application is true and accurate.</p>');
  }});
  return {engine,commands};
}

test('embedded engine fills without AI then recognizes zero-field confirmation after frame replacement', async () => {
  const {engine,commands}=embeddedHost();
  try { await engine.start(); assert.equal(engine.session.status,'confirmation'); assert.equal(commands.filter(c=>c.action==='submit').length,1); assert.ok(commands.find(c=>c.action==='submit').expectedSignature); }
  finally {engine.destroy();}
});

test('embedded ownership ambiguity prevents mutation', async () => {
  for (const options of [{ambiguous:true}]) {
    const {engine,commands}=embeddedHost(options);
    try {await engine.start();assert.match(engine.session.reason,/ambiguous/i);assert.equal(commands.some(c=>['fill','submit','scan'].includes(c.action)),false);}
    finally {engine.destroy();}
  }
});

test('embedded submission countdown cancellation prevents submit', async () => {
  const {engine,commands}=embeddedHost({cancel:true});
  try {await engine.start();assert.equal(engine.session.status,'paused');assert.equal(commands.some(c=>c.action==='fill'),true);assert.equal(commands.some(c=>c.action==='submit'),false);}
  finally {engine.destroy();}
});

test('destroying the parent cancels an in-progress fill in the actual embedded field agent', async () => {
  boot('<main><h1>Job Application</h1><iframe></iframe></main>');
  dom.reconfigure({url:'https://careers.example.com/jobs/1'});
  const bundle=await build({stdin:{contents:"import {createFieldAgent} from './src/core/agent.js'; window.fixtureAgent=createFieldAgent();",resolveDir:process.cwd()},bundle:true,format:'iife',write:false});
  const frame=new JSDOM('<h1>Job Application</h1><form id="application_form"><label for="first_name">First name</label><input id="first_name" required><label for="email">Email</label><input id="email" type="email" required></form>',{url:'https://job-boards.greenhouse.io/acme/jobs/1',runScripts:'dangerously',pretendToBeVisual:true});
  frame.window.CSS={escape:value=>value};
  frame.window.HTMLElement.prototype.scrollIntoView=()=>{};
  Object.defineProperty(frame.window.HTMLElement.prototype,'offsetWidth',{get:()=>200});
  frame.window.GM_getValue=(key,fallback)=>key==='kr:profile'?getProfile():fallback;
  frame.window.GM_setValue=()=>{};
  frame.window.eval(bundle.outputFiles[0].text);
  const commands=[],host=createGmHost();
  setPlatform({...host,capabilities:{...host.capabilities,crossFrame:true},framesList:async()=>[{frameId:1,isTop:false,fieldCount:2}],frameCommand:async(id,command)=>{commands.push(command.action);return frame.window.fixtureAgent.handle(command);}});
  saveSettings({autoContinue:true,autoSubmit:true});
  const engine=createApplicationEngine({settleMs:0,transitionMs:0,submitCountdownMs:0});
  frame.window.document.querySelector('#first_name').addEventListener('input',()=>engine.destroy(),{once:true});
  try {
    await engine.start();
    assert.equal(frame.window.document.querySelector('#first_name').value,'Test');
    assert.equal(frame.window.document.querySelector('#email').value,'');
    assert.ok(commands.includes('cancel'));
    assert.equal(commands.includes('submit'),false);
  } finally {engine.destroy();frame.window.close();}
});

test('embedded submission continues when attestation text appears in the host',async()=>{
  const {engine,commands}=embeddedHost({hostBoundary:true});
  try {await engine.start();assert.notEqual(classifyPage().type,'boundary');assert.equal(commands.some(command=>command.action==='submit'),true);assert.equal(engine.session.status,'confirmation');}
  finally {engine.destroy();}
});

test('embedded unanswered questions pause for manual input without being counted as late fields',async()=>{
  const {engine,commands}=embeddedHost({unanswered:true});
  try {await engine.start();assert.match(engine.session.reason,/needs review/);assert.equal(commands.some(command=>command.action==='submit'),false);assert.equal(engine.session.steps[engine.session.currentStep].lateRequests,0);}
  finally {engine.destroy();}
});

test('embedded user retry resolves newly saved answers within the repair budget',async()=>{
  const {engine}=embeddedHost({unanswered:true});
  try {await engine.start();saveProfile({...getProfile(),savedAnswers:{'Why this job?':'Saved reason'}});await engine.start();assert.equal(engine.session.status,'confirmation');assert.ok(Object.values(engine.session.steps).some(step=>step.repairs===1));}
  finally {engine.destroy();}
});

for (const ats of ['greenhouse','ashby']) {
  test(`${ats} hosted retry refreshes a missing saved email without AI or overwriting user values`,async()=>{
    boot(`<form class="${ats==='ashby'?'ashby-application-form':''}" id="application_form"><h1>Application</h1><label for="first_name">First name</label><input id="first_name" value="User name"><label for="email">Email</label><input id="email" type="email" required><button type="button">Continue</button></form>`,ats);
    saveProfile({...getProfile(),email:''});saveSettings({autoContinue:false,autoSubmit:false,overwriteExisting:false});
    let aiCalls=0;globalThis.GM_xmlhttpRequest=()=>{aiCalls++;throw new Error('Unexpected AI request');};
    const engine=createApplicationEngine({settleMs:0,transitionMs:0,navigationTimeoutMs:0});
    try {
      await engine.start();assert.match(engine.session.reason,/unavailable/);
      saveProfile({...getProfile(),email:'new@example.com'});await engine.start();
      assert.equal(document.querySelector('#email').value,'new@example.com');
      assert.equal(document.querySelector('#first_name').value,'User name');
      assert.match(engine.session.reason,/Page filled/);assert.equal(aiCalls,0);
      assert.equal(engine.session.steps[engine.session.currentStep].requests,1);
    } finally {engine.destroy();}
  });
  test(`${ats} hosted workflow blocks on a hidden required resume in a visible upload container`,async()=>{
    boot(`<form class="${ats==='ashby'?'ashby-application-form':''}" id="application_form"><h1>Application</h1><label for="email">Email</label><input id="email" type="email" required><div class="field"><label for="resume">Resume</label><input id="resume" type="file" required style="display:none"><span class="filename"></span></div><button type="button">Continue</button></form>`,ats);
    saveSettings({autoContinue:false,autoSubmit:false});
    assert.ok(scanFormFields().some(field=>field.id==='resume'));
    const engine=createApplicationEngine({settleMs:0,transitionMs:0,navigationTimeoutMs:0});
    try {await engine.start();assert.match(engine.session.reason,/documents are unavailable/);assert.equal(engine.session.stepReview,false);}
    finally {engine.destroy();}
  });
}

test('Greenhouse Add tolerates a rerender without losing existing row bindings', async () => {
  boot('<form id="application_form"><div id="education_section"><div class="education"><label>School<input value="A"></label><label>Degree<input></label></div><button type="button" id="add_education">Add</button></div></form>');
  saveProfile({fullName:'Test Applicant',education:[{id:'a',institution:'A',degree:'Bachelor'},{id:'b',institution:'B',degree:'Master'}]});
  document.querySelector('#add_education').onclick=()=>{
    const old=document.querySelector('.education');old.replaceWith(old.cloneNode(true));
    document.querySelector('#add_education').insertAdjacentHTML('beforebegin','<div class="education"><label>School<input></label><label>Degree<input></label></div>');
  };
  const agent=createFieldAgent(),scanned=await agent.handle({action:'scan'});
  assert.equal(scanned.fields.filter(field=>field.ats.rowId).length,3);
  await agent.handle({action:'fill',answers:(await generateAutofillAnswers(scanned.fields)).answers});
  assert.equal(document.querySelector('.education input:last-child').value,'A');
  assert.equal(document.querySelectorAll('.education label:nth-child(2) input')[0].value,'Bachelor');
});

test('row caps and unavailable Add controls stop without creating records',async()=>{
  boot('<form id="application_form"><div id="education_section" data-max-rows="1"><div class="education"><label>School<input value="A"></label></div><button type="button" id="add_education">Add</button></div></form>');
  saveProfile({fullName:'Test Applicant',education:[{id:'a',institution:'A'},{id:'b',institution:'B'}]});
  await assert.rejects(createFieldAgent().handle({action:'scan'}),/row limit/);
  document.querySelector('#education_section').removeAttribute('data-max-rows');document.querySelector('#add_education').remove();
  await assert.rejects(createFieldAgent().handle({action:'scan'}),/Add unavailable/);
  assert.equal(document.querySelectorAll('.education').length,1);
});

test('Greenhouse disclosure aliases discover unfiltered choices before a grounded search',async()=>{
  boot(await readFile(new URL('../../fixtures/greenhouse-job-boards-fixture.html',import.meta.url),'utf8'),'greenhouse',true);
  saveProfile({...getProfile(),gender:'Man'});
  const fields=scanFormFields();await harvestComboboxOptions(fields);
  const response=await generateAutofillAnswers(normalizeFieldsForAI(fields));
  assert.equal(response.answers.find(answer=>answer.fieldId==='326').value,'Male');
});

test('captured Ashby education controls have distinct component labels, canonical keys and IDs before binding',async()=>{
  boot(await readFile(new URL('../../fixtures/ashby-cursor-embed-captured.html',import.meta.url),'utf8'),'ashby');
  const fields=scanFormFields();assertUniqueFields(fields);
  const row=fields.filter(field=>field.element.closest('[class*=repeatableEducationEntry]'));
  assert.deepEqual(row.map(field=>field.ats.canonicalKey),['institution','degree','fieldOfStudy','startDate_month','startDate_year','endDate_month','endDate_year','current']);
  assert.equal(row.at(-1).label,'Still Student?');
});

test('Ashby portal harvesting closes its accessibility overlay before rediscovery',async()=>{
  boot('<form class="ashby-application-form"><div class="ashby-application-form-field-entry"><label class="ashby-application-form-question-title" for="source">Source</label><input id="source" role="combobox" aria-controls="menu"><div id="menu" role="listbox" hidden><div role="option">LinkedIn</div></div></div></form>','ashby');
  const input=document.querySelector('#source'),form=document.querySelector('form'),menu=document.querySelector('#menu');
  input.addEventListener('mousedown',()=>{menu.hidden=false;form.setAttribute('aria-hidden','true');});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;form.removeAttribute('aria-hidden');}});
  const fields=scanFormFields();await harvestComboboxOptions(fields);
  assert.equal(form.hasAttribute('aria-hidden'),false);assert.equal(fields[0].options[0].label,'LinkedIn');
});

test('captured Ashby EEOC groups retain canonical disclosure metadata',async()=>{
  boot(await readFile(new URL('../../fixtures/ashby-cursor-embed-captured.html',import.meta.url),'utf8'),'ashby');
  const fields=scanFormFields().filter(field=>field.element.name?.includes('_systemfield_eeoc_'));
  assert.deepEqual(fields.map(field=>field.ats?.canonicalKey),['gender','ethnicity','veteran_v2']);
  const response=await generateAutofillAnswers(normalizeFieldsForAI(fields));
  assert.ok(response.answers.every(answer=>answer.value===''));
});

test('embedded workflow continues and fills when host page contains scannable controls', async () => {
  const {engine,commands}=embeddedHost({hostFields:true});
  try {
    assert.ok(scanFormFields().length > 0);
    await engine.start();
    assert.equal(engine.session.status,'confirmation');
    assert.equal(commands.filter(c=>c.action==='submit').length,1);
  } finally {
    engine.destroy();
  }
});

test('jobContext location with state abbreviations does not infer country, leaving state-only locations unresolved', async () => {
  boot('<form id="application_form"><label for="authorization">Are you authorized to work in the job country?</label><select id="authorization"><option value="">Select</option><option>Yes</option><option>No</option></select></form>');
  saveProfile({
    fullName: 'Test Applicant',
    workEligibilities: [
      { id: 'ca', country: 'Canada', workAuthorization: 'Yes', enabled: true },
      { id: 'in', country: 'India', workAuthorization: 'Yes', enabled: true },
      { id: 'us', country: 'United States', workAuthorization: 'No', enabled: true },
    ]
  });

  // State abbreviation CA (California) must NOT be parsed as Canada
  const fields = scanFormFields();
  let response = await generateAutofillAnswers(normalizeFieldsForAI(fields), { jobContext: { location: 'San Francisco, CA' } });
  assert.equal(response.answers[0].value, '');

  // State abbreviation IN (Indiana) must NOT be parsed as India
  response = await generateAutofillAnswers(normalizeFieldsForAI(fields), { jobContext: { location: 'Indianapolis, IN' } });
  assert.equal(response.answers[0].value, '');

  // Explicit country name in location DOES resolve
  response = await generateAutofillAnswers(normalizeFieldsForAI(fields), { jobContext: { location: 'San Francisco, CA, United States' } });
  assert.equal(response.answers[0].value, 'No');

  // Explicit country alias USA in location DOES resolve
  response = await generateAutofillAnswers(normalizeFieldsForAI(fields), { jobContext: { location: 'San Francisco, CA, USA' } });
  assert.equal(response.answers[0].value, 'No');

  // Dedicated workCountry DOES resolve
  response = await generateAutofillAnswers(normalizeFieldsForAI(fields), { jobContext: { location: 'San Francisco, CA', workCountry: 'Canada' } });
  assert.equal(response.answers[0].value, 'Yes');
});

test('fillCheckboxQuestion clears stale checked options and verifier rejects superset', async () => {
  boot('<form id="application_form"><fieldset class="demographic_question"><legend>Gender</legend><label><input type="checkbox" name="gender" value="decline" checked>Decline to state</label><label><input type="checkbox" name="gender" value="male">Male</label><label><input type="checkbox" name="gender" value="female">Female</label></fieldset></form>');
  const fields = scanFormFields();
  assert.equal(fields[0].widget, 'ats-choice');
  assert.equal(fields[0].ats?.multiple, true);

  // When filling "male", stale "decline" choice must be unchecked
  assert.equal(await fillField(fields[0], 'male'), true);
  assert.equal(document.querySelector('input[value="decline"]').checked, false);
  assert.equal(document.querySelector('input[value="male"]').checked, true);
  assert.equal(document.querySelector('input[value="female"]').checked, false);

  const verification = await verifyField(fields[0], 'male');
  assert.equal(verification.verified, true);

  // If an extra stale choice is checked, verifier must reject the superset
  document.querySelector('input[value="female"]').checked = true;
  const supersetVerification = await verifyField(fields[0], 'male');
  assert.equal(supersetVerification.verified, false);
});

test('reproduce Greenhouse work eligibility question rejection and expanded dropdown menu', async () => {
  boot('<form id="application_form"><div class="field"><label for="eligibility_question">Work Eligibility</label><select id="eligibility_question"><option value="">Select an option</option><option value="yes_val">Yes, I am authorized to work in the United States</option><option value="no_val">No, I am not authorized</option></select></div><div class="field"><label for="sponsorship_question">Will you require sponsorship for an employment visa now or in the future?</label><select id="sponsorship_question"><option value="">Select an option</option><option value="yes_spons">Yes, I will require sponsorship</option><option value="no_spons">No, I do not require sponsorship</option></select></div></form>');
  saveProfile({
    fullName: 'Test Candidate',
    workCountry: 'United States',
    workAuthorization: 'Yes',
    sponsorshipNow: 'No',
    sponsorshipFuture: 'No',
    workEligibilities: [{ country: 'United States', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'No' }]
  });

  const fields = scanFormFields();
  assert.equal(fields.length, 2);

  // 1. Verify canonical recognition
  assert.equal(fields[0].ats?.canonicalKey, 'work_auth', 'Work Eligibility should be canonicalized to work_auth');
  assert.equal(fields[1].ats?.canonicalKey, 'sponsorship', 'Sponsorship question should be canonicalized to sponsorship');

  // 2. Verify deterministic answer generation
  const response = await generateAutofillAnswers(normalizeFieldsForAI(fields));
  assert.equal(response.answers[0].value, 'yes_val', 'Work Eligibility should resolve to the matching yes option');
  assert.equal(response.answers[1].value, 'no_spons', 'Sponsorship should resolve to the matching no option');

  // 3. Verify combobox close dismisses Greenhouse floating menu
  const { closeCombobox } = await import('../../src/core/fields/combobox.js');
  const shell = document.createElement('div');
  shell.className = 'select-shell';
  shell.innerHTML = '<div class="select__control"><input class="select__input" role="combobox" aria-expanded="true"></div><div class="select__menu"></div>';
  document.body.appendChild(shell);
  const input = shell.querySelector('input');
  let escapeDispatched = false;
  input.addEventListener('keydown', e => { if (e.key === 'Escape') escapeDispatched = true; });
  let bodyClicked = false;
  document.body.addEventListener('mousedown', () => { bodyClicked = true; });

  closeCombobox(input);
  assert.equal(escapeDispatched, true, 'Escape must be dispatched to close React-select menu');
  assert.equal(bodyClicked, true, 'Click outside must be dispatched to dismiss floating menu');
});
