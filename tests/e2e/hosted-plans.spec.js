import { test, expect } from './support/fixtures.js';
import worker from '../../server/src/index.js';
import { database } from '../../server/test/db.js';
import { environment } from '../../server/test/stripe.js';

test('hosted offer selection shows current server terms and redirects through a native consent form to Stripe Checkout', async ({ kr }, testInfo) => {
  const env = { DB: database(), ...environment() };
  const origin = 'https://api.kareer.itsamro.me';
  const purchase = await (await worker.fetch(new Request(`${origin}/v1/purchases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env, {})).json();
  const original = globalThis.fetch, created = [];
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.stripe.com/v1/checkout/sessions') return original(url, options);
    created.push(new URLSearchParams(options.body));
    return Response.json({ id: 'cs_test_e2e', object: 'checkout.session', status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test_e2e' });
  };
  try {
    await kr.context.route(`${origin}/plans/**`, async route => {
      const incoming = route.request();
      const response = await worker.fetch(new Request(incoming.url(), { method: incoming.method(), headers: incoming.headers(), ...(incoming.method() === 'POST' ? { body: incoming.postData() } : {}) }), env, {});
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    const page = await kr.context.newPage();
    await page.goto(purchase.url);
    await expect(page.getByRole('heading', { name: 'More help with your next application.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(purchase.claimSecret);
    await expect(page.locator('body')).toContainText('All sales are final');
    await expect(page.getByRole('link', { name: 'Terms of Service' }).first()).toHaveAttribute('href', 'https://kareer.itsamro.me/terms/');
    await expect(page.locator('body')).not.toContainText(/Lemon|OpenRouter/);
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
    // Chromium follows a redirect from a fulfilled route without routing it again; the URL proves CSP form-action allowed it.
    await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/cs_test_e2e');
    expect(created).toHaveLength(1);
    expect(created[0].get('mode')).toBe('payment');
    expect(created[0].get('client_reference_id')).toBe(purchase.id);
    expect(env.DB.sql.prepare('SELECT offer,status FROM purchases').get()).toEqual({ offer: 'pack', status: 'pending' });
  } finally { globalThis.fetch = original; env.DB.sql.close(); }
});
