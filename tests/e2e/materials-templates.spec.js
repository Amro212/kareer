import { test, expect } from './support/fixtures.js';
import legacy from '../../fixtures/materials-legacy.json' with { type: 'json' };
import pdfMake from 'pdfmake/build/pdfmake.js';
import roboto from 'pdfmake/build/vfs_fonts.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import fs from 'node:fs';

pdfMake.addVirtualFileSystem(roboto);
const profile = { fullName: legacy.name, email: legacy.contact, workExperiences: [{ id: 'work1', title: 'Engineer', company: 'Acme', description: 'Built APIs.' }] };
async function request(page, operation, input = {}) {
  const result = await page.evaluate(({ operation, input }) => chrome.runtime.sendMessage({ type: 'kr:materials', operation, input }), { operation, input });
  if (!result?.status) expect(result?.error).toBeFalsy(); return result;
}
const bytes = file => Uint8Array.from(Buffer.from(file.data, 'base64'));

async function legacyRecord(kind, job) {
  const model = legacy[kind];
  const text = kind === 'coverLetter' ? model.paragraphs.join('\n\n') : `${model.summary}\n${model.sections[0].bullets[0]}`;
  const pdf = await pdfMake.createPdf({ pageSize: 'LETTER', pageMargins: [42, 38, 42, 38], defaultStyle: { fontSize: 10.5 }, content: [{ text: model.name, fontSize: 19, bold: true }, model.contact, text] }).getBuffer();
  const docx = await Packer.toArrayBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text, font: 'Roboto', size: 21 })] })] }] }));
  const id = `material:url:${job.listingUrl}:${kind}`;
  return { id, kind, job, model, source: legacy.resume, revision: 'old-template', pages: 1, updatedAt: '2026-10-10T12:00:00.000Z', options: { pageTarget: 1, tone: 'direct', instructions: 'Keep my wording.' }, files: {
    pdf: { name: 'old.pdf', type: 'application/pdf', data: Buffer.from(pdf).toString('base64') },
    docx: { name: 'old.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: Buffer.from(docx).toString('base64') },
  } };
}

async function seedRecord(kr, record) {
  await kr.worker.evaluate(async record => {
    for (const file of Object.values(record.files)) { file.buffer = Uint8Array.from(atob(file.data), c => c.charCodeAt(0)).buffer; file.size = file.buffer.byteLength; delete file.data; }
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('kareer', 1);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(record, record.id);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; req.onerror = () => reject(req.error);
    });
  }, record);
}

async function assertPdf(data, kind) {
  const loading = getDocument({ data: Uint8Array.from(data), fontExtraProperties: true, isEvalSupported: false, useWasm: false });
  try {
    const pdf = await loading.promise; expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1), operators = await page.getOperatorList();
    const { items } = await page.getTextContent(), text = items.map(i => i.str).join(' ');
    expect(text).toContain('10 services');
    for (const item of items.filter(i => i.str.trim())) {
      const font = page.commonObjs.get(item.fontName).name;
      expect(font).toMatch(kind === 'coverLetter' ? /Charter/ : /CMUSerif/); expect(font).not.toMatch(/Roboto/);
    }
    const name = items.find(i => i.str === legacy.name && i.height === (kind === 'coverLetter' ? 28 : 25));
    expect(name).toBeTruthy(); expect(name.transform[4] + name.width / 2).toBeCloseTo(306, 1);
    expect(items.filter(i => i.str === legacy.contact)).toHaveLength(1);
    if (kind === 'coverLetter') {
      expect(operators.argsArray[operators.fnArray.indexOf(OPS.setFillRGBColor)][0]).toBe('#e1e1e1');
      const band = operators.argsArray[operators.fnArray.indexOf(OPS.constructPath)][2];
      expect([...band].slice(0, 3)).toEqual([0, 0, 612]); expect(band[3]).toBeCloseTo(93.6, 3);
      expect(items.find(i => i.str === 'I supported 10 services.').transform[4]).toBe(72);
      expect(items.find(i => i.str === 'I welcome a conversation.').transform[4]).toBe(96);
      const signature = items.find(i => i.str === legacy.name && i.height === 12);
      expect(signature.transform[5]).toBeLessThan(75); expect(signature.transform[4] + signature.width).toBeCloseTo(540, 1);
    } else expect(items.find(i => /^-? ?Built APIs for 10 services\.$/.test(i.str)).height).toBe(8);
  } finally { await loading.destroy(); }
}
async function assertWord(data, kind) {
  const zip = await JSZip.loadAsync(data), xml = await zip.file('word/document.xml').async('string');
  expect(xml).not.toContain('Roboto'); expect(xml).toContain(kind === 'coverLetter' ? 'Charter' : 'CMU Serif');
  expect(Object.keys(zip.files).filter(name => /word\/fonts\/.*\.odttf$/.test(name))).toHaveLength(4);
  if (kind === 'coverLetter') {
    const header = await zip.file('word/header1.xml').async('string'); expect(header).toContain('E1E1E1'); expect(header).toContain('w:val="56"');
    expect(xml).toContain('w:jc w:val="right"'); expect(xml).toContain('w:firstLine="480"');
    expect(xml).not.toContain(legacy.contact);
  } else { expect(xml).toContain('w:sz w:val="16"'); expect(xml).toContain('w:pBdr'); }
}

