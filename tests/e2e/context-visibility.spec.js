import { test, expect, ASHBY_HOST, GREENHOUSE_HOST } from './support/fixtures.js';

test('a mixed 25-field application uses one primary request and bounded fill time', async ({ kr }) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  const page = await kr.context.newPage();
  const fields = Array.from({ length: 24 }, (_, index) => `<label for="question${index}">Custom question ${index}</label><input id="question${index}" type="text">`).join('');
  await page.route('**/speed-regression', route => route.fulfill({ contentType: 'text/html', body: `<title>Job Application</title><h1>Job Application</h1><form>${fields}<label for="why">Why this role?</label><textarea id="why"></textarea></form>` }));
  await page.goto(kr.fixtureUrl('speed-regression'));
  await kr.openPanel(page);
  const started = Date.now();
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#why')).not.toHaveValue('', { timeout: 14000 });
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  const elapsed = Date.now() - started;
  console.log(`25-field application completed in ${elapsed}ms with ${kr.openrouter.requests.length} primary request(s)`);
  expect(kr.openrouter.requests.length).toBe(1);
  expect(elapsed).toBeLessThan(14000);
});

test('unrelated pages stay clear, and a dynamically mounted application starts as a pebble', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/ordinary-page', route => route.fulfill({ contentType: 'text/html', body: '<title>How to build a React application</title><h1>How to build a React application</h1><article>A resume tutorial</article><input type="search"><form id="comments"><textarea placeholder="Comment"></textarea></form>' }));
  await page.goto(kr.fixtureUrl('ordinary-page'));
  await page.waitForTimeout(700);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => { document.body.innerHTML = '<h1>Job Application</h1><div class="job__location">New York City, NY</div><form><label for="email">Email</label><input id="email" type="email"></form>'; });
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await expect(page.locator('#kr-main-panel')).toHaveCount(0);
  await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('United States');
  await kr.openPanel(page);
  await expect(page.locator('#kr-capture-job')).toHaveCount(0);
  await page.locator('[data-tab=debug]').click();
  await expect(page.locator('#kr-main-panel')).toContainText('United States');
  await expect(page.locator('#kr-recapture-job-btn')).toHaveCount(0);
  await page.evaluate(() => { document.body.querySelector('h1').textContent = 'Videos'; document.body.querySelector('form').remove(); document.body.querySelector('.job__location').remove(); });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => { const comment = document.createElement('textarea'); document.body.append(comment); comment.focus(); });
  await expect(page.locator('#kareer-inline-rewrite')).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('h1').textContent = 'Job Application'; });
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.locator('textarea').blur();
  await page.locator('textarea').focus();
  await expect(page.locator('#kareer-inline-rewrite')).toHaveCount(1);
  await expect(page.locator('#kareer-inline-rewrite')).toBeVisible();
});

for (const placement of ['head', 'body']) {
  test(`existing ${placement} JSON-LD replacements refresh work country automatically`, async ({ kr }) => {
    const page = await kr.context.newPage();
    const metadata = '<script id="job-metadata" type="application/ld+json">{"@type":"JobPosting","title":"Engineer","jobLocation":{"address":{"addressCountry":"US"}}}</script>';
    await page.route('**/metadata-replacement', route => route.fulfill({ contentType: 'text/html', body: `<head><title>Open role</title>${placement === 'head' ? metadata : ''}</head><body>${placement === 'body' ? metadata : ''}<h1>Engineer</h1><form><input type="email"></form></body>` }));
    await page.goto(kr.fixtureUrl('metadata-replacement'));
    await expect(page.locator('.kr-pebble')).toBeVisible();
    await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('United States');
    await page.evaluate(() => { const script = document.querySelector('#job-metadata'); script.textContent = script.textContent.replace('"US"', '"CA"'); });
    await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('Canada');
    const [id] = await kr.readStorage('kr:sessions');
    expect((await kr.readStorage(`kr:sessions:${id}`)).job.workCountry).toBe('Canada');
  });
}

for (const [file, host, company] of [['ashby-sift-2026-10-02-captured.html', ASHBY_HOST, 'Sift'], ['greenhouse-reddit-2026-10-02-captured.html', GREENHOUSE_HOST, 'Reddit']]) {
  test(`captures ${company} job location automatically from the reported live page`, async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl(file, host));
    await expect(page.locator('.kr-pebble')).toBeVisible();
    await expect.poll(async () => (await kr.readStorage('kr:job'))?.company).toBe(company);
    await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('United States');
    await kr.openPanel(page);
    await expect(page.locator('#kr-capture-job')).toHaveCount(0);
  });
}

test('switching jobs on the same SPA URL clears the previous country and session', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/changing-job', route => route.fulfill({ contentType: 'text/html', body: '<main data-ashby-root><h1>Engineer A</h1><div class="job__location">New York City, NY</div><input type="email"></main>' }));
  await page.goto(kr.fixtureUrl('changing-job', ASHBY_HOST));
  await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('United States');
  await expect.poll(async () => (await kr.readStorage('kr:sessions'))?.length).toBe(1);
  const [oldId] = await kr.readStorage('kr:sessions');
  await page.evaluate(() => {
    document.querySelector('h1').textContent = 'Engineer B';
    document.querySelector('.job__location').textContent = 'Remote';
  });
  await expect.poll(async () => (await kr.readStorage('kr:job'))?.title).toBe('Engineer B');
  await expect.poll(async () => (await kr.readStorage('kr:job'))?.workCountry).toBe('');
  await expect.poll(async () => (await kr.readStorage('kr:sessions'))?.[0]).not.toBe(oldId);
  const [newId] = await kr.readStorage('kr:sessions');
  expect((await kr.readStorage(`kr:sessions:${newId}`)).job.workCountries).toEqual([]);
});

test('accepted Ashby resume remains verified after the file input is cleared', async ({ kr }) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', email: 'test@example.com' }, resume: { name: 'resume.pdf', type: 'application/pdf', contents: '%PDF fake test resume' } });
  const page = await kr.context.newPage();
  await page.route('**/upload-regression', route => route.fulfill({ contentType: 'text/html', body: '<title>Job Application</title><main data-ashby-root><h1>Engineer</h1><div class="ashby-application-form-field-entry"><label for="resume">Resume</label><div class="ashby-application-form-input-file"><input id="resume" type="file" required></div></div><label for="email">Email</label><input id="email" type="email"></main><script>document.querySelector("#resume").onchange = e => { const name = e.target.files[0].name; e.target.value=""; const label=document.createElement("div");label.className="ashby-application-form-input-file-filename";label.textContent=name;e.target.after(label);const replace=document.createElement("button");replace.textContent="Replace";label.after(replace); };</script>' }));
  await page.goto(kr.fixtureUrl('upload-regression', ASHBY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('.kr-review-item').filter({ hasText: 'Resume' })).toContainText('VERIFIED', { timeout: 20000 });
  expect(await page.locator('#resume').evaluate(el => el.files.length)).toBe(0);
  expect(kr.openrouter.requests.length).toBe(0);
});
