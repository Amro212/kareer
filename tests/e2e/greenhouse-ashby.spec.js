import {test,expect,GREENHOUSE_HOST,ASHBY_HOST,EMBED_HOST} from './support/fixtures.js';

const PROFILE={fullName:'Test Applicant',email:'test@example.com',country:'Canada',additionalUrl:'https://test.example',education:[{id:'a',institution:'School A',degree:'Bachelor'},{id:'b',institution:'School B',degree:'Master'}],savedAnswers:{'Why this company?':'Saved company response.'}};

for(const [ats,host,query] of [['greenhouse',GREENHOUSE_HOST,'?select2'],['greenhouse',GREENHOUSE_HOST,'?modern'],['ashby',ASHBY_HOST,'?ats=ashby']]) {
  test(`${ats}${query} completes saved fields and records without AI or duplicate rows on retry`,async({kr})=>{
    await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:false}});
    const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',host,query));await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
    await expect(page.locator('#first_name')).toHaveValue('Test');await expect(page.locator('#country')).toHaveValue('Canada');
    await expect(page.locator('.education')).toHaveCount(2);await expect(page.locator('.education input').nth(3)).toHaveValue('Master');
    expect(await page.locator('#cover_letter').evaluate(el=>el.files.length)).toBe(0);expect(kr.openrouter.requests).toHaveLength(0);
    await page.reload();await kr.openPanel(page);await page.locator('#kr-capture-job').click();await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('.education')).toHaveCount(2);await expect(page.locator('.education input').nth(3)).toHaveValue('Master');expect(kr.openrouter.requests).toHaveLength(0);
  });
}

for(const ats of ['greenhouse','ashby']) {
  test(`${ats} embedded workflow continues and submits only the local fixture, then detects zero-field success`,async({kr})=>{
    await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:true,autoSubmit:true}});
    const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,`?ats=${ats}`));await kr.openPanel(page);
    await expect(page.locator('#kr-main-panel')).toContainText('embedded frame',{timeout:20000});
    await page.locator('#kr-autofill-btn').click();
    await expect(page.frameLocator(`iframe[src*="${EMBED_HOST}"]`).locator('body')).toHaveAttribute('data-submissions','1',{timeout:60000});
    await expect(page.locator('#kr-main-panel')).toContainText('confirmation',{timeout:20000});expect(kr.openrouter.requests).toHaveLength(0);
    expect(await page.locator('#kareer-root').count()).toBe(1);
  });
}

test('embedded Ashby rediscovers a replacement frame and confirms its local submission',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:true,autoSubmit:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ats=ashby&replace'));await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');await page.locator('#kr-autofill-btn').click();
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-submissions','1',{timeout:60000});
  await expect(page.locator('#kr-main-panel')).toContainText('confirmation');expect(kr.openrouter.requests).toHaveLength(0);
});

test('embedded verification headings allow profile filling and configured submission',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:true,autoSubmit:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ats=ashby&boundary'));await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');await page.locator('#kr-autofill-btn').click();
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-submissions','1',{timeout:60000});
  await expect(page.locator('#kr-main-panel')).toContainText('confirmation');
});

test('embedded submission countdown can be cancelled',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:true,autoSubmit:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ats=ashby'));await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Submitting in',{timeout:60000});await page.locator('#kr-pause-autofill-btn').click();
  await page.waitForTimeout(5500);await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-submissions','0');
});

test('host attestation text does not cancel configured embedded submission',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoContinue:true,autoSubmit:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ats=ashby'));await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Submitting in',{timeout:60000});
  await page.locator('main').evaluate(main=>main.insertAdjacentHTML('beforeend','<p>I certify this application is true and accurate.</p>'));
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-submissions','1',{timeout:15000});
  await expect(page.locator('#kr-main-panel')).toContainText('confirmation');
  expect(kr.openrouter.requests).toHaveLength(0);
});

