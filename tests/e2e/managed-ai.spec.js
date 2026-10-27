import { test, expect } from './support/fixtures.js';

async function mockGateway(kr, credits = 5) {
  await kr.worker.evaluate(credits => {
    const original = globalThis.fetch;
    globalThis.__managedCalls = [];
    globalThis.__credits = credits;
    const status = () => ({ state: globalThis.__credits ? 'ready' : 'outOfCredits', monthly: 0, purchased: globalThis.__credits, total: globalThis.__credits, billingUrl: 'https://store.lemonsqueezy.com/billing' });
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.kareer.itsamro.me/')) return original(url, options);
      const path = new URL(url).pathname;
      const body = options?.body ? JSON.parse(options.body) : null;
      globalThis.__managedCalls.push({ path, body });
      if (path === '/v1/activate' && body?.licenseKey === 'invalid-test-license') return Response.json({ code: 'INVALID_KEY' }, { status: 403 });
      if (path === '/v1/activate' || path === '/v1/status') return Response.json(status());
      if (path === '/v1/purchases') return Response.json({ id: '11111111-1111-4111-8111-111111111111', claimSecret: 'private-checkout-claim', expiresAt: new Date(Date.now() + 900000).toISOString(), url: 'https://api.kareer.itsamro.me/plans/11111111-1111-4111-8111-111111111111' });
      if (path.startsWith('/v1/checkouts/')) return Response.json({ status: 'complete', licenseKey: 'private-managed-license', aiStatus: status() });
      if (path === '/v1/ai') {
        if (!globalThis.__credits) return Response.json({ code: 'NO_CREDITS' }, { status: 402 });
        globalThis.__credits--;
        let content;
        if (body.operation.startsWith('document')) content = JSON.stringify({ paragraphs: ['Dear Hiring Team,', 'I build useful software.', 'Sincerely, Applicant'] });
        else if (body.operation === 'fieldRewrite') content = 'I build useful software.';
        else {
          const input = JSON.parse(body.messages.at(-1).content);
          content = JSON.stringify({ answers: input.fieldsToFill.map(f => ({ fieldId: f.fieldId, value: 'A useful answer', inferred: true })) });
        }
        return new Response(JSON.stringify({ type: 'processing' }) + '\n' + JSON.stringify({ type: 'result', content, credits: { monthly: 0, purchased: globalThis.__credits, total: globalThis.__credits } }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      throw Error('Unexpected mocked route');
    };
  }, credits);
}

test('new installation activates without showing models or leaking license credentials', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  await mockGateway(kr);
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#ai-mode')).toHaveValue('managed');
  await expect(options.locator('#ai-mode')).toBeHidden();
  await expect(options.locator('#advanced-ai')).not.toHaveAttribute('open');
  await expect(options.locator('#start-checkout')).toBeVisible();
  await expect(options.locator('#start-checkout')).toHaveText('View plans');
  await expect(options.locator('#purchase-offer')).toHaveCount(0);
  await expect(options.locator('#connection')).not.toContainText('US$');
  await expect(options.locator('#usage-details')).toBeHidden();
  await expect(options.locator('#byok-connection')).toBeHidden();
  await expect(options.locator('#license-key')).toBeHidden();
  await options.setViewportSize({ width: 2548, height: 1276 });
  await options.screenshot({ path: testInfo.outputPath('billing-wide.png'), fullPage: true });
  await options.setViewportSize({ width: 1280, height: 900 });
  await options.screenshot({ path: testInfo.outputPath('billing-desktop.png'), fullPage: true });
  await options.setViewportSize({ width: 390, height: 844 });
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await options.screenshot({ path: testInfo.outputPath('billing-mobile.png'), fullPage: true });
  await options.setViewportSize({ width: 1280, height: 720 });
  await options.locator('#license-activation summary').click();
  await expect(options.locator('#activate-license')).toBeDisabled();
  const inputBox = await options.locator('#license-key').boundingBox();
  const buttonBox = await options.locator('#activate-license').boundingBox();
  expect(buttonBox.y - (inputBox.y + inputBox.height)).toBeGreaterThanOrEqual(16);
  await options.screenshot({ path: testInfo.outputPath('billing-activation.png'), fullPage: true });
  await options.locator('#license-key').fill('invalid-test-license');
  await options.locator('#activate-license').click();
  await expect(options.locator('#activation-feedback')).toContainText('could not be verified');
  await expect(options.locator('#license-key')).toHaveValue('invalid-test-license');
  await expect(options.locator('#activate-license')).toBeEnabled();
  await options.locator('#license-key').fill('private-managed-license');
  await options.keyboard.press('Tab');
  await expect(options.locator('#activate-license')).toBeFocused();
  expect(await options.locator('#activate-license').evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await options.getByRole('button', { name: 'Activate key', exact: true }).click();
  await expect(options.locator('#managed-state')).toHaveText('Ready');
  await expect(options.locator('#license-key')).toHaveValue('');
  await expect(options.locator('#usage-details')).toBeVisible();
  const removeBox = await options.locator('#disconnect-license').boundingBox();
  expect(removeBox.height).toBeGreaterThanOrEqual(44);
  await options.screenshot({ path: testInfo.outputPath('billing-ready.png'), fullPage: true });
  await options.goto(`${kr.optionsUrl()}#models`);
  await expect(options.locator('#byok-model')).toBeHidden();
  await expect(options.locator('#narrative-style')).toBeVisible();
  const page = await kr.context.newPage();
  await page.route('**/managed-application', route => route.fulfill({ contentType: 'text/html', body: '<title>Job Application</title><h1>Job Application</h1><form><label for="email">Email</label><input type="email" id="email"><label for="why">Why this role?</label><textarea id="why"></textarea></form>' }));
  await page.goto(kr.fixtureUrl('managed-application'));
  await kr.openPanel(page);
  await expect(page.locator('.kr-model-chip')).toContainText('Kareer AI');
  await expect(page.locator('[data-tab=debug]')).toHaveCount(0);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#why')).toHaveValue('A useful answer');
  await expect(page.locator('#kr-main-panel')).not.toContainText('gemini');
  await expect(page.locator('#kr-main-panel')).not.toContainText('OpenRouter');
  const snapshot = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'kr:snapshot' }));
  expect(JSON.stringify(snapshot)).not.toContain('private-managed-license');
  expect(await kr.worker.evaluate(() => globalThis.__managedCalls.filter(c => c.path === '/v1/ai').length)).toBe(1);
});

