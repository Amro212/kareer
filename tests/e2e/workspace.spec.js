import { test, expect } from './support/fixtures.js';
import fs from 'node:fs';

const profile = {
  fullName: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.org',
  phone: '+1 416 555 0100', city: 'Toronto', country: 'Canada',
  workExperiences: [{ id: 'work', title: 'Software Engineer', company: 'Northstar', startDate: '2022-06', current: true, description: 'Built Python APIs. Reduced latency by 20%.' }],
  education: [{ id: 'education', institution: 'Example University', degree: 'BSc', fieldOfStudy: 'Computer Science', endDate: '2022-05' }],
  projects: [{ id: 'project', name: 'Service Monitor', description: 'Built a Python monitoring tool.' }],
  skills: ['Python', 'SQL'],
};
const section = (page, id) => page.locator(`[data-profile-section="${id}"]`);
const workspaceUrl = kr => `chrome-extension://${kr.extensionId}/materials/index.html`;

async function openProfile(kr) {
  await kr.seed({ profile });
  const page = await kr.context.newPage();
  await page.goto(kr.optionsUrl());
  await expect(section(page, 'identity')).toContainText('Alex Morgan');
  return page;
}

function reply(body) {
  const input = JSON.parse(body.messages.at(-1).content);
  const model = input.kind === 'resume'
    ? { summary: 'Software engineer building reliable Python APIs.', sections: input.source.sections.map(record => ({ id: record.id, bullets: record.bullets, relevance: 3 })) }
    : { paragraphs: ['Dear Hiring Team,', 'My Python API experience supports your integration work.', 'Sincerely,\nAlex Morgan'] };
  return { choices: [{ message: { content: JSON.stringify(model) } }] };
}