test('legacy exports upgrade on every entry path without AI or lost wording; active run stays frozen', async ({ kr }) => {
  await kr.seed({ profile });
  const page = await kr.context.newPage(); await page.goto(kr.fixtureUrl('materials-fixture.html')); await kr.openPanel(page);
  const ids = await kr.readStorage('kr:sessions'), session = await kr.readStorage(`kr:sessions:${ids[0]}`);
  await page.locator('label').evaluateAll(labels => labels.filter(label => !label.querySelector('input[type="file"]')).forEach(label => label.remove()));
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  for (const kind of ['resume', 'coverLetter']) {
    const old = await legacyRecord(kind, session.job);
    await kr.worker.evaluate(async ({ session, old, kind }) => {
      session.materialRefs = { [kind]: { id: old.id, revision: old.revision } }; await chrome.storage.local.set({ [`kr:sessions:${session.id}`]: session });
    }, { session, old, kind });
    for (const operation of ['get', 'document', 'snapshot']) {
      await seedRecord(kr, old);
      const result = await request(workspace, operation, { id: old.id, ref: { id: old.id }, sessionId: session.id });
      const pdf = operation === 'document' ? result : (operation === 'snapshot' ? result.records[kind] : result).files.pdf;
      await assertPdf(bytes(pdf), kind);
      const current = await request(workspace, 'get', { id: old.id });
      expect(current.templateVersion).toBe(1); expect(current.revision).not.toBe(old.revision);
      expect(current.options).toEqual(old.options); expect(current.updatedAt).toBe(old.updatedAt);
      expect((await request(workspace, 'get', { id: old.id })).revision).toBe(current.revision);
      await assertWord(bytes(current.files.docx), kind);
    }
    // A running application keeps its selected bytes; upgrading must not swap a file mid-run.
    const current = await request(workspace, 'snapshot', { sessionId: session.id, persistRun: true });
    await seedRecord(kr, old);
    await request(workspace, 'get', { id: old.id });
    const resumed = await request(workspace, 'snapshot', { sessionId: session.id, resumeRun: true });
    expect(resumed.records[kind].files.pdf.data).toBe(current.records[kind].files.pdf.data);
    await request(workspace, 'endRun', { sessionId: session.id, runRef: current.runRef });
    await page.locator('#kr-autofill-btn').click();
    const control = kind === 'resume' ? '#resume' : '#cover';
    await expect.poll(() => page.locator(control).evaluate(el => el.files.length)).toBe(1);
    const uploaded = await page.locator(control).evaluate(async el => [...new Uint8Array(await el.files[0].arrayBuffer())]); await assertPdf(uploaded, kind);
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  }
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('opening old saved letters upgrades actual preview and PDF/Word downloads', async ({ kr }, testInfo) => {
  await kr.seed({ profile });
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  const old = await legacyRecord('coverLetter', { listingUrl: 'https://example.com/jobs/legacy', title: 'Engineer', company: 'Acme', description: 'Build APIs.' });
  await seedRecord(kr, old);
  await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html?document=${encodeURIComponent(old.id)}`);
  await expect(workspace.locator('#pdf-preview canvas')).toHaveCount(1); await expect(workspace.locator('#pdf-preview')).toHaveAttribute('aria-busy', 'false');
  await expect(workspace.locator('[data-paragraph]')).toHaveCount(4);
  await expect(workspace.locator('[data-paragraph="1"]')).toHaveValue('I supported 10 services.');
  await workspace.locator('#pdf-preview').screenshot({ path: testInfo.outputPath('migrated-letter-preview.png') });
  for (const format of ['pdf', 'docx']) {
    const download = workspace.waitForEvent('download'); await workspace.locator(`[data-download="${format}"]`).click();
    const data = fs.readFileSync(await (await download).path());
    if (format === 'pdf') await assertPdf(data, 'coverLetter'); else await assertWord(data, 'coverLetter');
  }
  await workspace.reload(); await expect(workspace.locator('#pdf-preview canvas')).toHaveCount(1);
  expect(kr.openrouter.requests).toHaveLength(0);
});

test('fresh generation and saved edits use only current PDF and Word templates', async ({ kr }) => {
  await kr.seed({ profile });
  kr.openrouter.handler = body => {
    const input = JSON.parse(body.messages.at(-1).content);
    expect(body.response_format.type).toBe('json_schema');
    const output = input.kind === 'coverLetter' ? { paragraphs: legacy.coverLetter.paragraphs } : { summary: legacy.resume.summary, sections: [{ id: 'work1', bullets: legacy.resume.sections[0].bullets }] };
    return { choices: [{ message: { content: JSON.stringify(output) } }] };
  };
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  await expect(workspace.locator('#workspace-version')).toHaveText(`Kareer v${JSON.parse(fs.readFileSync('dist/chrome/manifest.json', 'utf8')).version}`);
  const job = { listingUrl: 'https://example.com/jobs/fresh', title: 'Engineer', company: 'Acme', description: 'Build APIs.' };
  for (const kind of ['resume', 'coverLetter']) {
    const task = await request(workspace, 'start', { kind, job });
    await expect.poll(async () => (await request(workspace, 'status', { id: task.id })).status, { timeout: 45000 }).toBe('ready');
    const status = await request(workspace, 'status', { id: task.id });
    const record = await request(workspace, 'get', { id: status.material.id });
    expect(record.templateVersion).toBe(1); await assertPdf(bytes(record.files.pdf), kind); await assertWord(bytes(record.files.docx), kind);
    const saved = await request(workspace, 'save', { id: record.id, revision: record.revision, model: record.model });
    expect(saved.templateVersion).toBe(1); await assertPdf(bytes(saved.files.pdf), kind); await assertWord(bytes(saved.files.docx), kind);
  }
  expect(kr.openrouter.requests).toHaveLength(2);
});

test('reading an old document during regeneration does not masquerade as concurrent edits', async ({ kr }) => {
  await kr.seed({ profile }); kr.openrouter.delayMs = 1800;
  kr.openrouter.handler = () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'Updated wording for 10 services.', sections: [{ id: 'work1', bullets: ['Built APIs for 10 services.'] }] }) } }] });
  const workspace = await kr.context.newPage(); await workspace.goto(`chrome-extension://${kr.extensionId}/materials/index.html`);
  await expect(workspace.locator('#generate')).toBeEnabled();
  const old = await legacyRecord('resume', { listingUrl: 'https://example.com/jobs/concurrent', title: 'Engineer', company: 'Acme', description: 'Build APIs.' });
  await seedRecord(kr, old);
  const task = await request(workspace, 'start', { kind: 'resume', job: old.job });
  await expect.poll(() => kr.openrouter.requests.length).toBe(1);
  await request(workspace, 'get', { id: old.id });
  await expect.poll(async () => (await request(workspace, 'status', { id: task.id })).status, { timeout: 45000 }).not.toBe('running');
  const finished = await request(workspace, 'status', { id: task.id }); expect(finished.status, finished.error).toBe('ready');
  const current = await request(workspace, 'get', { id: old.id });
  expect(current.model.summary).toBe('Updated wording for 10 services.'); expect(current.templateVersion).toBe(1);
});
