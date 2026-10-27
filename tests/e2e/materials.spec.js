import { test, expect } from './support/fixtures.js';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';

test('generated resumes with metadata deviations open for editing without content or page-limit rejection', async ({ kr }) => {
  await kr.seed({ profile: { ...PROFILE, projects: [{ id: 'project1', name: 'API project', description: 'Built APIs.' }] } });
  const summary = 'Generated summary text for user review. '.repeat(250).trim();
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    return { choices: [{ message: { content: JSON.stringify(input.rewrite ? { summary: 'Rewritten summary. '.repeat(400).trim() } : { summary, sections: [
      { id: 'work1', keywords: [], relevance: 'high', bullets: ['Generated work bullet.'] },
      { id: 'project1', keywords: 'Python, Rust, API design, SQL, Docker', bullets: ['Generated project bullet.'] },
      { id: 'skills', keywords: null, bullets: ['An unsaved skill'] },
      { id: 'extra', heading: 'Additional evidence', bullets: ['Generated additional detail.'] },
    ] }) } }] };
  };
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-description').fill('Build APIs.'); await workspace.locator('#generate').click();
  await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await expect(workspace.locator('#view-edit')).toHaveAttribute('aria-selected', 'true');
  await expect(workspace.locator('#resume-summary')).toHaveText(summary);
  const record = await message(workspace, 'get', { id: (await message(workspace, 'list'))[0].id });
  expect(record.pages).toBeGreaterThan(1); expect(record.options.pageTarget || 1).toBe(1);
  expect(record.model.sections[2].bullets).toEqual(['An unsaved skill']);
  expect(record.model.sections[3].bullets).toEqual(['Generated additional detail.']);
  await workspace.locator('[data-editor-section="project1"]').click();
  await workspace.locator('[data-material-section="project1"] .paper-keywords').fill('Corrected keywords');
  await workspace.locator('#save-document').click(); await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  const saved = await message(workspace, 'get', { id: record.id });
  expect(saved.model.sections[1].keywords).toEqual(['Corrected keywords']);
  await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job: saved.job, options: { pageTarget: 1, rewrite: { path: 'summary', revision: saved.revision } } }));
  const rewritten = await message(workspace, 'get', { id: record.id });
  expect(rewritten.model.summary).toBe('Rewritten summary. '.repeat(400).trim());
  expect(rewritten.model.sections[1].keywords).toEqual(['Corrected keywords']);
});

test('selected evidence, project keywords and description-backed skills survive generation save and rewrite', async ({ kr }, testInfo) => {
  await kr.seed({ profile: { fullName: 'Test Applicant', email: 'applicant@example.com',
    workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Acme', description: 'Built Python APIs for client integrations.' },
      { id: 'other', title: 'Assistant', company: 'Other Company', description: 'Organized office supplies.' }],
    projects: [{ id: 'cad', name: 'Mechanical design', url: 'https://example.org/mechanical-design', description: 'Reconstructed components in SolidWorks and AutoCAD.' }],
  } });
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    return { choices: [{ message: { content: JSON.stringify(input.rewrite ? { sections: [{ id: 'work1', bullets: ['Built reliable Python APIs for client integrations.'] }] } : {
      summary: 'Engineer with client integration and CAD project experience.', sections: [
        { id: 'work1', relevance: 3, bullets: ['Built Python APIs for client integrations.'] },
        { id: 'cad', relevance: 2, keywords: ['SolidWorks', 'AutoCAD'], bullets: ['Reconstructed components in SolidWorks and AutoCAD.'] },
        { id: 'skills', bullets: ['Python', 'SolidWorks', 'AutoCAD'] },
      ],
    }) } }] };
  };
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-title').fill('Technical Solutions Engineer');
  await workspace.locator('#job-description').fill('Explain technical solutions to clients. Build Python integrations and use SolidWorks CAD.');
  await workspace.locator('#generate').click(); await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  expect(kr.openrouter.requests).toHaveLength(1);
  await expect(workspace.locator('[data-editor-section="other"]')).toHaveCount(0);
  await expect(workspace.locator('[data-editor-section="skills"]')).toHaveCount(1);
  const records = await message(workspace, 'list'), record = await message(workspace, 'get', { id: records[0].id });
  expect(record.model.sections.map(s => s.id)).toEqual(['work1', 'cad', 'skills']);
  expect(record.model.sections[1].keywords).toEqual(['SolidWorks', 'AutoCAD']);
  fs.writeFileSync(testInfo.outputPath('selected-resume.pdf'), Buffer.from(record.files.pdf.data, 'base64'));
  const word = await mammoth.extractRawText({ buffer: Buffer.from(record.files.docx.data, 'base64') });
  expect(word.value).toContain('Mechanical design | SolidWorks, AutoCAD');
  expect(word.value).not.toContain('Other Company');
  const loading = getDocument({ data: Uint8Array.from(Buffer.from(record.files.pdf.data, 'base64')), isEvalSupported: false, useWasm: false });
  try {
    const links = await (await (await loading.promise).getPage(1)).getAnnotations();
    expect(links.filter(a => a.url === 'https://example.org/mechanical-design')).toHaveLength(1);
  } finally { await loading.destroy(); }
  await workspace.locator('[data-editor-section="work1"]').click();
  await workspace.locator('[data-section="0"]').fill('Built Python APIs for client integrations and documented workflows.');
  await workspace.locator('#save-document').click(); await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  const saved = await message(workspace, 'get', { id: record.id });
  expect(saved.revision).not.toBe(record.revision);
  await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job: saved.job, options: { rewrite: { path: 'section:work1', revision: saved.revision } } }));
  const rewritten = await message(workspace, 'get', { id: saved.id });
  expect(rewritten.model.sections.slice(1)).toEqual(saved.model.sections.slice(1));
  expect(rewritten.model.sections[0].relevance).toBe(3);
  expect(kr.openrouter.requests).toHaveLength(2);
});