async function createApplication(page, title, kind = 'resume') {
  await page.locator('#new-job').click();
  if (kind === 'coverLetter') await page.locator('#tab-coverLetter').click();
  await page.locator('#job-title').fill(title);
  await page.locator('#job-company').fill('Example Labs');
  await page.locator('#job-description').fill('Build reliable Python APIs for customer integrations.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
}

test('Profile starts as summaries; section saves and cancellation preserve other unfinished edits', async ({ kr }) => {
  const page = await openProfile(kr);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('#pf-firstName')).toBeHidden();
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-firstName').fill('Avery');
  await section(page, 'work').getByRole('button', { name: 'Edit experience' }).click();
  await page.locator('#work-experience-list .card-header').click();
  await page.locator('.work-title').fill('Senior Engineer');
  fs.mkdirSync('scratch/saas-preview', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/profile-edit-${width}.png` });
    if (width === 390) {
      const dock = await page.locator('#profile-floating-dock').boundingBox();
      expect(Math.abs(dock.x + dock.width / 2 - width / 2)).toBeLessThan(2);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#pf-lastName').focus();
  await page.keyboard.press('Enter');
  await expect(section(page, 'identity')).toContainText('Avery Morgan');
  expect((await kr.readStorage('kr:profile')).workExperiences[0].title).toBe('Software Engineer');
  await expect(page.locator('.work-title')).toHaveValue('Senior Engineer');
  await section(page, 'work').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(section(page, 'work')).toContainText('Software Engineer');
  await expect(page.locator('#profile-floating-dock')).toBeHidden();
  await page.reload();
  await expect(section(page, 'identity')).toContainText('Avery Morgan');
  expect(errors).toEqual([]);
});

test('Profile stays centered in the available content area at wide and compact widths', async ({ kr }) => {
  const page = await openProfile(kr);
  for (const width of [2048, 1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const main = await page.locator('.settings-main').boundingBox();
    const sidebar = await page.locator('.settings-nav').boundingBox();
    const left = width > 760 ? sidebar.x + sidebar.width : 0;
    expect(Math.abs(main.x + main.width / 2 - (left + width) / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('Profile subsection links jump to summary cards and preserve route history and open edits', async ({ kr }) => {
  const page = await openProfile(kr);
  await expect(page.locator('.profile-section-link')).toHaveCount(12);
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-firstName').fill('Unfinished');
  for (const id of ['projects', 'work']) {
    const link = page.locator(`.profile-section-link[href="#section-${id}"]`);
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'location');
    await expect(section(page, id).locator('h2')).toBeFocused();
    expect((await section(page, id).boundingBox()).y).toBeGreaterThanOrEqual(0);
  }
  await page.goBack();
  await expect(section(page, 'projects').locator('h2')).toBeFocused();
  await expect(page.locator('#pf-firstName')).toHaveValue('Unfinished');
  await section(page, 'identity').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.app-configuration > a').click();
  await expect(page.locator('#profile-subsections')).toBeHidden();
  await page.locator('#profile-nav-link').click();
  await expect(page.locator('#profile-subsections')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('.profile-section-link[href="#section-skills"]').click();
  await expect(section(page, 'skills').locator('h2')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(section(page, 'skills').locator('h2')).toBeFocused();
});

test('Profile failed writes keep fields editable and retries persist them', async ({ kr }) => {
  const page = await openProfile(kr);
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-email').fill('new@example.org');
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === 'kr:profile-patch') {
        chrome.runtime.sendMessage = original;
        callback({ error: 'Storage temporarily unavailable.' });
        return;
      }
      return original(message, callback);
    };
  });
  await section(page, 'identity').getByRole('button', { name: 'Save section' }).click();
  await expect(section(page, 'identity')).toContainText('Storage temporarily unavailable');
  await expect(page.locator('#pf-email')).toBeEnabled();
  await expect(page.locator('#pf-email')).toHaveValue('new@example.org');
  expect((await kr.readStorage('kr:profile')).email).toBe('alex@example.org');
  await section(page, 'identity').getByRole('button', { name: 'Save section' }).click();
  await expect(section(page, 'identity')).toContainText('new@example.org');
  expect((await kr.readStorage('kr:profile')).email).toBe('new@example.org');
});

test('Profile detects a newer section in another window and keeps the local edits', async ({ kr }) => {
  const page = await openProfile(kr);
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-email').fill('local@example.org');
  await kr.seed({ profile: { email: 'other-window@example.org' } });
  await section(page, 'identity').getByRole('button', { name: 'Save section' }).click();
  await expect(section(page, 'identity')).toContainText('changed in another window');
  await expect(page.locator('#pf-email')).toHaveValue('local@example.org');
  expect((await kr.readStorage('kr:profile')).email).toBe('other-window@example.org');
});

test('Materials opens on recent applications, searches jobs, and preserves edits when returning to the library', async ({ kr }) => {
  await kr.seed({ profile });
  kr.openrouter.handler = reply;
  const page = await kr.context.newPage();
  await page.goto(workspaceUrl(kr));
  await expect(page.locator('#materials-library')).toBeVisible();
  await expect(page.locator('#application-list')).toContainText('Your next application starts here');
  fs.mkdirSync('scratch/saas-preview', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createApplication(page, 'Backend Engineer');
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#view-prepare').click();
    await expect(page.locator('#view-prepare')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#view-edit')).toHaveAttribute('aria-selected', 'false');
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/prepare-${width}.png` });
    await page.locator('#view-edit').click();
    await expect(page.locator('#view-edit')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#view-prepare')).toHaveAttribute('aria-selected', 'false');
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/editor-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#resume-summary').fill('Current edits before returning to the library.');
  await page.locator('#back-to-library').click();
  await expect(page.locator('#materials-library')).toBeVisible();
  await expect(page.locator('.application-row')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#materials-library')).toBeVisible();
  await page.locator('.application-document').click();
  await expect(page.locator('#resume-summary')).toHaveText('Current edits before returning to the library.');
  await page.locator('#back-to-library').click();
  await createApplication(page, 'Platform Engineer', 'coverLetter');
  await page.locator('#materials-home').click();
  await expect(page.locator('.application-row')).toHaveCount(2);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/library-${width}.png` });
  }
  await page.locator('#application-search').fill('platform');
  await expect(page.locator('.application-row')).toHaveCount(1);
  await page.locator('.application-open').click();
  await expect(page.locator('#tab-coverLetter')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.paper-letter')).toContainText('My Python API experience');
});

test('workspace layouts fit desktop, compact and narrow widths; keyboard focus and reduced motion remain usable', async ({ kr }) => {
  const page = await openProfile(kr);
  fs.mkdirSync('scratch/saas-preview', { recursive: true });
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/profile-${width}.png` });
  }
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pf-firstName')).toBeFocused();
  await page.screenshot({ animations: 'disabled', path: 'scratch/saas-preview/profile-edit-mobile.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('#profile-editor-identity').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await section(page, 'identity').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' })).toBeFocused();
  await page.goto(workspaceUrl(kr));
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ animations: 'disabled', path: `scratch/saas-preview/library-empty-${width}.png` });
  }
  await page.locator('#new-job').click();
  await expect(page.locator('#job-title')).toBeFocused();
  expect(await page.locator('#job-description').evaluate(el => el.getBoundingClientRect().height)).toBe(160);
});

