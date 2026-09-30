import { test, expect, WORKDAY_HOST } from './support/fixtures.js';

const profile = {
  fullName: 'Test Applicant', email: 'test@example.com',
  workExperiences: [
    { id: 'writer', company: 'NewCorp', title: 'Writer', description: 'Wrote documentation.' },
    { id: 'acme', company: 'Acme', title: 'Senior Developer', startDate: '2023-09', endDate: '2024-12', current: false, description: 'Built useful tools.' },
    { id: 'old', company: 'ReturnCo', title: 'Engineer', startDate: '2021-02', description: 'Earlier role.' },
    { id: 'new', company: 'ReturnCo', title: 'Engineer', startDate: '2023-09', description: 'Later role.' },
    { id: 'tutor', company: 'Paper', title: 'Tutor', description: 'Taught math.' },
  ],
  education: [{ id: 'edu', institution: 'University', degree: "Master's degree", gpa: '' }],
  languageRecords: [{ id: 'english', language: 'English', reading: 'Advanced' }],
};

for (const overwriteExisting of [false, true]) {
  test(`Workday reconciles parsed rows in place and preserves unmatched values (overwrite=${overwriteExisting})`, async ({ kr }) => {
    await kr.seed({ apiKey: '', profile, settings: { autoContinue: false, overwriteExisting } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('workday-parsed-rows-fixture.html', WORKDAY_HOST));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('[data-automation-id^="workExperience-"]')).toHaveCount(6);
    await expect(page.locator('[data-automation-id^="education-"]')).toHaveCount(1);
    await expect(page.locator('[data-automation-id="formField-school"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', 'University');
    await expect(page.locator('#workExperience-1--jobTitle')).toHaveValue('Senior Developer');
    await expect(page.locator('#workExperience-1--roleDescription')).toHaveValue('Built useful tools.');
    await expect(page.locator('#workExperience-1--currentlyWorkHere')).not.toBeChecked();
    await expect(page.locator('#work-1-startDate-year')).toHaveValue('2023');
    await expect(page.locator('#work-1-startDate-month')).toHaveValue('9');
    await expect(page.locator('#work-1-endDate-year')).toHaveValue('2024');
    await expect(page.locator('#work-1-endDate-month')).toHaveValue('12');
    await expect(page.locator('#workExperience-2--jobTitle')).toHaveValue('User role');
    await expect(page.locator('#workExperience-2--roleDescription')).toHaveValue('');
    await expect(page.locator('#workExperience-3--roleDescription')).toHaveValue('Later role.');
    await expect(page.locator('#workExperience-4--roleDescription')).toHaveValue('Earlier role.');
    await expect(page.locator('#workExperience-5--jobTitle')).toHaveValue('Writer');
    await expect(page.locator('#workExperience-6--jobTitle')).toHaveValue('Tutor');
    await expect(page.locator('#education-1--degree')).toHaveText('Master of Science');
    await expect(page.locator('#education-1--gpa')).toHaveValue('3.8');
    await expect(page.locator('#language-1--reading')).toHaveValue('Advanced');
    await expect(page.locator('#website--url')).toHaveValue('https://user.example');
    expect(await page.evaluate(() => window.fixture)).toMatchObject({ adds: 1, submits: 0, continues: 0 });
    expect(kr.openrouter.requests).toHaveLength(0);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('[data-automation-id^="workExperience-"]')).toHaveCount(6);
    await expect(page.locator('[data-automation-id^="education-"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.fixture.adds)).toBe(1);
    expect(kr.openrouter.requests).toHaveLength(0);
    const options = await kr.context.newPage();
    await options.goto(kr.optionsUrl());
    await expect(options.locator('.work-enabled-toggle')).toHaveCount(profile.workExperiences.length);
    for (const toggle of await options.locator('.work-enabled-toggle').all()) await toggle.uncheck();
    await options.locator('#profile-form button[type=submit]').click();
    await expect(options.locator('#profile-feedback')).toHaveText('Profile saved.');
    const savedWork = (await kr.readStorage('kr:profile')).workExperiences;
    expect(savedWork).toHaveLength(profile.workExperiences.length);
    expect(savedWork.every(record => record.enabled === false)).toBe(true);
    await page.bringToFront();
    await page.locator('#workExperience-1--roleDescription').fill('User edited after disabling the record.');
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#workExperience-1--roleDescription')).toHaveValue('User edited after disabling the record.');
    expect(await page.evaluate(() => window.fixture.adds)).toBe(1);
  });
}

test('Workday pauses tied employer matches before adding or modifying rows', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile: { fullName: 'Test Applicant', email: 'test@example.com', workExperiences: [
    { id: 'missing', title: 'Tutor', company: 'Paper' },
    { id: 'a', title: 'Engineer', company: 'Acme' },
    { id: 'b', title: 'Manager', company: 'Acme' },
  ] }, settings: { autoContinue: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-parsed-rows-fixture.html', WORKDAY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('#kr-main-panel')).toContainText(/ambiguous parsed rows/i);
  await expect(page.locator('#workExperience-1--jobTitle')).toHaveValue('Developer');
  expect(await page.evaluate(() => window.fixture)).toMatchObject({ adds: 0, submits: 0, continues: 0 });
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('Workday application workflow reconciles saved rows before its review pause', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile, settings: { autoContinue: false, overwriteExisting: true } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-parsed-rows-fixture.html', WORKDAY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-capture-job').click();
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toHaveText(/next step/i, { timeout: 60000 });
  await expect(page.locator('#workExperience-1--jobTitle')).toHaveValue('Senior Developer');
  await expect(page.locator('#work-1-startDate-year')).toHaveValue('2023');
  await expect(page.locator('#work-1-endDate-year')).toHaveValue('2024');
  await expect(page.locator('#workExperience-2--roleDescription')).toHaveValue('');
  await expect(page.locator('#education-1--degree')).toHaveText('Master of Science');
  expect(await page.evaluate(() => window.fixture)).toMatchObject({ adds: 1, submits: 0, continues: 0 });
  expect(kr.openrouter.requests).toHaveLength(0);
});
