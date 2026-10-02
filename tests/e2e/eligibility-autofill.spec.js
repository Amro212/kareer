import {test,expect,GREENHOUSE_HOST,LEVER_HOST,ASHBY_HOST} from './support/fixtures.js';
import {readFileSync} from 'node:fs';

const profile={fullName:'Test Candidate',email:'test@example.com',applicantNotes:'I am authorized to work in Spain, the United Arab Emirates, and New Zealand.',workEligibilities:[{country:'Canada',workAuthorization:'Yes',sponsorshipNow:'No',sponsorshipFuture:'Yes'}]};

for(const [ats,host] of [['greenhouse',GREENHOUSE_HOST],['lever',LEVER_HOST],['ashby',ASHBY_HOST]]){
  test(`${ats} fills eligibility, contextual answers, and acknowledgment with all menus closed`,async({kr})=>{
    await kr.seed({profile,settings:{autoContinue:false,autoSubmit:false}});
    kr.openrouter.handler=body=>{
      const fields=JSON.parse(body.messages.at(-1).content).fieldsToFill;
      expect(fields.map(field=>field.label)).toContain('Are you authorized to work in Spain?');
      expect(fields.map(field=>field.label)).toContain('Are you authorized to work in UAE?');
      expect(fields.map(field=>field.label)).toContain('Are you authorized to work in NZ?');
      expect(fields.some(field=>field.fieldId==='eligibility')).toBe(false);
      expect(fields.some(field=>field.fieldId==='authorization-no-sponsorship')).toBe(false);
      expect(body.messages[0].content).not.toMatch(/never guess yes or no|never complete assessments/i);
      expect(body.messages[0].content).not.toMatch(/unsupported (?:factual )?guesses|label unsupported facts/i);
      expect(body.messages[0].content).toMatch(/never invent facts out of thin air/i);
      return {choices:[{message:{content:JSON.stringify({answers:fields.map(field=>({fieldId:field.fieldId,value:field.type==='checkbox'?true:field.options.find(option=>option.label==='Yes')?.label||'',provenance:'inferred',inferred:true}))})}}]};
    };
    const page=await kr.context.newPage();
    await page.goto(kr.fixtureUrl('eligibility-menu-replay.html',host,`?ats=${ats}`));
    await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#email')).toHaveValue(profile.email,{timeout:60000});
    await expect(page.locator('#eligibility-value')).toHaveValue('yes',{timeout:60000});
    await expect(page.locator('#sponsorship-value')).toHaveValue('yes');
    await expect(page.locator('#spain')).toHaveValue('yes');
    await expect(page.locator('#authorization-no-sponsorship')).toHaveValue('no');
    await expect(page.locator('#uae')).toHaveValue('yes');
    await expect(page.locator('#nz')).toHaveValue('yes');
    await expect(page.locator('#acknowledgment')).toBeChecked();
    await expect(page.locator('[role=listbox]:visible')).toHaveCount(0);
    await expect(page.locator('[role=combobox][aria-expanded=true]')).toHaveCount(0);
    await expect(page.locator('#kr-main-panel')).not.toContainText('Safety Boundary');
    await expect(page.locator('body')).toHaveAttribute('data-submissions','0');
    expect(kr.openrouter.requests).toHaveLength(1);
    // The site widget still reopens and closes normally after autofill cleanup.
    await page.locator('#eligibility').click();await expect(page.locator('#eligibility-menu')).toBeVisible();
    await page.locator('#eligibility').press('Escape');await expect(page.locator('#eligibility-menu')).toBeHidden();
  });
}

test('Ashby Sift capture with screenshot acknowledgment allows filling saved contacts',async({kr})=>{
  await kr.seed({profile,settings:{autoContinue:false,autoSubmit:false}});
  kr.openrouter.handler=body=>({choices:[{message:{content:JSON.stringify({answers:JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field=>({fieldId:field.fieldId,value:field.type==='checkbox'?true:field.options?.find(option=>option.value && !/select|choose/i.test(option.label))?.label||'',provenance:'inferred'}))})}}]});
  const page=await kr.context.newPage();await page.goto(kr.fixtureUrl('ashby-sift-captured.html',ASHBY_HOST));
  // The stored capture predates the acknowledgment in the reported screenshot.
  const acknowledgmentMarkup=readFileSync(new URL('../../fixtures/ashby-sift-acknowledgment-replay.html',import.meta.url),'utf8');
  await page.evaluate(markup=>(document.querySelector('[aria-labelledby="job-application-form"]')||document.body).insertAdjacentHTML('beforeend',markup),acknowledgmentMarkup);
  await kr.openPanel(page);await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#_systemfield_name')).toHaveValue(profile.fullName,{timeout:60000});
  await expect(page.locator('#_systemfield_email')).toHaveValue(profile.email);
  await expect(page.locator('#kr-main-panel')).not.toContainText('Safety Boundary');
  const acknowledgment=page.getByLabel(/^I certify that all information provided/);
  await expect(acknowledgment).toBeChecked({timeout:60000});
});
