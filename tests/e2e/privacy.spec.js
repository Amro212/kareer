import { test, expect } from './support/fixtures.js';

test('Settings discloses AI data sharing next to Kareer AI and AI works without a separate consent step', async ({ kr }, testInfo) => {
  await kr.seed({ apiKey: '', settings: { aiMode: 'managed' }, profile: { fullName: 'Alex Morgan', email: 'alex@example.com' } });
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  await expect(options.locator('#ai-data-consent')).toHaveCount(0);
  const notice = options.locator('#managed-ai #ai-data-details');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('disability');
  await expect(notice).toContainText('Starting a trial, buying or activating a key means you agree');
  await expect(notice.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'https://kareer.itsamro.me/privacy/');
  const noticeBox = await notice.boundingBox(), trialBox = await options.locator('#start-trial').boundingBox(), plansBox = await options.locator('#ai-plans').boundingBox();
  expect(noticeBox.y).toBeGreaterThan(trialBox.y);
  expect(noticeBox.y - (plansBox.y + plansBox.height)).toBeLessThan(48);
  await options.setViewportSize({ width: 390, height: 844 });
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await options.screenshot({ path: testInfo.outputPath('ai-disclosure-mobile.png'), fullPage: true });
  await kr.worker.evaluate(() => chrome.storage.local.set({ 'kr:settings': { aiMode: 'byok' }, 'kr:secrets': { apiKey: 'sk-or-v1-e2e-test-key' } }));
  const result = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'kr:ai-request', options: {
    operation: 'autofill', input: { fieldsToFill: [{ fieldId: 'why' }] },
    url: 'https://openrouter.ai/api/v1/chat/completions', data: JSON.stringify({ messages: [{ role: 'user', content: '{}' }] }),
  } }));
  expect(result.status).toBe(200);
  expect(kr.openrouter.requests).toHaveLength(1);
});

test('Chrome content scripts cannot directly read privileged credential storage', async ({ kr }) => {
  await kr.seed();
  const application = await kr.context.newPage();
  await application.goto(kr.fixtureUrl('store-demo-application.html'));
  await kr.openPanel(application);
  const client = await kr.context.newCDPSession(application);
  const contexts = [];
  client.on('Runtime.executionContextCreated', event => contexts.push(event.context));
  await client.send('Runtime.enable');
  let extensionContext;
  for (const context of contexts.filter(context => context.auxData?.isDefault === false)) {
    const result = await client.send('Runtime.evaluate', { contextId: context.id,
      expression: `globalThis.chrome?.runtime?.id === ${JSON.stringify(kr.extensionId)}`, returnByValue: true });
    if (result.result.value === true) { extensionContext = context.id; break; }
  }
  expect(extensionContext).toBeDefined();
  const result = await client.send('Runtime.evaluate', { contextId: extensionContext, awaitPromise: true, returnByValue: true,
    expression: '(async () => { try { await chrome.storage.local.get("kr:secrets"); return false; } catch { return true; } })()' });
  expect(result.result.value).toBe(true);
  await expect(application.locator('#kr-autofill-btn')).toBeEnabled();
});
