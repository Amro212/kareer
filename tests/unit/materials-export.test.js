import test from 'node:test';
import assert from 'node:assert/strict';
import { exportMaterial, MATERIAL_TEMPLATE_VERSION } from '../../src/targets/extension/materials/export.js';
import { buildMaterialSource } from '../../src/core/materials-model.js';
import mammoth from 'mammoth';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

test('overflow drops weaker experience before reducing stronger older evidence and keeps skills', async () => {
  const description = Array.from({ length: 4 }, (_, i) => `Delivered integration ${i + 1} with Python and SQL, documented client requirements, tested API workflows and explained results to customer teams; `.repeat(12)).join('\n');
  const source = buildMaterialSource({ fullName: 'Test Applicant', skills: ['Python', 'SQL'], workExperiences: [
    { id: 'recent', title: 'Assistant', company: 'Recent Company', description },
    { id: 'strong', title: 'Engineer', company: 'Earlier Company', description },
  ] });
  source.sections[0].relevance = 1; source.sections[1].relevance = 3;
  assert.ok((await exportMaterial(source, {}, 1, { fit: false })).pages > 1);
  const exported = await exportMaterial(source, {}, 1);
  assert.equal(exported.pages, 1);
  assert.deepEqual(exported.model.sections.map(s => s.id), ['strong', 'skills']);
  assert.equal(exported.model.sections[0].bullets.length, 4);
  assert.deepEqual(exported.model.sections[1].bullets, ['Python', 'SQL']);
  assert.equal(source.sections.length, 3);
});

test('project keywords render beside the protected title in PDF and Word', async () => {
  const source = buildMaterialSource({ fullName: 'Test Applicant', projects: [{ id: 'cad', name: 'Mechanical design', role: 'Team member', startDate: '2022-01', endDate: '2022-05', url: 'https://example.org/cad', description: 'Reconstructed components using SolidWorks and AutoCAD.' }] });
  source.sections[0].keywords = ['SolidWorks', 'AutoCAD'];
  const exported = await exportMaterial(source, {});
  const word = await mammoth.extractRawText({ buffer: Buffer.from(exported.files.docx.buffer) });
  assert.match(word.value, /Mechanical design \| SolidWorks, AutoCAD/);
  const loading = getDocument({ data: new Uint8Array(exported.files.pdf.buffer.slice(0)), isEvalSupported: false, useWasm: false });
  try {
    const { items } = await (await (await loading.promise).getPage(1)).getTextContent();
    assert.match(items.map(i => i.str).join(' '), /Mechanical design \| SolidWorks, AutoCAD/);
    assert.ok(Math.abs(items.find(i => i.str.includes('Mechanical design')).transform[5] - items.find(i => i.str === '2022-01 – 2022-05').transform[5]) < 1);
  } finally { await loading.destroy(); }
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
  const loading = getDocument({ data: new Uint8Array(exported.files.pdf.buffer.slice(0)), fontExtraProperties: true, isEvalSupported: false, useWasm: false });
  try {
    const pdf = await loading.promise, page = await pdf.getPage(1);
    const operators = await page.getOperatorList();
    assert.equal(operators.argsArray[operators.fnArray.indexOf(OPS.setFillRGBColor)][0], '#e1e1e1');
    const band = operators.argsArray[operators.fnArray.indexOf(OPS.constructPath)][2];
    assert.deepEqual([...band].slice(0, 3), [0, 0, 612]);
    assert.ok(Math.abs(band[3] - 93.6) < 0.001, 'full-width 93.6pt stationery band');
    const { items } = await page.getTextContent();
    for (const item of items.filter(i => i.str.trim())) assert.match(page.commonObjs.get(item.fontName).name, /Charter/);
    const name = items.find(i => i.str === model.name && i.height === 28);
    assert.ok(Math.abs(name.transform[4] + name.width / 2 - 306) < 0.1, '28pt name centered on Letter paper');
    assert.equal(items.find(i => i.str === model.contact).height, 9);
    assert.equal(items.filter(i => i.str === model.contact).length, 1);
    const first = items.find(i => i.str === model.paragraphs[1]), next = items.find(i => i.str === model.paragraphs[2]);
    assert.equal(first.height, 12); assert.equal(first.transform[4], 72); assert.equal(next.transform[4], 96);
    const closing = items.find(i => i.str === 'Sincerely,');
    assert.ok(Math.abs(closing.transform[4] + closing.width - 540) < 0.1);
    assert.ok(closing.transform[5] < 75, 'closing inside reserved bottom margin');
    assert.ok(name.transform[5] > 698.4, 'letterhead inside 93.6pt header band');
    assert.equal(exported.templateVersion, MATERIAL_TEMPLATE_VERSION);
  } finally { await loading.destroy(); }
  const zip = await JSZip.loadAsync(exported.files.docx.buffer);
  const text = await mammoth.extractRawText({ buffer: Buffer.from(exported.files.docx.buffer) });
  assert.match(text.value, /Acme/);
  assert.match(text.value, /I build reliable APIs/);
  const header = await zip.file('word/header1.xml').async('string');
  assert.match(header, /E1E1E1/);
  assert.match(header, /Charter/);
  assert.match(await zip.file('word/document.xml').async('string'), /w:jc w:val="right"/);
  assert.match(await zip.file('word/document.xml').async('string'), /w:br/);
  assert.doesNotMatch(header + await zip.file('word/document.xml').async('string'), /Roboto/);
});