test('tailoring uses profile facts only even when an old base resume exists', async ({ kr }) => {
  await kr.seed({ profile: { ...PROFILE, resumeContext: 'IMPORTED_CONTEXT' } }); kr.openrouter.handler = materialResponse;
  await kr.worker.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('kareer', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files'); };
      req.onsuccess = () => { const db = req.result, tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ id: 'base', text: 'IMPORTED_TEXT', summary: 'IMPORTED_SUMMARY', sections: [{ id: 'import_1', heading: 'IMPORTED_ROLE', bullets: ['IMPORTED_BULLET'] }] }, 'base');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; req.onerror = () => reject(req.error);
    });
  });
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  const first = await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job: { localId: 'profile-only', description: 'Build APIs.' } }));
  const record = await message(workspace, 'get', { id: first.material.id });
  expect(JSON.stringify(record.source)).not.toContain('IMPORTED_');
  expect(kr.openrouter.requests).toHaveLength(1);
  expect(JSON.stringify(kr.openrouter.requests[0].body)).not.toContain('IMPORTED_');
  await kr.seed({ profile: { ...PROFILE, workExperiences: [{ ...PROFILE.workExperiences[0], title: 'Senior Engineer' }] } });
  await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job: record.job, options: { rewrite: { path: 'section:work1', revision: record.revision } } }));
  const rewriteInput = JSON.parse(kr.openrouter.requests.at(-1).body.messages.at(-1).content);
  expect(rewriteInput.source.sections[0].heading).toContain('Senior Engineer');
  expect(rewriteInput.currentDocument.sections[0].heading).toContain('Senior Engineer');
  await kr.seed({ profile: { workExperiences: [], education: [], projects: [], skills: [], resumeContext: 'IMPORTED_CONTEXT' } });
  const missing = await message(workspace, 'start', { kind: 'resume', job: { localId: 'missing-profile', description: 'Build APIs.' } });
  expect(missing.needsWorkspace).toBe(true); expect(missing.reason).toContain('Profile');
  expect(kr.openrouter.requests).toHaveLength(2);
});

test('workspace tabs retain drafts and downloads save the current section edits', async ({ kr }, testInfo) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.setViewportSize({ width: 1800, height: 1000 });
  await workspace.locator('#job-title').fill('API Engineer'); await workspace.locator('#job-description').fill('Build dependable APIs.');
  await workspace.screenshot({ path: testInfo.outputPath('workspace-prepare.png'), fullPage: true });
  await workspace.locator('#generate').click(); await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await expect(workspace.locator('#view-edit')).toHaveAttribute('aria-selected', 'true');
  await expect(workspace.locator('#base-details, #changes-section')).toHaveCount(0);
  await expect(workspace.locator('.material-section:visible')).toHaveCount(3);
  await workspace.locator('#resume-summary').fill('My current unsaved summary.');
  await expect(workspace.locator('#document-status')).toContainText('Saving');
  await workspace.locator('#view-prepare').click();
  await workspace.locator('.writing-settings summary').click();
  await workspace.locator('#instructions').fill('Emphasize observability.');
  await workspace.locator('#view-edit').click();
  await workspace.locator('#recent-navigation summary').click();
  await workspace.locator('#saved-jobs button').first().click();
  await expect(workspace.locator('#draft-dialog')).not.toBeVisible();
  await expect(workspace.locator('#resume-summary')).toHaveText('My current unsaved summary.');
  await workspace.locator('[data-editor-section="work1"]').click();
  await workspace.locator('[data-section="0"]').fill('My current edited API achievement.');
  await expect(workspace.locator('.material-section:visible')).toHaveCount(3);
  const downloadPromise = workspace.waitForEvent('download'); await workspace.locator('#download-toggle').click(); await workspace.locator('[data-download="pdf"]').click();
  const download = await downloadPromise;
  const text = await pdfText(fs.readFileSync(await download.path()));
  expect(text).toContain('My current unsaved summary.'); expect(text).toContain('My current edited API achievement.');
  await expect(workspace.locator('#document-status')).toContainText('Saved locally');
  await expect(workspace.locator('#instructions')).toHaveValue('Emphasize observability.');
  await expect(workspace.locator('[data-section="0"]')).toBeVisible();
  await expect(workspace.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  const toolbar = await workspace.locator('#editor-actions').boundingBox(); expect(toolbar.y).toBeLessThan(170);
  await workspace.screenshot({ path: testInfo.outputPath('workspace-desktop.png'), fullPage: true });
  await workspace.setViewportSize({ width: 1280, height: 850 });
  await workspace.screenshot({ path: testInfo.outputPath('workspace-laptop.png'), fullPage: true });
  await workspace.setViewportSize({ width: 650, height: 850 });
  await workspace.screenshot({ path: testInfo.outputPath('workspace-compact.png'), fullPage: true });
  await workspace.setViewportSize({ width: 390, height: 844 });
  expect(await workspace.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await workspace.screenshot({ path: testInfo.outputPath('workspace-narrow.png'), fullPage: true });
  await workspace.locator('#view-edit').focus(); await workspace.keyboard.press('Home');
  await expect(workspace.locator('#view-prepare')).toHaveAttribute('aria-selected', 'true');
  await workspace.keyboard.press('End'); await expect(workspace.locator('#view-edit')).toHaveAttribute('aria-selected', 'true');
});

test('document switches persist drafts automatically and concurrent saves retain failed edits', async ({ kr }) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-description').fill('Build APIs.'); await workspace.locator('#generate').click();
  await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await workspace.locator('#resume-summary').fill('Keep my draft.');
  await workspace.locator('#tab-coverLetter').click();
  await expect(workspace.locator('#draft-dialog')).not.toBeVisible();
  await expect(workspace.locator('#tab-coverLetter')).toHaveAttribute('aria-selected', 'true');
  await workspace.locator('#tab-resume').click();
  await expect(workspace.locator('#resume-summary')).toHaveText('Keep my draft.');
  await workspace.locator('#save-document').click(); await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  const current = await message(workspace, 'get', { id: (await message(workspace, 'list'))[0].id });
  await message(workspace, 'save', { id: current.id, revision: current.revision, model: { ...current.model, summary: 'Concurrent saved edit.' } });
  await workspace.locator('#resume-summary').fill('Keep my newer typing.');
  await workspace.locator('#tab-coverLetter').click();
  await expect(workspace.locator('#draft-dialog')).toBeVisible();
  await expect(workspace.locator('#draft-error')).toContainText('newer document');
  await workspace.locator('#draft-stay').click();
  await expect(workspace.locator('#tab-resume')).toHaveAttribute('aria-selected', 'true');
  await expect(workspace.locator('#resume-summary')).toHaveText('Keep my newer typing.');
  let downloads = 0; workspace.on('download', () => downloads++);
  await workspace.locator('#download-toggle').click(); await workspace.locator('[data-download="pdf"]').click();
  await expect(workspace.locator('#feedback')).toContainText('newer document');
  await expect(workspace.locator('#download-toggle')).toBeEnabled(); expect(downloads).toBe(0);
  await workspace.locator('#discard-draft').click();
  await expect(workspace.locator('#resume-summary')).toHaveText('Concurrent saved edit.');
});

