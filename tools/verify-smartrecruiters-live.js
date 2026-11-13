// Explicit acceptance tool: real extension, headed, synthetic facts, no submission.
// Run separately from fixtures: node tools/verify-smartrecruiters-live.js [postingUrl]
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const posting=process.argv[2] || 'https://jobs.smartrecruiters.com/UniversityHealthNetwork/744000159404572';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kareer-sr-live-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(temporary,{channel:'chromium',headless:false,viewport:{width:1400,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-first-run']});
const profile={fullName:'Test Applicant',firstName:'Test',lastName:'Applicant',email:'test.applicant@example.com',phone:'+1 416 555 0199',country:'Canada',city:'Toronto',stateProvince:'Ontario',linkedin:'https://www.linkedin.com/in/test-applicant',
  workExperiences:[
    {id:'w1',enabled:true,title:'Software Developer',company:'Acme Robotics',location:'Toronto, Ontario',startDate:'2022-03-01',endDate:'',current:true,description:'Built internal tools.'},
    {id:'w2',enabled:true,title:'Junior Developer',company:'Northwind Labs',location:'Ottawa, Ontario',startDate:'2020-01-01',endDate:'2022-02-01',current:false,description:'Maintained web services.'}],
  education:[{id:'e1',enabled:true,institution:'University of Toronto',degree:'Bachelor of Science',fieldOfStudy:'Computer Science',startDate:'2016-09-01',endDate:'2020-05-01'}]};
const out=path.resolve('docs/qa/2026-11-10-follow-up');
fs.mkdirSync(out,{recursive:true});

function state() {
  const all=(root,selector,found=[])=>{root.querySelectorAll(selector).forEach(el=>found.push(el));root.querySelectorAll('*').forEach(el=>el.shadowRoot&&all(el.shadowRoot,selector,found));return found;};
  const value=id=>all(document,`input#${id}`)[0]?.value ?? null;
  const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
  const files=test=>all(document,`spl-dropzone[data-test="${test}"]`).map(zone=>text(zone.shadowRoot||zone).slice(0,160));
  const rows=(entry,title,sub)=>all(document,entry).map(row=>all(row,'[data-test$="-edit-form"],oc-experience-edit-form,oc-education-edit-form').length?'EDITOR':`${text(all(row,`[data-test="${title}"]`)[0])} | ${text(all(row,`[data-test="${sub}"]`)[0])}`);
  return {
    firstName:value('first-name-input'),lastName:value('last-name-input'),email:value('email-input'),confirmEmail:value('confirm-email-input'),
    city:all(document,'oc-personal-information spl-autocomplete[data-test="location-autocomplete"]').map(el=>el.value ?? text(el)).slice(0,1),
    phone:all(document,'spl-phone-field input[type="tel"]').map(el=>el.value),
    parser:files('apply-with-resume-container'),resume:files('resume-upload'),
    experience:rows('oc-experience-entry','experience-entry-title','experience-entry-company'),
    education:rows('oc-education-entry','education-entry-institution','education-entry-degree'),
  };
}

const report={posting,runs:[]};
try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(async profile=>{
    await chrome.storage.local.set({'kr:settings':{autoContinue:false,autoSubmit:false,overwriteExisting:false},'kr:profile':profile});
    const buffer=new TextEncoder().encode('%PDF-1.4 synthetic resume').buffer;
    await new Promise((resolve,reject)=>{const req=indexedDB.open('kareer',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');
      req.onsuccess=()=>{const tx=req.result.transaction('files','readwrite');tx.objectStore('files').put({name:'Test-Resume.pdf',type:'application/pdf',buffer,size:buffer.byteLength,storedAt:new Date().toISOString()},'resume');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);});
  },profile);
  const page=await context.newPage();
  let submissionRequests=0;
  await page.route('**/*',route=>{
    const request=route.request();
    if(request.method()==='POST' && /\/(?:submit|applications?(?:\/[^/]+)?\/submit|apply)(?:\?|$)/i.test(new URL(request.url()).pathname)) {submissionRequests++;return route.abort();}
    return route.continue();
  });
  await page.goto(posting,{waitUntil:'domcontentloaded',timeout:60000});
  const apply=page.locator('a.js-oneclick[href*="/oneclick-ui/"]').first();
  if(await apply.count()) await page.goto(new URL(await apply.getAttribute('href'),page.url()).href,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>{const find=root=>root.querySelector('#first-name-input')||[...root.querySelectorAll('*')].some(el=>el.shadowRoot&&find(el.shadowRoot));return find(document);},null,{timeout:60000});
  await page.waitForTimeout(3000);
  report.before=await page.evaluate(state);
  await page.locator('#kr-pebble-toggle-btn').waitFor({state:'attached',timeout:30000});
  if(!await page.locator('#kr-main-panel').isVisible()) await page.locator('#kr-pebble-toggle-btn').click();
  for(const run of [1,2]) {
    const button=page.locator('#kr-autofill-btn');
    await button.waitFor({timeout:20000});
    await page.waitForFunction(()=>!document.querySelector('#kareer-root')?.shadowRoot?.querySelector('#kr-autofill-btn')?.disabled,null,{timeout:60000});
    await button.click();
    await page.waitForTimeout(4000);
    await page.waitForFunction(()=>{const button=document.querySelector('#kareer-root')?.shadowRoot?.querySelector('#kr-autofill-btn');return button && !button.disabled && !/stop|filling/i.test(button.textContent);},null,{timeout:180000}).catch(()=>{});
    await page.waitForTimeout(3000);
    report.runs.push({run,panel:(await page.locator('#kr-main-panel').innerText()).slice(0,1500),state:await page.evaluate(state),submissionRequests});
    await page.screenshot({path:path.join(out,`smartrecruiters-live-run${run}.png`),fullPage:false});
    console.log(JSON.stringify(report.runs.at(-1).state));
  }
} catch(error) {
  report.error=error.stack;console.error(error);
  const page=context.pages().at(-1);
  if(page) {report.url=page.url();report.body=(await page.locator('body').innerText().catch(()=>'')).slice(0,800);await page.screenshot({path:path.join(out,'smartrecruiters-live-error.png')}).catch(()=>{});console.error(report.url,report.body);}
}
finally {
  fs.writeFileSync(path.join(out,'smartrecruiters-live.json'),JSON.stringify(report,null,2));
  await context.close();
  fs.rmSync(temporary,{recursive:true,force:true});
}
