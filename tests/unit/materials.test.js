import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../../src/core/materials-model.js').catch(() => ({}));
const binary = await import('../../src/targets/extension/shared/binary.js').catch(() => ({}));
const upload = await import('../../src/core/materials.js').catch(() => ({}));
const profile = {
  fullName: 'Test Applicant', email: 'test@example.com',
  workExperiences: [{ id: 'work1', company: 'Acme', title: 'Engineer', startDate: '2021-01', endDate: '2024-02', description: 'Built APIs. Reduced latency by 20%.' },
    { id: 'hidden', enabled: false, company: 'Private Co', title: 'Intern', description: 'Private details' }],
  education: [{ id: 'edu1', institution: 'University', degree: 'BSc', fieldOfStudy: 'Computer Science' }], skills: ['JavaScript', 'SQL'],
};

test('materials source uses authoritative profile facts and excludes disabled records', () => {
  assert.equal(typeof model.buildMaterialSource, 'function');
  const source = model.buildMaterialSource(profile, { text: 'Resume background', sections: [{ id: 'work1', heading: 'Wrong title', facts: 'Wrong dates', bullets: ['Built APIs.'] }] });
  assert.equal(source.name, profile.fullName);
  assert.match(JSON.stringify(source), /Engineer/);
  assert.doesNotMatch(JSON.stringify(source), /Wrong title|Wrong dates|Private Co|Private details/);
});

test('resume AI output cannot replace protected job titles or dates', () => {
  assert.equal(typeof model.validateMaterial, 'function');
  const source = model.buildMaterialSource(profile);
  const result = model.validateMaterial('resume', { summary: 'API engineer', sections: [{ id: 'work1', heading: 'CEO', facts: '2025', bullets: ['Built APIs.'] }] }, source);
  assert.equal(result.sections[0].heading, source.sections.find(s => s.id === 'work1').heading);
  assert.equal(result.sections[0].facts, source.sections.find(s => s.id === 'work1').facts);
});

test('resume rejects unknown source sections', () => {
  assert.equal(typeof model.validateMaterial, 'function');
  const source = model.buildMaterialSource(profile);
  assert.throws(() => model.validateMaterial('resume', { sections: [{ id: 'invented', bullets: ['Led a team'] }] }, source), /source|unknown/i);
});

test('numbers do not block resume summaries, bullets, cover letters or targeted rewrites', () => {
  const source = model.buildMaterialSource(profile);
  const resume = model.validateMaterial('resume', { summary: 'Engineer supporting 10 services.', sections: [{ id: 'work1', bullets: ['Reduced latency by 80%.'] }] }, source);
  assert.equal(resume.summary, 'Engineer supporting 10 services.');
  assert.deepEqual(resume.sections[0].bullets, ['Reduced latency by 80%.']);
  const rewritten = model.mergeMaterialRewrite(resume, { sections: [{ id: 'work1', bullets: ['Supported 12 services.'] }] }, 'section:work1');
  assert.deepEqual(model.validateMaterial('resume', rewritten, source).sections[0].bullets, ['Supported 12 services.']);
  assert.deepEqual(model.validateMaterial('coverLetter', { paragraphs: ['Dear Hiring Team,', 'I supported 10 services.'] }, source).paragraphs, ['Dear Hiring Team,', 'I supported 10 services.']);
});

test('section comparisons include omissions', () => {
  assert.equal(typeof model.materialChanges, 'function');
  const source = model.buildMaterialSource(profile);
  const changes = model.materialChanges(source, { ...source, sections: source.sections.filter(s => s.id !== 'edu1') });
  assert.ok(changes.some(change => change.id === 'edu1' && change.type === 'omitted'));
  assert.ok(model.materialChanges(source, { ...source, sections: [...source.sections].reverse() }).some(change => change.type === 'reordered'));
});

test('jobs with identical titles have distinct material identities', () => {
  assert.equal(typeof model.materialJobKey, 'function');
  assert.notEqual(model.materialJobKey({ title: 'Engineer', listingUrl: 'https://jobs.test/one' }), model.materialJobKey({ title: 'Engineer', listingUrl: 'https://jobs.test/two' }));
  assert.throws(() => model.materialJobKey({ title: 'Engineer' }), /identity|job/i);
});

test('document transport survives Chrome JSON serialization without corrupting bytes', () => {
  assert.equal(typeof binary.encodeDocument, 'function');
  const buffer = Uint8Array.from([0, 255, 128, 10, 13, 200]).buffer;
  const result = binary.decodeDocument(JSON.parse(JSON.stringify(binary.encodeDocument({ name: 'test.pdf', type: 'application/pdf', buffer }))));
  assert.deepEqual(new Uint8Array(result.buffer), new Uint8Array(buffer));
  const empty = binary.decodeDocument(JSON.parse(JSON.stringify(binary.encodeDocument({ buffer: new ArrayBuffer(0) }))));
  assert.equal(empty.buffer?.byteLength, 0);
});

