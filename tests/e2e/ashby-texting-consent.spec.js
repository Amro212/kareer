import { test, expect, ASHBY_HOST } from './support/fixtures.js';

for (const suffix of ['05-29', '05-31', '05-36']) {
  test(`captured Ashby ${suffix} fills contacts and SMS consent without a duplicate-ID pause`, async ({ kr }) => {
    const profile = { fullName: 'Test Applicant', email: 'test@example.com', phone: '+14165550199', country: 'Canada', city: 'Toronto' };
    await kr.seed({ profile, settings: { autoContinue: false, autoSubmit: false }, resume: { name: 'resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test resume' } });
    kr.openrouter.handler = body => ({ choices: [{ message: { content: JSON.stringify({ answers: JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field => ({ fieldId: field.fieldId, value: 'notGiven' })) }) } }] });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl(`jobs.ashbyhq.com-2026-10-07-${suffix}.html`, ASHBY_HOST));
    await page.evaluate(() => {
      // Keep the captured contact/consent/resume markup intact. Other questions
      // and parser/network widgets are outside this field-identity regression.
      const elements = [document.getElementById('_systemfield_name'), document.getElementById('_systemfield_email'), document.querySelector('input[type=tel]'), document.getElementById('_systemfield_resume')];
      const entries = elements.map(element => element.closest('.ashby-application-form-field-entry'));
      document.querySelector('[aria-labelledby="job-application-form"]').replaceChildren(...entries);
      const resume = document.getElementById('_systemfield_resume');
      resume.onchange = () => {
        const root = resume.closest('.ashby-application-form-input-file');
        root.querySelectorAll('.ashby-application-form-input-file-filename,button').forEach(node => node.remove());
        const name = document.createElement('div');
        name.className = 'ashby-application-form-input-file-filename';
        name.textContent = resume.files[0].name;
        const replace = document.createElement('button');
        replace.type = 'button'; replace.textContent = 'Replace';
        root.append(name, replace);
      };
    });
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.', { timeout: 30000 });
    await expect(page.locator('#_systemfield_name')).toHaveValue(profile.fullName);
    await expect(page.locator('#_systemfield_email')).toHaveValue(profile.email);
    expect((await page.locator('input[type=tel]').inputValue()).replace(/\D/g, '')).toBe('14165550199');
    await expect(page.locator('.ashby-application-form-input-file-filename')).toHaveText('resume.pdf');
    if (suffix !== '05-36') {
      await expect(page.locator('input[name=communicationConsent][value=notGiven]')).toBeChecked();
      await expect(page.locator('input[name=communicationConsent][value=given]')).not.toBeChecked();
      const request = kr.openrouter.requests[0];
      const fields = JSON.parse(request.body.messages.at(-1).content).fieldsToFill;
      expect(fields).toHaveLength(1);
      expect(fields[0].fieldId).toBe('communicationConsent');
      expect(fields[0].label).toMatch(/receive text message updates/i);
    } else expect(kr.openrouter.requests).toHaveLength(0);
    await expect(page.locator('#kr-main-panel')).not.toContainText('duplicate field IDs');
  });
}
