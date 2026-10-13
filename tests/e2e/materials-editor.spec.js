import { test, expect } from './support/fixtures.js';
import fs from 'node:fs';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const profile = { fullName: 'Alex Morgan', email: 'alex@example.org', city: 'Toronto', country: 'Canada',
  workExperiences: [{ id: 'work', title: 'Software Engineer', company: 'Northstar', startDate: '2022-06', current: true, description: 'Built Python APIs for customer integrations. Reduced request latency by 20%.' }],
  projects: [{ id: 'project', name: 'Service Monitor', role: 'Developer', url: 'https://example.org/service-monitor', description: 'Built a Python and SQL monitoring tool for internal teams.' }],
  education: [{ id: 'education', degree: 'BSc', fieldOfStudy: 'Computer Science', institution: 'Example University', startDate: '2018-09', endDate: '2022-05' }], skills: ['Python', 'SQL', 'JavaScript'] };
const reply = body => {
  const input = JSON.parse(body.messages.at(-1).content);
  const model = input.kind === 'coverLetter' ? { paragraphs: ['Dear Hiring Team,', 'I build dependable APIs and tools for internal teams. My work at Northstar reduced request latency by 20%.', 'I would bring that experience to your engineering team.', 'Sincerely,\nAlex Morgan'] }
    : { summary: 'Software engineer building reliable APIs and practical tools for internal teams.', sections: input.source.sections.map(s => ({ id: s.id, bullets: s.bullets, relevance: 3, ...(s.id === 'project' ? { keywords: ['Python', 'SQL'] } : {}) })) };
  if (input.rewrite) {
    if (input.rewrite.path === 'summary') return { choices: [{ message: { content: JSON.stringify({ summary: 'Rewritten API summary.' }) } }] };
    if (input.rewrite.path.startsWith('paragraph:')) return { choices: [{ message: { content: JSON.stringify({ paragraphs: ['A rewritten paragraph.'] }) } }] };
    const id = input.rewrite.path.slice(8); model.sections = [{ id, bullets: ['Rewritten reliable API achievement.'] }];
  }
  return { choices: [{ message: { content: JSON.stringify(model) } }] };
};
const message = (page, operation, input = {}) => page.evaluate(({ operation, input }) => chrome.runtime.sendMessage({ type: 'kr:materials', operation, input }), { operation, input });
async function setup(kr, kind = 'resume') {
  await kr.seed({ profile }); kr.openrouter.handler = reply;
  const page = await kr.context.newPage(); await page.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=${kind}`);
  await expect(page.locator('#generate')).toBeEnabled();
  await page.locator('#job-title').fill('Backend Engineer'); await page.locator('#job-company').fill('Example Labs');
  await page.locator('#job-description').fill('Build Python APIs and reliable integrations. Collaborate with internal teams.');
  await page.locator('#generate').click(); await expect(page.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  return page;
}
async function downloaded(page, format) {
  const pending = page.waitForEvent('download');
  await page.locator('#download-toggle').click(); await page.locator(`[data-download="${format}"]`).click();
  return fs.readFileSync(await (await pending).path());
}
async function pdfText(bytes) {
  const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWasm: false });
  try { const doc = await loading.promise; let text = ''; for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(i => i.str).join(' '); return text; }
  finally { await loading.destroy(); }
}

test('continuous document edits autosave, survive reload, retain history, and export current text', async ({ kr }) => {
  const page = await setup(kr);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.material-section:visible')).toHaveCount(5);
  await page.locator('#resume-summary').fill('Current inline summary.');
  await expect(page.locator('#resume-summary')).toHaveText('Current inline summary.');
  await expect(page.locator('#document-status')).toContainText('Saved locally');
  const [meta] = await message(page, 'list');
  await expect.poll(async () => (await message(page, 'get', { id: meta.id })).model.summary).toBe('Current inline summary.');
  await expect(page.locator('#undo')).toBeEnabled();
  await page.locator('#undo').click(); await expect(page.locator('#resume-summary')).toHaveText(/Software engineer/);
  await page.locator('#redo').click(); await expect(page.locator('#resume-summary')).toHaveText('Current inline summary.');
  await page.locator('[data-editable-section="work"]').fill('Edited production API achievement.');
  await page.locator('[data-material-section="project"] .paper-keywords').fill('Python, SQL, Monitoring');
  const word = await mammoth.extractRawText({ buffer: await downloaded(page, 'docx') });
  expect(word.value).toContain('Current inline summary.'); expect(word.value).toContain('Edited production API achievement.'); expect(word.value).toContain('Service Monitor | Python, SQL, Monitoring');
  expect(await pdfText(await downloaded(page, 'pdf'))).toContain('Edited production API achievement.');
  await page.reload(); await expect(page.locator('#resume-summary')).toHaveText('Current inline summary.');
  await page.locator('#proof-toggle').click(); await expect(page.locator('#pdf-preview canvas')).toHaveCount(1);
  await expect(page.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  await page.locator('#proof-toggle').click(); await expect(page.locator('[data-editable-section="work"]')).toHaveText('Edited production API achievement.');
  expect((await message(page, 'get', { id: meta.id })).model.sections.find(s => s.id === 'work').title).toBe('Software Engineer');
  expect(errors).toEqual([]);
});

test('paragraph split, merge, and rich paste use library editing without unsupported formatting', async ({ kr }) => {
  const page = await setup(kr, 'coverLetter');
  const body = page.locator('.paper-letter p').nth(1);
  await body.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('A new paragraph with plain text.');
  await expect(page.locator('.paper-letter p')).toHaveCount(5);
  await expect(page.locator('.paper-letter')).toContainText('A new paragraph with plain text.');
  await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(page.locator('.paper-letter p')).toHaveCount(4);
  await page.locator('.paper-letter p').nth(1).click(); await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter'); await page.keyboard.type('A soft line break survives.');
  await expect(page.locator('.paper-letter p').nth(1)).toContainText('A soft line break survives.');
  // Use the public paste command through the DOM clipboard event for actual browser parsing.
  await page.locator('.paper-letter p').nth(1).click();
  await page.evaluate(() => { const data = new DataTransfer(); data.setData('text/html', '<p><b>Clipboard content.</b></p>'); data.setData('text/plain', 'Clipboard content.'); document.querySelector('.document-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(page.locator('.paper-letter')).toContainText('Clipboard content.');
  await expect(page.locator('.paper-letter b, .paper-letter strong')).toHaveCount(0);
  const text = await mammoth.extractRawText({ buffer: await downloaded(page, 'docx') }); expect(text.value).toContain('Clipboard content.');
  expect(text.value).toContain('A soft line break survives.');
});

test('late contextual rewrites keep newer typing and apply safely with undo', async ({ kr }) => {
  const page = await setup(kr); kr.openrouter.delayMs = 1200;
  await page.locator('[data-material-section="summary"]').hover(); await page.locator('[data-rewrite="summary"]').click();
  await expect(page.locator('#rewrite-status')).toBeVisible();
  await page.locator('#resume-summary').fill('New typing wins.');
  await expect(page.locator('#feedback')).toContainText('newer edits were kept');
  await expect(page.locator('#resume-summary')).toHaveText('New typing wins.');
  kr.openrouter.delayMs = 0;
  await page.locator('[data-material-section="summary"]').hover(); await page.locator('[data-rewrite="summary"]').click();
  await expect(page.locator('#feedback')).toContainText('Rewrite applied');
  await expect(page.locator('#resume-summary')).toHaveText('Rewritten API summary.');
  await page.locator('#undo').click(); await expect(page.locator('#resume-summary')).toHaveText('New typing wins.');
});

test('empty letter drafts persist after failed exports and switching keeps them recoverable', async ({ kr }) => {
  const page = await setup(kr, 'coverLetter');
  await page.locator('.paper-letter').fill('');
  await expect(page.locator('#document-status')).toContainText('Save needs attention');
  const [record] = await message(page, 'list'); const draft = await message(page, 'getDraft', { id: record.id });
  expect(draft.model.paragraphs).toEqual([]);
  expect((await message(page, 'get', { id: record.id })).model.paragraphs.length).toBeGreaterThan(0);
  await page.reload(); await expect(page.locator('.paper-letter')).toHaveText('');
  await page.locator('.paper-letter').fill('Recovered letter text.');
  expect(await pdfText(await downloaded(page, 'pdf'))).toContain('Recovered letter text.');
});

test('draft writes reject stale windows and never alter protected facts', async ({ kr }) => {
  const page = await setup(kr); const [meta] = await message(page, 'list'), record = await message(page, 'get', { id: meta.id });
  const model = { ...record.model, name: 'Forged name', summary: 'First window draft.' };
  const first = await message(page, 'putDraft', { id: record.id, revision: record.revision, model, pageTarget: 1 });
  expect(first.model.name).toBe(profile.fullName);
  const second = await message(page, 'putDraft', { id: record.id, revision: record.revision, model: { ...model, summary: 'Stale window' }, pageTarget: 1 });
  expect(second.error).toContain('newer draft');
  expect((await message(page, 'getDraft', { id: record.id })).model.summary).toBe('First window draft.');
});

test('Prepare and Edit fit desktop, compact, and narrow layouts with visible focus and local fonts', async ({ kr }) => {
  const page = await setup(kr);
  fs.mkdirSync('.impeccable/review', { recursive: true });
  for (const [name, width, height] of [['desktop',1440,1000],['compact',900,850],['mobile',390,844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#view-prepare').click();
    await page.locator('#prepare-panel').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: `.impeccable/review/prepare-${name}.png` });
    await page.locator('#view-edit').click();
    await page.locator('#zoom').selectOption('fit');
    await expect.poll(() => page.evaluate(() => document.querySelector('#paper-frame').getBoundingClientRect().width <= document.querySelector('#editor-section').clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/${name}.png` });
  }
  await page.locator('#view-edit').focus(); await page.keyboard.press('Home'); await expect(page.locator('#view-prepare')).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End'); await expect(page.locator('#view-edit')).toHaveAttribute('aria-selected','true');
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('12px "Material CMU"'); })).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('#proof-toggle').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('failed regeneration preserves the editable document and resumes autosave', async ({ kr }) => {
  const page = await setup(kr);
  kr.openrouter.status = 500;
  await page.locator('#view-prepare').click(); await page.locator('#generate').click();
  await expect(page.locator('#feedback')).toContainText('OpenRouter returned 500');
  await page.locator('#view-edit').click();
  await page.locator('#resume-summary').fill('I can still edit after a generation failure.');
  await expect.poll(async () => {
    const [record] = await message(page, 'list'); return (await message(page, 'get', { id: record.id })).model.summary;
  }).toBe('I can still edit after a generation failure.');
  await expect(page.locator('#document-status')).toContainText('Saved locally');
  expect(await pdfText(await downloaded(page, 'pdf'))).toContain('I can still edit after a generation failure.');
});