const PROFILE = { fullName: 'Test Applicant', email: 'test.applicant@example.com', resumeContext: '',
  workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Acme', startDate: '2021-01', endDate: '2024-02', description: 'Built APIs. Reduced latency by 20%.' }], skills: ['JavaScript'] };

test('skills flow inline like the PDF and switch to categorized rows without losing edits', async ({ kr }) => {
  await kr.seed({ profile: { ...PROFILE, skills: ['Python', 'SQL', 'Docker'] } });
  kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage();
  await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-description').fill('Build APIs.');
  await workspace.locator('#generate').click();
  await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  const skills = workspace.locator('.paper-skills');
  await expect(skills).toHaveClass(/paper-skills-inline/);
  const tops = await skills.locator('p').evaluateAll(nodes => nodes.map(p => p.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  expect(await skills.locator('p').nth(1).evaluate(p => getComputedStyle(p, '::before').content)).toContain('·');
  const id = (await message(workspace, 'list'))[0].id;
  expect(await pdfText(Buffer.from((await message(workspace, 'get', { id })).files.pdf.data, 'base64'))).toContain('Python · SQL · Docker');
  await skills.locator('p').first().fill('Languages: Python');
  await expect(skills).not.toHaveClass(/paper-skills-inline/);
  expect((await skills.locator('p').nth(1).boundingBox()).y).toBeGreaterThan((await skills.locator('p').first().boundingBox()).y);
  await workspace.locator('#save-document').click();
  await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  expect((await message(workspace, 'get', { id })).model.sections.find(s => s.id === 'skills').bullets).toEqual(['Languages: Python', 'SQL', 'Docker']);
  await workspace.locator('#undo').click();
  await expect(skills).toHaveClass(/paper-skills-inline/);
  await workspace.locator('#save-document').click();
  await expect.poll(async () => (await message(workspace, 'get', { id })).model.sections.find(s => s.id === 'skills').bullets).toEqual(['Python', 'SQL', 'Docker']);
  await workspace.reload();
  await expect(workspace.locator('.paper-skills')).toHaveClass(/paper-skills-inline/);
  expect((await message(workspace, 'get', { id })).model.sections.find(s => s.id === 'skills').bullets).toEqual(['Python', 'SQL', 'Docker']);
});

test('PDF counts distinguish pending edits and proof fits and labels every exported page', async ({ kr }, testInfo) => {
  await kr.seed({ profile: PROFILE });
  kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage();
  await workspace.setViewportSize({ width: 1440, height: 1000 });
  await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-description').fill('Build APIs.');
  await workspace.locator('#generate').click();
  await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await expect(workspace.locator('#export-page-count')).toHaveText('PDF · 1 page');
  await workspace.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message, callback) => {
      if (message.type === 'kr:materials' && message.operation === 'save') {
        chrome.runtime.sendMessage = send;
        callback({ error: 'Export temporarily unavailable.' });
      } else return send(message, callback);
    };
  });
  await workspace.locator('#resume-summary').fill('Built reliable application interfaces and documented integration workflows for engineering teams. '.repeat(140));
  await expect(workspace.locator('#export-page-count')).toHaveText('Last PDF · 1 page · updating');
  await workspace.locator('#save-document').click();
  await expect(workspace.locator('#feedback')).toContainText('Export temporarily unavailable');
  await expect(workspace.locator('#export-page-count')).toHaveText('Last PDF · 1 page · needs update');
  await workspace.locator('#proof-toggle').click();
  // Opening proof retries the failed export while preserving the last good PDF.
  await expect(workspace.locator('#export-page-count')).toHaveText(/^PDF · \d+ pages$/);
  await expect(workspace.locator('#feedback')).not.toContainText('Export temporarily unavailable');
  const record = await message(workspace, 'get', { id: (await message(workspace, 'list'))[0].id });
  const loading = getDocument({ data: Uint8Array.from(Buffer.from(record.files.pdf.data, 'base64')), isEvalSupported: false, useWasm: false });
  let pages;
  try { pages = (await loading.promise).numPages; } finally { await loading.destroy(); }
  expect(pages).toBeGreaterThan(1);
  expect(record.pages).toBe(pages);
  await expect(workspace.locator('#page-count')).toHaveText(`${pages} pages`);
  await expect(workspace.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  await expect(workspace.locator('.pdf-page')).toHaveCount(pages);
  await expect(workspace.locator('.pdf-page figcaption')).toHaveText(Array.from({ length: pages }, (_, i) => `Page ${i + 1} of ${pages}`));
  await expect(workspace.locator('#overflow-status')).toContainText('1-page target is exceeded');
  await expect(workspace.locator('#proof-zoom')).toHaveValue('page');
  await expect(workspace.locator('#zoom')).toBeHidden();
  for (const width of [1440, 900, 390]) {
    await workspace.setViewportSize({ width, height: 1000 });
    await expect.poll(async () => {
      const bounds = await workspace.locator('#pdf-preview').boundingBox();
      const page = await workspace.locator('.pdf-page').first().boundingBox();
      return page.height <= bounds.height && page.width <= bounds.width;
    }).toBe(true);
    expect(await workspace.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await workspace.screenshot({ path: testInfo.outputPath(`pdf-proof-${width}.png`) });
  }
  await workspace.setViewportSize({ width: 1440, height: 1000 });
  const fitted = await workspace.locator('.pdf-page').first().boundingBox();
  await workspace.locator('#proof-zoom').selectOption('width');
  await expect.poll(async () => (await workspace.locator('.pdf-page').first().boundingBox()).width).toBeGreaterThan(fitted.width);
  const downloadPromise = workspace.waitForEvent('download');
  await workspace.locator('#download-toggle').click(); await workspace.locator('[data-download="pdf"]').click();
  const download = await downloadPromise;
  expect(fs.readFileSync(await download.path())).toEqual(Buffer.from(record.files.pdf.data, 'base64'));
  await workspace.locator('#proof-toggle').click();
  await expect(workspace.locator('#export-page-count')).toHaveText(`PDF · ${pages} pages`);
  await expect(workspace.locator('#zoom')).toBeVisible();
});

function materialResponse(body) {
  const input = JSON.parse(body.messages.at(-1).content);
  if (!input.kind) return { choices: [{ message: { content: JSON.stringify({ answers: (input.fieldsToFill || []).map(f => ({ fieldId: f.fieldId, value: f.type === 'email' ? PROFILE.email : PROFILE.fullName })) }) } }] };
  const value = input.kind === 'coverLetter' ? { paragraphs: ['Dear Hiring Team,', 'I build APIs and would contribute to your engineering team.', 'Sincerely, Test Applicant'] }
    : { summary: 'Engineer building reliable APIs.', sections: input.source.sections.map(s => ({ id: s.id, bullets: s.bullets })) };
  return { choices: [{ message: { content: JSON.stringify(value) } }] };
}

async function message(page, operation, input = {}) {
  const result = await page.evaluate(({ operation, input }) => chrome.runtime.sendMessage({ type: 'kr:materials', operation, input }), { operation, input });
  if (result?.error && !result.status) throw new Error(result.error);
  return result;
}
async function waitTask(workspace, task) {
  await expect.poll(async () => (await message(workspace, 'status', { id: task.id })).status, { timeout: 45000 }).not.toBe('running');
  const final = await message(workspace, 'status', { id: task.id });
  expect(final.status, final.error).toBe('ready');
  return final;
}
async function pdfText(bytes) {
  const loading = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useWasm: false });
  const pdf = await loading.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) text += (await (await pdf.getPage(i)).getTextContent()).items.map(item => item.str).join(' ');
  await loading.destroy(); return text;
}

