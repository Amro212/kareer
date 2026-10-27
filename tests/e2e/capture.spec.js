import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './support/fixtures.js';
import { capturePage } from './support/capture.js';

const PROFILE = {
  fullName: 'Amrit Kaur Singh',
  email: 'amrit.singh@example.com',
  phone: '+1 416 555 0134',
  location: 'Toronto, Ontario, Canada',
  resumeContext: 'Shipped payments systems at scale.',
};

test.describe('fixture capture', () => {
  test('captures a page and its cross-origin frame as separate sanitized files', async ({ kr }) => {
    await kr.seed({ profile: PROFILE });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('embedded-host.html'));
    await kr.openPanel(page);
    await expect(page.locator('#kr-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    // Put real-looking applicant data into the embedded form first, so the
    // capture has something it must strip.
    const frame = page.frameLocator('iframe[src*="embed.kareer.test"]');
    await frame.locator('#name').fill('Amrit Kaur Singh');
    await frame.locator('#email').fill('amrit.singh@example.com');
    await frame.locator('#why').fill('Shipped payments systems at scale.');

    await expect(page.locator('[data-tab=debug]')).toHaveCount(0);

    const files = await capturePage(page, kr);

    expect(files.length).toBe(2);
    await expect(page.locator('#kr-capture-fixture')).toHaveCount(0);

    const host = files.find((file) => !file.name.includes('frame1'));
    const embed = files.find((file) => file.name.includes('frame1'));
    expect(host).toBeTruthy();
    expect(embed).toBeTruthy();

    // The embedded frame captured its own document, which the host cannot read.
    expect(embed.body).toContain('id="name"');
    expect(embed.body).toContain('Current location');
    expect(embed.body).toContain('University or college');

    for (const file of files) {
      for (const secret of ['Amrit Kaur Singh', 'amrit.singh@example.com', 'Shipped payments systems']) {
        expect(file.body, `${secret} leaked into ${file.name}`).not.toContain(secret);
      }
      expect(file.body).not.toContain('kareer-root');
      expect(file.body).toContain('Kareer captured fixture');
    }

    // The host file points at the frame file rather than the live origin.
    expect(host.body).toContain(embed.name);
    expect(host.body).toContain('data-kr-original-host="embed.kareer.test"');
  });

  test('a captured fixture replays through the field engine', async ({ kr }) => {
    await kr.seed({ profile: PROFILE });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await expect(page.locator('[data-tab=debug]')).toHaveCount(0);
    const detected = page.locator('#kr-main-panel .kr-badge-blue').first();
    await expect(detected).toHaveText(/\d+ detected/);
    const originalCount = await detected.textContent();

    const files = await capturePage(page, kr);
    expect(files.length).toBe(1);

    // Serve the capture back and confirm the scanner still sees the same fields.
    const replayName = 'replay-capture.html';
    const replayPath = path.join(process.cwd(), 'fixtures', replayName);
    fs.writeFileSync(replayPath, files[0].body, 'utf8');

    try {
      const replay = await kr.context.newPage();
      await replay.goto(kr.fixtureUrl(replayName));
      await kr.openPanel(replay);
      await expect(replay.locator('#kr-main-panel .kr-badge-blue').first()).toHaveText(originalCount, { timeout: 20000 });
    } finally {
      fs.rmSync(replayPath, { force: true });
    }
  });
});
