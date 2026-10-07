import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { scanFormFields, harvestComboboxOptions } from '../../src/core/fields/scanner.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { generateAutofillAnswers, buildStructuredSystemPrompt } from '../../src/core/ai.js';
import { applicationAnswer, canonicalField, applicationOptionMatches } from '../../src/core/adapters/application-fields.js';
import { leverAnswer, leverCanonicalKey } from '../../src/core/adapters/lever-fields.js';
import { classifyPage } from '../../src/core/pageClassifier.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { saveProfile, saveApiKey } from '../../src/core/storage.js';
import {resolveDiscoveredAnswers} from '../../src/core/autofill.js';
import { workEligibilityAnswer } from '../../src/core/profile.js';

test('generic authorization honors sponsorship qualifiers and time horizons',async()=>{
  boot('<form></form>');
  const record={country:'United States',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'Yes'};
  const answer=(suffix,changes={})=>workEligibilityAnswer(
    {...question(`Are you authorized to work in the United States ${suffix}?`),ats:undefined},
    {workEligibilities:[{...record,...changes}]}
  );
  assert.equal(answer('without sponsorship now or in the future').value,'no');
  assert.equal(answer('without sponsorship in the future').value,'no');
  assert.equal(answer('without sponsorship now').value,'yes');
  assert.equal(answer('without sponsorship in the future',{sponsorshipNow:'Yes',sponsorshipFuture:'No'}).value,'yes');
  assert.equal(answer('and do not require sponsorship now',{sponsorshipNow:'Yes'}).value,'no');
  assert.equal(answer('without sponsorship now or in the future',{sponsorshipFuture:''}).value,'');
  assert.equal(answer('without sponsorship now or in the future',{sponsorshipFuture:''}).provenance,'unresolved');
  assert.equal(answer('without sponsorship now',{workAuthorization:'No',sponsorshipNow:''}).value,'no');
  assert.equal(answer('without sponsorship now',{sponsorshipNow:''}).value,'');
  assert.equal(workEligibilityAnswer({...question('Will you require sponsorship to be authorized to work in the United States now?'),ats:undefined},{workEligibilities:[record]}).value,'no');
  saveProfile({fullName:'Test Applicant',workEligibilities:[{...record,sponsorshipNow:'Yes'}]});
  const response=await generateAutofillAnswers([{...question('Are you authorized to work in the United States without sponsorship?'),ats:undefined}]);
  assert.equal(response.answers[0].value,'no');
  assert.equal(response.answers[0].provenance,'saved');
});

let dom;
function boot(html, ats = 'greenhouse') {
  dom?.window.close();
  const host = {greenhouse:'job-boards.greenhouse.io',lever:'jobs.lever.co',ashby:'jobs.ashbyhq.com'}[ats];
  dom = new JSDOM(html, {url:`https://${host}/acme/1`,pretendToBeVisual:true});
  for (const key of ['window','document','location','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Event','InputEvent','KeyboardEvent','MouseEvent','MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = {escape:value=>value};
  Object.defineProperty(HTMLElement.prototype,'offsetWidth',{configurable:true,get:()=>200});
  Object.defineProperty(HTMLElement.prototype,'offsetHeight',{configurable:true,get:()=>20});
  HTMLElement.prototype.scrollIntoView = () => {};
  const store = new Map();
  globalThis.GM_getValue = (key,fallback) => store.has(key) ? store.get(key) : fallback;
  globalThis.GM_setValue = (key,value) => store.set(key,structuredClone(value));
  globalThis.GM_deleteValue = key => store.delete(key);
  globalThis.GM_xmlhttpRequest = undefined;
  saveProfile({fullName:'Test Candidate',workEligibilities:[{country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'No'}]});
}
afterEach(() => dom?.window.close());
const options = [{value:'yes',label:'Yes'},{value:'no',label:'No'}];
const question = (label,key='work_auth',ats='greenhouse') => ({id:'q',fieldId:'q',label,type:'select',options,ats:{adapter:ats,canonicalKey:key}});

test('a harvested equivalent degree remains eligible for the primary contextual request', async () => {
  boot('<form></form>','ashby');
  saveProfile({fullName:'Test Candidate',educationLevel:'Bachelor'});
  saveApiKey('fixture-key');
  const field={fieldId:'degree',label:'Highest degree',type:'combobox',required:true,options:[{value:'Bachelor degree',label:'Bachelor degree'}],ats:{adapter:'ashby',canonicalKey:'highestDegree'}};
  let calls=0;
  globalThis.GM_xmlhttpRequest=request=>{
    calls++;
    assert.deepEqual(JSON.parse(JSON.parse(request.data).messages.at(-1).content).fieldsToFill.map(field=>field.fieldId),['degree']);
    request.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answers:[{fieldId:'degree',value:'Bachelor degree'}]})}}]})});
  };
  const response=await generateAutofillAnswers([field]);
  assert.equal(calls,1);
  assert.equal(response.answers[0].value,'Bachelor degree');
  assert.equal(response.answers[0].source,'ai');
});