test('empty Profile, validation, skill edits and Cancel keep an honest overview', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.goto(kr.optionsUrl());
  await expect(section(page, 'identity')).toContainText('No details added yet');
  await expect(page.locator('#profile-floating-dock')).toBeHidden();
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-email').fill('invalid email');
  await section(page, 'identity').getByRole('button', { name: 'Save section' }).click();
  await expect(page.locator('#pf-email')).toBeFocused();
  expect(await page.locator('#pf-email').evaluate(input => input.validity.valid)).toBe(false);
  await section(page, 'identity').getByRole('button', { name: 'Cancel', exact: true }).click();
  await section(page, 'skills').getByRole('button', { name: 'Edit skills' }).click();
  await page.locator('#skill-input').fill('Python, SQL');
  await page.keyboard.press('Enter');
  await expect(page.locator('.skill-chip')).toHaveCount(2);
  await section(page, 'skills').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(section(page, 'skills')).toContainText('No details added yet');
  await expect(page.locator('#profile-floating-dock')).toBeHidden();
});

test('Profile and Materials startup failures have working retry controls', async ({ kr }) => {
  await kr.seed({ profile });
  const profilePage = await kr.context.newPage();
  await profilePage.addInitScript(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === 'kr:snapshot') {
        chrome.runtime.sendMessage = send;
        callback({ error: 'Snapshot temporarily unavailable.' });
      } else return send(message, callback);
    };
  });
  await profilePage.goto(kr.optionsUrl());
  await expect(profilePage.locator('#profile-feedback')).toContainText('Snapshot temporarily unavailable');
  await expect(profilePage.locator('#profile')).toHaveAttribute('aria-busy', 'false');
  await profilePage.locator('#profile-retry').click();
  await expect(profilePage.locator('[data-profile-section]')).toHaveCount(12);
  await expect(section(profilePage, 'identity')).toContainText('Alex Morgan');

  const materials = await kr.context.newPage();
  await materials.addInitScript(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === 'kr:materials' && message.operation === 'list') {
        chrome.runtime.sendMessage = send;
        callback({ error: 'Library temporarily unavailable.' });
      } else return send(message, callback);
    };
  });
  await materials.goto(workspaceUrl(kr));
  await expect(materials.locator('#workspace-load-message')).toContainText('Library temporarily unavailable');
  await expect(materials.locator('#application-list')).toHaveAttribute('aria-busy', 'false');
  await materials.locator('#workspace-retry').click();
  await expect(materials.locator('#workspace-load-error')).toBeHidden();
  await expect(materials.locator('#application-list')).toContainText('Your next application starts here');
});

test('a partial Profile save preserves unrelated external changes and later rejects stale fields', async ({ kr }) => {
  const page = await openProfile(kr);
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-email').fill('new@example.org');
  await kr.seed({ profile: { skills: ['Python', 'SQL', 'Rust'] } });
  await section(page, 'identity').getByRole('button', { name: 'Save section' }).click();
  await expect(page.locator('#profile-feedback')).toContainText('saved locally');
  expect((await kr.readStorage('kr:profile')).skills).toEqual(['Python', 'SQL', 'Rust']);
  await section(page, 'skills').getByRole('button', { name: 'Edit skills' }).click();
  await page.locator('#skill-input').fill('Go');
  await page.keyboard.press('Enter');
  await section(page, 'skills').getByRole('button', { name: 'Save section' }).click();
  await expect(section(page, 'skills')).toContainText('changed in another window');
  await expect(page.locator('.skill-chip')).toContainText(['Python', 'SQL', 'Go']);
  expect((await kr.readStorage('kr:profile')).skills).toEqual(['Python', 'SQL', 'Rust']);
});

test('simultaneous Profile windows cannot overwrite the same section', async ({ kr }) => {
  const first = await openProfile(kr);
  const second = await kr.context.newPage();
  await second.goto(kr.optionsUrl());
  for (const [page, name] of [[first, 'Avery'], [second, 'Blair']]) {
    await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
    await page.locator('#pf-firstName').fill(name);
  }
  await Promise.all([first, second].map(page => section(page, 'identity').getByRole('button', { name: 'Save section' }).click()));
  await expect.poll(async () => {
    return (await first.locator('.profile-section-actions .error').count()) + (await second.locator('.profile-section-actions .error').count());
  }).toBe(1);
  expect(['Avery Morgan', 'Blair Morgan']).toContain((await kr.readStorage('kr:profile')).fullName);
});

