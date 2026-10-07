import {test,expect} from './support/fixtures.js';
import path from 'node:path';
import fs from 'node:fs';
const pages=[
  ['greenhouse-mthree-recovery','https://job-boards.greenhouse.io/mthreerecruitingportal/jobs/4595152006'],
  ['ashby-fellow-recovery','https://jobs.ashbyhq.com/fellowai/f932dda0-8ad0-45d6-a327-d2143b7d82aa/application'],
  ['workday-ciena-recovery','https://ciena.wd5.myworkdayjobs.com/en-US/Careers/job/Ottawa/Embedded-Software-Engineer---New-Grad_R031571/apply'],
];
for(const [name,url] of pages)test(`read-only live capture: ${name}`,async({kr})=>{
  test.skip(process.env.KR_LIVE_WORKFLOW_CAPTURE!=='1','Explicit diagnostic run only; no application filling or submission.');
  const page=await kr.context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await kr.openPanel(page);
  const signals=await page.evaluate(()=>[...document.querySelectorAll('[role=progressbar],[aria-busy=true]')].map(element=>{const ancestors=[];for(let node=element;node&&ancestors.length<5;node=node.parentElement){const style=getComputedStyle(node);ancestors.push({tag:node.tagName,cls:node.className,state:node.getAttribute('data-state'),display:style.display,visibility:style.visibility,opacity:style.opacity});}return ancestors;}));
  fs.writeFileSync(path.join(process.cwd(),'scratch','regression-debug',`${name}-signals.json`),JSON.stringify(signals,null,2));
  await page.locator('[data-tab=debug]').click();
  const downloading=page.waitForEvent('download');
  await page.locator('#kr-capture-fixture').click();
  const download=await downloading;
  await download.saveAs(path.join(process.cwd(),'fixtures',`${name}-captured.html`));
  expect(fs.readFileSync(path.join(process.cwd(),'fixtures',`${name}-captured.html`),'utf8')).toContain('Kareer captured fixture');
});
