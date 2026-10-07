
import { test, expect, ASHBY_HOST } from './support/fixtures.js';

test('captured Quora parser and Resume stay verified after Ashby clears required file inputs', async ({ kr }) => {
  const profile = { fullName: 'Test Applicant', email: 'test@example.com' };
  await kr.seed({ profile, settings: { autoContinue: false, autoSubmit: false }, resume: { name: 'resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('jobs.ashbyhq.com-2026-10-07-05-29.html', ASHBY_HOST));
  await page.evaluate(() => {
    const parser = document.querySelector('.ashby-application-form-autofill-input-root');
    const entries = ['_systemfield_name', '_systemfield_email', '_systemfield_resume'].map(id => document.getElementById(id).closest('.ashby-application-form-field-entry'));
    document.querySelector('[aria-labelledby="job-application-form"]').replaceChildren(parser, ...entries);
    document.querySelectorAll('[data-state=hidden]').forEach(node => { node.hidden = true; });
    document.body.dataset.parserUploads = '0';
    document.body.dataset.resumeUploads = '0';
    const input = parser.querySelector('input[type=file]');
    const resume = document.getElementById('_systemfield_resume');
    const accept = name => {
      const root = resume.closest('.ashby-application-form-input-file');
      root.querySelectorAll('.ashby-application-form-input-file-item').forEach(node => node.remove());
      const item = document.createElement('div');
      item.className = 'ashby-application-form-input-file-item';
      item.innerHTML = '<p class="_name_10xk4_41 ashby-application-form-input-file-item-name"><svg></svg><span></span></p><button type="button" title="Delete file"></button>';
      item.querySelector('span').textContent = name;
      root.insertBefore(item, root.querySelector('.ashby-application-form-input-file-dropzone'));
      root.querySelector('.ashby-application-form-input-file-dropzone-upload').textContent = 'Replace';
      resume.value = '';
    };
    input.onchange = () => {
      const name = input.files[0].name;
      document.body.dataset.parserUploads = String(Number(document.body.dataset.parserUploads) + 1);
      parser.dataset.state = 'pending';
      parser.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        input.value = '';
        accept(name);
        parser.dataset.state = 'default';
        parser.removeAttribute('aria-busy');
        parser.querySelector('.ashby-application-form-autofill-input-base-layer').insertAdjacentHTML('beforeend', '<div class="ashby-application-form-autofill-input-form-alert" data-highlight="positive"><h2>Autofill completed!</h2><p>Please review the information we filled in for you below.</p></div>');
      }, 400);
    };
    resume.onchange = () => {
      document.body.dataset.resumeUploads = String(Number(document.body.dataset.resumeUploads) + 1);
      accept(resume.files[0].name);
    };
  });
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.', { timeout: 30000 });
  await expect(page.locator('#kr-main-panel')).toContainText('4 VERIFIED');
  await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill from resume');
  await expect(page.locator('.ashby-application-form-input-file-item-name')).toHaveText('resume.pdf');
  expect(await page.locator('#_systemfield_resume').evaluate(input => input.required && input.files.length === 0)).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-parser-uploads', '1');
  await expect(page.locator('body')).toHaveAttribute('data-resume-uploads', '0');
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.');
  await expect(page.locator('#kr-main-panel')).toContainText('4 VERIFIED');
  await expect(page.locator('body')).toHaveAttribute('data-parser-uploads', '1');
  await expect(page.locator('body')).toHaveAttribute('data-resume-uploads', '0');
  expect(kr.openrouter.requests).toHaveLength(0);
});