test('late owned degree options receive one bounded contextual resolution',async()=>{
  boot('<form></form>','ashby');
  saveProfile({fullName:'Test Candidate',educationLevel:'Bachelor'});saveApiKey('fixture-key');
  const fields=[{fieldId:'jcf2::degree',label:'Highest degree',type:'combobox',required:true,options:[{value:'Bachelor degree',label:'Bachelor degree'}],ats:{adapter:'ashby',canonicalKey:'highestDegree'}}];
  let calls=0;
  globalThis.GM_xmlhttpRequest=request=>{
    calls++;
    assert.deepEqual(JSON.parse(JSON.parse(request.data).messages.at(-1).content).fieldsToFill.map(field=>field.fieldId),['jcf2::degree']);
    request.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answers:[{fieldId:'jcf2::degree',value:'Bachelor degree'}]})}}]})});
  };
  const answers=await resolveDiscoveredAnswers(fields,[{fieldId:'jcf2::degree',value:'',searchQuery:'Bachelor'}]);
  assert.equal(calls,1);assert.equal(answers[0].value,'Bachelor degree');assert.equal(answers[0].source,'ai');
});

for (const resolve of [applicationAnswer,leverAnswer]) {
  test(`${resolve.name} keeps explicit countries and country aliases scoped`, () => {
    boot('<select></select>');
    const profile = {workEligibilities:[{country:'Canada',workAuthorization:'Yes'},{country:'United States',workAuthorization:'No'}]};
    assert.equal(resolve(question('Are you authorized to work in the U.S.?'),profile)?.value,'no');
    assert.equal(resolve(question('Are you authorized to work in Spain?'),{workEligibilities:[profile.workEligibilities[0]]})?.value || '','');
    assert.equal(resolve(question('Are you authorized to work in Canada or the United States?'),profile)?.value || '','');
  });
  test(`${resolve.name} uses job country for an implicit eligibility question`, () => {
    boot('<select></select>');
    const profile = {workEligibilities:[{country:'Canada',workAuthorization:'Yes'},{country:'United States',workAuthorization:'No'}]};
    assert.equal(resolve(question('Are you currently eligible to work in the country that you are applying for?'),profile,{jobContext:{workCountry:'United States'}})?.value,'no');
  });
  test(`${resolve.name} resolves UAE aliases without borrowing another country's record`, () => {
    boot('<select></select>');
    const canada = {country:'Canada',workAuthorization:'Yes'};
    for (const alias of ['UAE','U.A.E.']) {
      const field = question(`Are you authorized to work in the ${alias}?`);
      assert.equal(resolve(field,{workEligibilities:[canada]})?.value || '','');
      assert.equal(resolve(field,{workEligibilities:[canada,{country:'United Arab Emirates',workAuthorization:'No'}]})?.value,'no');
    }
  });
  test(`${resolve.name} leaves unrecognized explicit countries for contextual AI`, () => {
    boot('<select></select>');
    const profile = {workEligibilities:[{country:'Canada',workAuthorization:'Yes'}]};
    const field = question('Are you authorized to work in NZ?');
    assert.equal(resolve(field,profile)?.value || '','');
    assert.equal(resolve(field,profile,{jobContext:{workCountry:'Canada'}})?.value || '','');
    assert.equal(resolve(question('Are you eligible to work in the country that you are applying for?'),profile)?.value,'yes');
    assert.equal(resolve(question('Are you authorized to work in the job country?'),profile)?.value,'yes');
  });
  test(`${resolve.name} honors the time horizon for authorization without sponsorship`, () => {
    boot('<select></select>');
    const record = {country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'Yes'};
    const answer = (horizon,changes={}) => resolve(question(`Are you authorized to work in Canada without sponsorship ${horizon}?`),{workEligibilities:[{...record,...changes}]})?.value || '';
    assert.equal(answer('now or in the future'),'no');
    assert.equal(answer('in the future'),'no');
    assert.equal(answer('in the future',{sponsorshipNow:'Yes',sponsorshipFuture:'No'}),'yes');
    assert.equal(answer('now'),'yes');
    assert.equal(answer('now or in the future',{sponsorshipFuture:'No'}),'yes');
    assert.equal(answer('now or in the future',{sponsorshipFuture:''}),'');
    assert.equal(answer('now or in the future',{sponsorshipNow:'',sponsorshipFuture:'Yes'}),'no');
    assert.equal(answer('in the future',{sponsorshipFuture:''}),'');
    assert.equal(answer('now or in the future',{workAuthorization:'No',sponsorshipFuture:''}),'no');
  });
}