test('numeric prose reaches both active application documents without a numeric rejection', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false } });
  kr.openrouter.streaming = true;
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    const response = materialResponse(body);
    if (!['resume', 'coverLetter'].includes(input.kind)) return response;
    expect(body.response_format.type).toBe('json_object');
    const value = JSON.parse(response.choices[0].message.content);
    if (input.kind === 'resume') {
      value.summary = 'Engineer supporting 10 services.';
      value.sections.find(section => section.id === 'work1').bullets = ['Built APIs for 10 services.'];
    } else value.paragraphs[1] = 'I build APIs for 10 services.';
    response.choices[0].message.content = JSON.stringify(value);
    return response;
  };
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('materials-fixture.html')); await kr.openPanel(page);
  await page.locator('#cover').evaluate(el => el.accept = '.docx');
  await page.locator('#kr-tailor-resume').click();
  await page.locator('#kr-generate-cover-letter').click();
  for (const kind of ['resume', 'coverLetter']) await expect(page.locator(`#kr-material-${kind}-status`)).toContainText('Ready', { timeout: 45000 });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#resume-name')).toContainText('.pdf');
  await expect(page.locator('#letter-name')).toContainText('.docx');
  await expect(page.locator('#letter-text')).toHaveValue(/10 services/);
  const resume = await page.locator('#resume').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]);
  expect(await pdfText(resume)).toContain('10 services');
  const letter = await page.locator('#cover').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]);
  expect((await mammoth.extractRawText({ buffer: Buffer.from(letter) })).value).toContain('10 services');
});

