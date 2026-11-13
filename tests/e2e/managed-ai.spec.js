import { test, expect, ASHBY_HOST, GREENHOUSE_HOST } from './support/fixtures.js';

async function mockGateway(kr, credits = 5) {
  await kr.worker.evaluate(({ credits, gateway }) => {
    const original = globalThis.fetch;
    globalThis.__managedCalls = [];
    globalThis.__credits = credits;
    const status = () => ({ state: globalThis.__credits ? 'ready' : 'outOfCredits', monthly: 0,
      purchased: globalThis.__trial ? 0 : globalThis.__credits, trial: globalThis.__trial ? globalThis.__credits : 0, total: globalThis.__credits,
      trialExpiresAt: globalThis.__trial ? new Date(Date.now() + 30 * 86400000).toISOString() : null, billing: !globalThis.__trial });
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith(`${gateway}/`)) return original(url, options);
      const path = new URL(url).pathname;
      const body = options?.body ? JSON.parse(options.body) : null;
      globalThis.__managedCalls.push({ path, body });
      if (path === '/v1/activate' && body?.licenseKey === 'invalid-test-license') return Response.json({ code: 'INVALID_KEY' }, { status: 403 });
      if (path === '/v1/activate' || path === '/v1/status') return Response.json(status());
      if (path === '/v1/purchases') return Response.json({ id: '11111111-1111-4111-8111-111111111111', claimSecret: 'private-checkout-claim', expiresAt: new Date(Date.now() + 900000).toISOString(), url: `${gateway}/plans/11111111-1111-4111-8111-111111111111`,
        ...(body?.offer ? { checkoutUrl: `https://checkout.stripe.com/c/pay/cs_test_${body.offer}` } : {}) });
      if (path.startsWith('/v1/purchases/')) return Response.json({ status: 'complete', licenseKey: 'private-managed-license', aiStatus: status() });
      if (path === '/v1/trial') {
        globalThis.__trial = true;
        globalThis.__credits = 10;
        return Response.json({ licenseKey: `kr_${'T'.repeat(43)}`, aiStatus: status() });
      }
      if (path === '/v1/billing-portal') return Response.json({ url: 'https://billing.stripe.com/p/session/test_e2e' });
      if (path === '/v1/ai') {
        if (globalThis.__failManagedOnce) {
          globalThis.__failManagedOnce = false;
          return new Response(JSON.stringify({ type: 'error', code: 'GENERATION_FAILED', charged: false, credits: status() }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
        }
        const cost = { document: 3, documentRewrite: 2 }[body.operation] || 1;
        if (globalThis.__credits < cost) return Response.json({ code: 'NO_CREDITS' }, { status: 402 });
        globalThis.__credits -= cost;
        let content;
        if (body.operation.startsWith('document')) content = JSON.stringify({ paragraphs: ['Dear Hiring Team,', 'I build useful software.', 'Sincerely, Applicant'] });
        else if (body.operation === 'fieldRewrite') content = 'I build useful software.';
        else {
          if (body.messages || body.model) throw Error('The gateway builds prompts; clients send structured input only');
          content = JSON.stringify({ answers: body.input.fieldsToFill.map(f => ({ fieldId: f.fieldId, value: 'A useful answer', inferred: true })) });
        }
        return new Response(JSON.stringify({ type: 'processing' }) + '\n' + JSON.stringify({ type: 'result', content, credits: status() }) + '\n', { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
      throw Error('Unexpected mocked route');
    };
  }, { credits, gateway: kr.gatewayOrigin });
}

async function managedFixture(kr, ashby) {
  const page = await kr.context.newPage();
  await page.route('**/managed-fixture', route => route.fulfill({ contentType: 'text/html', body: `<title>Test Engineer Application</title><h1>Job Application</h1><form ${ashby ? 'class="ashby-application-form" data-ashby-root' : 'id="application_form"'}><label for="email">Email</label><input type="email" id="email" required><label for="reference">Reference note</label><textarea id="reference"></textarea><label for="why">Why do you want to work as a test engineer?</label><textarea id="why" required></textarea><button type="submit">Submit application</button></form>` }));
  await page.goto(kr.fixtureUrl('managed-fixture', ashby ? ASHBY_HOST : GREENHOUSE_HOST));
  await kr.openPanel(page);
  return page;
}

for (const ats of ['Greenhouse', 'Ashby']) test(`${ats}: first run refreshes a funded wallet, keeps saved answers on failure, and resumes`, async ({ kr }) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Jordan Example', email: 'kareer-test@example.com', savedAnswers: { 'Reference note': 'Saved reference' } } });
  await mockGateway(kr, 300);
  await kr.worker.evaluate(async () => {
    const { 'kr:secrets': secrets } = await chrome.storage.local.get('kr:secrets');
    await chrome.storage.local.set({ 'kr:secrets': { ...secrets, licenseKey: 'private-managed-license' }, 'kr:ai-status': { state: 'outOfCredits', total: 0 } });
    globalThis.__failManagedOnce = true;
  });
  const page = await managedFixture(kr, ats === 'Ashby');
  await expect(page.locator('.kr-model-chip')).toHaveText('0 credits');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('No credits were charged.');
  await expect(page.locator('#email')).toHaveValue('kareer-test@example.com');
  await expect(page.locator('#reference')).toHaveValue('Saved reference');
  await expect(page.locator('#why')).toHaveValue('');
  await expect(page.locator('.kr-model-chip')).toHaveText('300 credits');
  expect(await page.locator('.kr-model-chip').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#why')).toHaveValue('A useful answer');
  await expect(page.locator('.kr-model-chip')).toHaveText('299 credits');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('staging sandbox pack claim and real managed autofill', async ({ kr }) => {
  test.skip(!process.env.KR_TEST_CHECKOUT, 'Requires a completed staging Stripe sandbox purchase');
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Jordan Example', email: 'kareer-test@example.com', savedAnswers: { 'Reference note': 'Saved reference' } } });
  await kr.worker.evaluate(async checkout => {
    const { 'kr:secrets': secrets } = await chrome.storage.local.get('kr:secrets');
    await chrome.storage.local.set({ 'kr:secrets': { ...secrets, checkout } });
  }, JSON.parse(process.env.KR_TEST_CHECKOUT));
  const settings = await kr.context.newPage();
  await settings.goto(`${kr.optionsUrl()}#connection`);
  await expect(settings.locator('#total-balance')).toHaveText('300 credits');
  const greenhouse = await managedFixture(kr, false);
  await expect(greenhouse.locator('.kr-model-chip')).toHaveText('300 credits');
  await greenhouse.locator('#kr-autofill-btn').click();
  await expect(greenhouse.locator('#why')).not.toHaveValue('');
  await expect(greenhouse.locator('.kr-model-chip')).toHaveText('299 credits');
  await expect(settings.locator('#total-balance')).toHaveText('299 credits');
  const ashby = await managedFixture(kr, true);
  await ashby.locator('#kr-autofill-btn').click();
  await expect(ashby.locator('#why')).not.toHaveValue('');
  await expect(ashby.locator('.kr-model-chip')).toHaveText('298 credits');
});

test('a new installation without a key defaults to Kareer AI with the trial offer', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#ai-mode')).toHaveValue('managed');
  await expect(options.locator('#managed-ai')).toBeVisible();
  await expect(options.locator('#start-trial')).toBeVisible();
  await expect(options.locator('#byok-connection')).toBeHidden();
});

test('Kareer AI activates without showing models or leaking license credentials', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  await mockGateway(kr);
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#ai-mode')).toHaveValue('managed');
  await expect(options.locator('#ai-mode')).toBeHidden();
  await expect(options.locator('#advanced-ai')).not.toHaveAttribute('open');
  await expect(options.locator('#start-checkout')).toBeVisible();
  await expect(options.locator('#start-checkout')).toHaveText('View plans');
  await expect(options.locator('#purchase-offer')).toHaveCount(0);
  await expect(options.locator('#ai-plans li.ai-plan')).toHaveCount(2);
  await expect(options.locator('#ai-plans li.ai-plan').nth(0)).toContainText('Kareer Monthly');
  await expect(options.locator('#ai-plans li.ai-plan').nth(0).locator('.ai-plan-price')).toHaveText('US$9.99 / month');
  await expect(options.locator('#ai-plans li.ai-plan').nth(0)).toContainText('Best value · 40% less per credit');
  await expect(options.locator('#ai-plans li.ai-plan').nth(1)).toContainText('Kareer Credit Pack');
  await expect(options.locator('#ai-plans li.ai-plan').nth(1).locator('.ai-plan-price')).toHaveText('US$4.99 once');
  await expect(options.locator('.ai-purchase-note')).toContainText('All sales are final');
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
  await expect(options.locator('#connection')).not.toContainText(/receipt|Lemon/i);
  await options.evaluate(() => { window.__opened = []; chrome.tabs.create = async ({ url }) => { window.__opened.push(url); }; });
  await options.locator('#manage-billing').click();
  await expect.poll(() => options.evaluate(() => window.__opened)).toEqual(['https://billing.stripe.com/p/session/test_e2e']);
  expect((await kr.worker.evaluate(() => globalThis.__managedCalls.map(c => c.path))).filter(p => p === '/v1/billing-portal')).toHaveLength(1);
  await options.locator('#reveal-license').click();
  await expect(options.locator('#license-value')).toHaveValue('private-managed-license');
  await options.reload();
  await expect(options.locator('#license-reveal')).toBeHidden();
  await options.goto(`${kr.optionsUrl()}#models`);
  await expect(options.locator('#byok-model')).toBeHidden();
  await expect(options.locator('#narrative-style')).toBeVisible();
  const page = await kr.context.newPage();
  await page.route('**/managed-application', route => route.fulfill({ contentType: 'text/html', body: '<title>Job Application</title><h1>Job Application</h1><form><label for="email">Email</label><input type="email" id="email"><label for="why">Why this role?</label><textarea id="why"></textarea></form>' }));
  await page.goto(kr.fixtureUrl('managed-application'));
  await kr.openPanel(page);
  await expect(page.locator('.kr-model-chip')).toHaveText('5 credits');
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
  await kr.context.route(`${kr.gatewayOrigin}/plans/**`, route => route.fulfill({ body: 'Test plans only' }));
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

test('choosing a plan in Settings goes straight to Stripe Checkout for that plan', async ({ kr }) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' } });
  await mockGateway(kr);
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await options.evaluate(() => { window.__opened = []; chrome.tabs.create = async ({ url }) => { window.__opened.push(url); }; });
  await options.locator('#buy-pack').click();
  await expect.poll(() => options.evaluate(() => window.__opened)).toEqual(['https://checkout.stripe.com/c/pay/cs_test_pack']);
  await options.locator('#buy-monthly').click();
  await expect.poll(() => options.evaluate(() => window.__opened.length)).toBe(2);
  expect(await options.evaluate(() => window.__opened[1])).toBe('https://checkout.stripe.com/c/pay/cs_test_monthly');
  const calls = await kr.worker.evaluate(() => globalThis.__managedCalls.filter(c => c.path === '/v1/purchases').map(c => c.body));
  expect(calls).toEqual([{ offer: 'pack' }, { offer: 'monthly' }]);
});

test('an unreachable gateway shows a plain message instead of a raw network error', async ({ kr }) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' } });
  await kr.worker.evaluate(gateway => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => String(url).startsWith(`${gateway}/`) ? Promise.reject(new TypeError('Failed to fetch')) : original(url, options);
  }, kr.gatewayOrigin);
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await options.locator('#buy-pack').click();
  await expect(options.locator('#managed-feedback')).toContainText("Can't reach Kareer right now");
  await expect(options.locator('#connection')).not.toContainText(/Failed to fetch|NetworkError/);
});

test('local-only autofill links directly to AI setup without blocking saved profile filling', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
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
  expect(calls.every(c => !c.model && !c.messages && c.input.kind === 'coverLetter')).toBe(true);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('a new browser claims the 10-credit trial once and a cover letter uses 3 credits', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'test@example.com',
    workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Example', description: 'Built useful software.' }] } });
  await mockGateway(kr, 0);
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#trial-offer')).toBeVisible();
  await options.locator('#start-trial').click();
  await expect(options.locator('#managed-state')).toHaveText('Ready');
  await expect(options.locator('#trial-offer')).toBeHidden();
  await expect(options.locator('#trial-balance')).toHaveText('10');
  await expect(options.locator('#total-balance')).toHaveText('10 credits');
  await expect(options.locator('#manage-billing')).toBeHidden();
  await expect(options.locator('#reveal-license')).toBeVisible();
  await expect(options.locator('#monthly-expiry')).toContainText('Trial credits expire');
  await expect(options.locator('#monthly-expiry')).toContainText('a résumé or cover letter uses 3');
  await options.screenshot({ path: testInfo.outputPath('trial-claimed.png'), fullPage: true });
  const secrets = await kr.readStorage('kr:secrets');
  expect(secrets).toMatchObject({ licenseKey: `kr_${'T'.repeat(43)}`, trialUsed: 1 });
  expect(await options.locator('body').textContent()).not.toContain(secrets.licenseKey);
  const page = await kr.context.newPage();
  await page.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=coverLetter`);
  await expect(page.locator('#generate')).toHaveAttribute('title', 'Uses 3 Kareer AI credits');
  await page.locator('#job-description').fill('Build useful software for customers.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await options.reload();
  await expect(options.locator('#trial-balance')).toHaveText('7');
  await expect(options.locator('#trial-offer')).toBeHidden();
  await kr.worker.evaluate(() => chrome.storage.local.set({ 'kr:secrets': { trialUsed: 1 } }));
  await options.reload();
  await expect(options.locator('#trial-offer')).toBeHidden();
  expect((await kr.worker.evaluate(() => globalThis.__managedCalls.map(c => c.path))).filter(p => p === '/v1/trial')).toHaveLength(1);
});

test('staging: a real trial pays for a 3-credit cover letter and can start a pack checkout', async ({ kr }, testInfo) => {
  test.skip(!process.env.KR_STAGING_TRIAL, 'Uses the real staging gateway, OpenRouter and the Stripe sandbox');
  test.setTimeout(180000);
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Test Applicant', email: 'kareer-test@example.com',
    workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Example', description: 'Built useful software.' }] } });
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await options.locator('#start-trial').click();
  await expect(options.locator('#managed-state')).toHaveText('Ready', { timeout: 30000 });
  await expect(options.locator('#trial-balance')).toHaveText('10');
  await expect(options.locator('#manage-billing')).toBeHidden();
  const materials = await kr.context.newPage();
  await materials.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=coverLetter`);
  await materials.locator('#job-description').fill('Build useful software for customers.');
  await materials.locator('#generate').click();
  await expect(materials.locator('#feedback')).toContainText('Ready', { timeout: 120000 });
  await options.reload();
  await expect(options.locator('#trial-balance')).toHaveText('7');
  await options.evaluate(() => { window.__opened = []; chrome.tabs.create = async ({ url }) => { window.__opened.push(url); }; });
  await options.locator('#buy-pack').click();
  // Paying stops here: Stripe Checkout challenges automated browsers with hCaptcha, which tests never solve.
  await expect.poll(() => options.evaluate(() => window.__opened[0] || ''), { timeout: 30000 }).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  await options.screenshot({ path: testInfo.outputPath('staging-trial.png'), fullPage: true });
});

test('official production builds offer Kareer AI only and ignore a saved OpenRouter key', async ({ kr }) => {
  test.skip(!process.env.KR_PRODUCTION_BUILD, 'Requires dist/chrome built with --production');
  await kr.seed({ settings: { aiMode: 'byok' }, profile: { fullName: 'Test Applicant', email: 'test@example.com' } });
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#advanced-ai')).toBeHidden();
  await expect(options.locator('#byok-connection')).toBeHidden();
  await expect(options.locator('#managed-ai')).toBeVisible();
  await expect(options.locator('#trial-offer')).toBeVisible();
  const status = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'kr:snapshot' }));
  expect(status.aiStatus.mode).toBe('managed');
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('greenhouse-application-fixture.html'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('input[type=email]').first()).toHaveValue('test@example.com');
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