test('purchase auto-claim is privileged and mode switching preserves the saved personal key', async ({ kr }) => {
  await kr.seed();
  await mockGateway(kr);
  const page = await kr.context.newPage();
  await kr.context.route('https://api.kareer.itsamro.me/plans/**', route => route.fulfill({ body: 'Test plans only' }));
  await page.goto(`${kr.optionsUrl()}#connection`);
  await expect(page.locator('#ai-mode')).toHaveValue('byok');
  await expect(page.locator('#advanced-ai')).toHaveAttribute('open', '');
  await page.locator('#ai-mode').selectOption('managed');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
  await page.locator('#start-checkout').click();
  await expect(page.locator('#managed-state')).toHaveText('Ready');
  const secrets = await kr.readStorage('kr:secrets');
  expect(secrets.apiKey).toBe('sk-or-v1-e2e-test-key');
  expect(secrets.licenseKey).toBe('private-managed-license');
  expect(await page.locator('body').textContent()).not.toContain('private-checkout-claim');
  const calls = await kr.worker.evaluate(() => globalThis.__managedCalls);
  expect(calls.find(c => c.path === '/v1/purchases').body).toEqual({});
  await page.locator('#ai-mode').selectOption('byok');
  await expect(page.locator('#byok-connection')).toBeVisible();
  expect((await kr.readStorage('kr:secrets')).licenseKey).toBe('private-managed-license');
});

