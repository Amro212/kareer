import { test, expect } from './support/fixtures.js';
import worker from '../../server/src/index.js';
import { database } from '../../server/test/db.js';

test('hosted offer selection shows current server terms and redirects through a native consent form', async ({ kr }, testInfo) => {
  const env = { DB: database(), SALES_ENABLED: 'true', LS_STORE_ID: '1', LS_PACK_VARIANT: '20', LS_MONTHLY_VARIANT: '10', LS_TEST_MODE: 'true' };
  const origin = 'https://api.kareer.itsamro.me';
  const purchase = await (await worker.fetch(new Request(`${origin}/v1/purchases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {})).json();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url) === 'https://api.lemonsqueezy.com/v1/checkouts'
    ? Response.json({ data: { id: '8', attributes: { url: 'https://store.lemonsqueezy.com/checkout/test' } } })
    : original(url, options);
  try {
    await kr.context.route(`${origin}/plans/**`, async route => {
      const incoming = route.request();
      const response = await worker.fetch(new Request(incoming.url(), { method: incoming.method(), headers: incoming.headers(), ...(incoming.method() === 'POST' ? { body: incoming.postData() } : {}) }), env, {});
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await kr.context.route('https://store.lemonsqueezy.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock payment checkout</h1>' }));
    const page = await kr.context.newPage();
    await page.goto(purchase.url);
    await expect(page.getByRole('heading', { name: 'More help with your next application.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(purchase.claimSecret);
    await page.screenshot({ path: testInfo.outputPath('plans-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('plans-mobile.png'), fullPage: true });
    const pack = page.locator('.offer').filter({ has: page.getByRole('heading', { name: 'Credit pack', exact: true }) });
    await pack.getByRole('button', { name: 'Buy credit pack' }).click();
    await expect(page).toHaveURL(purchase.url);
    await pack.getByRole('checkbox').focus();
    await page.keyboard.press('Space');
    await pack.getByRole('button', { name: 'Buy credit pack' }).click();
    await expect(page).toHaveURL('https://store.lemonsqueezy.com/checkout/test');
    expect(env.DB.sql.prepare('SELECT offer FROM checkouts').get().offer).toBe('pack');
  } finally { globalThis.fetch = original; env.DB.sql.close(); }
});