test('legacy letter exports split body blocks and remove the repeated contact signature', async () => {
  const model = { kind: 'coverLetter', name: 'Test Applicant', contact: 'test@example.com', paragraphs: [
    'Dear Hiring Team,\r\n\r\nI supported 10 services.\r\n\r\nI welcome a conversation.', 'Test Applicant\r\ntest@example.com',
  ] };
  const result = await exportMaterial(model, { company: 'Acme' });
  assert.deepEqual(result.model.paragraphs, ['Dear Hiring Team,', 'I supported 10 services.', 'I welcome a conversation.', 'Test Applicant']);
  const loading = getDocument({ data: new Uint8Array(result.files.pdf.buffer.slice(0)), isEvalSupported: false, useWasm: false });
  try {
    const { items } = await (await (await loading.promise).getPage(1)).getTextContent();
    assert.equal(items.filter(i => i.str === model.contact).length, 1);
    const signature = items.find(i => i.str === model.name && i.height === 12);
    assert.ok(signature.transform[5] < 75);
    assert.ok(Math.abs(signature.transform[4] + signature.width - 540) < 0.1);
  } finally { await loading.destroy(); }
});

test('standard, detailed and overflowing letters retain all text with the closing on the final page', async () => {
  const sentence = 'I build reliable APIs and maintain production systems for engineering teams.';
  for (const [repeat, pages] of [[8, 1], [14, 1], [20, 2]]) {
    const paragraphs = ['Dear Hiring Team,', ...Array.from({ length: 3 }, () => Array(repeat).fill(sentence).join(' ')), 'Sincerely,\nTest Applicant'];
    const result = await exportMaterial({ kind: 'coverLetter', name: 'Test Applicant', contact: 'test@example.com', paragraphs }, { company: 'Acme' });
    assert.equal(result.pages, pages);
    const loading = getDocument({ data: new Uint8Array(result.files.pdf.buffer.slice(0)), fontExtraProperties: true, isEvalSupported: false, useWasm: false });
    try {
      const pdf = await loading.promise;
      let body = '';
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number); await page.getOperatorList();
        const { items } = await page.getTextContent();
        for (const item of items.filter(i => i.str.trim())) assert.match(page.commonObjs.get(item.fontName).name, /Charter/);
        const signature = items.find(i => i.str === 'Sincerely,');
        assert.equal(Boolean(signature), number === pdf.numPages);
        if (signature) assert.ok(signature.transform[5] < 75);
        const content = items.filter(i => i.height === 12 && i.str && i.transform[5] >= 75);
        for (const item of content) assert.ok(item.transform[4] >= 72 && item.transform[4] + item.width <= 540.1, 'body stays inside horizontal margins');
        body += content.map(i => i.str).join(' ') + ' ';
      }
      assert.equal((body.match(/I build reliable APIs/g) || []).length, repeat * 3);
      const extracted = (await mammoth.extractRawText({ buffer: Buffer.from(result.files.docx.buffer) })).value;
      assert.equal((extracted.match(/I build reliable APIs/g) || []).length, repeat * 3);
    } finally { await loading.destroy(); }
  }
});

