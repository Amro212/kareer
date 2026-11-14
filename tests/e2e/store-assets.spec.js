import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './support/fixtures.js';

// Store captures use an isolated test profile and mocked AI, never applicant data.
test('capture real extension store screenshots with fictional data', async ({ kr }) => {
  test.skip(process.env.KR_STORE_ASSETS !== '1', 'Opt-in store asset capture');
  const out = path.resolve('docs/store-assets/chrome');
  fs.mkdirSync(out, { recursive: true });
  const profile = {
    fullName: 'Alex Morgan', firstName: 'Alex', lastName: 'Morgan',
    email: 'alex.morgan@example.com', phone: '+1 416 555 0142', location: 'Toronto, Ontario, Canada',
    city: 'Toronto', stateProvince: 'Ontario', country: 'Canada',
    workExperiences: [{ id: 'work1', title: 'Software Developer', company: 'Maple Studio', startDate: '2023-05', endDate: '2026-04',
      description: 'Built JavaScript dashboards for customer support teams. Developed Python APIs and SQL reporting queries. Documented integrations and supported releases.' }],
    education: [{ id: 'edu1', institution: 'Example University', degree: "Bachelor's degree", fieldOfStudy: 'Computer Science', startDate: '2019-09', endDate: '2023-04' }],
    projects: [{ id: 'project1', name: 'Community Events', description: 'Built a volunteer event directory with JavaScript and accessible forms.' }],
    skills: ['JavaScript', 'Python', 'SQL', 'Git', 'API development'],
  };
  await kr.seed({ profile, settings: { autoContinue: false, autoSubmit: false } });
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    const value = input.kind ? {
      summary: 'Software developer building useful web applications, APIs and reporting tools. Experienced in JavaScript, Python and SQL, with a focus on clear documentation and dependable releases.',
      sections: input.source.sections.map(s => ({ id: s.id, bullets: s.bullets })),
    } : { answers: (input.fieldsToFill || []).map(f => ({ fieldId: f.fieldId,
      value: 'I enjoy building tools that make daily work easier. At Maple Studio, I developed JavaScript dashboards, Python APIs and SQL reports for support teams. I would bring that practical experience to your engineering team.',
      provenance: 'inferred', source: 'ai', confidence: 0.9 })) };
    return { choices: [{ message: { content: JSON.stringify(value) } }] };
  };
  const page = await kr.context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(kr.fixtureUrl('store-demo-application.html'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#email')).toHaveValue(profile.email);
  await expect(page.locator('#first-name')).toHaveValue('Alex');
  await expect(page.locator('#motivation')).toHaveValue(/Maple Studio/, { timeout: 30000 });
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  await page.locator('#motivation').blur();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector('#kareer-root').shadowRoot.querySelector('.kr-content').scrollTop = 0;
  });
  await page.screenshot({ path: path.join(out, 'screenshot-01-autofill.png'), animations: 'disabled' });

  const options = await kr.context.newPage();
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.goto(kr.optionsUrl());
  await expect(options.locator('#pf-fullName')).toHaveValue(profile.fullName);
  await expect(options.locator('body')).toContainText('Maple Studio');
  await options.evaluate(() => document.fonts.ready);
  await options.screenshot({ path: path.join(out, 'screenshot-02-profile.png'), animations: 'disabled' });

  const workspace = await kr.context.newPage();
  await workspace.setViewportSize({ width: 1280, height: 800 });
  await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-title').fill('Software Engineer');
  await workspace.locator('#job-company').fill('Northstar Labs');
  await workspace.locator('#job-description').fill('Build reliable web applications and APIs with JavaScript, Python and SQL. Document integrations and collaborate with support teams.');
  await workspace.locator('#generate').click();
  await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await expect(workspace.locator('#edit-panel')).toBeVisible();
  await expect(workspace.locator('#resume-summary')).toContainText('Software developer');
  await expect(workspace.locator('#document-status')).toContainText('Saved locally');
  expect(kr.openrouter.requests.every(request => request.body.provider.data_collection === 'deny')).toBe(true);
  await workspace.screenshot({ path: path.join(out, 'screenshot-03-documents.png'), animations: 'disabled' });
});