test('authorization without needing sponsorship retains its meaning and combines profile facts', () => {
  boot('<select></select>');
  const label = 'Are you authorized to work in Canada without the need for visa sponsorship?';
  assert.equal(canonicalField(document.querySelector('select'),label),'work_auth');
  assert.equal(leverCanonicalKey({type:'select',label}),'work_auth');
  const field = question(label);
  const record = {country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'No'};
  assert.equal(applicationAnswer(field,{workEligibilities:[record]}).value,'yes');
  assert.equal(applicationAnswer(field,{workEligibilities:[{...record,sponsorshipNow:'Yes'}]}).value,'no');
});

test('eligibility option aliases distinguish negation from a negative answer', () => {
  boot('<select></select>');
  const field = question('Are you authorized to work in Canada?');
  assert.equal(applicationOptionMatches(field,'No restrictions on my right to work','No'),false);
  assert.equal(applicationOptionMatches(field,'I am not a citizen but I am authorized to work','No'),false);
  assert.equal(applicationOptionMatches(field,'I do not have authorization to work','No'),true);
  assert.equal(applicationOptionMatches(field,'Yes, I am authorized to work','Yes'),true);
  assert.equal(applicationOptionMatches(question('Will you require sponsorship?','sponsorship'),'Authorized to work without sponsorship','Yes'),false);
});