test('panel generation activates separate documents for the next Autofill and exports real bytes', async ({ kr }, testInfo) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false, overwriteExisting: true } });
  kr.openrouter.handler = materialResponse;
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('materials-fixture.html'));
  await kr.openPanel(page);
  await page.locator('#kr-tailor-resume').click();
  await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 90000 });
  expect(await page.locator('#resume').evaluate(el => el.files.length)).toBe(0);
  await page.locator('#kr-generate-cover-letter').click();
  await expect(page.locator('#kr-material-coverLetter-status')).toContainText('Ready', { timeout: 90000 });
  // Material requests must not be reused as autofill-answer requests.
  kr.openrouter.handler = body => {
    const { fieldsToFill = [] } = JSON.parse(body.messages.at(-1).content);
    return { choices: [{ message: { content: JSON.stringify({ answers: fieldsToFill.map(f => ({ fieldId: f.fieldId, value: f.type === 'email' ? PROFILE.email : PROFILE.fullName })) }) } }] };
  };
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#resume-name')).toContainText('.pdf');
  await expect(page.locator('#letter-name')).toContainText('.pdf');
  await expect(page.locator('#letter-text')).toHaveValue(/I build APIs/);
  const signatures = await page.evaluate(async () => Promise.all(['resume', 'cover'].map(async id => new TextDecoder().decode((await document.getElementById(id).files[0].arrayBuffer()).slice(0, 5)))));
  expect(signatures).toEqual(['%PDF-', '%PDF-']);
  const workspacePromise = kr.context.waitForEvent('page');
  await page.locator('[data-material-open="resume"]').click();
  const workspace = await workspacePromise;
  await expect(workspace.locator('#document-editor')).toContainText('Built APIs');
  await workspace.locator('#proof-toggle').click();
  await expect(workspace.locator('#pdf-preview canvas')).toHaveCount(1);
  const downloadPromise = workspace.waitForEvent('download');
  await workspace.locator('#download-toggle').click(); await workspace.locator('[data-download="docx"]').click();
  await expect(workspace.locator('#feedback')).toContainText('Downloaded');
  const downloaded = await downloadPromise;
  const word = await mammoth.extractRawText({ buffer: fs.readFileSync(await downloaded.path()) });
  expect(word.value).toContain('Built APIs');
  await workspace.evaluate(() => window.scrollTo(0, 0));
  await workspace.screenshot({ path: testInfo.outputPath('workspace-desktop.png'), fullPage: true });
  await workspace.setViewportSize({ width: 650, height: 850 });
  await workspace.screenshot({ path: testInfo.outputPath('workspace-compact.png'), fullPage: true });
  await workspace.setViewportSize({ width: 1280, height: 850 });
  await workspace.locator('#tab-coverLetter').click();
  await workspace.locator('#tab-resume').click();
  await workspace.locator('#tab-coverLetter').click();
  await workspace.locator('[data-editor-section="letter"]').click();
  await expect(workspace.locator('.paper-letter p').nth(1)).toHaveText(/I build APIs/);
  await workspace.locator('#proof-toggle').click();
  await expect(workspace.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  await expect(workspace.locator('#pdf-preview canvas')).toHaveCount(1);
  // Wait for the actual saved cover-letter PDF to finish rendering.
  await expect(workspace.locator('#pdf-preview canvas')).toBeVisible();
  await workspace.locator('#pdf-preview').screenshot({ path: testInfo.outputPath('cover-letter-preview.png') });
  await workspace.locator('#tab-resume').click();
  await expect(workspace.locator('#resume-summary')).toHaveText('Engineer building reliable APIs.');
  await expect(workspace.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  const oldName = await page.locator('#resume').evaluate(el => el.files[0].name);
  await workspace.locator('#resume-summary').fill('Engineer focused on dependable APIs.');
  await workspace.locator('#save-document').click();
  await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect.poll(() => page.locator('#resume').evaluate(el => el.files[0].name)).not.toBe(oldName);
  const bytes = await page.locator('#resume').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]);
  expect(await pdfText(bytes)).toContain('Engineer focused on dependable APIs.');
  await page.evaluate(() => { window.resumeUploads = 0; document.querySelector('#resume').addEventListener('change', () => window.resumeUploads++); });
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Review your answers, then submit the application.');
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.resumeUploads)).toBe(0);
  kr.openrouter.handler = materialResponse;
  await workspace.locator('[data-editor-section="work1"]').click();
  await workspace.locator('[data-material-section="work1"]').hover();
  await workspace.locator('[data-rewrite="section:work1"]').click();
  await expect(workspace.locator('#feedback')).toContainText('Rewrite applied', { timeout: 45000 });
  await expect(workspace.locator('#resume-summary')).toHaveText('Engineer focused on dependable APIs.');
  await workspace.locator('#delete-document').click();
  await expect(workspace.locator('#feedback')).toContainText('Document deleted');
  const sessions = await kr.readStorage('kr:sessions');
  expect((await kr.readStorage(`kr:sessions:${sessions[0]}`)).materialRefs.resume).toBeUndefined();
});