test('bulk Profile save failures remain visible, keep their inputs and recover on retry', async ({ kr }) => {
  const page = await openProfile(kr);
  await section(page, 'identity').getByRole('button', { name: 'Edit identity & contact' }).click();
  await page.locator('#pf-email').fill('recover@example.org');
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === 'kr:profile-patch') {
        chrome.runtime.sendMessage = send;
        callback({ error: 'Storage temporarily unavailable.' });
      } else return send(message, callback);
    };
  });
  await page.locator('#floating-save-btn').click();
  await expect(page.locator('#dock-status-message')).toHaveText('Save needs attention');
  await expect(page.locator('#pf-email')).toBeEnabled();
  await expect(page.locator('#pf-email')).toHaveValue('recover@example.org');
  await page.locator('#floating-save-btn').click();
  await expect(page.locator('#profile-floating-dock')).toBeHidden();
  expect((await kr.readStorage('kr:profile')).email).toBe('recover@example.org');
});

test('missing profile data recovers in a new tab without losing the job description', async ({ kr }) => {
  await kr.seed();
  kr.openrouter.handler = reply;
  const page = await kr.context.newPage();
  await page.goto(workspaceUrl(kr));
  await page.locator('#new-job').click();
  await page.locator('#job-description').fill('Build reliable Python APIs.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Add experience');
  expect(kr.openrouter.requests).toHaveLength(0);
  const opened = kr.context.waitForEvent('page');
  await page.locator('.profile-source a').click();
  const profilePage = await opened;
  await section(profilePage, 'skills').getByRole('button', { name: 'Edit skills' }).click();
  await profilePage.locator('#skill-input').fill('Python');
  await profilePage.keyboard.press('Enter');
  await section(profilePage, 'skills').getByRole('button', { name: 'Save section' }).click();
  await expect(page.locator('#profile-summary')).toContainText('1 enabled profile section');
  await expect(page.locator('#job-description')).toHaveValue('Build reliable Python APIs.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
});

test('generation shows progress, cancels cleanly and retains the document after provider failure', async ({ kr }) => {
  await kr.seed({ profile });
  kr.openrouter.handler = reply;
  kr.openrouter.delayMs = 2000;
  const page = await kr.context.newPage();
  await page.goto(workspaceUrl(kr));
  await page.locator('#new-job').click();
  await page.locator('#job-description').fill('Build reliable Python APIs.');
  await page.locator('#generate').click();
  await expect(page.locator('#cancel')).toBeVisible();
  await expect(page.locator('#generate')).toBeDisabled();
  await expect(page.locator('#view-edit')).toBeDisabled();
  await page.locator('#cancel').click();
  await expect(page.locator('#feedback')).toContainText('Generation canceled');
  await expect(page.locator('#feedback')).not.toHaveClass(/error/);
  await expect(page.locator('#generate')).toBeEnabled();
  kr.openrouter.delayMs = 0;
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  const original = await page.locator('#resume-summary').textContent();
  await page.locator('#view-prepare').click();
  kr.openrouter.status = 500;
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('OpenRouter returned 500');
  await expect(page.locator('#generate')).toBeEnabled();
  await page.locator('#view-edit').click();
  await expect(page.locator('#resume-summary')).toHaveText(original);
});

test('long profile facts and application names remain readable without horizontal page overflow', async ({ kr }) => {
  const title = 'LongRole'.repeat(45);
  await kr.seed({ profile: { ...profile, workExperiences: [{ ...profile.workExperiences[0], title, company: title }] } });
  const page = await kr.context.newPage();
  await page.goto(kr.optionsUrl());
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(section(page, 'work')).toContainText(title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await section(page, 'work').getByRole('button', { name: 'Edit experience' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  kr.openrouter.handler = reply;
  await page.goto(workspaceUrl(kr));
  await page.locator('#new-job').click();
  await page.locator('#job-title').fill(title);
  await page.locator('#job-company').fill(title);
  await page.locator('#job-description').fill('Build reliable Python APIs.');
  await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await expect(page.locator('#job-heading')).toHaveAttribute('title', title);
  await expect(page.locator('#company-heading')).toHaveAttribute('title', title);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('#editor-section').evaluate(element => element.clientHeight)).toBeGreaterThan(150);
  }
});
