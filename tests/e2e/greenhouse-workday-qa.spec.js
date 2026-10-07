import {test,expect,GREENHOUSE_HOST,WORKDAY_HOST} from './support/fixtures.js';

const settings={autoContinue:false,autoSubmit:false};

for(const numbered of [false,true]) test(`captured Greenhouse education harvests choices before matching ${numbered?'numbered':'named'} months`,async({kr})=>{
  await kr.seed({profile:{fullName:'Test Applicant',education:[{id:'education',institution:'Test University',degree:'Bachelor of Engineering',startDate:'2020-02',endDate:'2024-06'}]},settings});
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:'Bachelor degree',inferred:true}))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('job-boards.greenhouse.io-2026-10-06-03-13.html',GREENHOUSE_HOST));
  await page.evaluate(numbered=>{
    const section=document.querySelector('.education--container');
    const ids=['school--0','degree--0','start-month--0','end-month--0'];
    const row=section.querySelector('.education--form');row.replaceChildren(...ids.map(id=>document.getElementById(id).closest('.select')));
    document.querySelector('form').replaceChildren(section);
    window.qa={queries:[],submits:0};document.querySelector('form').onsubmit=event=>{window.qa.submits++;event.preventDefault();};
    const months=numbered?['01','02','03','04','05','06','07','08','09','10','11','12']:['January','February','March','April','May','June','July','August','September','October','November','December'];
    const choices={'school--0':['Test University','Other'],'degree--0':['Bachelor degree','Master degree'],'start-month--0':months,'end-month--0':months};
    for(const id of ids){
      const input=document.getElementById(id),shell=input.closest('.select-shell');
      const menu=document.createElement('div');menu.id=id+'-menu';menu.setAttribute('role','listbox');menu.hidden=true;shell.append(menu);input.setAttribute('aria-controls',menu.id);
      const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false');};
      const render=()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');menu.replaceChildren(...choices[id].filter(label=>label.toLowerCase().includes(input.value.toLowerCase())).map(label=>{const option=document.createElement('div');option.setAttribute('role','option');option.textContent=label;option.onmousedown=()=>{let value=shell.querySelector('.select__single-value');if(!value){value=document.createElement('div');value.className='select__single-value';shell.append(value);}value.textContent=label;shell.querySelector('.select__placeholder')?.remove();shell.querySelector('input[aria-hidden=true]')?.remove();input.value='';close();};return option;}));};
      input.onmousedown=render;input.oninput=()=>{window.qa.queries.push({id,value:input.value});render();};input.onkeydown=event=>{if(event.key==='Escape')close();};
    }
  },numbered);
  await kr.openPanel(page);const started=Date.now();await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('.select__single-value')).toHaveText(['Test University','Bachelor degree',numbered?'02':'February',numbered?'06':'June']);
  const qa=await page.evaluate(()=>window.qa);expect(qa.submits).toBe(0);expect(qa.queries.some(query=>query.value==='Bachelor of Engineering'||['02','06'].includes(query.value))).toBe(false);
  expect(kr.openrouter.requests).toHaveLength(1);
  const fields=JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;
  expect(fields).toHaveLength(1);expect(fields[0].options.map(option=>option.label)).toEqual(['Bachelor degree','Master degree']);
  expect(Date.now()-started).toBeLessThan(15000); // No eight-second failed searches per menu.
});

test('required-field repair leaves no historical warning after all current fields succeed',async({kr})=>{
  await kr.seed({profile:{fullName:'Test Applicant',email:'',applicantNotes:'Email is test@example.com.'},settings});
  kr.openrouter.handler=(body,count)=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:count===1?'':'test@example.com',inferred:true}))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('job-boards.greenhouse.io-2026-10-06-03-13.html',GREENHOUSE_HOST));
  await page.locator('form').evaluate(form=>{form.innerHTML='<label for="email">Email *</label><input id="email" type="email" required>';});
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
  await expect(page.locator('#kr-main-panel')).not.toContainText('Required value missing or rejected.');
  expect(kr.openrouter.requests).toHaveLength(2);
});

test('captured Phreesia skills commit by second Enter and generic resume uploader attaches',async({kr})=>{
  await kr.seed({profile:{fullName:'Test Applicant',skills:['Python','Java','JavaScript']},settings,resume:{name:'resume.pdf',type:'application/pdf',contents:'%PDF-1.4 fixture resume'}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('phreesia.wd1.myworkdayjobs.com-2026-10-06-03-17.html',WORKDAY_HOST));
  await page.evaluate(()=>{
    const skills=document.querySelector('[data-automation-id="formField-skills"]'),file=document.querySelector('input[type=file]'),upload=file.closest('[data-fkit-id*="resume"]');
    const form=document.createElement('form');form.append(skills,upload);document.body.replaceChildren(form);
    // Debug removes site handlers. Replay the reported keyboard search/commit events.
    window.qa={submits:0,uploads:0};form.onsubmit=event=>{window.qa.submits++;event.preventDefault();};
    const input=document.getElementById('skills--skills'),container=input.closest('[data-automation-id="multiSelectContainer"]');
    container.insertAdjacentHTML('afterbegin','<div data-automation-id="selectedItem" title="Python">Python</div>');
    const menu=document.createElement('div');menu.id='skills-menu';menu.setAttribute('role','listbox');menu.hidden=true;container.append(menu);input.setAttribute('aria-controls',menu.id);
    let searched=false;input.oninput=()=>{searched=false;menu.hidden=true;};
    input.onkeydown=event=>{if(event.key!=='Enter')return;if(!searched){searched=true;menu.hidden=false;menu.innerHTML=`<div role="option">${input.value}</div>`;}else{container.insertAdjacentHTML('afterbegin',`<div data-automation-id="selectedItem" title="${menu.textContent}">${menu.textContent}</div>`);input.value='';menu.hidden=true;searched=false;}};
    file.onchange=()=>{window.qa.uploads++;const item=document.createElement('div');item.setAttribute('data-automation-id','file-upload-item');const name=document.createElement('span');name.setAttribute('data-automation-id','file-upload-file-name');name.textContent=file.files[0].name;item.append(name);upload.append(item);};
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('[data-automation-id="selectedItem"]')).toHaveCount(3,{timeout:60000});
  await expect(page.locator('#skills--skills')).toHaveValue('');
  await expect(page.locator('[data-automation-id="file-upload-file-name"]')).toHaveText('resume.pdf');
  await expect(page.locator('.kr-review-item').filter({hasText:'Upload a file'})).toContainText('VERIFIED');
  await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
  await expect(page.locator('#kr-main-panel')).not.toContainText('Required value missing or rejected.');
  expect(await page.evaluate(()=>window.qa)).toEqual({submits:0,uploads:1});expect(kr.openrouter.requests).toHaveLength(0);
  await page.locator('#kr-autofill-btn').click();await expect(page.locator('#kr-autofill-btn')).toBeEnabled({timeout:60000});
  await expect(page.locator('[data-automation-id="selectedItem"]')).toHaveCount(3);expect(await page.evaluate(()=>window.qa.uploads)).toBe(1);
});
