import {test,expect,ASHBY_HOST,GREENHOUSE_HOST,WORKDAY_HOST} from './support/fixtures.js';
const settings={autoContinue:false,autoSubmit:false};
const profile={fullName:'Test Applicant',email:'test@example.com',linkedin:'https://linkedin.com/in/test',resumeContext:'Test applicant',phone:'+14165550199',city:'Toronto',country:'Canada'};

test('captured Fellow Ashby parser hands off its cleared file to the Resume attachment and autofill continues',async({kr})=>{
  await kr.seed({profile,settings,resume:{name:'resume.pdf',type:'application/pdf',contents:'%PDF-1.4 test'}});
  const page=await kr.context.newPage();
  page.on('console',message=>{kr._consoleLog=(kr._consoleLog||'')+message.text()+'\n';});
  await page.goto(kr.fixtureUrl('ashby-fellow-recovery-captured.html',ASHBY_HOST));
  await page.evaluate(()=>{
    // Debug captures preserve data-state but omit the site's external CSS.
    document.querySelectorAll('[data-state=hidden]').forEach(node=>{node.hidden=true;});
    const parser=document.querySelector('.ashby-application-form-autofill-input-root');
    const entries=['_systemfield_name','_systemfield_email','_systemfield_resume'].map(id=>document.getElementById(id).closest('.ashby-application-form-field-entry'));
    document.querySelector('[aria-labelledby="job-application-form"]').replaceChildren(parser,...entries);
    const input=parser.querySelector('input[type=file]');
    input.onchange=()=>{
      const name=input.files[0].name;
      parser.dataset.state='processing';parser.setAttribute('aria-busy','true');
      setTimeout(()=>{
        Object.defineProperty(input,'files',{value:new DataTransfer().files,configurable:true});
        const resume=document.getElementById('_systemfield_resume');resume.required=false;
        resume.closest('.ashby-application-form-input-file').insertAdjacentHTML('beforeend',`<div class="ashby-application-form-input-file-filename">${name}</div><button type="button">Replace</button>`);
        parser.dataset.state='default';parser.removeAttribute('aria-busy');
        parser.insertAdjacentHTML('beforeend','<div role="status">Autofill completed! Please review the information below.</div>');
        document.body.dataset.parse='complete';
      },400);
    };
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:30000});
  await expect(page.locator('#_systemfield_email')).toHaveValue(profile.email);
  await expect(page.locator('body')).toHaveAttribute('data-parse','complete');
  await expect(page.locator('.ashby-application-form-input-file-filename')).toHaveText('resume.pdf');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('captured mthree disabled consent survives a saved pause and Resume finishes the page',async({kr})=>{
  await kr.seed({profile,settings});
  const page=await kr.context.newPage();
  page.on('console',message=>{kr._consoleLog=(kr._consoleLog||'')+message.text()+'\n';});
  await page.goto(kr.fixtureUrl('greenhouse-mthree-recovery-captured.html',GREENHOUSE_HOST));
  await page.evaluate(()=>{
    const email=document.getElementById('email').closest('.text-input-wrapper');
    const consent=document.getElementById('gdpr_retention_consent_given_1');
    const wrapper=consent.closest('.checkbox');
    consent.disabled=false;consent.required=false;
    document.querySelector('form').replaceChildren(email,wrapper);
    document.querySelector('#email').oninput=()=>{consent.disabled=true;};
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('These fields became disabled:',{timeout:25000});
  const ids=await kr.readStorage('kr:sessions');
  const saved=await kr.readStorage(`kr:sessions:${ids[0]}`);expect(saved.reason).toContain('These fields became disabled:');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.');
  await expect(page.locator('#email')).toHaveValue(profile.email);
  expect(kr.openrouter.requests.length).toBeLessThanOrEqual(1);
});

test('Workday button-only application questions fill and Resume does not report a listing',async({kr})=>{
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:field.label.includes('graduation')?'Less than one year':field.label.includes('GPA')?'80% or higher':'Yes'}))})}}]});
  await kr.seed({profile:{...profile,savedAnswers:{'Have you uploaded your most recent transcript?':'Yes','How long ago was your date of graduation?':'Less than one year','What is your GPA as a percentage?':'80% or higher','Are you legally entitled to work in Canada?':'Yes'}},settings});
  const page=await kr.context.newPage();
  page.on('console',message=>{kr._consoleLog=(kr._consoleLog||'')+message.text()+'\n';});await page.goto(kr.fixtureUrl('workday-ciena-questions-replay.html',WORKDAY_HOST));
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('#transcript')).toHaveText('Yes');await expect(page.locator('#graduation')).toHaveText('Less than one year');
  await expect(page.locator('#gpa')).toHaveText('80% or higher');await expect(page.locator('#workauth')).toHaveText('Yes');
  const requestCount=kr.openrouter.requests.length;
  await page.locator('#kr-rescan-btn').click();await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.');
  expect(kr.openrouter.requests.length).toBe(requestCount);
});

test('exact captured Ciena questions fill without misclassification and rescan preserves the current step',async({kr})=>{
  await kr.seed({profile,settings});
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:field.label.includes('graduation')?'Less than one year':field.label.includes('GPA')?'80% or higher':'Yes'}))})}}]});
  const page=await kr.context.newPage();
  page.on('console',message=>{kr._consoleLog=(kr._consoleLog||'')+message.text()+'\n';});
  await page.goto(kr.fixtureUrl('ciena.wd5.myworkdayjobs.com-2026-10-07-03-13.html',WORKDAY_HOST));
  await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('button[id^="primaryQuestionnaire--"][aria-haspopup=listbox]')];
    const popup=document.createElement('div');popup.setAttribute('data-automation-id','activeListContainer');popup.hidden=true;document.body.append(popup);
    document.body.addEventListener('mousedown',event=>{if(event.target===document.body){popup.hidden=true;buttons.forEach(button=>button.setAttribute('aria-expanded','false'));}});
    for(const [index,button] of buttons.entries())button.onclick=()=>{
      popup.hidden=false;button.setAttribute('aria-expanded','true');
      const labels=index===1?['Less than one year','More than one year']:index===2?['80% or higher','Below 80%']:['Yes','No'];
      popup.replaceChildren(...labels.map(label=>{const option=document.createElement('div');option.setAttribute('role','option');option.textContent=label;option.onmousedown=()=>{button.textContent=label;button.value=label;button.setAttribute('aria-expanded','false');popup.hidden=true;};return option;}));
    };
    const next=document.querySelector('[data-automation-id="pageFooterNextButton"],[data-automation-id="bottom-navigation-next-button"]');
    next.onclick=()=>{document.body.dataset.unexpectedNavigation='true';};
  });
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  expect(await page.locator('button[id^="primaryQuestionnaire--"]').allTextContents()).toEqual(['Yes','Less than one year','80% or higher','Yes']);
  await page.locator('#kr-rescan-btn').click();await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.');
  await expect(page.locator('body')).not.toHaveAttribute('data-unexpected-navigation','true');
});
