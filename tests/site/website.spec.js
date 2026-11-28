import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const offers = JSON.parse(readFileSync(new URL('../../src/core/offers.json', import.meta.url), 'utf8'));
const credits = JSON.parse(readFileSync(new URL('../../src/core/credits.json', import.meta.url), 'utf8'));

test('SEO pages expose their core content without scripts', async ({ browser, baseURL, request }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Job application autofill for Chrome and Firefox');
    const faq = page.locator('#faq details').filter({ hasText: 'What does Kareer cost?' });
    await expect(faq.locator('p')).toContainText(offers.monthly.price);
    await faq.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(faq.locator('p')).toBeVisible();
    const app = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph']
      .find(entity => entity['@type'] === 'SoftwareApplication');
    expect(app.offers).toMatchObject({ price: 0, priceCurrency: 'USD' });

    await expect(page.getByRole('link', { name: 'See tested application platforms' })).toHaveAttribute('href', '/compatibility/');
    await expect(page.getByRole('link', { name: 'Read the tailoring guide' })).toHaveAttribute('href', '/guides/tailor-resume-and-cover-letter/');
    await page.goto('/compatibility/');
    const matrix = page.getByRole('table');
    for (const platform of ['Workday', 'Greenhouse', 'Lever', 'Ashby', 'SmartRecruiters', 'Generic forms']) {
      await expect(matrix.getByRole('rowheader', { name: platform })).toBeVisible();
    }
    await page.goto('/guides/tailor-resume-and-cover-letter/');
    await expect(page.getByRole('main')).toContainText('Harbor Health');
    await expect(page.getByRole('main')).toContainText('Word (.docx)');
  } finally {
    await context.close();
  }
  expect((await request.get('/missing-seo-check/')).status()).toBe(404);
});

test('the pricing comparison and AI discovery files use the published offer data', async ({ page, request }) => {
  await page.goto('/pricing/');
  const table = page.getByRole('table', { name: 'Compare Kareer plans' });
  const mirror = await request.get('/pricing.md');
  expect(mirror.ok()).toBe(true);
  const markdown = await mirror.text();
  const local = table.getByRole('row').filter({ hasText: 'Local tools' });
  await expect(local).toContainText('Free');
  for (const offer of [offers.monthly, offers.pack]) {
    const row = table.getByRole('row').filter({ hasText: offer.name });
    await expect(row).toContainText(offer.price);
    await expect(row).toContainText(offer.credits.toLocaleString('en-US'));
    expect(markdown).toContain(offer.price);
    expect(markdown).toContain(offer.credits.toLocaleString('en-US'));
  }
  const trial = table.getByRole('row').filter({ hasText: 'Kareer AI trial' });
  await expect(trial).toContainText(`${credits.trial.credits} credits`);
  await expect(trial).toContainText(`${credits.trial.days} days`);
  expect(markdown).toContain(`${credits.trial.credits} credits`);
  expect(markdown).toContain(`${credits.trial.days} days`);
  await expect(page.getByRole('link', { name: 'Pricing in Markdown' })).toHaveAttribute('href', '/pricing.md');
  const discovery = await request.get('/llms.txt');
  expect(discovery.ok()).toBe(true);
  const links = await discovery.text();
  for (const path of ['/', '/pricing/', '/pricing.md', '/compatibility/', '/setup/', '/privacy/']) {
    expect(links).toContain(`(https://kareer.itsamro.me${path})`);
  }
});

test('purchase return and legacy link direct buyers to verification in the extension', async ({ page }) => {
  for (const route of ['/purchase/complete/', '/setup/?purchase=complete']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/purchase\/complete\/$/);
    await expect(page.getByRole('heading', { name: 'Back from checkout' })).toBeVisible();
    await expect(page.getByText('Kareer → Settings → AI & billing', { exact: true })).toBeVisible();
    await expect(page.getByText(/Kareer verifies your purchase there/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  }
});

test('hero heading, explanation and install link are visible before hydration', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/main-*.js', async route => { await blocked; await route.continue(); });
  const loaded = page.goto('/');
  try {
    const hero = page.locator('.hero');
    await expect(hero.getByRole('heading', { name: 'Job application autofill for Chrome and Firefox' })).toBeVisible();
    await expect(hero.locator('.hero-description')).toHaveCSS('opacity', '1');
    await expect(hero.locator('.hero-actions').getByRole('link', { name: 'Get Kareer' })).toBeVisible();
  } finally {
    release();
    await loaded;
  }
});

