// Real Firefox extension smoke. Test seed/probe live only in a temporary copy.
import webExt from 'web-ext';
import {firefox} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kareer-firefox-'));
const source=path.join(temporary,'extension');
fs.cpSync(path.resolve('dist/firefox'),source,{recursive:true});
const results=[];
const harness=`<script>(async()=>{
 const wait=async test=>{const end=Date.now()+45000;while(Date.now()<end){if(test())return;await new Promise(r=>setTimeout(r,100));}throw Error('Firefox smoke timeout');};
 const ats=new URLSearchParams(location.search).get('ats');
 try{
  await wait(()=>document.querySelector('#kareer-root')?.shadowRoot?.querySelector('#kr-toggle-btn'));
  const root=document.querySelector('#kareer-root').shadowRoot;
  if(!root.querySelector('#kr-main-panel'))root.querySelector('#kr-toggle-btn').click();
  await wait(()=>root.querySelector('#kr-autofill-btn')&&!root.querySelector('#kr-autofill-btn').disabled);
  root.querySelector('#kr-autofill-btn').click();
  await wait(()=>root.textContent.includes('Page filled. Auto Continue is off.'));
  await fetch('/result',{method:'POST',body:JSON.stringify({ats,name:document.querySelector('#first_name').value,email:document.querySelector('#email').value,rows:document.querySelectorAll('.education').length,submissions:document.body.dataset.submissions,panels:document.querySelectorAll('#kareer-root').length})});
 }catch(error){await fetch('/result',{method:'POST',body:JSON.stringify({ats,error:error.message,panel:document.querySelector('#kareer-root')?.shadowRoot?.textContent.slice(-800)})});}
})();</script>`;
const server=http.createServer((req,res)=>{
 if(req.url==='/result') {let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{results.push(JSON.parse(body));console.log(body);res.end('ok');});return;}
 res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('fixtures/greenhouse-ashby-workflow.html','utf8').replace('</body>',harness+'</body>'));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const profile={fullName:'Test Applicant',email:'test@example.com',country:'Canada',education:[{id:'a',institution:'School A',degree:'Bachelor'},{id:'b',institution:'School B',degree:'Master'}],savedAnswers:{'Why this company?':'Saved response.'}};
fs.writeFileSync(path.join(source,'smoke.js'),`(async()=>{await browser.storage.local.set({'kr:settings':{autoContinue:false,autoSubmit:false},'kr:profile':${JSON.stringify(profile)}});for(const ats of ['greenhouse','ashby'])await browser.tabs.create({url:${JSON.stringify(base)}+'/?ats='+ats});})();`);
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
manifest.background.scripts.push('smoke.js');
fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify(manifest));
let runner;
try {
 runner=await webExt.cmd.run({sourceDir:source,artifactsDir:path.join(temporary,'artifacts'),firefox:firefox.executablePath(),args:['-headless'],noReload:true,noInput:true,target:['firefox-desktop']},{shouldExitProgram:false});
 const deadline=Date.now()+60000;
 while(results.length<2 && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));
 assert.equal(results.length,2,'Firefox smoke did not return both ATS results');
 for(const result of results)assert.deepEqual(result,{ats:result.ats,name:'Test',email:'test@example.com',rows:2,submissions:'0',panels:1});
 console.log('Firefox extension smoke: Greenhouse and Ashby passed.');
} finally {
 await runner?.exit();server.close();
 assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));
 fs.rmSync(temporary,{recursive:true,force:true});
}
