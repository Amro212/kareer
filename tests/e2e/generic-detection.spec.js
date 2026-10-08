import fs from 'node:fs';
import { test, expect, EMBED_HOST } from './support/fixtures.js';

for (const file of ['brim.clearcompany.com-2026-10-07-21-51.html', 'jobs.smartrecruiters.com-2026-10-07-21-49.html']) {
  test(`generic panel mounts for captured ${file}`, async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.route('**/*', route => route.request().isNavigationRequest()
      ? route.fulfill({contentType:'text/html', body:fs.readFileSync(`fixtures/${file}`, 'utf8')}) : route.abort());
    await page.goto(kr.fixtureUrl(file));
    await expect(page.locator('.kr-pebble')).toBeVisible();
    await kr.openPanel(page);
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
    expect(kr.openrouter.requests).toHaveLength(0);
  });
}
test('generic dynamic headings, visibility and open roots reconcile', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/dynamic-generic', route => route.fulfill({contentType:'text/html',body:'<title>Candidate portal</title><h3>Contact us</h3><section hidden><label>Name<input></label><label>Email<input></label></section><candidate-portal></candidate-portal>'}));
  await page.goto(kr.fixtureUrl('dynamic-generic'));
  await page.waitForTimeout(500);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('h3').textContent = 'Apply for a job'; document.querySelector('section').hidden = false; });
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/education'); document.querySelector('h3').textContent = 'Education'; document.querySelector('section').remove(); });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => { document.querySelector('candidate-portal').attachShadow({mode:'open'}).innerHTML = '<h3>Job application</h3><label>Email<input type=email></label>'; });
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.evaluate(() => { document.querySelector('candidate-portal').hidden = true; document.querySelector('h3').textContent = 'Videos'; });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
});
test('generic child-frame intent mounts parent and clears when child becomes unrelated', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/generic-parent', route => route.fulfill({contentType:'text/html',body:`<title>Candidate portal</title><iframe src="http://${EMBED_HOST}/generic-child"></iframe>`}));
  await page.route('**/generic-child', route => route.fulfill({contentType:'text/html',body:'<h3>Apply for a job</h3><label>Name<input></label><label>Email<input type=email></label>'}));
  await page.goto(kr.fixtureUrl('generic-parent'));
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.frames().find(frame => frame.url().includes('/generic-child')).evaluate(() => { document.body.innerHTML = '<h3>Contact us</h3><label>Name<input></label><label>Email<input type=email></label>'; });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.frames().find(frame => frame.url().includes('/generic-child')).evaluate(() => { document.querySelector('h3').textContent = 'Apply for a job'; });
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.evaluate(() => document.querySelector('iframe').remove());
  await expect(page.locator('#kareer-root')).toHaveCount(0);
});

test('generic control name and id hydration reconciles the panel', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/attribute-generic', route => route.fulfill({contentType:'text/html',body:'<title>Candidate portal</title><section><label>Full name<input></label><input type=file></section>'}));
  await page.goto(kr.fixtureUrl('attribute-generic'));
  await page.waitForTimeout(500);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  for (const attribute of ['name', 'id']) {
    await page.evaluate(attribute => document.querySelector('input[type=file]').setAttribute(attribute, 'resume'), attribute);
    await expect(page.locator('.kr-pebble')).toBeVisible();
    await page.evaluate(attribute => document.querySelector('input[type=file]').removeAttribute(attribute), attribute);
    await expect(page.locator('#kareer-root')).toHaveCount(0);
  }
});

test('hidden and removed generic application frames cannot borrow a visible unrelated iframe', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/visibility-parent', route => route.fulfill({contentType:'text/html',body:`<title>Contact us</title><iframe id="application" hidden src="http://${EMBED_HOST}/visibility-child"></iframe><iframe src="http://${EMBED_HOST}/visibility-ad"></iframe>`}));
  await page.route('**/visibility-child', route => route.fulfill({contentType:'text/html',body:'<h3>Apply for a job</h3><label>Name<input></label><label>Email<input type=email></label>'}));
  await page.route('**/visibility-ad', route => route.fulfill({contentType:'text/html',body:'<h3>Advertisement</h3>'}));
  await page.goto(kr.fixtureUrl('visibility-parent'));
  await expect.poll(() => kr.worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(tab => tab.url === url);
    const key = `kr:frames:${tab.id}`;
    const frames = (await chrome.storage.session.get(key))[key] || [];
    return frames.some(frame => frame.url.endsWith('/visibility-child') && frame.applicationEvidence?.eligible);
  }, page.url())).toBe(true);
  await page.waitForTimeout(700);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#application').hidden = false);
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.evaluate(() => document.querySelector('#application').hidden = true);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#application').hidden = false);
  await expect(page.locator('.kr-pebble')).toBeVisible();
  await page.evaluate(() => document.querySelector('#application').remove());
  await expect(page.locator('#kareer-root')).toHaveCount(0);
});
test('manual panel survives mutations on its URL and clears on unrelated navigation', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/manual-generic', route => route.fulfill({contentType:'text/html',body:'<h3>Contact us</h3><label>Email<input type=email></label>'}));
  await page.goto(kr.fixtureUrl('manual-generic'));
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  const popup = await kr.context.newPage();
  await popup.goto(kr.popupUrl());
  // Send the same extension command as the popup, targeting this test tab.
  await kr.worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({});
    return await chrome.tabs.sendMessage(tabs.find(tab => tab.url === url).id, {type:'kr:toggle-panel'});
  }, page.url());
  await expect(page.locator('#kr-main-panel')).toBeVisible();
  await page.evaluate(() => { const field = document.createElement('textarea'); document.body.append(field); });
  await page.waitForTimeout(700);
  await expect(page.locator('#kr-main-panel')).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/videos'); document.querySelector('h3').textContent = 'Videos'; });
  await expect(page.locator('#kareer-root')).toHaveCount(0);
});

test('generic open-shadow application fills through the existing workflow', async ({ kr }) => {
  await kr.seed({profile:{fullName:'Test Applicant',email:'test@example.com'},settings:{autoContinue:false}});
  const page = await kr.context.newPage();
  await page.route('**/shadow-generic', route => route.fulfill({contentType:'text/html',body:'<title>Candidate portal</title><candidate-portal></candidate-portal><script>document.querySelector("candidate-portal").attachShadow({mode:"open"}).innerHTML = \'<h3>Job application</h3><input id="email" type="email" aria-label="Email" required>\';</script>'}));
  await page.goto(kr.fixtureUrl('shadow-generic'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#email')).toHaveValue('test@example.com');
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('generic ordinary forms and misleading headings stay clear', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.route('**/negative-generic', route => route.fulfill({contentType:'text/html',body:'<title>Easy Apply</title><h1 hidden>Job Application</h1><h3>Loan application</h3><form>Our resume service is available.<label>Name<input></label><label>Email<input type=email></label></form><script type="application/ld+json">{"@type":"Article","name":"JobPosting"}</script>'}));
  await page.goto(kr.fixtureUrl('negative-generic'));
  await page.waitForTimeout(1200);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
  await page.evaluate(() => { document.title = 'Advice'; document.querySelector('h3').textContent = 'How to apply for a job'; });
  await page.waitForTimeout(700);
  await expect(page.locator('#kareer-root')).toHaveCount(0);
});