test('mobile install link is ready when the demo starts below the fold', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/');
  await expect(page.locator('.hero-demo-entrance')).not.toBeInViewport();
  await expect(page.locator('.hero-actions').getByRole('link', { name: 'Get Kareer' })).toBeVisible();
});

test('a failed script load keeps prerendered install content readable', async ({ page }) => {
  await page.route('**/assets/main-*.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#hero-title')).toBeVisible();
  await expect(page.locator('.hero-actions')).toHaveCSS('opacity', '1');
});

test('linked buttons retain accessible text contrast on hover and keyboard focus', async ({ page }) => {
  await page.goto('/');
  const contrast = locator => locator.evaluate(element => {
    const context = document.createElement('canvas').getContext('2d');
    context.canvas.width = context.canvas.height = 1;
    const luminance = color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  for (const selector of ['.nav-install', '.closing-section a.v-btn']) {
    const button = page.locator(selector);
    await button.hover();
    await expect.poll(() => contrast(button)).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(0, 0);
    await button.focus();
    await expect.poll(() => contrast(button)).toBeGreaterThanOrEqual(4.5);
  }
});

test('fictional autofill demo completes, explains answers and replays without AI requests', async ({ page, baseURL }) => {
  const externalRequests = [];
  const pageErrors = [];
  const siteOrigin = new URL(baseURL).origin;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).origin !== siteOrigin) externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Job application autofill for Chrome and Firefox' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Explain answer: Why do you want to work at Northwind Labs?' }).click();
  await expect(page.locator('#answer-explanation')).toContainText('Drafted from your Campus Collective role and the job description');
  expect(await page.evaluate(() => {
    const stamp = document.querySelector('.completion-stamp').getBoundingClientRect();
    const action = document.querySelector('.panel-action').getBoundingClientRect();
    return stamp.bottom <= action.top || stamp.top >= action.bottom || stamp.right <= action.left || stamp.left >= action.right;
  }), 'Completion stamp must leave the replay control clear').toBe(true);
  await page.getByRole('button', { name: 'Replay demo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible({ timeout: 15000 });
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('demo shows all five answer states, completes the parsed row, adds a second row and resolves the unresolved field', async ({ page }) => {
  await page.goto('/');
  const demo = page.locator('#demo');
  await expect(demo.locator('.ats-row')).toHaveCount(1);
  await expect(demo.locator('[data-field="exp1-title"] .ats-value')).toHaveText('Student Developer');
  await page.getByRole('button', { name: 'Autofill Workday-style form' }).click();
  await expect(demo.locator('[data-field="heard"]')).toHaveAttribute('data-state', 'unresolved', { timeout: 15000 });
  await expect(demo.locator('[data-field="heard"]')).toHaveAttribute('data-state', 'guessed', { timeout: 5000 });
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible();
  await expect(demo.locator('.ats-row')).toHaveCount(2);
  await expect(demo.locator('[data-field="exp2-title"] .ats-value')).toHaveText('IT Help Desk Assistant');
  for (const [state, count] of [['saved', 12], ['verified', 9], ['inferred', 1], ['guessed', 1], ['unresolved', 0]]) {
    await expect(demo.locator(`.panel-counts [data-kind="${state}"] b`)).toHaveText(String(count));
  }
  await demo.locator('.review-first').getByRole('button', { name: /How did you hear about this role/ }).click();
  await expect(page.locator('#answer-explanation')).toContainText('Unresolved after the first pass');
  await page.getByRole('button', { name: 'Explain answer: Role description' }).first().click();
  await page.getByRole('button', { name: 'See the source in Profile' }).click();
  await expect(demo.locator('.record-list [data-source]')).toContainText('Campus Collective');
});

test('document studio reframes the same saved facts for each fictional posting', async ({ page }) => {
  await page.goto('/');
  const studio = page.locator('.document-studio');
  await studio.scrollIntoViewIfNeeded();
  await expect(studio.locator('.document-meta-label [aria-hidden="false"]')).toContainText('NORTHWIND LABS');
  await studio.getByRole('button', { name: /Civic Transit/ }).click();
  await expect(studio.getByRole('button', { name: /Civic Transit/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(studio.locator('.document-meta-label [aria-hidden="false"]')).toContainText('CIVIC TRANSIT');
  await expect(studio.locator('.tailoring-veil')).toHaveCount(0);
  await expect(studio.locator('[data-state="active"] .document-body[aria-hidden="false"] .document-role').first()).toContainText('IT Help Desk Assistant');
  await expect(studio.locator('mark.tailored').filter({ hasText: 'Wrote step-by-step guides' })).toBeVisible();
  await studio.getByRole('tab', { name: 'Cover letter', exact: true }).click();
  await expect(studio.locator('[data-state="active"] .document-body[aria-hidden="false"]')).toContainText('Dear Civic Transit hiring team');
});

for (const width of [1440, 600, 390]) test(`switching document tabs and postings keeps the document layout fixed at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const studio = page.locator('.document-studio');
  await page.locator('.documents-copy').scrollIntoViewIfNeeded();
  await expect(page.locator('.documents-copy')).toHaveAttribute('data-scroll-reveal', 'done');
  await studio.scrollIntoViewIfNeeded();
  await expect(page.locator('.document-entrance')).toHaveAttribute('data-scroll-reveal', 'done');
  const heading = page.locator('.documents-copy h2');
  const top = () => heading.evaluate(element => Math.round(element.getBoundingClientRect().top + scrollY));
  const before = await top();
  const height = await studio.evaluate(element => element.offsetHeight);
  await page.evaluate(() => {
    const element = document.querySelector('.documents-copy h2');
    const studio = document.querySelector('.document-studio');
    window.__headingTops = [];
    window.__studioHeights = [];
    const sample = () => {
      window.__headingTops.push(Math.round(element.getBoundingClientRect().top + scrollY));
      window.__studioHeights.push(studio.offsetHeight);
      window.__documentSampleFrame = requestAnimationFrame(sample);
    };
    sample();
  });
  for (const step of [() => studio.getByRole('tab', { name: 'Cover letter', exact: true }).click(), () => studio.getByRole('tab', { name: 'Résumé', exact: true }).click(), () => studio.getByRole('button', { name: /Civic Transit/ }).click(), () => studio.getByRole('button', { name: /Harbor Health/ }).click(), () => studio.getByRole('button', { name: /Northwind Labs/ }).click()]) {
    await step();
    await expect(studio.locator('.tailoring-veil')).toHaveCount(0);
    await expect.poll(() => studio.locator('[data-motion-surface="soften"]').evaluateAll(elements => elements.every(element => element.style.getPropertyValue('--presence-y') === '0px'))).toBe(true);
  }
  await page.evaluate(() => cancelAnimationFrame(window.__documentSampleFrame));
  expect(new Set(await page.evaluate(() => window.__headingTops))).toEqual(new Set([before]));
  expect(new Set(await page.evaluate(() => window.__studioHeights))).toEqual(new Set([height]));
});

test('pricing credit estimator gives a labeled range and a plan fit', async ({ page }) => {
  await page.goto('/pricing/');
  await expect(page.getByRole('rowheader', { name: 'Local tools' })).toBeVisible();
  const slider = page.getByLabel('Applications with AI help each month');
  await expect(page.locator('.estimate strong')).toHaveText('40–120');
  await expect(page.locator('.estimate-fit')).toContainText('Credit Pack');
  await slider.fill('200');
  await expect(page.locator('.estimate strong')).toHaveText('200–600');
  await expect(page.locator('.estimate-fit')).toContainText('Kareer Monthly covers even the high end');
  await slider.fill('400');
  await expect(page.locator('.estimate strong')).toHaveText('400–1,200');
  await expect(page.locator('.estimate-fit')).toContainText('At the high end, add a Credit Pack');
});

test('setup, privacy, security and terms are directly accessible static pages', async ({ page }) => {
  await page.goto('/setup/');
  await expect(page.getByRole('heading', { name: 'Install and use Kareer' })).toBeVisible();
  const chromeInstall = page.locator('#browser').getByRole('link', { name: 'Add to Chrome', exact: true });
  const firefoxInstall = page.locator('#browser').getByRole('link', { name: 'Add to Firefox', exact: true });
  await expect(chromeInstall).toBeVisible();
  await expect(chromeInstall).toHaveAttribute('href', 'https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf');
  await expect(firefoxInstall).toBeVisible();
  await expect(firefoxInstall).toHaveAttribute('href', 'https://addons.mozilla.org/addon/kareer/');
  const sourceBuild = page.locator('#browser details');
  await sourceBuild.getByText('Build Kareer from source', { exact: true }).click();
  await expect(sourceBuild.getByText('Load unpacked', { exact: true })).toBeVisible();
  await expect(sourceBuild.getByText('Load Temporary Add-on', { exact: true })).toBeVisible();
  await expect(sourceBuild.getByText('dist/firefox/manifest.json', { exact: true })).toBeVisible();
  await expect(page.locator('#browser a[href*=".xpi"]')).toHaveCount(0);
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { name: 'Kareer Privacy Policy' })).toBeVisible();
  await expect(page.locator('#ai-transmission')).toContainText('OpenRouter');
  await expect(page.locator('#retention')).toBeVisible();
  await expect(page.locator('#billing')).toContainText('Stripe');
  await expect(page.locator('main')).not.toContainText(/Lemon Squeezy|receipt email/);
  const securityLink = page.locator('#security').getByRole('link', { name: 'Kareer security' });
  await expect(securityLink).toHaveAttribute('href', '/security/');
  await securityLink.click();
  await expect(page).toHaveURL(/\/security\/$/);
  await expect(page.getByRole('heading', { name: 'Kareer Security', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Report a vulnerability privately' })).toHaveAttribute('href', 'https://github.com/Amro212/kareer/security/advisories/new');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page).toHaveURL(/\/terms\/$/);
  await expect(page.getByRole('heading', { name: 'Kareer Terms of Service' })).toBeVisible();
  await expect(page.locator('#about')).toContainText('form-filling assistant');
  await expect(page.locator('#refunds')).toContainText('All sales are final');
  await expect(page.locator('#keys').getByRole('link', { name: 'kareer@itsamro.me' })).toHaveAttribute('href', 'mailto:kareer@itsamro.me');
  await expect(page.locator('#about')).toContainText('Ontario, Canada');
});

test('pricing lists both plans from the shared offers and explains that purchases start in the extension', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page.getByRole('heading', { name: 'Kareer pricing and AI credits' })).toBeVisible();
  await expect(page.locator('.comparison-actions').getByRole('link', { name: 'Get Kareer' })).toHaveAttribute('href', '/setup/');
  await expect(page.locator('#buy-in-extension')).toContainText('All sales are final');
  await expect(page.locator('#buy-in-extension')).toContainText('20 free credits');
  await expect(page.locator('#buy-in-extension').getByRole('link', { name: 'kareer@itsamro.me' })).toHaveAttribute('href', 'mailto:kareer@itsamro.me');
  await expect(page.locator('main')).not.toContainText(/\bbot\b|auto-apply|OpenRouter/i);
  await page.goto('/terms/');
  await page.locator('.reading-intro').getByRole('link', { name: 'current pricing' }).click();
  await expect(page).toHaveURL(/\/pricing\/$/);
});

test('mobile navigation, reduced-motion demo and pages fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/setup/', '/privacy/', '/security/', '/terms/', '/pricing/', '/compatibility/', '/guides/tailor-resume-and-cover-letter/']) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No overflow on ${route}`).toBe(true);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible();
});

test('homepage routes generic install CTAs to setup and links both official stores', async ({ page }) => {
  await page.goto('/');
  const chromeStore = 'https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf';
  const firefoxStore = 'https://addons.mozilla.org/addon/kareer/';
  for (const selector of ['.nav-install', '.hero-actions a', '.closing-section a.v-btn']) {
    await expect(page.locator(selector)).toHaveAttribute('href', '/setup/');
  }
  for (const [name, url] of [['Chrome', chromeStore], ['Firefox', firefoxStore]]) {
    await expect(page.locator('.hero-copy .browser-availability').getByRole('link', { name, exact: true })).toHaveAttribute('href', url);
    await expect(page.locator('.closing-section .browser-availability').getByRole('link', { name, exact: true })).toHaveAttribute('href', url);
  }
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Chrome Web Store' })).toHaveAttribute('href', chromeStore);
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Firefox Add-ons' })).toHaveAttribute('href', firefoxStore);
  await page.getByText('Which browsers can I use?', { exact: true }).click();
  await expect(page.locator('#faq').getByRole('link', { name: 'Chrome Web Store' })).toHaveAttribute('href', chromeStore);
  await expect(page.locator('#faq').getByRole('link', { name: 'Mozilla Add-ons' })).toHaveAttribute('href', firefoxStore);
  await expect(page.locator('main')).not.toContainText(/Firefox coming soon|pending review/i);
  await page.locator('.nav-install').click();
  await expect(page).toHaveURL(/\/setup\/$/);
  await expect(page.locator('#browser').getByRole('link', { name: 'Add to Chrome' })).toBeVisible();
  await expect(page.locator('#browser').getByRole('link', { name: 'Add to Firefox' })).toBeVisible();
});

test('content and installation links are available without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [route, heading] of [['/', 'Job application autofill for Chrome and Firefox'], ['/setup/', 'Install and use Kareer'], ['/privacy/', 'Kareer Privacy Policy'], ['/security/', 'Kareer Security'], ['/terms/', 'Kareer Terms of Service'], ['/pricing/', 'Kareer pricing and AI credits']]) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page.locator('.nav-install')).toHaveAttribute('href', '/setup/');
    if (route === '/setup/') {
      await expect(page.locator('#browser').getByRole('link', { name: 'Add to Chrome' })).toHaveAttribute('href', 'https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf');
      await expect(page.locator('#browser').getByRole('link', { name: 'Add to Firefox' })).toHaveAttribute('href', 'https://addons.mozilla.org/addon/kareer/');
    }
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Security', exact: true })).toHaveAttribute('href', '/security/');
    await expect(page.getByRole('link', { name: 'Terms', exact: true })).toBeVisible();
  }
  await context.close();
});

test('robots and sitemap point to the canonical indexable pages', async ({ request }) => {
  const origin = 'https://kareer.itsamro.me';
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const paths = ['/', '/setup/', '/pricing/', '/compatibility/', '/guides/tailor-resume-and-cover-letter/', '/privacy/', '/security/', '/terms/'];
  const titles = new Set();
  const descriptions = new Set();
  expect(Array.from((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1])).toEqual(paths.map(path => origin + path));
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(`<link rel="canonical" href="${origin}${path}"`);
    expect(html).not.toMatch(/name="robots" content="noindex/);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html.match(/data-rendered="true"/g)).toHaveLength(1);
    titles.add(html.match(/<title>([^<]+)<\/title>/)?.[1]);
    descriptions.add(html.match(/name="description"\s+content="([^"]+)"/)?.[1]);
  }
  expect(titles).toHaveProperty('size', paths.length);
  expect(descriptions).toHaveProperty('size', paths.length);
  expect(titles.has(undefined)).toBe(false);
  expect(descriptions.has(undefined)).toBe(false);
});

test('document tabs, FAQ disclosures and keyboard activation work', async ({ page }) => {
  await page.goto('/');
  const letter = page.getByRole('tab', { name: 'Cover letter', exact: true });
  await letter.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'A proper introduction.' })).toBeVisible();
  await page.getByText('What does Kareer cost?', { exact: true }).click();
  await expect(page.getByText('US$9.99/month for 1,000 credits', { exact: false }).last()).toBeVisible();
});

