import { test, expect, WORKDAY_HOST } from './support/fixtures.js';

const profile = { fullName: 'Test Applicant', firstName: 'Test', lastName: 'Applicant', email: 'test@example.com', phone: '+442079460123', country: 'Canada', raceEthnicity: ['Black', 'Asian'],
  skills: ['Python', 'JavaScript'], workExperiences: [{ id: 'engineer', title: 'Engineer', company: 'Acme', description: 'Built useful tools.' }, { id: 'tutor', title: 'Tutor', company: 'Paper', description: 'Taught math.' }] };

test('Workday Enter prompts commit owned tokens and parsed experience rows are completed without duplicates or AI', async ({ kr }) => {
  await kr.seed({ profile, settings: { autoContinue: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-prompts-fixture.html', WORKDAY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('#legalName--firstName')).toHaveValue('Test');
  await expect(page.locator('#legalName--lastName')).toHaveValue('Applicant');
  await expect(page.locator('#phoneNumber--phoneNumber')).toHaveValue('2079460123');
  await expect(page.locator('#source--source')).toHaveValue('');
  await expect(page.locator('[data-automation-id="formField-source"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', 'LinkedIn');
  await expect(page.locator('[data-automation-id="formField-countryPhoneCode"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', 'United Kingdom (+44)');
  await expect(page.locator('[data-automation-id="formField-skills"] [data-automation-id="selectedItem"]')).toHaveCount(2);
  await expect(page.locator('[value="black-code"]')).toBeChecked();
  await expect(page.locator('[value="asian-code"]')).toBeChecked();
  await expect(page.locator('[value="old"]')).toBeChecked();
  await expect(page.locator('#workExperience-1--roleDescription')).toHaveValue('Built useful tools.');
  await expect(page.locator('#workExperience-2--jobTitle')).toHaveValue('Tutor');
  await expect(page.locator('#workExperience-2--roleDescription')).toHaveValue('Taught math.');
  expect(kr.openrouter.requests).toHaveLength(0);
  expect(await page.evaluate(() => window.fixture)).toMatchObject({ submits: 0, adds: 1, continues: 0 });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  expect(await page.evaluate(() => window.fixture.adds)).toBe(1);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('Workday profile autofill works without an API key', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile, settings: { autoContinue: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-prompts-fixture.html', WORKDAY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('#legalName--firstName')).toHaveValue('Test');
  await expect(page.locator('[data-automation-id="formField-source"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', 'LinkedIn');
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('options save legal name parts, phone country, and structured languages', async ({ kr }) => {
  const page = await kr.context.newPage();
  await page.goto(kr.optionsUrl());
  await page.locator('#pf-firstName').fill('Test');
  await page.locator('#pf-lastName').fill('Applicant');
  await page.locator('#pf-phoneCountry').fill('United Kingdom');
  await page.getByRole('button', { name: 'Add language', exact: true }).click();
  const languages = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Structured languages' }) });
  await languages.getByLabel('Language', { exact: true }).fill('English');
  await languages.getByLabel('Fluent?', { exact: true }).selectOption('Yes');
  await languages.getByLabel('Reading', { exact: true }).fill('Advanced');
  await page.locator('#profile-form button[type=submit]').click();
  await expect(page.locator('#profile-feedback')).toHaveText('Profile saved.');
  const saved = await kr.readStorage('kr:profile');
  expect(saved).toMatchObject({ firstName: 'Test', lastName: 'Applicant', phoneCountry: 'United Kingdom' });
  expect(saved.languageRecords).toHaveLength(1);
  expect(saved.languageRecords[0]).toMatchObject({ language: 'English', fluent: 'Yes', reading: 'Advanced', writing: '', speaking: '' });
  await page.reload();
  await expect(languages.getByLabel('Language', { exact: true })).toHaveValue('English');
});

test('CBC Workday disclosures commit exact gender and prompt choices including ethnicity', async ({ kr }) => {
  await kr.seed({ apiKey: '', profile: { ...profile, city: 'Toronto', gender: 'Man', pronouns: 'He/him', disabilityStatus: 'No', raceEthnicity: 'Middle Eastern' }, settings: { autoContinue: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('workday-cbc-disclosures-fixture.html', WORKDAY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 90000 });
  await expect(page.locator('#personalInfoPerson--gender')).toHaveText('Male');
  await expect(page.locator('[data-automation-id="formField-pronouns"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', 'He/him');
  await expect(page.locator('[data-automation-id="formField-disabilities"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', "No - I don't have any disability (Canada)");
  await expect(page.locator('[data-automation-id="formField-ethnicities"] [data-automation-id="selectedItem"]')).toHaveAttribute('title', /Arab and\/or Maghrebi/);
  expect(await page.evaluate(() => window.fixture)).toMatchObject({ submits: 0, continues: 0 });
  expect(kr.openrouter.requests).toHaveLength(0);
});
