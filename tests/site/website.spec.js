import { test, expect } from '@playwright/test';

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
  expect(at('copy', 'done') - at('copy', 'playing')).toBeGreaterThan(300);
  expect(at('buttons', 'done') - at('buttons', 'playing')).toBeGreaterThan(250);
  expect(at('copy', 'playing')).toBeGreaterThanOrEqual(Math.max(at('headline', 'done'), at('demo', 'done')));
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

test('fictional autofill demo completes, explains answers and replays without AI requests', async ({ page }) => {
  const externalRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4177')) externalRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Job hunting takes enough out of you.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible();
  await page.getByRole('button', { name: 'Explain answer: Why this role?' }).click();
  await expect(page.locator('#answer-explanation')).toContainText('Inferred from the sample profile and job description.');
  expect(await page.evaluate(() => {
    const stamp = document.querySelector('.completion-stamp').getBoundingClientRect();
    const action = document.querySelector('.demo-action').getBoundingClientRect();
    return stamp.bottom <= action.top || stamp.top >= action.bottom || stamp.right <= action.left || stamp.left >= action.right;
  }), 'Completion stamp must leave the replay control clear').toBe(true);
  await page.getByRole('button', { name: 'Replay demo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ready for your review' })).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('setup and privacy are directly accessible static pages', async ({ page }) => {
  await page.goto('/setup/');
  await expect(page.getByRole('heading', { name: 'A little setup. A lot less repetition.' })).toBeVisible();
  await page.getByRole('tab', { name: 'Chrome & Edge' }).click();
  await expect(page.getByText('chrome://extensions', { exact: true })).toBeVisible();
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { name: 'Your data. Your business.' })).toBeVisible();
  await expect(page.locator('#ai-transmission')).toContainText('OpenRouter');
  await expect(page.locator('#retention')).toBeVisible();
});

test('mobile navigation, reduced-motion demo and pages fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/', '/setup/', '/privacy/']) {
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

test('content and installation links are available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [route, heading] of [['/', 'Job hunting takes enough out of you.'], ['/setup/', 'A little setup. A lot less repetition.'], ['/privacy/', 'Your data. Your business.']]) {
    await page.goto(`http://127.0.0.1:4177${route}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  }
  await context.close();
});

test('document tabs, FAQ disclosures and keyboard activation work', async ({ page }) => {
  await page.goto('/');
  const letter = page.getByRole('tab', { name: 'Cover letter', exact: true });
  await letter.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'A proper introduction.' })).toBeVisible();
  await page.getByText('Is Kareer actually free?', { exact: true }).click();
  await expect(page.getByText('Kareer is free and open source, with no Kareer subscription or premium tier.', { exact: false })).toBeVisible();
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
