import { test, expect } from './support/fixtures.js';

test('AI sharing requires explicit Settings consent, persists, and can be withdrawn without losing local filling', async ({ kr }, testInfo) => {
  await kr.seed({ profile: { fullName: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com' }, settings: { autoContinue: false, autoSubmit: false } });
  await kr.worker.evaluate(() => chrome.storage.local.get('kr:secrets').then(values => chrome.storage.local.set({ 'kr:secrets': { ...values['kr:secrets'], aiDataConsent: 0 } })));
  const options = await kr.context.newPage();
  await options.goto(`${kr.optionsUrl()}#connection`);
  const consent = options.locator('#ai-data-consent');
  await expect(consent).not.toBeChecked();
  await expect(options.locator('#ai-data-heading')).toBeVisible();
  await expect(options.locator('#ai-data-details')).toContainText('OpenRouter');
  await expect(options.locator('#ai-data-details')).toContainText('disability');
  const request = () => options.evaluate(() => chrome.runtime.sendMessage({ type: 'kr:ai-request', options: {
    operation: 'autofill', input: { fieldsToFill: [{ fieldId: 'why' }] },
    url: 'https://openrouter.ai/api/v1/chat/completions', data: JSON.stringify({ messages: [{ role: 'user', content: '{}' }] }),
  } }));
  expect((await request()).kind).toBe('CONSENT_REQUIRED');
  expect(kr.openrouter.requests).toHaveLength(0);

  const application = await kr.context.newPage();
  await application.goto(kr.fixtureUrl('store-demo-application.html'));
  await kr.openPanel(application);
  await application.locator('#kr-autofill-btn').click();
  await expect(application.locator('#email')).toHaveValue('alex@example.com');
  await expect(application.locator('#kr-autofill-btn')).toBeEnabled();
  expect(kr.openrouter.requests).toHaveLength(0);

  await consent.check();
  await expect(options.locator('#ai-consent-feedback')).toHaveText('AI data sharing enabled.');
  expect((await request()).status).toBe(200);
  expect(kr.openrouter.requests).toHaveLength(1);
  await options.reload();
  await expect(consent).toBeChecked();
  await options.setViewportSize({ width: 390, height: 844 });
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await options.screenshot({ path: testInfo.outputPath('ai-disclosure-mobile.png'), fullPage: true });
  await consent.uncheck();
  await expect(options.locator('#ai-consent-feedback')).toContainText('sharing off');
  expect((await request()).kind).toBe('CONSENT_REQUIRED');
  expect(kr.openrouter.requests).toHaveLength(1);
  expect((await kr.readStorage('kr:profile')).email).toBe('alex@example.com');
  expect((await kr.readStorage('kr:secrets')).apiKey).toBeTruthy();
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
