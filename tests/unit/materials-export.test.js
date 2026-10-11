import test from 'node:test';
import assert from 'node:assert/strict';
import { exportMaterial } from '../../src/targets/extension/materials/export.js';
import { buildMaterialSource } from '../../src/core/materials-model.js';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';

test('export keeps the editable model cloneable and Word contains ordinary paragraphs', async () => {
  const source = buildMaterialSource({ fullName: 'Test Applicant', workExperiences: [{ id: 'role', title: 'Engineer', company: 'Acme', description: 'Built APIs. Reduced latency by 20%.' }] });
  const exported = await exportMaterial(source, { company: 'Acme' });
  assert.deepEqual(structuredClone(exported.model), source);
  assert.equal(exported.pages, 1);
  assert.equal(new TextDecoder().decode(exported.files.pdf.buffer.slice(0, 5)), '%PDF-');
  const word = await mammoth.extractRawText({ buffer: Buffer.from(exported.files.docx.buffer) });
  assert.match(word.value, /Engineer[\s\S]*Acme/);
  assert.match(word.value, /Built APIs/);
  const loading = getDocument({ data: new Uint8Array(exported.files.pdf.buffer.slice(0)), isEvalSupported: false, useWasm: false });
  const pdf = await loading.promise;
  assert.equal(pdf.numPages, 1);
  assert.match((await (await pdf.getPage(1)).getTextContent()).items.map(i => i.str).join(' '), /Built APIs/);
  await loading.destroy();
});

test('one-page fitting removes content with readable type and two-page export retains more', async () => {
  const source = buildMaterialSource({ fullName: 'Test Applicant', workExperiences: Array.from({ length: 6 }, (_, i) => ({ id: `role${i}`, title: 'Engineer', company: `Company ${i}`, description: Array.from({ length: 12 }, () => 'Built reliable APIs and improved documentation for delivery across the engineering team, coordinating releases and troubleshooting production integrations with partner teams.').join('\n') })) });
  const one = await exportMaterial(source, { company: 'Acme' }, 1);
  const two = await exportMaterial(source, { company: 'Acme' }, 2);
  assert.equal(one.pages, 1);
  assert.equal(two.pages, 2);
  assert.ok(JSON.stringify(two.model).length > JSON.stringify(one.model).length);
  assert.deepEqual(structuredClone(one.model), one.model);
});

test('reference formatting keeps compact resume type, section order and embedded Word fonts', async () => {
  const source = buildMaterialSource({ fullName: 'Test Applicant', email: 'test@example.com',
    workExperiences: [{ id: 'role', title: 'Engineer', company: 'Acme', location: 'Toronto', startDate: '2024-01', current: true, description: 'Built reliable APIs.' }],
    education: [{ id: 'degree', degree: 'BSc', institution: 'University' }],
    projects: [{ id: 'project', name: 'API project', description: 'Built a useful integration.' }], skills: ['Languages: JavaScript, Python', 'Tools: Git'],
  }, { summary: 'Engineer focused on API integrations.' });
  const exported = await exportMaterial(source, {});
  const loading = getDocument({ data: new Uint8Array(exported.files.pdf.buffer.slice(0)), isEvalSupported: false, useWasm: false });
  try {
    const page = await (await loading.promise).getPage(1), { items } = await page.getTextContent();
    const text = items.map(i => i.str).join(' ');
    assert.ok(text.indexOf('Technical Skills') < text.indexOf('Professional Experience'));
    assert.ok(text.indexOf('Projects') < text.indexOf('Education'));
    assert.ok(items.find(i => i.str === 'Languages: JavaScript, Python').transform[5] > items.find(i => i.str === 'Tools: Git').transform[5]);
    assert.equal(items.find(i => i.str.includes('Built reliable APIs.')).height, 8);
    assert.equal(items.find(i => i.str === 'Test Applicant').height, 25);
    assert.ok(items.find(i => i.str === '2024-01 – Present').transform[4] > 400);
  } finally { await loading.destroy(); }
  const zip = await JSZip.loadAsync(exported.files.docx.buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /w:left="490"/);
  assert.match(xml, /w:sz w:val="16"/);
  assert.match(xml, /w:pBdr/);
  assert.equal(Object.keys(zip.files).filter(name => /word\/fonts\/.*\.odttf$/.test(name)).length, 4);
});

test('cover letter has distinct serif stationery and right-aligned closing without losing text', async () => {
  const model = { kind: 'coverLetter', name: 'Test Applicant', contact: 'test@example.com', paragraphs: ['Dear Hiring Team,', 'I build reliable APIs.', 'I would welcome a conversation.', 'Sincerely,\nTest Applicant'] };
  const exported = await exportMaterial(model, { company: 'Acme' });
  assert.equal(exported.pages, 1);
  const zip = await JSZip.loadAsync(exported.files.docx.buffer);
  const text = await mammoth.extractRawText({ buffer: Buffer.from(exported.files.docx.buffer) });
  assert.match(text.value, /Acme/);
  assert.match(text.value, /I build reliable APIs/);
  const header = await zip.file('word/header1.xml').async('string');
  assert.match(header, /E1E1E1/);
  assert.match(header, /Charter/);
  assert.match(await zip.file('word/document.xml').async('string'), /w:jc w:val="right"/);
  assert.match(await zip.file('word/document.xml').async('string'), /w:br/);
});

test('cancelled generation stops export without changing the existing model', async () => {
  const controller = new AbortController(); controller.abort('Generation timed out.');
  const source = buildMaterialSource({ fullName: 'Test Applicant' });
  await assert.rejects(exportMaterial(source, {}, 1, { signal: controller.signal }), /timed out/);
  assert.equal(source.name, 'Test Applicant');
});