for (const [ats,host] of [['greenhouse',GREENHOUSE_HOST],['ashby',ASHBY_HOST]]) {
  test(`${ats} exact saved canonical answer and a newly saved email work on hosted retry`,async({kr})=>{
    const profile={...PROFILE,email:'',preferredName:'',savedAnswers:{...PROFILE.savedAnswers,'Preferred First Name':'Alex'}};
    await kr.seed({apiKey:'',profile,settings:{autoContinue:false,overwriteExisting:false}});
    const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',host,`?ats=${ats}`));
    await page.locator('#first_name').fill('User name');
    await page.locator('form').evaluate(form=>form.insertAdjacentHTML('afterbegin','<label for="preferred_first_name">Preferred First Name</label><input id="preferred_first_name" required>'));
    await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Required saved values or documents are unavailable',{timeout:60000});
    await expect(page.locator('#preferred_first_name')).toHaveValue('Alex');await expect(page.locator('#email')).toHaveValue('');
    await page.locator('[data-tab="profile"]').click();await page.locator('#kr-profile-email').fill('new@example.com');
    await page.locator('#kr-profile-form button[type="submit"]').click();await page.locator('[data-tab="home"]').click();await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
    await expect(page.locator('#email')).toHaveValue('new@example.com');await expect(page.locator('#first_name')).toHaveValue('User name');
    await expect(page.locator('.education')).toHaveCount(2);expect(kr.openrouter.requests).toHaveLength(0);
  });

  for (const hasResume of [false,true]) {
    test(`${ats} hidden required resume ${hasResume?'uploads and waits for acceptance':'blocks advancement when unavailable'}`,async({kr})=>{
      await kr.seed({apiKey:'',profile:PROFILE,...(hasResume?{resume:{name:'Resume.pdf',type:'application/pdf',contents:'%PDF-1.4 test'}}:{}),settings:{autoContinue:!hasResume,autoSubmit:!hasResume,overwriteExisting:true}});
      const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',host,`?ats=${ats}&upload&hiddenResume`));await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
      await expect(page.locator('#kr-main-panel')).toContainText(hasResume?'Page filled. Auto Continue is off.':'Required saved values or documents are unavailable',{timeout:60000});
      await expect(page.locator('#accepted-resume')).toHaveText(hasResume?'Resume.pdf':'');await expect(page.locator('#continue')).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-submissions','0');expect(await page.locator('#cover_letter').evaluate(el=>el.files.length)).toBe(0);
      expect(kr.openrouter.requests).toHaveLength(0);
    });
  }
}

test('embedded ownership ambiguity pauses before filling',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,settings:{autoSubmit:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ats-workflow-host.html',undefined,'?ambiguous'));await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame',{timeout:20000});await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('ownership is ambiguous');
  await expect(page.frameLocator('iframe').first().locator('#email')).toHaveValue('');
});

test('Greenhouse waits for accepted resume processing and leaves the cover-letter file manual',async({kr})=>{
  await kr.seed({apiKey:'',profile:PROFILE,resume:{name:'Resume.pdf',type:'application/pdf',contents:'%PDF-1.4 test'},settings:{autoContinue:false,overwriteExisting:true}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html',GREENHOUSE_HOST,'?upload'));await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.',{timeout:60000});
  await expect(page.locator('#accepted-resume')).toHaveText('Resume.pdf');await expect(page.locator('#first_name')).toHaveValue('Test');expect(await page.locator('#cover_letter').evaluate(el=>el.files.length)).toBe(0);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('captured live Greenhouse phone formatting preserves and verifies the saved digits',async({kr})=>{
  await kr.seed({apiKey:'',profile:{...PROFILE,education:[],phone:'+1 416 555 0199'},settings:{autoContinue:false}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('greenhouse-promptio-captured.html',GREENHOUSE_HOST));
  // Captures strip site scripts. Replay only the observed national-phone formatter.
  await page.locator('#phone').evaluate(input=>input.addEventListener('input',()=>{const digits=input.value.replace(/\D/g,'');if(digits.length===10)input.value=`(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;}));
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#phone')).toHaveValue('(416) 555-0199',{timeout:60000});
  await expect(page.locator('#kr-main-panel')).toContainText('4 VERIFIED');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('captured Ashby portal menus close before rediscovery and saved contacts fill',async({kr})=>{
  await kr.seed({apiKey:'',profile:{...PROFILE,education:[],phone:'+1 416 555 0199',location:'Toronto, Ontario, Canada'},settings:{autoContinue:false}});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ashby-sift-captured.html',ASHBY_HOST));
  // Captures strip scripts. Replay the observed Floating UI accessibility overlay.
  await page.evaluate(()=>document.querySelectorAll('.ashby-application-form-input-autocomplete').forEach((input,index)=>{
    const owner=input.closest('.ashby-application-form-field-entry,[class*=fieldEntry]');
    const menu=document.createElement('div');menu.id=`captured-menu-${index}`;menu.setAttribute('role','listbox');menu.hidden=true;
    menu.innerHTML=`<div role="option">${index===0?'Toronto, Ontario, Canada':'H-1B'}</div>`;owner.append(menu);input.setAttribute('aria-controls',menu.id);
    const close=()=>{menu.hidden=true;input.setAttribute('aria-expanded','false');document.querySelectorAll('[data-captured-hidden]').forEach(node=>{node.removeAttribute('aria-hidden');node.removeAttribute('data-captured-hidden');});};
    input.addEventListener('mousedown',()=>{menu.hidden=false;input.setAttribute('aria-expanded','true');document.querySelectorAll('.ashby-application-form-field-entry').forEach(node=>{if(node!==owner){node.setAttribute('aria-hidden','true');node.setAttribute('data-captured-hidden','');}});});
    input.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    menu.firstElementChild.addEventListener('mousedown',()=>{input.value=menu.textContent;close();});
  }));
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#_systemfield_name')).toHaveValue('Test Applicant',{timeout:60000});await expect(page.locator('#_systemfield_email')).toHaveValue('test@example.com');
  await expect(page.locator('#kr-main-panel')).toContainText('Required answers or documents need manual input');expect(kr.openrouter.requests).toHaveLength(0);
});
