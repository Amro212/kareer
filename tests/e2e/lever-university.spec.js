import { test, expect, LEVER_HOST } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  phone: '+1 555 0100',
  education: [{ institution: 'University of Waterloo' }],
};

async function openFixture(kr) {
  const page = await kr.context.newPage();
  // Captured CSS references production fonts and images. Keep replay local.
  await page.route('**/*', route => new URL(route.request().url()).hostname === LEVER_HOST
    ? route.continue() : route.abort());
  await page.goto(kr.fixtureUrl('jobs.lever.co-2026-09-30-21-49.html', LEVER_HOST));
  await kr.openPanel(page);
  return page;
}

test('captured Lever university fills exactly without scanning hidden fields or replacing GPA', async ({ kr }) => {
  await kr.seed({ profile: PROFILE });
  const page = await openFixture(kr);
  await page.locator('form').first().evaluate(form => {
    form.insertAdjacentHTML('beforeend', `
      <section hidden class="application-question">
        <div class="application-label">Which university do you attend?</div>
        <select id="hidden-university" required><option value="">Choose</option><option>University of Waterloo</option></select>
      </section>
      <div class="application-question">
        <div class="application-label">What is your university GPA?</div>
        <input id="university-gpa">
      </div>
    `);
  });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill complete. Review field statuses below.', { timeout: 60000 });
  await expect(page.locator('[data-qa="university-dropdown"]')).toHaveValue('University of Waterloo');
  await expect(page.locator('#hidden-university')).toHaveValue('');
  await expect(page.locator('#university-gpa')).toHaveValue('Filled university-gpa');

  const schoolRow = page.locator('.kr-review-item').filter({ hasText: 'What Post-Secondary institution do you attend?' });
  await expect(schoolRow).toHaveCount(1);
  await expect(schoolRow).toContainText('VERIFIED');
  await expect(schoolRow).toContainText('PROFILE');
  const requested = kr.openrouter.requests.flatMap(({ body }) => JSON.parse(body.messages.at(-1).content).fieldsToFill || []);
  expect(requested.some(field => field.fieldId === 'hidden-university')).toBe(false);
  expect(requested.some(field => field.ats?.canonicalKey === 'school')).toBe(false);
});

test('captured Lever required university with no usable answer appears as FAILED', async ({ kr }) => {
  await kr.seed({ profile: { ...PROFILE, education: [{ institution: 'An unlisted university' }] } });
  const defaultHandler = kr.openrouter.handler;
  kr.openrouter.handler = body => {
    const response = defaultHandler(body);
    const fields = JSON.parse(body.messages.at(-1).content).fieldsToFill || [];
    const schoolIds = new Set(fields.filter(field => field.ats?.canonicalKey === 'school').map(field => field.fieldId));
    const result = JSON.parse(response.choices[0].message.content);
    for (const answer of result.answers) if (schoolIds.has(answer.fieldId)) answer.value = '';
    response.choices[0].message.content = JSON.stringify(result);
    return response;
  };
  const page = await openFixture(kr);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill complete. Review field statuses below.', { timeout: 60000 });
  await expect(page.locator('[data-qa="university-dropdown"]')).toHaveValue('');
  const schoolRow = page.locator('.kr-review-item').filter({ hasText: 'What Post-Secondary institution do you attend?' });
  await expect(schoolRow).toHaveCount(1);
  await expect(schoolRow).toContainText('FAILED');
  await expect(schoolRow).not.toContainText('UNTOUCHED');
});