test('upload format respects accept and prefers PDF', () => {
  assert.equal(typeof model.materialFormat, 'function');
  assert.equal(model.materialFormat(''), 'pdf');
  assert.equal(model.materialFormat('.pdf,.docx'), 'pdf');
  assert.equal(model.materialFormat('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx');
  assert.throws(() => model.materialFormat('.jpg'), /accept|supported/i);
});

test('cover letter validation rejects empty output and preserves paragraph structure', () => {
  assert.equal(typeof model.validateMaterial, 'function');
  assert.throws(() => model.validateMaterial('coverLetter', { paragraphs: [] }, model.buildMaterialSource(profile)), /empty|paragraph/i);
  const result = model.validateMaterial('coverLetter', { paragraphs: ['Dear Hiring Team,', 'I build APIs.'] }, model.buildMaterialSource(profile));
  assert.match(model.materialText(result), /Dear Hiring Team,\n\nI build APIs\./);
});

test('legacy letter paragraph blocks become separate paragraphs with a name-only signature', () => {
  const source = model.buildMaterialSource(profile);
  const result = model.validateMaterial('coverLetter', { paragraphs: [
    'Dear Hiring Team,\n\nI supported 10 services.\n\nI welcome a conversation.',
    `${source.name}\n${source.contact}`,
  ] }, source);
  assert.deepEqual(result.paragraphs, ['Dear Hiring Team,', 'I supported 10 services.', 'I welcome a conversation.', source.name]);
  assert.deepEqual(model.validateMaterial('coverLetter', { paragraphs: [
    'Dear Hiring Team,\r\n\r\nI supported 10 services.\r\n\r\nI welcome a conversation.', `${source.name}\r\n${source.contact}`,
  ] }, source).paragraphs, result.paragraphs);
  const custom = ['Dear Hiring Team,', 'Contact me about 10 services.', 'With appreciation,\nA custom signature'];
  assert.deepEqual(model.validateMaterial('coverLetter', { paragraphs: custom }, source).paragraphs, custom);
});

test('material field routing distinguishes cover letter text, resume and unrelated uploads', () => {
  assert.equal(typeof upload.materialKind, 'function');
  assert.equal(upload.materialKind({ type: 'file', label: 'Cover letter' }, []), 'coverLetter');
  assert.equal(upload.materialKind({ type: 'textarea', label: 'Cover letter text' }, []), 'coverLetter');
  assert.equal(upload.materialKind({ type: 'file', label: 'Portfolio' }, []), null);
  assert.equal(upload.materialKind({ type: 'textarea', label: 'Why work here?' }, []), null);
});

test('generated skills cannot introduce a skill absent from source', () => {
  const source = model.buildMaterialSource(profile);
  assert.throws(() => model.validateMaterial('resume', { sections: [{ id: 'skills', bullets: ['Rust'] }] }, source), /skill|unsupported/i);
});

test('imported roles match profile facts even when extracted with another id; disabled facts stay out of writing context', () => {
  const source = model.buildMaterialSource(profile, { text: 'Wrong title at Acme. Intern Private Co. Private details', sections: [
    { id: 'import_1', category: 'Experience', heading: 'Wrong title — Acme', facts: 'Wrong dates', bullets: ['Imported accomplishment'] },
    { id: 'import_2', category: 'Experience', heading: 'Intern — Private Co', facts: '', bullets: ['Private details'] },
  ] });
  assert.equal(source.sections.filter(s => /Acme/.test(s.heading)).length, 1);
  assert.doesNotMatch(JSON.stringify(source), /Wrong title|Wrong dates|Private Co|Private details/);
});

test('targeted rewrites merge only the requested section and reject stale or unknown targets', () => {
  const source = model.buildMaterialSource(profile);
  const current = model.validateMaterial('resume', { summary: 'API engineer', sections: source.sections }, source);
  const output = { summary: 'Unrequested change', sections: [{ id: 'work1', bullets: ['Built reliable APIs.'] }] };
  const merged = model.mergeMaterialRewrite(current, output, 'section:work1');
  assert.equal(merged.summary, current.summary);
  assert.deepEqual(merged.sections.slice(1), current.sections.slice(1));
  assert.deepEqual(merged.sections[0].bullets, ['Built reliable APIs.']);
  assert.throws(() => model.mergeMaterialRewrite(current, output, 'section:missing'), /target/i);
  const letter = { kind: 'coverLetter', paragraphs: ['First', 'Second'] };
  assert.deepEqual(model.mergeMaterialRewrite(letter, { paragraphs: ['Changed', 'Other'] }, 'paragraph:0').paragraphs, ['Changed', 'Second']);
});

test('display metadata comes from saved facts, never unvalidated import properties', () => {
  const source = model.buildMaterialSource({ education: [{ id: 'edu', degree: 'BSc', institution: 'University', location: 'Toronto', gpa: '3.8' }] }, {
    sections: [{ id: 'import', category: 'Experience', heading: 'Engineer — Acme', facts: '2024', title: 'Invented executive title', dates: 'Invented date', bullets: ['Built APIs.'] }],
  });
  assert.equal(source.sections[0].location, 'Toronto · GPA 3.8');
  assert.doesNotMatch(JSON.stringify(source), /Invented/);
  assert.equal(source.sections[1].heading, 'Engineer — Acme');
});
