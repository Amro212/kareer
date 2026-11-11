import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {setPlatform} from '../../src/core/platform.js';
import {createGmHost} from '../../src/core/hosts/gm.js';
import {saveProfile,saveSettings} from '../../src/core/storage.js';
import {prepareWorkdaySections} from '../../src/core/adapters/workday-sections.js';
import {scanFormFields} from '../../src/core/fields/scanner.js';
import {rememberAnswer,recallAnswer} from '../../src/core/memory.js';
import {createApplicationEngine} from '../../src/core/application.js';

let dom,engine;
const profile = {fullName:'Test Applicant',email:'qa@example.test',linkedin:'https://linkedin.com/in/qa',github:'https://github.com/qa',portfolio:'https://portfolio.example.test'};
function boot() {
  dom = new JSDOM(readFileSync('fixtures/workday-clio-websites-fixture.html','utf8'),{url:'https://clio.wd3.myworkdayjobs.com/qa/apply',pretendToBeVisual:true});
  for(const key of ['window','document','location','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Element','Event','MutationObserver']) globalThis[key]=dom.window[key];
  globalThis.CSS={escape:value=>value};
  Object.defineProperty(HTMLElement.prototype,'offsetWidth',{get:()=>200});
  HTMLElement.prototype.scrollIntoView=()=>{};
  document.head.insertAdjacentHTML('beforeend','<style>*{opacity:1}</style>');
  const storage=new Map();
  globalThis.GM_getValue=(key,fallback)=>structuredClone(storage.get(key)??fallback);
  globalThis.GM_setValue=(key,value)=>storage.set(key,structuredClone(value));
  globalThis.GM_deleteValue=key=>storage.delete(key);
  globalThis.GM_getTab=undefined;
  setPlatform(createGmHost()); saveProfile(profile); saveSettings({autoContinue:false,autoSubmit:false,overwriteExisting:false});
}
afterEach(()=>{engine?.destroy();engine=null;dom?.window.close();});

test('website answer memory separates identical URL questions by saved record',async()=>{
  boot(); await prepareWorkdaySections(document,profile);
  const fields=scanFormFields();
  const session={answers:{}};
  const portfolio=fields.find(field=>field.ats.rowId==='portfolio');
  const github=fields.find(field=>field.ats.rowId==='github');
  rememberAnswer(session,portfolio,{value:profile.portfolio});
  assert.equal(recallAnswer(session,github),null);
  assert.equal(recallAnswer(session,portfolio).value,profile.portfolio);
  assert.equal(recallAnswer(session,{...portfolio,ats:{...portfolio.ats,rowId:'portfolio',canonicalKey:'description'}}),null);
});

test('Workday revisit ignores legacy flat URL memory and retains three distinct websites on retry',async()=>{
  boot(); engine=createApplicationEngine({settleMs:0,transitionMs:0});
  const session=engine.ensureSession({title:'QA',listingUrl:location.href,applicationUrl:location.href});
  // Old sessions keyed every repeated URL question alike; the last portfolio won.
  rememberAnswer(session,{label:'URL',type:'text',description:''},{value:profile.portfolio});
  await engine.start();
  assert.deepEqual([...document.querySelectorAll('input')].map(input=>input.value),[profile.linkedin,profile.github,profile.portfolio]);
  const step=engine.session.steps[engine.session.currentStep];
  for(const answer of Object.values(step.answers)) answer.value=profile.portfolio;
  for(const input of document.querySelectorAll('input')) input.value='';
  await engine.start();
  assert.deepEqual([...document.querySelectorAll('input')].map(input=>input.value),[profile.linkedin,profile.github,profile.portfolio]);
  assert.equal(document.querySelectorAll('input').length,3);
  assert.doesNotMatch(engine.session.reason,/ambiguous/);
});

test('ordinary flat answer recall still works after row-scoped answers are remembered',()=>{
  boot(); const session={answers:{}}; const field={label:'Full name',type:'text'};
  rememberAnswer(session,field,{value:'Test Applicant'});
  assert.equal(recallAnswer(session,field).value,'Test Applicant');
});