test('a generation finishing during Autofill is used only on the next run and later application steps', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false, overwriteExisting: true } }); kr.openrouter.handler = materialResponse;
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('materials-fixture.html')); await kr.openPanel(page);
  await page.locator('#kr-tailor-resume').click(); await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 45000 });
  await page.locator('#kr-autofill-btn').click(); await expect(page.locator('#resume-name')).toContainText('.pdf');
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Review your answers, then submit the application.');
  const previous = await page.locator('#resume').evaluate(el => el.files[0].name);
  kr.openrouter.delayMs = 1500;
  kr.openrouter.handler = body => { const reply = materialResponse(body), input = JSON.parse(body.messages.at(-1).content); if (input.kind === 'resume') { const data = JSON.parse(reply.choices[0].message.content); data.summary = 'Engineer focused on reliable delivery.'; reply.choices[0].message.content = JSON.stringify(data); } return reply; };
  await page.locator('#kr-tailor-resume').click();
  await expect(page.locator('#kr-material-resume-status')).toContainText('Writing');
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 45000 });
  expect(await page.locator('#resume').evaluate(el => el.files[0].name)).toBe(previous);
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Review your answers, then submit the application.');
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect.poll(() => page.locator('#resume').evaluate(el => el.files[0].name)).not.toBe(previous);
  expect(await pdfText(await page.locator('#resume').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]))).toContain('Engineer focused on reliable delivery.');
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  await page.locator('#kr-generate-cover-letter').click(); await expect(page.locator('#kr-material-coverLetter-status')).toContainText('Ready', { timeout: 45000 });
  await page.evaluate(() => { document.querySelector('form').innerHTML = '<h2>Documents — next step</h2><label>Resume<input id="next-resume" type="file" accept=".pdf"></label><label>Cover letter<input id="next-letter" type="file" accept=".pdf"></label><label>Cover letter text<textarea id="next-text"></textarea></label><button type="submit">Submit application</button>'; });
  await page.locator('#kr-rescan-btn').click();
  await page.locator('#kr-autofill-btn').click();
  await expect.poll(() => page.locator('#next-resume').evaluate(el => el.files.length)).toBe(1);
  await expect.poll(() => page.locator('#next-letter').evaluate(el => el.files.length)).toBe(1);
  await expect(page.locator('#next-text')).toHaveValue(/I build APIs/);
});

test('malformed regeneration retains the previous active file and offers retry', async ({ kr }) => {
  await kr.seed({ profile: PROFILE });
  kr.openrouter.handler = materialResponse;
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('materials-fixture.html'));
  await kr.openPanel(page);
  await page.locator('#kr-tailor-resume').click();
  await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 90000 });
  const before = await kr.readStorage('kr:sessions');
  const session = await kr.readStorage(`kr:sessions:${before[0]}`);
  kr.openrouter.handler = () => ({ choices: [{ message: { content: '{"sections":[]}' } }] });
  await page.locator('#kr-tailor-resume').click();
  await expect(page.locator('#kr-material-resume-status')).toContainText('empty', { timeout: 90000 });
  const after = await kr.readStorage(`kr:sessions:${before[0]}`);
  expect(after.materialRefs.resume).toEqual(session.materialRefs.resume);
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
});

test('HTTP 400 exposes a safe provider reason and both documents recover on explicit retry', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false } });
  kr.openrouter.status = 400;
  kr.openrouter.handler = () => ({ error: { message: 'Provider returned error', metadata: {
    raw: JSON.stringify({ error: { message: 'Invalid request payload: sk-or-v1-e2e-test-key' } }),
  } } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('materials-fixture.html')); await kr.openPanel(page);
  for (const [kind, button] of [['resume', '#kr-tailor-resume'], ['coverLetter', '#kr-generate-cover-letter']]) {
    await page.locator(button).click();
    const status = page.locator(`#kr-material-${kind}-status`);
    await expect(status).toContainText('400 using google/gemini-2.5-flash-lite');
    await expect(status).toContainText('Invalid request payload');
    await expect(status).not.toContainText('sk-or-v1-e2e-test-key');
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  }
  expect(kr.openrouter.requests).toHaveLength(2);
  kr.openrouter.status = 200; kr.openrouter.handler = materialResponse;
  for (const [kind, button] of [['resume', '#kr-tailor-resume'], ['coverLetter', '#kr-generate-cover-letter']]) {
    await page.locator(button).click();
    await expect(page.locator(`#kr-material-${kind}-status`)).toContainText('Ready', { timeout: 45000 });
  }
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#resume-name')).toContainText('.pdf');
  await expect(page.locator('#letter-name')).toContainText('.pdf');
  await expect(page.locator('#letter-text')).toHaveValue(/I build APIs/);
});

