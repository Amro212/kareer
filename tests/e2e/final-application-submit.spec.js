import { test, expect, GREENHOUSE_HOST, ASHBY_HOST, LEVER_HOST, ATS_HOST } from './support/fixtures.js';

const PROFILE = { fullName: 'Test Applicant', email: 'test@example.com' };

for (const autoSubmit of [false, true]) {
  test(`Greenhouse ignores removed failed fields at submission with Auto Submit ${autoSubmit ? 'on' : 'off'}`, async ({ kr }) => {
    await kr.seed({ apiKey: '', profile: { ...PROFILE, savedAnswers: { 'Old conditional question': 'Test answer' } }, settings: { autoContinue: true, autoSubmit } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('final-application-submit-fixture.html', GREENHOUSE_HOST, '?ats=greenhouse&stale'));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    if (!autoSubmit) {
      await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
      await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
      await page.locator('#kr-autofill-btn').click();
    }
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
    await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
    expect(kr.openrouter.requests).toHaveLength(0);
  });
}

for (const [ats, host] of [
  ['greenhouse', GREENHOUSE_HOST], ['ashby', ASHBY_HOST], ['lever', LEVER_HOST], ['generic', ATS_HOST],
]) {
  for (const autoContinue of [false, true]) {
    test(`${ats}: final form fills and reaches review with Auto Continue ${autoContinue ? 'on' : 'off'}`, async ({ kr }) => {
      await kr.seed({ apiKey: ats === 'generic' ? 'sk-or-v1-e2e-test-key' : '', profile: PROFILE, settings: { autoContinue, autoSubmit: false } });
      const page = await kr.context.newPage();
      const start = ats === 'generic';
      await page.goto(kr.fixtureUrl('final-application-submit-fixture.html', host, `?ats=${ats}${start ? '&start' : ''}`));
      await kr.openPanel(page);
      await page.locator('#kr-autofill-btn').click();
      if (start && !autoContinue) {
        await expect(page.locator('#kr-autofill-btn')).toHaveText(/next step/i);
        await page.locator('#kr-autofill-btn').click();
      }

      if (ats === 'lever') await expect(page.locator('#name')).toHaveValue(PROFILE.fullName);
      else {
        await expect(page.locator('#first_name')).toHaveValue('Test');
        await expect(page.locator('#last_name')).toHaveValue('Applicant');
      }
      await expect(page.locator('#email')).toHaveValue(PROFILE.email);
      await expect(page.locator('#kr-main-panel')).toContainText('READY FOR REVIEW');
      await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Review your answers, then submit the application.');
      await expect(page.locator('#kr-main-panel')).not.toContainText('No Next or Continue');
      await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
      await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
      await page.locator('#kr-autofill-btn').click();
      await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
      await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
      await expect(page.locator('#kr-autofill-btn')).toBeDisabled();
      expect((await kr.readStorage('kr:settings')).autoSubmit).toBe(false);
      expect(kr.openrouter.requests).toHaveLength(0);
    });
  }

  test(`${ats}: opt-in Auto Submit fills the final form and submits once`, async ({ kr }) => {
    await kr.seed({ apiKey: ats === 'generic' ? 'sk-or-v1-e2e-test-key' : '', profile: PROFILE, settings: { autoContinue: true, autoSubmit: true } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('final-application-submit-fixture.html', host, `?ats=${ats}`));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();

    await expect(page.locator('#kr-main-panel')).toContainText('Submitting in');
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
    await expect(page.locator('#kr-main-panel')).toContainText('SUBMITTED');
    expect(kr.openrouter.requests).toHaveLength(0);
  });
}
