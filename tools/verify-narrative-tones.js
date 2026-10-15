import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../src/core/constants.js';
import { setPlatform } from '../src/core/platform.js';
import { createGmHost } from '../src/core/hosts/gm.js';
import { saveApiKey, saveSettings, saveProfile, gmSet, getSettings } from '../src/core/storage.js';
import { NARRATIVE_STYLES } from '../src/core/narrative-styles.js';
import { generateAutofillAnswers, rewriteNarrativeField } from '../src/core/ai.js';

// Opt-in paid verification of production prompts; --original replays the tracked pre-change system prompts.
assert.ok(process.env.OPENROUTER_API_KEY, 'Set OPENROUTER_API_KEY.');
const original = process.argv.includes('--original');
const originalPrompts = original ? JSON.parse(fs.readFileSync(new URL('./fixtures/narrative-tone-original-prompts.json', import.meta.url), 'utf8')) : null;
const shipped = !original;
const modelArg = process.argv.find(arg => arg.startsWith('--model='));
const models = modelArg ? [modelArg.slice(8)] : [DEFAULT_SETTINGS.model, 'deepseek/deepseek-v4.1-flash'];
const angles = [original ? 'original' : 'shipped'];
const repeat = process.argv.includes('--repeat') ? 2 : 1;
const styleArg = process.argv.find(arg => arg.startsWith('--style='));
assert.ok(!styleArg || NARRATIVE_STYLES.some(style => style.id === styleArg.slice(8)), 'Unknown writing style.');
const heldOut = process.argv.includes('--held-out');
const outputPath = `sample-output/tone-comparison-${shipped ? 'shipped' : angles.join('-')}${heldOut ? '-held-out' : ''}${modelArg ? `-${models[0].replaceAll('/', '-')}` : ''}${styleArg ? `-${styleArg.slice(8)}` : ''}.json`;
const report = { at: new Date().toISOString(), models, angles, heldOut, requests: [], cases: [] };
fs.mkdirSync('sample-output', { recursive: true });
const dom = new JSDOM('<body></body>', { url: 'https://example.com/application' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
setPlatform(createGmHost());
saveApiKey(process.env.OPENROUTER_API_KEY);

let active;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (active.angle === 'original') {
    body.messages[0].content = originalPrompts[active.style];
    const input = JSON.parse(body.messages[1].content);
    input.fieldsToFill = input.fieldsToFill.map(({ writingStyle, ...field }) => field);
    body.messages[1].content = JSON.stringify(input);
    options = { ...options, body: JSON.stringify(body) };
  }
  assert.equal(body.model, active.model);
  assert.ok(!options.body.includes(process.env.OPENROUTER_API_KEY));
  const start = Date.now();
  const response = await originalFetch(url, options);
  const data = await response.clone().json();
  report.requests.push({ ...active, status: response.status, model: data.model, latencyMs: Date.now() - start,
    usage: data.usage, temperature: body.temperature, messages: body.messages,
    content: data.choices?.[0]?.message?.content, finishReason: data.choices?.[0]?.finish_reason,
    error: data.error ? { code: data.error.code, message: data.error.message } : undefined });
  if (response.status === 200) assert.equal(data.model, body.model, 'Unexpected returned model.');
  return response;
};
const source = heldOut
  ? 'At a repair cafe, I sorted donated chargers by connector type and added clear labels to the drawers. Volunteers could find compatible chargers without opening every drawer. I also wrote a small JavaScript tool that flags duplicate event registrations by email before export. No measured time savings or attendance increase supplied. At a community garden, I put watering tasks on a shared weekly board so volunteers could see which beds still needed water.'
  : 'As a library assistant, I noticed patrons had trouble finding reserved books. I added color-coded shelf signs and wrote a short checkout guide. Patrons could then locate their books without asking for help. I also wrote a Python script that reads supplier CSV invoices and flags missing purchase-order numbers before import; I used it with the finance team. At a food bank, I sorted donation boxes by item type and labeled shelf locations so volunteers could find supplies. No measured impact supplied for these improvements.';
const labels = heldOut
  ? ['Describe your repair cafe improvement.', 'Describe the event-registration tool you wrote.', 'Describe how you helped organize garden tasks.']
  : ['Describe the library process you improved.', 'Describe the invoice-checking project you built.', 'Describe your food bank improvement.'];
const field = (fieldId, label, maxLength = 650) => ({ fieldId, label, type: 'textarea', isNarrative: true, constraints: { maxLength } });
const fields = [
  ...labels.map((label, index) => field(`answer${index}`, label)),
  field('short', `${labels[0]} Maximum 180 characters.`, 180),
  { fieldId: 'shift', label: 'Preferred shift?', type: 'select', options: [{ value: 'day', label: 'Day shift' }, { value: 'night', label: 'Night shift' }] },
  { fieldId: 'saved', label: 'Saved answer', type: 'textarea' },
  { fieldId: 'name', label: 'Full name', type: 'text' },
];
function seed(model, style) {
  gmSet(STORAGE_KEYS.PROFILE, {});
  saveProfile({ fullName: 'Test Applicant', resumeContext: source, applicantNotes: 'Preferred shift: Day shift.', savedAnswers: { 'Saved answer': 'Keep my exact wording.' } });
  saveSettings({ ...DEFAULT_SETTINGS, model, narrativeModel: model, narrativeStyle: style });
}
async function run(info, fn) {
  active = info;
  const before = report.requests.length;
  const entry = { ...info };
  try { Object.assign(entry, await fn()); }
  catch (error) { entry.error = error.message; }
  entry.requestCount = report.requests.length - before;
  report.cases.push(entry);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`${entry.error ? 'FAIL' : 'DONE'} ${info.model} ${info.angle}/${info.style}/${info.kind}: ${entry.error || (entry.checks?.join(',') || 'contracts OK')}`);
}
try {
  for (const angle of angles) for (const model of models) for (const style of NARRATIVE_STYLES.filter(style => !styleArg || style.id === styleArg.slice(8))) {
    for (let iteration = 0; iteration < repeat; iteration++) {
      seed(model, style.id);
      await run({ angle, model, style: style.id, kind: 'fill', iteration }, async () => {
        const result = await generateAutofillAnswers(fields);
        const checks = [];
        for (const item of fields) {
          const value = result.answers.find(answer => answer.fieldId === item.fieldId)?.value;
          if (!value) checks.push(`missing:${item.fieldId}`);
          if (item.constraints?.maxLength && String(value).length > item.constraints.maxLength) checks.push(`length:${item.fieldId}`);
        }
        for (const [id, expected] of [['shift', 'day'], ['saved', 'Keep my exact wording.'], ['name', 'Test Applicant']]) {
          if (result.answers.find(answer => answer.fieldId === id)?.value !== expected) checks.push(`value:${id}`);
        }
        return { source, answers: result.answers, checks };
      });
    }
    if (shipped) {
      seed(model, 'natural');
      const input = heldOut ? 'I sorted donated chargers by connector type and labeled the drawers. Volunteers could find compatible chargers without opening every drawer.' : 'I added color-coded shelf signs and a short checkout guide at the library. Patrons could find reserved books without asking for help.';
      await run({ angle, model, style: style.id, kind: 'rewrite' }, async () => {
        const answer = await rewriteNarrativeField({ fieldLabel: labels[0], currentValue: input, style: style.id, constraints: { maxLength: 500 } });
        assert.equal(getSettings().narrativeStyle, 'natural');
        return { input, answer, checks: !answer ? ['missing'] : answer.length > 500 ? ['length'] : [] };
      });
      await run({ angle, model, style: style.id, kind: 'rewrite-override' }, async () => {
        const answer = await rewriteNarrativeField({ fieldLabel: labels[0], currentValue: input, style: style.id, feedback: 'Write in French, in one serious plain sentence. Preserve the action and outcome. Maximum 180 characters.', constraints: { maxLength: 180 } });
        return { input, answer, checks: !answer ? ['missing'] : answer.length > 180 ? ['length'] : [] };
      });
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  dom.window.close();
}
console.log(`Saved ${report.cases.length} cases to ${outputPath}`);
assert.ok(report.cases.every(item => !item.error && !item.checks.length && item.requestCount === 1), 'Live contract failed; inspect saved report.');