test('cover letters generate independently, use DOCX-only fields, and fill text without another writing request', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false } });
  kr.openrouter.handler = materialResponse; kr.openrouter.streaming = true;
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('materials-fixture.html')); await kr.openPanel(page);
  await page.locator('#cover').evaluate(el => el.accept = '.docx');
  await page.locator('#kr-generate-cover-letter').click();
  await expect(page.locator('#kr-material-coverLetter-status')).toContainText('Ready', { timeout: 45000 });
  expect(kr.openrouter.requests).toHaveLength(1);
  expect(kr.openrouter.requests[0].body.messages[0].content).toContain('Write in English.');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#letter-name')).toContainText('.docx');
  await expect(page.locator('#letter-text')).toHaveValue(/I build APIs/);
  expect(await page.locator('#resume').evaluate(el => el.files.length)).toBe(0);
  const bytes = await page.locator('#cover').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]);
  expect((await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value).toContain('I build APIs');
});

test('materials persist through page navigation and survive embedded overwrite scans', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { autoContinue: false, autoSubmit: false, overwriteExisting: true } });
  kr.openrouter.handler = materialResponse; kr.openrouter.delayMs = 1200;
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('materials-embedded.html')); await kr.openPanel(page);
  await page.locator('#kr-tailor-resume').click();
  await expect.poll(() => kr.openrouter.requests.length).toBe(1);
  await page.reload(); await kr.openPanel(page);
  await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 45000 });
  await page.locator('#kr-generate-cover-letter').click();
  await expect(page.locator('#kr-material-coverLetter-status')).toContainText('Ready', { timeout: 45000 });
  await page.locator('#kr-autofill-btn').click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#resume-name')).toContainText('.pdf');
  await expect(frame.locator('#letter-name')).toContainText('.pdf');
  await expect(frame.locator('#letter-text')).toHaveValue(/I build APIs/);
  await expect(page.locator('#kr-autofill-btn')).toHaveText('Submit Application');
  expect(kr.openrouter.requests).toHaveLength(2);
  expect(await page.locator('#kareer-root').count()).toBe(1);
  expect(await frame.locator('#kareer-root').count()).toBe(0);
  expect(await pdfText(await frame.locator('#resume').evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]))).toContain('Built APIs');
});

test('concurrent jobs stay isolated; cancellation and persisted interruption allow explicit retries', async ({ kr }) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse; kr.openrouter.delayMs = 1000;
  const pages = await Promise.all([kr.context.newPage(), kr.context.newPage()]);
  for (const [i, page] of pages.entries()) { await page.goto(kr.fixtureUrl('materials-fixture.html', undefined, `?job=${i}`)); await kr.openPanel(page); }
  await Promise.all(pages.map(page => page.locator('#kr-tailor-resume').click()));
  for (const page of pages) await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 45000 });
  const ids = await kr.readStorage('kr:sessions');
  const sessions = await Promise.all(ids.map(id => kr.readStorage(`kr:sessions:${id}`)));
  expect(new Set(sessions.map(s => s.materialRefs.resume.id)).size).toBe(2);
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#new-job')).toBeEnabled();
  const task = await message(workspace, 'start', { kind: 'resume', sessionId: sessions[0].id, job: sessions[0].job });
  await message(workspace, 'cancel', { id: task.id });
  await expect.poll(async () => (await message(workspace, 'status', { id: task.id })).status).toBe('error');
  expect((await kr.readStorage(`kr:sessions:${sessions[0].id}`)).materialRefs.resume).toEqual(sessions[0].materialRefs.resume);
  await kr.worker.evaluate(async () => {
    await new Promise((resolve, reject) => { const req = indexedDB.open('kareer', 1); req.onsuccess = () => { const db = req.result, tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({ id: 'task:interrupted', owner: 'previous-worker', status: 'running' }, 'task:interrupted'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
  });
  const requests = kr.openrouter.requests.length;
  const interrupted = await message(workspace, 'status', { id: 'task:interrupted' });
  expect(interrupted.error).toContain('interrupted'); expect(kr.openrouter.requests.length).toBe(requests);
  await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', sessionId: sessions[0].id, job: sessions[0].job }));
  expect((await kr.readStorage(`kr:sessions:${sessions[1].id}`)).materialRefs.resume).toEqual(sessions[1].materialRefs.resume);
});

test('workspace preserves profile facts and saves editable documents beyond the requested page count', async ({ kr }) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await workspace.locator('#job-title').fill('Engineer'); await workspace.locator('#job-description').fill('Build JavaScript APIs.');
  await workspace.locator('#generate').click(); await expect(workspace.locator('#feedback')).toContainText('Ready', { timeout: 45000 });
  await workspace.locator('#view-prepare').click();
  await expect(workspace.locator('.profile-source')).toContainText('Source: your profile');
  await expect(workspace.locator('#base-file, #base-text, #changes-section')).toHaveCount(0);
  await workspace.locator('#view-edit').click();
  expect((await kr.readStorage('kr:profile')).workExperiences[0].title).toBe('Engineer');
  const before = (await message(workspace, 'list'))[0].revision;
  await workspace.locator('#resume-summary').fill('Long summary '.repeat(1800));
  await workspace.locator('#save-document').click();
  await expect(workspace.locator('#feedback')).toContainText('Changes saved');
  const saved = await message(workspace, 'get', { id: (await message(workspace, 'list'))[0].id });
  expect(saved.revision).not.toBe(before);
  expect(saved.model.summary).toBe('Long summary '.repeat(1800).trim());
  expect(saved.pages).toBeGreaterThan(1);
});

test('edits saved while generation is running survive its completion', async ({ kr }) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  const job = { localId: 'race', title: 'Engineer', description: 'Build JavaScript APIs.' };
  const first = await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job }));
  kr.openrouter.delayMs = 1800;
  const second = await message(workspace, 'start', { kind: 'resume', job });
  await message(workspace, 'cancel', { id: first.id });
  await waitTask(workspace, second);
  const record = await message(workspace, 'get', { id: first.material.id });
  const regeneration = await message(workspace, 'start', { kind: 'resume', job });
  record.model.summary = 'My deliberately saved wording.';
  const saved = await message(workspace, 'save', { id: record.id, revision: record.revision, model: record.model });
  await expect.poll(async () => (await message(workspace, 'status', { id: regeneration.id })).status, { timeout: 10000 }).toBe('error');
  const latest = await message(workspace, 'get', { id: record.id });
  expect(latest.revision).toBe(saved.revision);
  expect(latest.model.summary).toBe('My deliberately saved wording.');
});

