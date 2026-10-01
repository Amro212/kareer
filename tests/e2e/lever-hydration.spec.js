import { readFileSync } from 'node:fs';
import { test, expect, LEVER_HOST } from './support/fixtures.js';

const APPLICATION_URL = `http://${LEVER_HOST}/review/42/apply`;
const POSTING_URL = `http://${LEVER_HOST}/review/42`;
const PROFILE = { fullName: 'Test Applicant', email: 'privacy.applicant@example.com', phone: '+1 555 0100' };
const DESCRIPTION = 'Full parent posting responsibilities and qualifications for the engineering position.';
const applicationHtml = readFileSync(new URL('../../fixtures/lever-hydration-fixture.html', import.meta.url), 'utf8');
const postingHtml = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', hiringOrganization: { name: 'Example' }, description: DESCRIPTION })}</script>`;

async function openApplication(kr, { stall = false } = {}) {
  await kr.seed({ apiKey: '', profile: PROFILE, settings: { autoContinue: false, autoSubmit: false } });
  const page = await kr.context.newPage();
  await page.route(APPLICATION_URL, route => route.fulfill({ contentType: 'text/html', body: applicationHtml }));
  await page.route(POSTING_URL, stall ? () => {} : route => route.fulfill({ contentType: 'text/html', body: postingHtml }));
  await page.goto(APPLICATION_URL);
  await kr.openPanel(page);
  return page;
}

test('Lever hydrated job and session remain plain data and survive filling and reload', async ({ kr }) => {
  const page = await openApplication(kr);
  await expect.poll(async () => (await kr.readStorage('kr:job'))?.description).toBe(DESCRIPTION);
  await page.locator('#kr-capture-job').click();
  await expect.poll(async () => {
    const ids = await kr.readStorage('kr:sessions');
    return ids?.[0] && (await kr.readStorage(`kr:sessions:${ids[0]}`))?.job.description;
  }).toBe(DESCRIPTION);
  const [id] = await kr.readStorage('kr:sessions');
  const job = await kr.readStorage('kr:job');
  expect(job.applicationUrl).toBe(APPLICATION_URL);
  expect(job).not.toHaveProperty('pendingHydration');
  expect((await kr.readStorage(`kr:sessions:${id}`)).job).not.toHaveProperty('pendingHydration');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#name')).toHaveValue(PROFILE.fullName);
  await expect(page.locator('#email')).toHaveValue(PROFILE.email);
  await expect(page.locator('#kr-autofill-btn')).toHaveText(/next step/i);
  const filled = await kr.readStorage(`kr:sessions:${id}`);
  expect(Object.keys(filled.answers).length).toBeGreaterThanOrEqual(2);
  expect(filled.job.description).toBe(DESCRIPTION);
  expect(filled.job).not.toHaveProperty('pendingHydration');
  await page.reload();
  await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('Example');
  expect(await kr.readStorage('kr:sessions')).toEqual([id]);
  expect((await kr.readStorage(`kr:sessions:${id}`)).job.description).toBe(DESCRIPTION);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('Lever standalone autofill finishes when the parent posting stalls without logging answers', async ({ kr }) => {
  const page = await openApplication(kr, { stall: true });
  const consoleMessages = [];
  page.on('console', message => consoleMessages.push(message.text()));
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#email')).toHaveValue(PROFILE.email, { timeout: 15000 });
  await expect(page.locator('#name')).toHaveValue(PROFILE.fullName);
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill complete. Review field statuses below.');
  const job = await kr.readStorage('kr:job');
  expect(job.description).toBe('Captured application summary.');
  expect(job.applicationUrl).toBe(APPLICATION_URL);
  expect(job).not.toHaveProperty('pendingHydration');
  const logs = await kr.readStorage('kr:debug');
  expect(logs.some(entry => /Job hydration failed:.*timed out|Job hydration failed:.*abort/i.test(entry.message))).toBe(true);
  expect(logs.some(entry => /Field action \[Profile\]/.test(entry.message))).toBe(true);
  expect(JSON.stringify(logs)).not.toContain(PROFILE.email);
  expect(consoleMessages.join('\n')).not.toContain(PROFILE.email);
  expect(kr.openrouter.requests).toHaveLength(0);
});
