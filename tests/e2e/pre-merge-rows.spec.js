import { test, expect, GREENHOUSE_HOST } from './support/fixtures.js';

test('complete employer rows are reserved before partial rows and retry creates no duplicates', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', workExperiences: [{ id: 'engineer', company: 'Acme', title: 'Engineer' }, { id: 'manager', company: 'Acme', title: 'Manager' }] }, settings: { autoContinue: false, autoSubmit: false } });
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('greenhouse-ashby-workflow.html', GREENHOUSE_HOST));
  await page.locator('form').evaluate(form => {
    form.innerHTML = '<div id="employment_section"><div class="employment"><label>Company<input name="company" value="Acme"></label><label>Title<input name="title" value="Engineer"></label></div><div class="employment"><label>Company<input name="company" value="Acme"></label><label>Title<input name="title"></label></div><button id="add_employment" type="button">Add</button></div>';
  });
  await kr.openPanel(page); await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('.employment input[name="title"]').nth(1)).toHaveValue('Manager', { timeout: 20000 });
  expect(await page.locator('.employment input[name="title"]').evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['Engineer', 'Manager']);
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.', {timeout: 60000});
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('.employment')).toHaveCount(2);
  await expect(page.locator('.employment input[name="title"]').nth(1)).toHaveValue('Manager');
  expect(kr.openrouter.requests).toHaveLength(0);
});
