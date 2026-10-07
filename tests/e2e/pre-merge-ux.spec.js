import { test, expect, WORKDAY_HOST } from './support/fixtures.js';

test('generic authorization without sponsorship must honor sponsorship facts', async ({ kr }) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', workEligibilities: [{ id: 'us', country: 'United States', workAuthorization: 'Yes', sponsorshipNow: 'Yes', sponsorshipFuture: 'Yes' }] }, settings: { autoContinue: false, autoSubmit: false } });
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
  await page.evaluate(() => {
    document.body.innerHTML = '<h1>Job Application</h1><form id="job-application"><fieldset><legend>Are you authorized to work in the United States without sponsorship?</legend><label><input type="radio" name="auth" value="Yes">Yes</label><label><input type="radio" name="auth" value="No">No</label></fieldset></form>';
  });
  await kr.openPanel(page); await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('input[value="No"]')).toBeChecked({ timeout: 20000 });
  expect(await page.locator('input[value="No"]').isChecked(), 'Saved sponsorship requirement makes the without-sponsorship answer No').toBe(true);
});

test('Java search must not commit JavaScript', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', skills: ['Java'] }, settings: { autoContinue: false, autoSubmit: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-application-fixture.html', WORKDAY_HOST));
  await page.evaluate(() => {
    document.body.innerHTML = '<main><form><div data-automation-id="skillsSection"><div data-automation-id="formField-skills"><label for="skills--skills">Skills</label><div data-automation-id="multiSelectContainer"><input id="skills--skills" placeholder="Search" data-uxi-widget-type="selectinput"></div></div></div></form></main><div data-automation-id="activeListContainer" hidden></div>';
    const input = document.querySelector('input'), menu = document.querySelector('[data-automation-id="activeListContainer"]');
    input.onkeydown = event => {
      if (event.key !== 'Enter' || !input.value) return;
      menu.hidden = false;
      menu.innerHTML = '<div data-automation-id="promptLeafNode"><div data-automation-id="promptOption" data-automation-label="JavaScript">JavaScript</div></div>';
      menu.firstElementChild.onclick = () => {
        input.parentElement.insertAdjacentHTML('afterbegin', '<div data-automation-id="selectedItem" title="JavaScript">JavaScript</div>');
        input.value = ''; menu.hidden = true;
      };
    };
  });
  await kr.openPanel(page); await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Required answers or documents need manual input', {timeout: 60000});
  expect(await page.locator('[data-automation-id="selectedItem"]').allTextContents(), 'A missing Java option must leave the skills unchanged').toEqual([]);
});
