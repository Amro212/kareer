import { test, expect } from '@playwright/test';

test('purchase return and legacy link direct buyers to verification in the extension', async ({ page }) => {
  for (const route of ['/purchase/complete/', '/setup/?purchase=complete']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/purchase\/complete\/$/);
    await expect(page.getByRole('heading', { name: 'Back from checkout' })).toBeVisible();
    await expect(page.getByText('Kareer → Settings → AI & billing', { exact: true })).toBeVisible();
    await expect(page.getByText(/Kareer verifies your purchase there/)).toBeVisible();
  }
});

test('hero stays hidden before hydration, then enters headline and demo, copy, buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/main-*.js', async route => { await blocked; await route.continue(); });
  await page.addInitScript(() => {
    window.__heroStages = [];
    new MutationObserver(records => {
      for (const { target, attributeName } of records) {
        const name = target.id === 'hero-title' ? 'headline' : target.dataset.heroStage;
        if (!name) continue;
        const phase = target.getAttribute(attributeName);
        if (phase === 'playing' || phase === 'done') window.__heroStages.push({ name, phase, time: performance.now() });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-reveal-state', 'data-scroll-reveal'] });
  });
  const loaded = page.goto('/');
  try {
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('#hero-title [data-reveal-visual]')).toBeHidden();
    for (const stage of ['demo', 'copy', 'buttons']) await expect(page.locator(`[data-hero-stage="${stage}"]`)).toHaveCSS('opacity', '0');
  } finally {
    release();
    await loaded;
  }
  await expect(page.locator('[data-hero-stage="buttons"]')).toHaveAttribute('data-scroll-reveal', 'done');
  const events = await page.evaluate(() => window.__heroStages);
  const at = (name, phase) => {
    const event = events.find(event => event.name === name && event.phase === phase);
    expect(event, `${name} must reach ${phase}`).toBeDefined();
    return event.time;
  };
  expect(Math.abs(at('headline', 'playing') - at('demo', 'playing'))).toBeLessThan(100);
  expect(at('demo', 'done') - at('demo', 'playing')).toBeGreaterThan(600);
  expect(at('copy', 'done') - at('copy', 'playing')).toBeGreaterThan(150);
  expect(at('buttons', 'done') - at('buttons', 'playing')).toBeGreaterThan(130);
  expect(at('copy', 'playing')).toBeGreaterThanOrEqual(at('demo', 'done'));
  expect(at('copy', 'playing') - at('headline', 'playing')).toBeLessThan(900);
  expect(at('buttons', 'playing')).toBeGreaterThanOrEqual(at('copy', 'done'));
});

test('mobile hero sequence completes even when the demo starts below the fold', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/');
  await expect(page.locator('.hero-demo-entrance')).not.toBeInViewport();
  await expect(page.locator('[data-hero-stage="buttons"]')).toHaveAttribute('data-scroll-reveal', 'done');
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeVisible();
});

