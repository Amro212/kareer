// Explicit acceptance tool: real extension, synthetic facts, no submission.
// Run separately from fixtures: rtk proxy node tools/verify-ats-live.js
import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kareer-live-'));
const extension=path.resolve('dist/chrome');
const context=await chromium.launchPersistentContext(temporary,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const report=[];
try {
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({'kr:settings':{autoContinue:false,autoSubmit:false,overwriteExisting:false},'kr:profile':{fullName:'Test Applicant',email:'test.applicant@example.com',phone:'+1 416 555 0199',country:'Canada',city:'Toronto',stateProvince:'Ontario'}}));
  const targets=[
    ['greenhouse-hosted','https://job-boards.greenhouse.io/promptioinc/jobs/4420814009'],
    ['ashby-hosted','https://jobs.ashbyhq.com/siftstack/be082df3-225c-4269-a159-bdb362b21c8e/application'],
    ['ashby-embed','https://jobs.ashbyhq.com/cursor/d0e5b41d-84ab-4887-bd3a-55589b11dd7b/application?embed=true'],
    ['greenhouse-iframe','https://job-boards.greenhouse.io/promptioinc/jobs/4420814009'],
    ['ashby-iframe','https://jobs.ashbyhq.com/siftstack/be082df3-225c-4269-a159-bdb362b21c8e/application?embed=true'],
  ];
  for(const [name,url] of targets) {
    if(process.argv[2] && name!==process.argv[2]) continue;
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('requestfailed',request=>pageErrors.push(`${new URL(request.url()).host}: ${request.failure()?.errorText}`));
    let submissionRequests=0;
    await page.route('**/*',route=>{
      const request=route.request();
      if(request.method()==='POST' && /(?:applications?\/submit|submitApplication|job_applications|applications$)/i.test(request.url())) {submissionRequests++;return route.abort();}
      return route.continue();
    });
    try {
      const embedded=name.endsWith('-iframe');
      if(embedded)await page.route('http://kareer-live.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Live application acceptance host</h1><iframe title="Application" width="1000" height="1800" src="${url}"></iframe>`}));
      await page.goto(embedded?`http://kareer-live.test/${name}`:url,{waitUntil:'domcontentloaded',timeout:45000});
      const scope=embedded?page.frameLocator('iframe'):page;
      await scope.locator('input:not([type=hidden]),textarea,select').first().waitFor({timeout:30000});
      await page.locator('#kr-toggle-btn').waitFor({timeout:25000});
      if(!await page.locator('#kr-main-panel').count()) await page.locator('#kr-toggle-btn').evaluate(button=>button.click());
      if(embedded)await page.waitForFunction(()=>document.querySelector('#kareer-root')?.shadowRoot?.textContent.includes('embedded frame'),null,{timeout:30000});
      const before=await page.locator('#kr-main-panel').innerText();
      const button=page.locator('#kr-autofill-btn');
      if(await button.isEnabled()) {
        await button.click();
        await page.waitForFunction(()=>{
          const root=document.querySelector('#kareer-root')?.shadowRoot;
          return /PAUSED|BOUNDARY|CONFIRMATION/.test(root?.textContent || '');
        },null,{timeout:45000});
      }
      report.push({name,url:page.url(),applicationUrl:url,before:before.slice(0,600),after:(await page.locator('#kr-main-panel').innerText()).slice(0,1200),submissionRequests,
        controls:await scope.locator('input,select,textarea').evaluateAll(elements=>elements.map(el=>({id:el.id,name:el.name,type:el.type,filled:Boolean(el.value),label:el.getAttribute('aria-label'),parent:el.parentElement.className,section:el.parentElement.parentElement?.className})))});
      if(name.endsWith('hosted') || name==='ashby-embed') {
        await page.locator('[data-tab=debug]').click();
        const download=page.waitForEvent('download');await page.locator('#kr-capture-fixture').click();
        const capture=name==='greenhouse-hosted'?'greenhouse-promptio-captured.html':name==='ashby-hosted'?'ashby-sift-captured.html':'ashby-cursor-embed-captured.html';
        await (await download).saveAs(path.resolve('fixtures',capture));
        report.at(-1).capture=`fixtures/${capture}`;
      }
    } catch(error) {report.push({name,url,error:error.message,body:(await page.locator('body').innerText()).slice(0,1200),pageErrors:pageErrors.slice(0,12),submissionRequests});}
    finally {await page.close();}
    const entry=report.at(-1);console.log(JSON.stringify({name:entry.name,url:entry.url,error:entry.error,after:entry.after,submissionRequests:entry.submissionRequests,capture:entry.capture}));
  }
} finally {
  fs.writeFileSync(path.resolve('docs/plans/2026-09-30-greenhouse-ashby-live.json'),JSON.stringify(report,null,2));
  await context.close();
  fs.rmSync(temporary,{recursive:true,force:true});
}