for (const ats of ['greenhouse','lever','ashby']) {
  test(`${ats} unresolved canonical eligibility never falls back to a less specific saved Yes`, async () => {
    boot('<form></form>',ats);
    saveProfile({fullName:'Test Candidate',applicantNotes:'I will need sponsorship in the future and cannot work in New Zealand.',workEligibilities:[{country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:''}]});
    saveApiKey('fixture-key');
    let calls=0;
    const fields=[question('Are you authorized to work in Canada without sponsorship now or in the future?','work_auth',ats),{...question('Are you authorized to work in NZ?','work_auth',ats),fieldId:'nz'}];
    globalThis.GM_xmlhttpRequest = request => {
      calls++;
      const unresolved=JSON.parse(JSON.parse(request.data).messages.at(-1).content).fieldsToFill;
      assert.deepEqual(unresolved.map(field=>field.fieldId),['q','nz']);
      request.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answers:fields.map(field=>({fieldId:field.fieldId,value:'No',provenance:'inferred'}))})}}]})});
    };
    const result=await generateAutofillAnswers(fields,{jobContext:{workCountry:'Canada'}});
    assert.equal(calls,1);
    assert.ok(result.answers.every(answer=>answer.value==='no' && answer.source==='ai'));
  });

  test(`${ats} fills eligibility wording and descriptive options from the saved profile`, async () => {
    boot('<form id="application_form"><div class="application-question field"><label class="application-label" for="q">Are you currently eligible to work in the country that you are applying for?</label><select id="q"><option value="">Select</option><option value="allowed">Yes, I am authorized to work</option><option value="denied">No, I am not authorized to work</option></select></div></form>',ats);
    const fields = scanFormFields();
    assert.equal(fields[0].ats.canonicalKey,'work_auth');
    const result = await generateAutofillAnswers(normalizeFieldsForAI(fields));
    assert.equal(result.answers[0].value,'allowed');
    assert.equal(await fillField(fields[0],result.answers[0].value),true);
    assert.equal(document.querySelector('select').value,'allowed');
  });

  test(`${ats} sends unresolved eligibility and disclosures through one contextual AI request`, async () => {
    boot('<form></form>',ats);
    saveProfile({fullName:'Test Candidate',applicantNotes:'I can work in Spain. My pronouns are they/them.',workEligibilities:[{country:'Canada',workAuthorization:'Yes'}]});
    saveApiKey('fixture-key');
    let calls=0;
    globalThis.GM_xmlhttpRequest = request => {
      calls++;
      const payload=JSON.parse(request.data), fields=JSON.parse(payload.messages.at(-1).content).fieldsToFill;
      assert.deepEqual(fields.map(field=>field.fieldId),['q','pronouns']);
      assert.doesNotMatch(payload.messages[0].content,/never guess yes or no|never guess disclosures|never complete assessments/i);
      assert.doesNotMatch(payload.messages[0].content,/unsupported (?:factual )?guesses|label unsupported facts/i);
      assert.match(payload.messages[0].content,/never invent facts out of thin air/i);
      request.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answers:[{fieldId:'q',value:'Yes',provenance:'inferred'},{fieldId:'pronouns',value:'They/them',provenance:'inferred'}]})}}]})});
    };
    const fields=[question('Are you authorized to work in Spain?','work_auth',ats),{fieldId:'pronouns',label:'Pronouns',type:'select',options:[{value:'they',label:'They/them'}],ats:{adapter:ats,canonicalKey:'pronouns'}}];
    const result=await generateAutofillAnswers(fields);
    assert.equal(calls,1);
    assert.equal(result.answers.find(answer=>answer.fieldId==='q').value,'yes');
    assert.equal(result.answers.find(answer=>answer.fieldId==='pronouns').value,'they');
    assert.ok(result.answers.every(answer=>answer.source==='ai' && answer.inferred));
  });
}

test('application acknowledgments and verification headings do not block the whole form', () => {
  for (const text of ['I certify that all information is accurate','Identity verification','Skills assessment','Recorded interview','Electronic signature']) {
    boot(`<form><h1>${text}</h1><input id="email" type="email"></form>`,'ashby');
    assert.equal(classifyPage().type,'application');
  }
  assert.doesNotMatch(buildStructuredSystemPrompt(),/return an empty string.*never a guessed identity|never guess yes or no/i);
});

for (const ats of ['greenhouse','lever','ashby']) {
  test(`${ats} harvests its owned menu and dismisses it before the next scan`,async()=>{
    boot('<form><div class="field select-shell"><label for="q">Work eligibility</label><div class="select__control"><input id="q" role="combobox" aria-controls="q-menu"></div><div id="q-menu" role="listbox" hidden><div role="option">Yes</div><div role="option">No</div></div></div></form>',ats);
    const input=document.querySelector('input'),menu=document.querySelector('[role=listbox]');
    input.addEventListener('mousedown',()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');});
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;input.setAttribute('aria-expanded','false');}});
    const fields=scanFormFields();
    await harvestComboboxOptions(fields);
    assert.deepEqual(fields[0].options.map(option=>option.label),['Yes','No']);
    assert.equal(menu.hidden,true);
    assert.equal(input.getAttribute('aria-expanded'),'false');
  });
}