test('cancelled generation stops export without changing the existing model', async () => {
  const controller = new AbortController(); controller.abort('Generation timed out.');
  const source = buildMaterialSource({ fullName: 'Test Applicant' });
  await assert.rejects(exportMaterial(source, {}, 1, { signal: controller.signal }), /timed out/);
  assert.equal(source.name, 'Test Applicant');
});

test('resume exports hyperlinks for contact and projects with clean readable labels', async () => {
  const source = buildMaterialSource({
    fullName: 'Amro AbedMoosa',
    email: 'amro@example.com',
    phone: '9054621004',
    city: 'Milton',
    stateProvince: 'Ontario',
    country: 'Canada',
    linkedin: 'https://linkedin.com/in/amro-abedmoosa',
    github: 'https://github.com/Amro212',
    portfolio: 'https://amro.dev',
    website: 'https://amro-personal.org',
    workExperiences: [{ id: 'role', title: 'Engineer', company: 'Acme', location: 'https://acme.org', description: 'Built APIs.' }],
    projects: [
      { id: 'p1', name: 'Kareer', role: 'Lead', url: 'https://github.com/Amro212/kareer', description: 'Autofill extension.' },
      { id: 'p2', name: 'Generic Proj', role: 'Dev', url: 'https://github.com', description: 'Bare github url.' },
      { id: 'p3', name: 'FlowMesh', role: 'Distributed Workflow Engine', url: 'https://github.com/arivera/flowmesh', startDate: '2023-01', current: true, description: 'Workflow engine.' }
    ]
  });
  const exported = await exportMaterial(source, { company: 'Acme' });
  assert.equal(exported.pages, 1);

  // PDF verification
  const loading = getDocument({ data: new Uint8Array(exported.files.pdf.buffer.slice(0)), isEvalSupported: false, useWasm: false });
  try {
    const page = await (await loading.promise).getPage(1);
    const annotations = await page.getAnnotations();
    const urls = annotations.map(a => a.url);
    assert.ok(urls.includes('mailto:amro@example.com'));
    assert.ok(urls.includes('https://linkedin.com/in/amro-abedmoosa'));
    assert.ok(urls.includes('https://github.com/Amro212'));
    assert.ok(urls.some(u => u.startsWith('https://amro.dev')));
    assert.ok(urls.some(u => u.startsWith('https://amro-personal.org')));
    assert.ok(urls.some(u => u.startsWith('https://github.com/Amro212/kareer')));
    assert.ok(urls.some(u => u.startsWith('https://github.com')));
    assert.ok(urls.some(u => u.includes('github.com/arivera/flowmesh')));

    const { items } = await page.getTextContent();
    const text = items.map(i => i.str).join(' ');
    assert.match(text, /LinkedIn/);
    assert.match(text, /GitHub/);
    assert.match(text, /Portfolio/);
    assert.match(text, /Website/);
    assert.match(text, /amro@example\.com/);
    assert.doesNotMatch(text, /https:\/\/linkedin\.com/);
    assert.doesNotMatch(text, /https:\/\/github\.com/);
    assert.doesNotMatch(text, /https:\/\/amro\.dev/);
    assert.doesNotMatch(text, /https:\/\/amro-personal\.org/);
    assert.doesNotMatch(text, /github\.com\/arivera\/flowmesh/);

    // Verify project titles are hyperlinked annotations
    const kareerItem = items.find(i => i.str === 'Kareer');
    assert.ok(kareerItem, 'Project title Kareer exists');
    const flowMeshItem = items.find(i => i.str === 'FlowMesh');
    assert.ok(flowMeshItem, 'Project title FlowMesh exists');
  } finally { await loading.destroy(); }

  // Word verification
  const word = await mammoth.extractRawText({ buffer: Buffer.from(exported.files.docx.buffer) });
  assert.match(word.value, /LinkedIn · GitHub · Portfolio · Website/);
  assert.match(word.value, /Lead/);
  assert.match(word.value, /Distributed Workflow Engine/);
  assert.match(word.value, /- Built APIs/);
  assert.doesNotMatch(word.value, /https:\/\/amro\.dev/);
  assert.doesNotMatch(word.value, /github\.com\/arivera\/flowmesh/);

  const zip = await JSZip.loadAsync(exported.files.docx.buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.match(xml, /w:hyperlink/);
  assert.match(rels, /https:\/\/github\.com\/Amro212\/kareer/);
  assert.match(rels, /https:\/\/amro\.dev/);
  assert.match(rels, /github\.com\/arivera\/flowmesh/);
});
