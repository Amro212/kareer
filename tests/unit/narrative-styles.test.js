import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { STORAGE_KEYS } from '../../src/core/constants.js';
import { getSettings, saveSettings, saveProfile, saveApiKey, gmSet } from '../../src/core/storage.js';
import { exportPayload, importPayload, collectPortableData } from '../../src/core/migration.js';
import { NARRATIVE_STYLES, getNarrativeStyle } from '../../src/core/narrative-styles.js';
import { generateAutofillAnswers, rewriteNarrativeField, buildNarrativeSystemPrompt, buildNarrativeEditorSystemPrompt } from '../../src/core/ai.js';

let requests, dom;
beforeEach(() => {
  dom = new JSDOM('<body></body>', { url: 'https://example.com/jobs' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.GM_getValue = undefined;
  globalThis.GM_setValue = undefined;
  setPlatform(createGmHost());
  saveApiKey('style-test-key');
  saveProfile({ fullName: 'Test Candidate', resumeContext: 'Built a form-filling tool.', savedAnswers: { 'Saved answer': 'Keep my exact wording.' } });
  requests = [];
  globalThis.GM_xmlhttpRequest = options => {
    const body = JSON.parse(options.data);
    requests.push(body);
    let input;
    try { input = JSON.parse(body.messages[1].content); } catch {}
    const content = input ? JSON.stringify({ answers: input.fieldsToFill.map(field => ({ fieldId: field.fieldId, value: field.options?.[0]?.label || 'I built a form-filling tool.', inferred: true })) }) : 'I built a form-filling tool.';
    options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content } }] }) });
  };
});

afterEach(() => dom.window.close());

function checkVoice(prompt, style) {
  assert.match(prompt, /NARRATIVE VOICE/);
  assert.match(prompt, /SPECIFICITY TEST/);
  assert.match(prompt, /SPOKEN TEST/);
  assert.match(prompt, /em dashes/);
  assert.match(prompt, /ceremonial/);
  assert.match(prompt, /natural contractions|normal contractions/);
  assert.ok(prompt.includes(style.prompt));
  for (const example of style.examples) assert.ok(prompt.includes(example.answer));
  assert.match(prompt, /demonstrations.*not.*evidence/i);
  assert.doesNotMatch(prompt, /23-year-old|candidate himself|He uses|Direct developer|Why 1Password/);
  assert.match(prompt, /emotional framing, inferred personal reactions, and plausible anecdotal elaboration/);
  assert.match(prompt, /career history, qualifications, dates, and measurable results/);
  assert.doesNotMatch(prompt, /Do not manufacture enthusiasm|Never invent facts out of thin air\./);
  for (const other of NARRATIVE_STYLES.filter(other => other.id !== style.id)) assert.ok(!prompt.includes(other.prompt));
}

for (const style of NARRATIVE_STYLES) {
  test(`${style.label} reaches mixed page fill and rewrite with one request each`, async () => {
    saveSettings({ narrativeStyle: style.id });
    const result = await generateAutofillAnswers([
      { fieldId: 'story', label: 'Describe a project', type: 'textarea', isNarrative: true, constraints: { maxLength: 400 } },
      { fieldId: 'choice', label: 'Preferred shift?', type: 'select', options: [{ value: 'day', label: 'Day shift' }] },
      { fieldId: 'saved', label: 'Saved answer', type: 'textarea' },
      { fieldId: 'name', label: 'Full name', type: 'text' },
    ]);
    assert.equal(requests.length, 1);
    checkVoice(requests[0].messages[0].content, style);
    assert.match(requests[0].messages[0].content, /Writing style applies only to generated narrative/);
    assert.match(requests[0].messages[0].content, /structured fields.*strictly grounded/);
    const sent = JSON.parse(requests[0].messages[1].content).fieldsToFill;
    assert.deepEqual(sent.map(field => field.fieldId), ['story', 'choice']);
    assert.equal(sent[0].constraints.maxLength, 400);
    assert.equal(result.answers.find(answer => answer.fieldId === 'saved').value, 'Keep my exact wording.');
    assert.equal(result.answers.find(answer => answer.fieldId === 'name').value, 'Test Candidate');
    assert.equal(result.answers.find(answer => answer.fieldId === 'choice').value, 'day');
    await rewriteNarrativeField({ fieldLabel: 'Describe a project', currentValue: 'Original', constraints: { maxLength: 200 } });
    assert.equal(requests.length, 2);
    checkVoice(requests[1].messages[0].content, style);
    assert.equal(requests[1].temperature, 0.6);
    assert.match(requests[1].messages[1].content, /200 characters/);
    checkVoice(buildNarrativeSystemPrompt({}, getSettings()), style);
    checkVoice(buildNarrativeEditorSystemPrompt({}, getSettings()), style);
    assert.ok(!JSON.stringify(requests).includes('style-test-key'));
  });
}

test('default, unknown, and malformed styles fall back to Natural and backups retain the choice', () => {
  assert.equal(getSettings().narrativeStyle, 'natural');
  for (const value of ['obsolete', null, {}, '__proto__']) {
    gmSet(STORAGE_KEYS.SETTINGS, { narrativeStyle: value });
    assert.equal(getSettings().narrativeStyle, 'natural');
    assert.equal(getNarrativeStyle(value).id, 'natural');
  }
  saveSettings({ narrativeStyle: 'story-led', model: 'custom-model', autoSubmit: true });
  const imported = importPayload(exportPayload(collectPortableData()));
  assert.equal(imported[STORAGE_KEYS.SETTINGS].narrativeStyle, 'story-led');
  gmSet(STORAGE_KEYS.SETTINGS, imported[STORAGE_KEYS.SETTINGS]);
  assert.equal(getSettings().narrativeStyle, 'story-led');
  assert.equal(getSettings().model, 'custom-model');
  assert.equal(getSettings().autoSubmit, true);
});

test('a rewrite override is local and approved examples are interpreted through that style', async () => {
  saveSettings({ narrativeStyle: 'warm-personal', writingExamples: [{ question: 'Why?', answer: 'My approved phrasing.' }] });
  await rewriteNarrativeField({ fieldLabel: 'Why?', currentValue: 'Original', style: 'light-wit' });
  checkVoice(requests[0].messages[0].content, getNarrativeStyle('light-wit'));
  assert.match(requests[0].messages[0].content, /My approved phrasing/);
  assert.match(requests[0].messages[0].content, /Interpret.*selected style/);
  assert.equal(getSettings().narrativeStyle, 'warm-personal');
  await rewriteNarrativeField({ fieldLabel: 'Why?', currentValue: 'Original' });
  checkVoice(requests[1].messages[0].content, getNarrativeStyle('warm-personal'));
});