test('scroll entrances animate once without shifting section layout', async ({ page }) => {
  await page.addInitScript(() => {
    window.__siteMotionSamples = [];
    new MutationObserver(records => {
      for (const record of records) {
        const element = record.target;
        if (!(element instanceof HTMLElement)) continue;
        const value = element.matches('[data-scroll-reveal]') ? element.style.getPropertyValue('--presence-y') : '';
        if (value && value !== '0px') window.__siteMotionSamples.push({ section: element.closest('section')?.id, value });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  await page.goto('/');
  const position = () => page.locator('#documents').evaluate(element => Math.round(element.getBoundingClientRect().top + scrollY));
  const before = await position();
  await page.locator('#documents').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.__siteMotionSamples.some(sample => sample.section === 'documents'))).toBe(true);
  await expect.poll(position).toBe(before);
  await expect.poll(() => page.locator('#documents [data-scroll-reveal]').last().evaluate(element => getComputedStyle(element).getPropertyValue('--presence-y').trim())).toBe('0px');
  const count = await page.evaluate(() => window.__siteMotionSamples.filter(sample => sample.section === 'documents').length);
  await page.locator('#faq').scrollIntoViewIfNeeded();
  await page.locator('#documents').scrollIntoViewIfNeeded();
  await expect(page.getByRole('tab', { name: 'Résumé', exact: true })).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await position()).toBe(before);
  expect(await page.locator('#documents [data-scroll-reveal]').last().evaluate(element => getComputedStyle(element).getPropertyValue('--presence-y').trim())).toBe('0px');
  expect(await page.evaluate(() => window.__siteMotionSamples.filter(sample => sample.section === 'documents').length)).toBe(count);
});

test('the mobile pricing receipt sharpens while it is still fading in', async ({ page }) => {
  const start = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-entrances', 'ready');
  const receipt = page.locator('.cost-receipt');
  await expect(receipt).toHaveAttribute('data-scroll-reveal', 'waiting');
  const appearance = () => receipt.evaluate(element => {
    const { opacity, filter } = getComputedStyle(element);
    return { opacity: Number(opacity), blur: filter === 'none' ? 0 : Number.parseFloat(filter.slice(5)) };
  });
  await receipt.evaluate(element => window.scrollTo({
    top: window.scrollY + element.getBoundingClientRect().top - 360, behavior: 'instant',
  }));
  await expect(receipt).toHaveAttribute('data-scroll-reveal', 'playing');
  await page.clock.runFor(96);
  expect((await appearance()).blur).toBeGreaterThan(1);
  await page.clock.runFor(128);
  const fading = await appearance();
  expect(fading.opacity).toBeGreaterThan(0.5);
  expect(fading.opacity).toBeLessThan(0.85);
  expect(fading.blur).toBeLessThan(0.2);
  await page.clock.runFor(650);
  await expect(receipt).toHaveAttribute('data-scroll-reveal', 'done');
  expect(await appearance()).toEqual({ opacity: 1, blur: 0 });
});

test('changing to reduced motion settles section entrances immediately', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('[data-scroll-reveal]').evaluateAll(elements => elements.every(element => {
    const style = getComputedStyle(element);
    return style.opacity === '1' && style.translate === 'none' && style.filter === 'none';
  }))).toBe(true);
  await page.locator('#documents').scrollIntoViewIfNeeded();
  await expect(page.getByRole('tab', { name: 'Résumé', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.locator('#documents [data-scroll-reveal]').evaluateAll(elements => elements.map(element => getComputedStyle(element).getPropertyValue('--presence-y').trim())), 'A preference change must not replay completed sections').toEqual(['0px', '0px']);
});
