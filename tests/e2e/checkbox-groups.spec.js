import { test, expect, GREENHOUSE_HOST } from './support/fixtures.js';

for (const [file, host, groupSelector, selectedCounts] of [
  ['greenhouse-paypay-checkboxes-captured.html', GREENHOUSE_HOST, 'fieldset:has(input[name="question_6117561006[]"]),fieldset:has(input[name="question_6117562006[]"])', [2, 2]],
  ['generic-riverrun-checkboxes-captured.html', undefined, '#field_14_11,#field_14_12,#field_14_17', [1, 2, 2]],
]) {
  test(`${file} fills grouped choices with one page request and no false failures`, async ({ kr }) => {
    await kr.seed({ profile: { fullName: 'Test Applicant', email: 'test@example.com', phone: '+1 416 555 0199', city: 'Toronto', country: 'Canada' }, settings: { autoContinue: false, autoSubmit: false } });
    kr.openrouter.handler = body => ({ choices: [{ message: { content: JSON.stringify({ answers: JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field => ({
      fieldId: field.fieldId, value: field.ats?.multiple ? field.options.filter((_, index) => index === 0 || index === 2).map(option => option.label) : true,
      inferred: true,
    })) }) } }] });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl(file, host));
    await page.locator('form').evaluate(form => {
      window.checkboxEvents = [];
      form.addEventListener('change', event => {
        if (event.target.type === 'checkbox') window.checkboxEvents.push({ value: event.target.value, checked: event.target.checked });
      });
    });
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-main-panel')).toContainText(file.startsWith('greenhouse') ? 'Page filled. Auto Continue is off.' : 'Autofill complete. Review field statuses below.', { timeout: 60000 });
    const groups = page.locator(groupSelector);
    for (const [index, count] of selectedCounts.entries()) await expect(groups.nth(index).locator('input:checked')).toHaveCount(count);
    await expect(page.locator('.kr-review-item')).toHaveCount(3);
    await expect(page.locator('#kr-main-panel')).not.toContainText('Repair limit reached');
    expect(kr.openrouter.requests).toHaveLength(1);
    const requested = JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;
    expect(requested).toHaveLength(3);
    expect(requested.filter(field => field.ats?.multiple)).toHaveLength(selectedCounts.length);
    const events = await page.evaluate(() => window.checkboxEvents);
    expect(events).toHaveLength(selectedCounts.reduce((total, count) => total + count, 0) + (file.startsWith('greenhouse') ? 1 : 0));
    expect(events.every(event => event.checked)).toBe(true);
    await expect(page.locator('input[disabled]:checked')).toHaveCount(0);
  });
}

test('generic optional empty checkbox group causes no scroll or checkbox actions', async ({ kr }) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', email: 'test@example.com', phone: '+1 416 555 0199', city: 'Toronto', country: 'Canada' }, settings: { autoContinue: false, autoSubmit: false } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('generic-riverrun-checkboxes-captured.html'));
  await page.locator('form').evaluate(form => {
    form.innerHTML = '<fieldset id="optional"><legend>Optional skills (select all that apply)</legend><label><input type="checkbox" name="skills" value="a">Alpha</label><label><input type="checkbox" name="skills" value="b">Beta</label></fieldset>';
    window.checkboxChanges = 0;
    form.addEventListener('change', () => window.checkboxChanges++);
  });
  kr.openrouter.handler = body => ({ choices: [{ message: { content: JSON.stringify({ answers: JSON.parse(body.messages.at(-1).content).fieldsToFill.map(field => ({ fieldId: field.fieldId, value: [] })) }) } }] });
  await kr.openPanel(page);
  const cdp = await kr.context.newCDPSession(page);
  const worlds = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await cdp.send('Runtime.enable');
  const contentWorld = worlds.find(world => world.origin === `chrome-extension://${kr.extensionId}`);
  expect(contentWorld, JSON.stringify(worlds)).toBeTruthy();
  await cdp.send('Runtime.evaluate', { contextId: contentWorld.id, expression: `
    const fieldset = document.querySelector('#optional');
    fieldset.setAttribute('data-scrolls', '0');
    fieldset.scrollIntoView = () => fieldset.setAttribute('data-scrolls', String(Number(fieldset.getAttribute('data-scrolls')) + 1));
  ` });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill complete. Review field statuses below.');
  await expect(page.locator('#optional')).toHaveAttribute('data-scrolls', '0');
  expect(await page.evaluate(() => window.checkboxChanges)).toBe(0);
  expect(kr.openrouter.requests).toHaveLength(1);
});
