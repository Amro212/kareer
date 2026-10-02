import {test,expect,ASHBY_HOST,GREENHOUSE_HOST} from './support/fixtures.js';

const PROFILE={fullName:'Test Applicant',email:'test@example.com',phone:'+1 416 555 0199',country:'Canada',city:'Milton',stateProvince:'Ontario',location:'Milton, Ontario, Canada',education:[],disabilityStatus:'No'};

test('embedded late degree discovery resolves an equivalent owned option without another click',async({kr})=>{
  await kr.seed({profile:{...PROFILE,educationLevel:'Bachelor'},settings:{autoContinue:false,autoSubmit:false}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ats=ashby'));
  const frame=page.frameLocator('iframe');
  await frame.locator('form').evaluate(form=>{
    form.innerHTML='<div class="ashby-application-form-field-entry"><label for="highestDegree" class="ashby-application-form-question-title _required_">Highest degree</label><div class="select-shell"><input id="highestDegree" role="combobox" aria-controls="late-degree-menu" required><div id="late-degree-menu" role="listbox" hidden></div></div></div>';
    const input=form.querySelector('input'),menu=form.querySelector('[role=listbox]');let searches=0;
    input.addEventListener('input',()=>{if(input.value==='Bachelor' && ++searches>=2){menu.innerHTML='<div role="option">Bachelor degree</div>';menu.firstElementChild.addEventListener('mousedown',()=>{input.value=menu.textContent;menu.hidden=true;input.setAttribute('aria-expanded','false');});}});
    input.addEventListener('mousedown',()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');});
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;input.setAttribute('aria-expanded','false');}});
  });
  await kr.openPanel(page);await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');await page.locator('#kr-autofill-btn').click();
  await expect(frame.locator('#highestDegree')).toHaveValue('Bachelor degree',{timeout:60000});
  await expect(page.locator('#kr-main-panel')).toContainText('Embedded page filled. Review the application before proceeding.');
  expect(kr.openrouter.requests).toHaveLength(1);
});

test('required canonical answer can recover through bounded contextual repair',async({kr})=>{
  await kr.seed({profile:{...PROFILE,email:'',applicantNotes:'My email is test@example.com.'},settings:{autoContinue:false,autoSubmit:false}});
  kr.openrouter.handler=(body,count)=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:count===1?'':'test@example.com',inferred:true}))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',ASHBY_HOST,'?ats=ashby'));
  await page.locator('form').evaluate(form=>{form.innerHTML='<label for="email">Email</label><input id="email" type="email" required>';});
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('#email')).toHaveValue('test@example.com');
  expect(kr.openrouter.requests).toHaveLength(2);
});

test('captured 1Password radio and multi-checkbox questions accept distinct owned answers',async({kr})=>{
  await kr.seed({profile:PROFILE,settings:{autoContinue:false,autoSubmit:false}});
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({
    fieldId:field.fieldId,value:field.ats?.multiple ? field.options.slice(0,2).map(option=>option.label) : ['radio','select','combobox'].includes(field.type) ? field.options?.[1]?.label || field.options?.[0]?.label || '' : field.type==='checkbox' ? true : 'Synthetic test response',inferred:true,
  }))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ashby-1password-2026-10-02-captured.html',ASHBY_HOST));await kr.openPanel(page);
  // Replay the captured choice controls; unrelated uploads/typeaheads need site scripts.
  await page.locator('.ashby-application-form,[aria-labelledby="job-application-form"]').first().evaluate(form=>{
    form.setAttribute('data-ashby-root',''); // Preserve ATS identity on the local, non-Ashby fixture host.
    form.replaceChildren(...[...form.querySelectorAll('.ashby-application-form-input-radio-group,.ashby-application-form-input-checkbox-group')].filter(group=>group.querySelectorAll('input').length>1));
  });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('.ashby-application-form-input-radio-group input:checked')).toHaveCount(8,{timeout:60000});
  const languages=page.locator('.ashby-application-form-input-checkbox-group').filter({hasText:'Which lanugages'});
  await expect(languages.locator('input:checked')).toHaveCount(2);
  const background=page.locator('.ashby-application-form-input-checkbox-group').filter({hasText:'racial or ethnic background'});
  await expect(background.locator('input:checked')).toHaveCount(2);
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  expect(kr.openrouter.requests).toHaveLength(1);
  const fields=JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;
  expect(fields.find(field=>field.label.includes('lanugages')).options).toHaveLength(8);
  expect(fields.some(field=>field.label==='Typescript')).toBe(false);
});

test('captured Reddit phone formatting and committed city remain verified',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:false,autoSubmit:false}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-reddit-captured.html',GREENHOUSE_HOST));
  // The Debug capture strips the external intl-tel stylesheet; replay its hide rule.
  await page.addStyleTag({content:'.iti__hide { display: none !important; }'});
  await page.evaluate(()=>{
    const phone=document.querySelector('#phone');
    const phoneField=phone.closest('.phone-input');
    phoneField.replaceChildren(phone.closest('.phone-input__phone'));
    const locationField=document.querySelector('#candidate-location').closest('.select__container');
    document.querySelector('form').replaceChildren(phoneField,locationField);
    phone.addEventListener('input',()=>{const digits=phone.value.replace(/\D/g,'').slice(-10);if(digits.length===10)phone.value=`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;});
    const input=document.querySelector('#candidate-location'),shell=input.closest('.select-shell,.select__container');
    const menu=document.createElement('div');menu.id='captured-city-menu';menu.setAttribute('role','listbox');menu.hidden=true;
    menu.innerHTML='<div role="option">Milton, Ontario, Canada</div>';shell.append(menu);input.setAttribute('aria-controls',menu.id);
    const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false');};
    input.addEventListener('mousedown',()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');});
    input.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    menu.firstElementChild.addEventListener('mousedown',()=>{let value=shell.querySelector('.select__single-value');if(!value){value=document.createElement('div');value.className='select__single-value';shell.append(value);}value.textContent=menu.textContent;input.value='';close();});
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#phone')).toHaveValue('(416) 555-0199',{timeout:60000});
  await expect(page.locator('#candidate-location').locator('xpath=ancestor::*[contains(@class,"select-shell")][1]').locator('.select__single-value')).toHaveText('Milton, Ontario, Canada');
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  const rows=page.locator('.kr-review-item');
  await expect(rows.filter({hasText:'Phone'})).toContainText('VERIFIED');
  await expect(rows.filter({hasText:'Location (City)'})).toContainText('VERIFIED');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('required harvested equivalent degree uses one contextual page request',async({kr})=>{
  await kr.seed({profile:{...PROFILE,educationLevel:'Bachelor'},settings:{autoContinue:false,autoSubmit:false}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',ASHBY_HOST,'?ats=ashby'));
  await page.locator('form').evaluate(form=>{
    form.innerHTML='<div class="ashby-application-form-field-entry"><label for="highestDegree" class="ashby-application-form-question-title _required_">Highest degree</label><div class="select-shell"><input id="highestDegree" role="combobox" aria-controls="degree-menu" required><div id="degree-menu" role="listbox" hidden><div role="option">Bachelor degree</div></div></div></div>';
    const input=form.querySelector('input'),menu=form.querySelector('[role=listbox]');
    input.addEventListener('mousedown',()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');});
    input.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;input.setAttribute('aria-expanded','false');}});
    menu.firstElementChild.addEventListener('mousedown',()=>{input.value=menu.textContent;menu.hidden=true;input.setAttribute('aria-expanded','false');});
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('#highestDegree')).toHaveValue('Bachelor degree');
  expect(kr.openrouter.requests).toHaveLength(1);
});
