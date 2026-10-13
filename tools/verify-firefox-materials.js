// Real Firefox extension smoke. Mock credentials and probes exist only in a temporary copy.
import webExt from 'web-ext';
import { firefox } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kareer-firefox-materials-'));
const source = path.join(temporary, 'extension');
fs.cpSync(path.resolve('dist/firefox'), source, { recursive: true });
const results = [];
const waitCode = `const wait=async test=>{const end=Date.now()+45000;while(Date.now()<end){if(await test())return;await new Promise(r=>setTimeout(r,100));}throw Error('Firefox materials smoke timeout');};`;
const harness = `<script>(async()=>{${waitCode}
let stage='panel';
try{
 await wait(()=>document.querySelector('#kareer-root')?.shadowRoot?.querySelector('#kr-pebble-toggle-btn, #kr-toggle-btn'));
 const root=document.querySelector('#kareer-root').shadowRoot;
 if(root.querySelector('.kr-pebble'))root.querySelector('#kr-pebble-toggle-btn').click();
 if(!root.querySelector('#kr-main-panel'))root.querySelector('#kr-toggle-btn').click();
 await wait(()=>root.querySelector('#kr-tailor-resume'));
 stage='resume';
 root.querySelector('#kr-tailor-resume').click();
 await wait(()=>root.querySelector('#kr-material-resume-status')?.textContent.includes('Ready'));
 stage='letter';
 root.querySelector('#kr-generate-cover-letter').click();
 await wait(()=>root.querySelector('#kr-material-coverLetter-status')?.textContent.includes('Ready'));
 stage='upload';
 root.querySelector('#kr-autofill-btn').click();
 await wait(()=>document.querySelector('#resume').files.length&&document.querySelector('#cover').files.length);
 await fetch('/result',{method:'POST',body:JSON.stringify({surface:'application',resume:new TextDecoder().decode((await document.querySelector('#resume').files[0].arrayBuffer()).slice(0,5)),letter:new TextDecoder().decode((await document.querySelector('#cover').files[0].arrayBuffer()).slice(0,5)),text:document.querySelector('#letter-text').value.includes('I build APIs')})});
 root.querySelector('[data-material-open="resume"]').click();
}catch(error){const root=document.querySelector('#kareer-root')?.shadowRoot;await fetch('/result',{method:'POST',body:JSON.stringify({surface:'application',stage,error:error.message,buttons:[...root?.querySelectorAll('button')||[]].map(b=>b.id),resume:root?.querySelector('#kr-material-resume-status')?.textContent,letter:root?.querySelector('#kr-material-coverLetter-status')?.textContent})});}
})();</script>`;
const server = http.createServer((req, res) => {
  if (req.url === '/result') { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => { results.push(JSON.parse(body)); console.log(body); res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(fs.readFileSync('fixtures/materials-fixture.html', 'utf8').replace('</body>', harness + '</body>'));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = { fullName: 'Test Applicant', email: 'test@example.com', resumeContext: '', workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Acme', description: 'Built APIs.' }], skills: ['JavaScript'] };
fs.writeFileSync(path.join(source, 'smoke.js'), `(async()=>{
 if((await browser.storage.local.get('smokeStarted')).smokeStarted)return;
 await browser.storage.local.set({smokeStarted:true});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(url,options)=>{
  if(String(url).startsWith('https://openrouter.ai/')){
   const body=JSON.parse(options.body),input=JSON.parse(body.messages.at(-1).content);
   const value=input.kind==='resume'?{summary:'API engineer',sections:input.source.sections.map(s=>({id:s.id,bullets:s.bullets}))}:input.kind==='coverLetter'?{paragraphs:['Dear Hiring Team,','I build APIs.','Sincerely, Test Applicant']}:{answers:(input.fieldsToFill||[]).map(f=>({fieldId:f.fieldId,value:f.type==='email'?'test@example.com':'Test Applicant'}))};
   return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{headers:{'Content-Type':'application/json'}}));
  }return originalFetch(url,options);
 };
 await browser.storage.local.set({'kr:settings':{autoContinue:false,autoSubmit:false},'kr:secrets':{apiKey:'smoke-test'},'kr:profile':${JSON.stringify(profile)}});
 await browser.tabs.create({url:${JSON.stringify(base)}});
})();`);
fs.writeFileSync(path.join(source, 'materials', 'smoke-ui.js'), `(async()=>{${waitCode}
try{
 await wait(()=>document.querySelector('.document-content')&&!document.querySelector('#generate').disabled);
 document.querySelector('#proof-toggle').click(); await wait(()=>document.querySelector('#pdf-preview canvas')); document.querySelector('#proof-toggle').click();
 const send=(operation,input={})=>browser.runtime.sendMessage({type:'kr:materials',operation,input});
 const records=await send('list'), record=await send('get',{id:records.find(r=>r.kind==='resume').id});
 const summary=document.querySelector('#resume-summary'), editor=document.querySelector('.document-content').editor;
 const section=editor.state.doc.content.content.find(n=>n.attrs.id==='summary');
 editor.commands.insertContentAt({from:1,to:section.nodeSize-1},[{type:'paragraph',content:[{type:'text',text:'My Firefox draft.'}]}]);
 document.querySelector('#view-prepare').click();document.querySelector('#view-edit').click();
 if(summary.textContent!=='My Firefox draft.')throw Error('Tabs lost the draft');
 document.querySelector('#download-toggle').click(); document.querySelector('[data-download="docx"]').click();
 await wait(()=>document.querySelector('#feedback').textContent.includes('Downloaded'));
 const saved=await send('get',{id:record.id});if(saved.model.summary!=='My Firefox draft.')throw Error('Download did not save the draft');
 document.querySelector('[data-editor-section="work1"]').click();
 if(document.querySelectorAll('.material-section').length<2)throw Error('Continuous document sections are missing');
 document.querySelector('#proof-toggle').click();await wait(()=>document.querySelector('#pdf-preview canvas'));
 if(document.querySelector('#base-file, #changes-section'))throw Error('Obsolete workflow is visible');
 await fetch(${JSON.stringify(base + '/result')},{method:'POST',body:JSON.stringify({surface:'workspace',preview:document.querySelectorAll('#pdf-preview canvas').length,pdf:atob(saved.files.pdf.data).slice(0,5),word:atob(saved.files.docx.data).slice(0,2),edits:true})});
}catch(error){await fetch(${JSON.stringify(base + '/result')},{method:'POST',body:JSON.stringify({surface:'workspace',error:error.message,feedback:document.querySelector('#feedback').textContent})});}
})();`);
const htmlPath = path.join(source, 'materials', 'index.html');
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8').replace('</body>', '<script src="smoke-ui.js"></script></body>'));
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json')));
manifest.background.scripts.push('smoke.js');
fs.writeFileSync(path.join(source, 'manifest.json'), JSON.stringify(manifest));
let runner;
try {
  runner = await webExt.cmd.run({ sourceDir: source, artifactsDir: path.join(temporary, 'artifacts'), firefox: firefox.executablePath(), args: ['-headless'], noReload: true, noInput: true, target: ['firefox-desktop'] }, { shouldExitProgram: false });
  const deadline = Date.now() + 100000;
  while (results.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(results.length, 2, 'Firefox did not return application and workspace results');
  assert.deepEqual(results.find(r => r.surface === 'application'), { surface: 'application', resume: '%PDF-', letter: '%PDF-', text: true });
  assert.deepEqual(results.find(r => r.surface === 'workspace'), { surface: 'workspace', preview: 1, pdf: '%PDF-', word: 'PK', edits: true });
  console.log('Firefox materials smoke passed: generation, uploads, letter text, preview, inline editing, PDF proof and download saves.');
} finally {
  await runner?.exit(); server.close();
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temporary, { recursive: true, force: true });
}
