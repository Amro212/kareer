import { test, expect } from './support/fixtures.js';

const application = (title) => `<title>${title}</title><h1>${title}</h1><form><label for="email">Email</label><input id="email" type="email" required><button type="button">Continue</button></form>`;

for (const mode of ['exact', 'redirect']) {
  test(`generic personal-information navigation restores the bound session (${mode})`, async ({ kr }) => {
    await kr.seed({ profile: { fullName: 'Test Applicant', email: 'test@example.com' }, settings: { autoContinue: false } });
    const page = await kr.context.newPage();
    await page.route('**/applications/42/**', route => route.fulfill({ contentType: 'text/html', body: application(route.request().url().endsWith('/start') ? 'Job Application' : 'Personal Information') }));
    await page.goto(kr.fixtureUrl('applications/42/start'));
    await kr.openPanel(page);
    await expect.poll(async () => (await kr.readStorage('kr:sessions'))?.length).toBe(1);
    const [id] = await kr.readStorage('kr:sessions');
    const next = kr.fixtureUrl('applications/42/personal');
    await kr.worker.evaluate(async ({ id, next, mode }) => {
      const key = `kr:sessions:${id}`;
      const session = (await chrome.storage.local.get(key))[key];
      session.pendingUrl = mode === 'exact' ? next : next.replace('/personal', '/step-2');
      session.pendingAt = Date.now();
      session.active = mode === 'redirect';
      await chrome.storage.local.set({ [key]: session });
    }, { id, next, mode });
    await page.goto(next);
    await kr.openPanel(page);
    await expect.poll(async () => (await kr.readStorage(`kr:sessions:${id}`))?.currentUrl).toBe(next);
    expect(await kr.readStorage('kr:sessions')).toEqual([id]);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#email')).toHaveValue('test@example.com');
  });
}

test('SPA unmount clears old field values and provenance before another job', async ({ kr }) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', email: 'old@example.com' }, settings: { autoContinue: false } });
  const page = await kr.context.newPage();
  await page.route('**/cache-job-a', route => route.fulfill({ contentType: 'text/html', body: application('Job Application') }));
  await page.goto(kr.fixtureUrl('cache-job-a'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#email')).toHaveValue('old@example.com');
  await expect(page.locator('.kr-review-item').filter({ hasText: 'Email' })).toContainText('VERIFIED');
  await page.evaluate(() => {
    history.pushState({}, '', '/unrelated');
    document.title = 'Videos';
    document.querySelector('h1').textContent = 'Videos';
    document.querySelector('form').remove();
  });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => {
    history.pushState({}, '', '/cache-job-b');
    document.title = 'Job Application';
    document.querySelector('h1').textContent = 'Job Application';
    const form = document.createElement('form');
    form.innerHTML = '<label for="email">Email</label><input id="email" type="email" required>';
    document.body.append(form);
  });
  await kr.openPanel(page);
  await expect.poll(async () => (await kr.readStorage('kr:sessions'))?.length).toBe(2);
  await expect(page.locator('#email')).toHaveValue('');
  const review = page.locator('.kr-review-item').filter({ hasText: 'Email' });
  await expect(review).not.toContainText('VERIFIED');
  await expect(review).not.toContainText('old@example.com');
});
