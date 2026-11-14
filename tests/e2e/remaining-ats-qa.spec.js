import {test,expect,GREENHOUSE_HOST,WORKDAY_HOST} from './support/fixtures.js';
import fs from 'node:fs';

const settings={autoContinue:false,autoSubmit:false};
const profile={fullName:'Test Applicant',email:'test@example.com',phone:'+14165550199',city:'Toronto',country:'Canada'};

test('captured paginated Greenhouse school resolves Guelph and retries the partial row without Add',async({kr})=>{
  await kr.seed({profile:{...profile,education:[{id:'edu',institution:'university of guelph',degree:'Bachelor of Engineering'}]},settings});
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:'B.E/ B.Tech',inferred:true}))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-mthree-school-first-page-captured.html',GREENHOUSE_HOST));
  page.on('console',message=>{kr._consoleLog=(kr._consoleLog||'')+message.text()+'\n';});
  await page.evaluate(searchedHtml=>{
    const searched=new DOMParser().parseFromString(searchedHtml,'text/html');
    const input=document.getElementById('school--0');
    const first=[...input.closest('.select').querySelectorAll('[role=option]')].map(n=>n.textContent);
    const found=[...searched.getElementById('school--0').closest('.select').querySelectorAll('[role=option]')].map(n=>n.textContent);
    window.qa={first,found,adds:0,queries:[],allowSchool:false};
    const section=document.querySelector('.education--container'),row=section.querySelector('.education--form'),add=section.querySelector('.add-another-button');
    row.replaceChildren(...['school--0','degree--0'].map(id=>document.getElementById(id).closest('.select')));document.querySelector('form').replaceChildren(section);
    add.onclick=()=>{window.qa.adds++;row.after(row.cloneNode(true));};
    for(const id of ['school--0','degree--0']){
      const control=document.getElementById(id),shell=control.closest('.select-shell');
      shell.querySelectorAll('.select__menu').forEach(n=>n.remove());control.setAttribute('aria-expanded','false');
      const menu=document.createElement('div');menu.id=id+'-menu';menu.setAttribute('role','listbox');menu.hidden=true;shell.append(menu);control.setAttribute('aria-controls',menu.id);
      const close=()=>{menu.hidden=true;control.setAttribute('aria-expanded','false');};
      const render=()=>{
        menu.hidden=false;control.setAttribute('aria-expanded','true');
        const labels=id==='degree--0'?['B.E/ B.Tech','Master']:control.value?found:first;
        menu.replaceChildren(...labels.map(label=>{const option=document.createElement('div');option.setAttribute('role','option');option.textContent=label;option.onmousedown=()=>{
          if(id==='school--0' && !window.qa.allowSchool)return;
          let value=shell.querySelector('.select__single-value');if(!value){value=document.createElement('div');value.className='select__single-value';shell.append(value);}value.textContent=label;
          shell.querySelector('.select__placeholder')?.remove();shell.querySelector('input[aria-hidden=true]')?.remove();control.value='';close();
        };return option;}));
      };
      shell.querySelector('button[aria-label="Toggle flyout"]').onclick=()=>{if(menu.hidden)render();else close();};
      control.oninput=()=>{window.qa.queries.push({id,value:control.value});if(!menu.hidden)render();};control.onkeydown=event=>{if(event.key==='Escape')close();};
    }
  },fs.readFileSync('fixtures/greenhouse-mthree-school-guelph-captured.html','utf8'));
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Repair limit reached',{timeout:60000});
  await expect(page.locator('.select__single-value')).toHaveText(['B.E/ B.Tech']);
  const primary=JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;expect(primary).toHaveLength(1);expect(primary[0].label).toBe('Degree');
  const before=await page.evaluate(()=>window.qa);expect(before.first).toHaveLength(100);expect(before.first).not.toContain('University of Guelph');expect(before.found).toEqual(['University of Guelph']);
  await page.evaluate(()=>{window.qa.allowSchool=true;});
  await page.locator('#kr-autofill-btn').click();await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('.education--form')).toHaveCount(1);expect(await page.evaluate(()=>window.qa.adds)).toBe(0);
  await expect(page.locator('.select__single-value').first()).toHaveText('University of Guelph');
  await expect(page.locator('#kr-main-panel')).not.toContainText('Ambiguous duplicate field IDs');
});