test('local-only autofill links directly to AI setup without blocking saved profile filling', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  const page = await kr.context.newPage();
  await page.route('**/local-only-application', route => route.fulfill({ contentType: 'text/html', body: '<h1>Job Application</h1><form id="application_form"><label for="email">Email</label><input type="email" id="email" required><label for="why">Why this role?</label><textarea id="why" required></textarea></form>' }));
  await page.goto(kr.fixtureUrl('local-only-application', 'boards.greenhouse.io'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#email')).toHaveValue('test@example.com');
  await expect(page.locator('#kr-main-panel')).toContainText('Connect AI in Settings');
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  expect(kr.openrouter.requests).toHaveLength(0);
  await page.locator('.kr-content').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('local-only-guidance.png') });
  const opened = kr.context.waitForEvent('page');
  await page.getByRole('button', { name: 'Connect AI', exact: true }).click();
  const options = await opened;
  await expect(options).toHaveURL(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#start-checkout')).toBeVisible();
  await mockGateway(kr);
  await options.locator('#license-activation summary').click();
  await options.locator('#license-key').fill('private-managed-license');
  await options.locator('#activate-license').click();
  await expect(options.locator('#managed-state')).toHaveText('Ready');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#why')).toHaveValue('A useful answer');
  await expect(page.locator('#email')).toHaveValue('test@example.com');
  await expect(page.getByRole('button', { name: 'Connect AI', exact: true })).toHaveCount(0);
});

test('exhausted managed mode keeps local filling and does not spend the personal key', async ({ kr }) => {
  await kr.seed({ settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  await kr.worker.evaluate(() => chrome.storage.local.set({ 'kr:secrets': { apiKey: 'sk-or-v1-e2e-test-key', licenseKey: 'private-managed-license' }, 'kr:ai-status': { state: 'outOfCredits', total: 0 } }));
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('greenhouse-application-fixture.html'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('input[type=email]').first()).toHaveValue('test@example.com');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('managed cover letter generation and document rewrite share the metered gateway', async ({ kr }) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'test@example.com',
    workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Example', description: 'Built useful software.' }] } });
  await kr.worker.evaluate(() => chrome.storage.local.set({ 'kr:secrets': { licenseKey: 'private-managed-license' }, 'kr:ai-status': { state: 'ready', total: 5, purchased: 5 } }));
  await mockGateway(kr);
  const page = await kr.context.newPage();
  await page.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=coverLetter`);
  await page.locator('#job-description').fill('Build useful software for customers.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  const rewritten = await page.evaluate(async () => {
    const request = (operation, input) => chrome.runtime.sendMessage({ type: 'kr:materials', operation, input });
    const list = await request('list');
    const record = await request('get', { id: list[0].id });
    return request('rewriteDraft', { id: record.id, revision: record.revision, model: record.model, path: 'paragraph:0', options: {} });
  });
  expect(rewritten.error).toBeUndefined();
  const calls = await kr.worker.evaluate(() => globalThis.__managedCalls.filter(c => c.path === '/v1/ai').map(c => c.body));
  expect(calls.map(c => c.operation)).toEqual(['document', 'documentRewrite']);
  expect(calls.every(c => !c.model && c.document.kind === 'coverLetter')).toBe(true);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('popup controls stay usable while a free managed usage refresh is pending', async ({ kr }) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' } });
  await kr.worker.evaluate(async () => {
    await chrome.storage.local.set({ 'kr:secrets': { licenseKey: 'private-managed-license' }, 'kr:ai-status': { state: 'ready', total: 5, purchased: 5 } });
    const original = globalThis.fetch;
    globalThis.__usageWaiters = [];
    globalThis.fetch = (url, options) => String(url).endsWith('/v1/status')
      ? new Promise(resolve => globalThis.__usageWaiters.push(() => resolve(Response.json({ state: 'ready', total: 5, purchased: 5 }))))
      : original(url, options);
  });
  try {
    const popup = await kr.context.newPage();
    await popup.goto(kr.popupUrl());
    await expect(popup.locator('#key-status')).toHaveText('Ready');
    const opened = kr.context.waitForEvent('page');
    await popup.locator('#open-options').click();
    await expect(await opened).toHaveURL(kr.optionsUrl());
  } finally { await kr.worker.evaluate(() => globalThis.__usageWaiters.forEach(resolve => resolve())); }
});