test('regeneration retains corrected job context and saved document options', async ({ kr }) => {
  await kr.seed({ profile: PROFILE }); kr.openrouter.handler = materialResponse;
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  const original = { localId: 'corrected', title: 'Engineer', description: 'Original job description.' };
  const corrected = { ...original, title: 'API Engineer', company: 'Acme', description: 'Corrected job description: build JavaScript APIs.' };
  await waitTask(workspace, await message(workspace, 'start', { kind: 'resume', job: corrected, jobEdited: true, options: { pageTarget: 2, instructions: 'Emphasize APIs.' } }));
  const task = await message(workspace, 'start', { kind: 'resume', job: original });
  expect(task.job.description).toBe(corrected.description);
  const finished = await waitTask(workspace, task);
  const record = await message(workspace, 'get', { id: finished.material.id });
  expect(record.options.pageTarget).toBe(2);
  expect(record.options.instructions).toBe('Emphasize APIs.');
  expect(kr.openrouter.requests.at(-1).body.messages.at(-1).content).toContain('Corrected job description');
});

test('automatic full navigation keeps the document selected when Autofill began', async ({ kr }) => {
  await kr.seed({ profile: { ...PROFILE, phone: '+1 555 0100', location: 'Toronto, Ontario, Canada', workCountry: 'Canada', workAuthorization: 'Yes' }, settings: { autoContinue: true, autoSubmit: false } });
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    if (input.kind) return materialResponse(body);
    return { choices: [{ message: { content: JSON.stringify({ answers: (input.fieldsToFill || []).map(f => ({ fieldId: f.fieldId, value: f.type === 'checkbox' ? true : ['radio', 'select', 'combobox'].includes(f.type) ? f.options?.find(o => o.label && !/select|choose/i.test(o.label))?.label || '' : f.type === 'textarea' ? 'I build and ship software and have production application experience.' : f.type === 'tel' ? '+1 555 0100' : f.type === 'email' ? PROFILE.email : PROFILE.fullName })) }) } }] };
  };
  const page = await kr.context.newPage(), uploads = [];
  page.on('console', event => { if (event.text().startsWith('MATERIAL_UPLOAD ')) uploads.push(JSON.parse(event.text().slice(16))); });
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form'); if (!form) return;
    const label = document.createElement('label'); label.textContent = 'Resume';
    const input = document.createElement('input'); input.type = 'file'; input.id = 'materials-resume'; input.accept = '.pdf';
    input.onchange = () => console.log('MATERIAL_UPLOAD ' + JSON.stringify({ step: new URLSearchParams(location.search).get('step'), name: input.files[0]?.name }));
    label.append(input); form.prepend(label);
    if (new URLSearchParams(location.search).get('step') === '1') form.querySelector('button').onclick = () => {
      if (form.checkValidity()) { const next = new URL(location.href); next.searchParams.set('step', '2'); location.href = next.href; }
    };
  }));
  let generation;
  let transition;
  const nextStep = new Promise(resolve => { transition = resolve; });
  await page.route('**/acme/materials-navigation*', async route => {
    const secondStep = new URL(route.request().url()).searchParams.get('step') === '2';
    if (secondStep) await waitTask(workspace, generation);
    await route.fulfill({ contentType: 'text/html', body: fs.readFileSync('fixtures/phase3-application-fixture.html', 'utf8') });
    if (secondStep) transition();
  });
  await page.goto(kr.fixtureUrl('acme/materials-navigation', undefined, '?step=1')); await kr.openPanel(page);
  await page.locator('#kr-tailor-resume').click(); await expect(page.locator('#kr-material-resume-status')).toContainText('Ready', { timeout: 45000 });
  const ids = await kr.readStorage('kr:sessions'), session = await kr.readStorage(`kr:sessions:${ids[0]}`);
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?kind=resume`); await expect(workspace.locator('#generate')).toBeEnabled();
  const old = await message(workspace, 'get', { id: session.materialRefs.resume.id });
  kr.openrouter.delayMs = 800;
  generation = await message(workspace, 'start', { kind: 'resume', job: session.job, sessionId: session.id });
  await page.locator('#kr-autofill-btn').click();
  await page.waitForURL(/step=(?:2|review)/, { timeout: 45000 });
  await nextStep;
  await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('Ready for review', { timeout: 60000 });
  expect(uploads.find(u => u.step === '1')?.name).toBe(old.files.pdf.name);
  expect(uploads.find(u => u.step === '2')?.name).toBe(old.files.pdf.name);
  const latest = await message(workspace, 'get', { id: old.id });
  expect(latest.revision).not.toBe(old.revision);
});
