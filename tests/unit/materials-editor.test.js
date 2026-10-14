import test from 'node:test';
import assert from 'node:assert/strict';
import { modelToEditor, editorToModel, editableModel, rewriteText } from '../../src/targets/extension/materials/editor-model.js';
import { MaterialAutosave } from '../../src/targets/extension/materials/autosave.js';

const model = { kind: 'resume', name: 'Test Applicant', contact: 'applicant@example.org', summary: 'API engineer.', sections: [
  { id: 'work', category: 'Experience', title: 'Engineer', subtitle: 'Acme', dates: '2021–2024', heading: 'Engineer — Acme', bullets: ['Built APIs.', 'Reduced latency.'], relevance: 3, protected: true },
  { id: 'project', category: 'Projects', heading: 'Platform', keywords: ['Python', 'SQL'], bullets: ['Shipped integrations.'], link: 'https://example.org' },
  { id: 'skills', category: 'Skills', heading: 'Skills', bullets: ['JavaScript'] },
] };

test('document round trip retains metadata and source order despite visual category order', () => {
  assert.deepEqual(editorToModel(modelToEditor(model), model), model);
  const doc = modelToEditor(model);
  doc.content.find(s => s.attrs.id === 'work').content[0].content[0].text = 'Built production APIs.';
  const result = editorToModel(doc, model);
  assert.equal(result.sections[0].bullets[0], 'Built production APIs.');
  assert.equal(result.sections[0].relevance, 3);
  assert.equal(result.sections[1].link, model.sections[1].link);
  assert.deepEqual(result.sections[1].keywords, ['Python', 'SQL']);
  assert.equal(result.name, model.name);
});
test('letter paragraph split and merge retain newlines and ordinary paragraph text', () => {
  const letter = { kind: 'coverLetter', name: model.name, contact: model.contact, paragraphs: ['Dear Hiring Team,', 'I build APIs.', 'Sincerely,\nTest Applicant'] };
  const doc = modelToEditor(letter);
  doc.content[0].content.splice(2, 0, { type: 'paragraph', content: [{ type: 'text', text: 'I improve reliability.' }] });
  assert.deepEqual(editorToModel(doc, letter).paragraphs, ['Dear Hiring Team,', 'I build APIs.', 'I improve reliability.', 'Sincerely,\nTest Applicant']);
  assert.deepEqual(editorToModel(modelToEditor(letter), letter), letter);
});
test('background editable bridge rejects structural edits and protects profile facts', () => {
  const input = structuredClone(model); input.name = 'Forged'; input.sections[0].title = 'CEO'; input.sections[0].bullets = ['Edited achievement.'];
  const saved = editableModel(model, input);
  assert.equal(saved.name, model.name); assert.equal(saved.sections[0].title, 'Engineer');
  assert.deepEqual(saved.sections[0].bullets, ['Edited achievement.']);
  input.sections.pop(); assert.throws(() => editableModel(model, input), /Invalid resume/);
});
test('rewrite guards detect paragraph insertion before the selected paragraph', () => {
  const letter = { paragraphs: ['Opening', 'Body', 'Closing'] };
  assert.notEqual(rewriteText(letter, 'paragraph:1'), rewriteText({ paragraphs: ['New', ...letter.paragraphs] }, 'paragraph:1'));
  const newer = structuredClone(model); newer.sections[1].keywords.push('Monitoring');
  assert.notEqual(rewriteText(model, 'section:project'), rewriteText(newer, 'section:project'));
});

function harness({ delaySave, failSave = false, failDraft = false } = {}) {
  let current = { model: structuredClone(model), pageTarget: 1 }, calls = [], compiled = [], states = [], release;
  const gate = delaySave ? new Promise(resolve => release = resolve) : null;
  const record = { id: 'material:test', revision: 'r1', model, options: { pageTarget: 1 } };
  const autosave = new MaterialAutosave({ record, read: () => structuredClone(current), draftDelay: 100000, compileDelay: 100000,
    request: async (operation, input) => {
      calls.push({ operation, input });
      if (operation === 'putDraft') { if (failDraft) throw Error('disk unavailable'); return { revision: `d${calls.length}` }; }
      if (operation === 'save') { if (gate) await gate; if (failSave) throw Error('export failed'); return { ...record, model: input.model, revision: `r${calls.length}`, options: { pageTarget: input.pageTarget } }; }
      return { ok: true };
    }, onState: (state, error) => states.push([state, error?.message]), onCompiled: record => compiled.push(record) });
  return { autosave, calls, compiled, states, edit(text) { current.model.summary = text; autosave.change(); }, release: () => release?.() };
}
test('typing during compilation remains pending and the next export uses the acknowledged revision', async () => {
  const h = harness({ delaySave: true }); h.edit('First edit');
  const first = h.autosave.flush();
  await new Promise(resolve => setImmediate(resolve));
  h.edit('New typing during export'); h.release(); await first;
  assert.equal(h.compiled[0].model.summary, 'First edit'); assert.equal(h.autosave.pending, true); assert.equal(h.autosave.needsCompile, true);
  await h.autosave.flush();
  assert.equal(h.compiled[1].model.summary, 'New typing during export');
  assert.equal(h.calls.filter(c => c.operation === 'save')[1].input.revision, h.compiled[0].revision);
  assert.equal(h.autosave.pending, false); assert.equal(h.autosave.needsCompile, false); h.autosave.dispose();
});
test('failed exports retain persisted drafts and report failure without claiming current bytes', async () => {
  const h = harness({ failSave: true }); h.edit('Recover this draft');
  await assert.rejects(h.autosave.flush(), /export failed/);
  assert.equal(h.autosave.pending, false); assert.equal(h.autosave.needsCompile, true); assert.equal(h.autosave.draftRevision, 'd1');
  assert.equal(h.compiled.length, 0); assert.deepEqual(h.states.at(-1), ['error', 'export failed']); h.autosave.dispose();
});
test('failed local persistence leaves edits pending and prevents stale downloads', async () => {
  const h = harness({ failDraft: true }); h.edit('Unsaved text');
  await assert.rejects(h.autosave.flush(), /disk unavailable/);
  assert.equal(h.autosave.pending, true); assert.equal(h.calls.some(c => c.operation === 'save'), false); h.autosave.dispose();
});
test('concurrent flushes compile once and unchanged documents do not generate files', async () => {
  const h = harness(); h.edit('One edit');
  await Promise.all([h.autosave.flush(), h.autosave.flush()]);
  assert.equal(h.calls.filter(c => c.operation === 'save').length, 1);
  await h.autosave.flush(); assert.equal(h.calls.length, 2); h.autosave.dispose();
});

test('resuming after an interrupted operation restores live reads instead of freezing future edits', async () => {
  const h = harness(); h.autosave.dispose(); h.autosave.resume();
  h.edit('Editing after failed regeneration'); await h.autosave.flush();
  assert.equal(h.compiled[0].model.summary, 'Editing after failed regeneration'); h.autosave.dispose();
});
