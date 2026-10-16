import { test, expect } from './support/fixtures.js';

const PROFILE = { fullName: 'Test Applicant', email: 'test@example.com', savedAnswers: { 'Why this role?': 'I build useful software.' } };

for (const query of ['control=native', 'control=input', 'control=implicit', 'control=accessible', 'control=custom', 'control=external', 'control=footer', 'control=native&shadow', 'control=custom&shadow', 'control=native&steps', 'control=native&sidebar-newsletter']) {
  test(`generic manual submission: ${query}`, async ({ kr }) => {
    await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: false, overwriteExisting: true } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('generic-application-fixture.html', undefined, `?${query}`));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
    if (!query.includes('steps')) {
      await expect(page.locator('#full_name')).toHaveValue(PROFILE.fullName);
      await page.locator('#full_name').fill('Reviewed name');
    } else await expect(page.locator('#motivation')).toHaveValue(PROFILE.savedAnswers['Why this role?']);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
    if (!query.includes('steps')) await expect(page.locator('body')).toHaveAttribute('data-submitted-name', 'Reviewed name');
    await expect(page.locator('body')).toHaveAttribute('data-newsletters', '0');
    if (query.includes('sidebar-newsletter')) await expect(page.locator('aside input')).toHaveValue('subscriber@example.org');
    expect((await kr.readStorage('kr:settings')).autoSubmit).toBe(false);
    expect(kr.openrouter.requests).toHaveLength(0);
  });
}

test('native Next: Review obeys Auto Continue off even with Auto Submit on', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: true } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('generic-application-fixture.html', undefined, '?steps&next-label=Next%3A%20Review'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toHaveText('Continue to Next Step');
  await expect(page.locator('h2')).toHaveText('Contact details');
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
  await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
});

for (const autoSubmit of [false, true]) {
  for (const capture of [false, true]) {
    test(`generic iframe submission with Auto Submit ${autoSubmit ? 'on' : 'off'}${capture ? ' beside email capture' : ''}`, async ({ kr }) => {
      await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit } });
      const page = await kr.context.newPage();
      await page.goto(kr.fixtureUrl('generic-application-host.html', undefined, capture ? '?capture' : ''));
      await kr.openPanel(page);
      await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');
      await page.locator('#kr-autofill-btn').click();
      const frame = page.frameLocator('iframe');
      if (!autoSubmit) {
        await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
        await frame.locator('#full_name').fill('Reviewed iframe name');
        await page.locator('#kr-autofill-btn').click();
      }
      await expect(frame.locator('body')).toHaveAttribute('data-submissions', '1');
      if (!autoSubmit) await expect(frame.locator('body')).toHaveAttribute('data-submitted-name', 'Reviewed iframe name');
      await expect(frame.locator('body')).toHaveAttribute('data-newsletters', '0');
      await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
      if (capture) {
        await expect(page.locator('body')).toHaveAttribute('data-signups', '0');
        await expect(page.locator('form input')).toHaveValue('');
      }
    });
  }
}

for (const query of ['ambiguous', 'disabled', 'forward-ambiguity']) {
  test(`generic ${query} submit controls explain the blocker`, async ({ kr }) => {
    await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: true } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('generic-application-fixture.html', undefined, `?${query}`));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    const message = query === 'ambiguous' ? 'Multiple Submit controls' : query === 'forward-ambiguity' ? 'Multiple forward buttons' : 'Submit button is disabled';
    await expect(page.locator('#kr-main-panel')).toContainText(message);
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
  });
}

test('generic native Auto Submit keeps its countdown', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: true } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('generic-application-fixture.html'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Submitting in');
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
  await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
});

for (const autoSubmit of [false, true]) {
  for (const widget of [false, true]) {
    test(`mixed parent and iframe fields submit through the parent with Auto Submit ${autoSubmit}${widget ? ' beside unrelated widget' : ''}`, async ({ kr }) => {
      await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit } });
      const page = await kr.context.newPage();
      await page.goto(kr.fixtureUrl('generic-application-host.html', undefined, `?mixed${widget ? '&widget' : ''}`));
      await kr.openPanel(page);
      await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');
      if (widget) {
        await expect(page.locator('#kr-main-panel')).toContainText('2 embedded frames');
        await expect(page.frameLocator('iframe[title="Support widget"]').locator('#topic')).toHaveAttribute('aria-invalid', 'true');
      }
      await page.locator('#kr-autofill-btn').click();
      const frame = page.frameLocator('iframe[title="Job application"]');
      await expect(page.locator('#parent-name')).toHaveValue(PROFILE.fullName);
      await expect(frame.locator('#email')).toHaveValue(PROFILE.email);
      await expect(frame.locator('body')).toHaveAttribute('data-submissions', '0');
      if (!autoSubmit) {
        await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
        await frame.locator('#email').fill('');
        await page.locator('#kr-autofill-btn').click();
        await expect(page.locator('#kr-main-panel')).toContainText('Email');
        await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
        await frame.locator('#email').fill(PROFILE.email);
        await page.locator('#kr-autofill-btn').click();
        await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
        await page.locator('#kr-autofill-btn').click();
      }
      await expect(page.locator('body')).toHaveAttribute('data-submissions', '1');
      await expect(page.locator('#kr-autofill-btn')).toHaveText('Submitted');
    });
  }
}