test('a failed script load restores the prerendered content', async ({ page }) => {
  await page.route('**/assets/main-*.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('[data-hero-stage="buttons"]')).toHaveCSS('opacity', '0');
  await expect(page.locator('html')).not.toHaveAttribute('data-entrances', 'pending', { timeout: 6000 });
  await expect(page.locator('#hero-title [data-reveal-visual]')).toBeVisible();
  await expect(page.locator('[data-hero-stage="buttons"]')).toHaveCSS('opacity', '1');
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
  await expect(page.getByRole('heading', { name: 'Job hunting takes enough out of you.' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Local tools' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'A little setup. A lot less repetition.' })).toBeVisible();
  const chromeInstall = page.locator('#browser').getByRole('link', { name: 'Add to Chrome', exact: true });
  const firefoxInstall = page.locator('#browser').getByRole('link', { name: 'Add to Firefox', exact: true });
  await expect(chromeInstall).toBeVisible();
  await expect(chromeInstall).toHaveAttribute('href', 'https://chromewebstore.google.com/detail/kareer/gnbkbdbpajlpclicmapjghpodogkgblf');
  await expect(firefoxInstall).toBeVisible();
  await expect(firefoxInstall).toHaveAttribute('href', 'https://addons.mozilla.org/addon/kareer/');
  await page.getByText('Build for Chrome, Edge or Brave from source', { exact: true }).click();
  await expect(page.getByText('chrome://extensions', { exact: true })).toBeVisible();
  await expect(page.locator('#browser a[href*=".xpi"]')).toHaveCount(0);
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { name: 'Your data. Your business.' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Plain terms. No surprises.' })).toBeVisible();
  await expect(page.locator('#about')).toContainText('form-filling assistant');
  await expect(page.locator('#refunds')).toContainText('All sales are final');
  await expect(page.locator('#keys').getByRole('link', { name: 'kareer@itsamro.me' })).toHaveAttribute('href', 'mailto:kareer@itsamro.me');
  await expect(page.locator('#about')).toContainText('Ontario, Canada');
});

test('pricing lists both plans from the shared offers and explains that purchases start in the extension', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page.getByRole('heading', { name: 'Simple pricing. Pay only for AI.' })).toBeVisible();
  const monthly = page.locator('.pricing-card').filter({ has: page.getByRole('heading', { name: 'Kareer Monthly' }) });
  await expect(monthly).toContainText('US$9.99');
  await expect(monthly).toContainText('1,000 credits each month');
  const pack = page.locator('.pricing-card').filter({ has: page.getByRole('heading', { name: 'Kareer Credit Pack' }) });
  await expect(pack).toContainText('US$4.99');
  await expect(pack).toContainText('300 credits');
  await expect(pack.getByRole('link', { name: 'Get Kareer to buy' })).toHaveAttribute('href', '/setup/');
  await expect(monthly.getByRole('link', { name: 'Get Kareer to buy' })).toHaveAttribute('href', '/setup/');
  await expect(page.locator('.pricing-free').getByRole('link', { name: 'Get Kareer' })).toHaveAttribute('href', '/setup/');
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
  for (const route of ['/', '/setup/', '/privacy/', '/security/', '/terms/', '/pricing/']) {
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
  for (const selector of ['.nav-install', '.hero-actions a', '.documents-copy a.text-link', '.closing-section a.v-btn']) {
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
  for (const [route, heading] of [['/', 'Job hunting takes enough out of you.'], ['/setup/', 'A little setup. A lot less repetition.'], ['/privacy/', 'Your data. Your business.'], ['/security/', 'Kareer Security'], ['/terms/', 'Plain terms. No surprises.'], ['/pricing/', 'Simple pricing. Pay only for AI.']]) {
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
  const paths = ['/', '/setup/', '/pricing/', '/privacy/', '/security/', '/terms/'];
  expect(Array.from((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1])).toEqual(paths.map(path => origin + path));
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain(`<link rel="canonical" href="${origin}${path}"`);
    expect(html).not.toMatch(/name="robots" content="noindex/);
  }
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

test('hero typography and scroll entrances animate once without shifting section layout', async ({ page }) => {
  await page.addInitScript(() => {
    window.__siteMotionSamples = [];
    new MutationObserver(records => {
      for (const record of records) {
        const element = record.target;
        if (!(element instanceof HTMLElement)) continue;
        const hero = element.closest('#hero-title');
        const reveal = element.matches('[data-scroll-reveal]');
        const value = hero ? element.style.getPropertyValue('--reveal-fold') : reveal ? element.style.getPropertyValue('--presence-y') : '';
        if (value && value !== '0deg' && value !== '0px') window.__siteMotionSamples.push({ kind: hero ? 'hero' : 'scroll', section: element.closest('section')?.id, value });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  await page.goto('/');
  await expect(page.locator('#hero-title [data-reveal-line]')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__siteMotionSamples.some(sample => sample.kind === 'hero'))).toBe(true);
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

test('changing to reduced motion settles typography and section entrances immediately', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hero-title [data-reveal-line]')).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('[data-scroll-reveal]').evaluateAll(elements => elements.every(element => {
    const style = getComputedStyle(element);
    return style.opacity === '1' && style.translate === 'none' && style.filter === 'none';
  }))).toBe(true);
  await expect.poll(() => page.locator('#hero-title [data-reveal-line]').evaluateAll(elements => elements.every(element => getComputedStyle(element).transform === 'none'))).toBe(true);
  await page.locator('#documents').scrollIntoViewIfNeeded();
  await expect(page.getByRole('tab', { name: 'Résumé', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try the demo', exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.locator('#documents [data-scroll-reveal]').evaluateAll(elements => elements.map(element => getComputedStyle(element).getPropertyValue('--presence-y').trim())), 'A preference change must not replay completed sections').toEqual(['0px', '0px']);
});