test('captured Workday pills stay separate from skills results and asynchronous cleared-file upload verifies',async({kr})=>{
  await kr.seed({profile:{...profile,skills:['Java','JavaScript']},settings,resume:{name:'resume.pdf',type:'application/pdf',contents:'%PDF-1.4 test resume'}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('phreesia.wd1.myworkdayjobs.com-2026-10-06-03-57.html',WORKDAY_HOST));
  await page.evaluate(()=>{
    const study=document.querySelector('input[id$="--fieldOfStudy"]').closest('[data-automation-id^="formField"]');
    const skills=document.querySelector('[data-automation-id="formField-skills"]'),file=document.querySelector('input[type=file]'),upload=file.closest('[data-fkit-id*="resume"]');
    const acceptedItem=upload.querySelector('[data-automation-id="file-upload-item"]').cloneNode(true);upload.querySelector('[data-automation-id="file-upload-item"]').remove();
    const form=document.createElement('form');form.append(study,skills,upload);document.body.replaceChildren(form);window.qa={uploads:0,submits:0,foreignQueries:[]};form.onsubmit=e=>{e.preventDefault();window.qa.submits++;};
    study.querySelector('input').oninput=e=>window.qa.foreignQueries.push(e.target.value);
    const input=skills.querySelector('input'),container=input.closest('[data-automation-id="multiSelectContainer"]'),menu=document.createElement('div');
    menu.setAttribute('data-automation-id','activeListContainer');menu.setAttribute('data-uxi-multiselect-id',input.getAttribute('data-uxi-multiselect-id'));menu.hidden=true;form.append(menu);
    let searched=false;
    container.querySelector('[data-automation-id="promptIcon"]').onclick=()=>{menu.hidden=!menu.hidden;};
    input.oninput=()=>{searched=false;menu.replaceChildren();};
    input.onkeydown=e=>{
      if(e.key!=='Enter')return;
      if(!searched){searched=true;menu.hidden=false;menu.innerHTML=`<div data-automation-id="promptLeafNode"><div data-automation-id="promptOption" data-automation-label="${input.value}">${input.value}</div></div>`;}
      else {const label=menu.textContent;container.insertAdjacentHTML('afterbegin',`<div data-automation-id="selectedItem" title="${label}">${label}</div>`);input.value='';menu.hidden=true;searched=false;}
    };
    file.onchange=()=>{window.qa.uploads++;file.value='';setTimeout(()=>upload.append(acceptedItem),450);};
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('[data-automation-id="formField-skills"] [data-automation-id="selectedItem"]')).toHaveText(['JavaScript','Java']);
  await expect(page.locator('[data-automation-id="selectedItemList"] [data-automation-id="selectedItem"]')).toHaveText('Computer Engineering');
  await expect(page.locator('#skills--skills')).toHaveValue('');expect(await page.locator('input[type=file]').evaluate(input=>input.files.length)).toBe(0);
  await expect(page.locator('.kr-review-item').filter({hasText:'Upload a file'})).toContainText('VERIFIED');
  await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');expect(await page.evaluate(()=>window.qa)).toEqual({uploads:1,submits:0,foreignQueries:[]});
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('Workday retry clears an old failed upload after the page accepts the resume',async({kr})=>{
  await kr.seed({profile,settings});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('phreesia.wd1.myworkdayjobs.com-2026-10-06-03-57.html',WORKDAY_HOST));
  await page.evaluate(()=>{
    const input=document.querySelector('input[type=file]'),upload=input.closest('[data-fkit-id*="resume"]');
    window.acceptedItem=upload.querySelector('[data-automation-id="file-upload-item"]').cloneNode(true);upload.querySelector('[data-automation-id="file-upload-item"]').remove();
    const form=document.createElement('form');form.innerHTML='<h1>Job Application</h1><label for="email">Email</label><input id="email" value="test@example.com">';form.append(upload);document.body.replaceChildren(form);
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({timeout:60000});await expect(page.locator('#kr-main-panel')).toContainText('1 FAILED');
  await page.locator('[data-fkit-id*="resume"]').evaluate(upload=>upload.append(window.acceptedItem));
  await page.locator('#kr-autofill-btn').click();await expect(page.locator('#kr-autofill-btn')).toBeEnabled({timeout:60000});
  await expect(page.locator('.kr-review-item').filter({hasText:'Upload a file'})).toContainText('VERIFIED');await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
});
