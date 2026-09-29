import { test, expect } from './support/fixtures.js';

test.describe('extension shell', () => {
  test('profile save dock floats while dirty and persists edits on desktop and mobile', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.optionsUrl());
    const dock = page.locator('#profile-floating-dock');
    await expect(page.locator('#pf-github')).toBeVisible();
    await expect(dock).toBeHidden();
    await expect(dock).toHaveCSS('position', 'fixed');

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const github = `https://github.com/applicant-${width}`;
      await page.locator('#pf-github').fill(github);
      await expect(dock).toBeVisible();
      await expect(dock).toContainText('Unsaved profile changes');
      await expect(dock).toBeInViewport();
      await page.locator('#applicantNotes').fill(`Notes at ${width}`);
      await expect(dock).toBeInViewport();
      const box = await dock.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.locator('#floating-save-btn').click();
      await expect(dock).toContainText('Profile saved');
      await expect.poll(async () => (await kr.readStorage('kr:profile')).github).toBe(github);
      expect((await kr.readStorage('kr:profile')).applicantNotes).toBe(`Notes at ${width}`);
      await expect(dock).toBeHidden();
      await page.reload();
      await expect(page.locator('#pf-github')).toHaveValue(github);
      await expect(dock).toBeHidden();
    }
  });

  test('panel mounts in the page and reports the hydrated key state', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    // Reads through the hydrated cache: the panel never sees the key itself.
    await expect(page.locator('#kr-main-panel')).toContainText('Ready');
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
    await expect(page.locator('#kr-main-panel')).toContainText('detected');
  });

  test('a missing key surfaces as No API Key without exposing storage to the page', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    await expect(page.locator('#kr-main-panel')).toContainText('No API Key');

    // The panel offers the options page instead of collecting the key in-page.
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#kr-open-options')).toBeVisible();
    await expect(page.locator('#kr-api-key-input')).toHaveCount(0);
  });

  test('the key stays out of the page even after it is saved', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-super-secret-value' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Key saved');

    const leaked = await page.evaluate(() => {
      const root = document.querySelector('#kareer-root');
      const haystack = [
        document.documentElement.outerHTML,
        root?.shadowRoot?.innerHTML || '',
        JSON.stringify(Object.keys(localStorage).map((k) => localStorage.getItem(k))),
        JSON.stringify(Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k))),
      ].join('\n');
      return haystack.includes('super-secret-value');
    });
    expect(leaked).toBe(false);
  });

  test('options page persists the key, model, and profile', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.optionsUrl());

    await page.locator('#api-key').fill('sk-or-v1-from-options-page');
    await page.locator('#save-key').click();
    await expect(page.locator('#key-status')).toHaveText('Key saved');

    await page.locator('#model').selectOption('openai/gpt-4o-mini');
    await page.locator('#save-model').click();
    await expect(page.locator('#model-feedback')).toHaveText('Model saved.');

    await page.locator('#pf-firstName').fill('Test');
    await page.locator('#pf-lastName').fill('Applicant');
    await page.locator('#eligibility-list .card-header').first().click();
    await page.locator('#pf-workCountry').fill('Canada');
    await page.locator('#pf-workAuthorization').selectOption('Yes');
    await page.locator('#applicantNotes').fill('Ships production software.');
    await page.locator('#profile-form button[type=submit]').click();
    await expect(page.locator('#profile-feedback')).toHaveText('Profile saved.');

    expect(await kr.readStorage('kr:secrets')).toEqual({ apiKey: 'sk-or-v1-from-options-page' });
    expect((await kr.readStorage('kr:settings')).model).toBe('openai/gpt-4o-mini');

    const profile = await kr.readStorage('kr:profile');
    expect(profile.fullName).toBe('Test Applicant');
    expect(profile.workCountry).toBe('Canada');
    expect(profile.workAuthorization).toBe('Yes');
    expect(profile.workEligibilities.length).toBeGreaterThanOrEqual(1);
    expect(profile.workEligibilities[0].country).toBe('Canada');
    expect(profile.workEligibilities[0].workAuthorization).toBe('Yes');
    expect(profile.applicantNotes).toBe('Ships production software.');
  });

  test('options page allows adding multiple eligible countries and persists all entries', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.optionsUrl());

    await page.locator('#pf-firstName').fill('Dual');
    await page.locator('#pf-lastName').fill('Citizen');
    await page.locator('#eligibility-list .card-header').first().click();
    await page.locator('#pf-workCountry').fill('United States');
    await page.locator('#pf-workAuthorization').selectOption('Yes');

    // Add a second country
    await page.locator('#add-eligibility-btn').click();
    const secondCard = page.locator('#eligibility-list .repeatable-card').nth(1);
    await secondCard.locator('.elig-country').fill('Canada');
    await secondCard.locator('.elig-auth').selectOption('Yes');
    await secondCard.locator('.elig-sponsor-future').selectOption('No');

    await page.locator('#profile-form button[type=submit]').click();
    await expect(page.locator('#profile-feedback')).toHaveText('Profile saved.');

    const profile = await kr.readStorage('kr:profile');
    expect(profile.workCountry).toBe('United States');
    expect(profile.workAuthorization).toBe('Yes');
    expect(profile.workEligibilities).toHaveLength(2);
    expect(profile.workEligibilities[0].country).toBe('United States');
    expect(profile.workEligibilities[0].workAuthorization).toBe('Yes');
    expect(profile.workEligibilities[1].country).toBe('Canada');
    expect(profile.workEligibilities[1].workAuthorization).toBe('Yes');
    expect(profile.workEligibilities[1].sponsorshipFuture).toBe('No');
  });

  test('profile edits made in the options page reach an already-open page', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    const options = await kr.context.newPage();
    await options.goto(kr.optionsUrl());
    await options.locator('#pf-firstName').fill('Broadcast');
    await options.locator('#pf-lastName').fill('Applicant');
    await options.locator('#profile-form button[type=submit]').click();
    await expect(options.locator('#profile-feedback')).toHaveText('Profile saved.');

    await page.bringToFront();
    await page.locator('[data-tab=profile]').click();
    await expect(page.locator('#kareer-root [name=fullName]')).toHaveValue('Broadcast Applicant');
  });

  test('popup reports field and frame counts for the active tab', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await page.bringToFront();

    const popup = await kr.context.newPage();
    await popup.goto(kr.popupUrl());
    await expect(popup.locator('#key-status')).toHaveText('Key saved');
    await expect(popup.locator('#frame-count')).not.toHaveText('-');
    expect(Number(await popup.locator('#field-count').textContent())).toBeGreaterThan(0);
  });
});
