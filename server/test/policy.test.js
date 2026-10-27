import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, upstreamBody, validateCompletion, readBody } from '../src/policy.js';

const input = { id: '12345678-abcd', operation: 'autofill', messages: [{ role: 'user', content: 'Fill this' }] };
test('only text operations are accepted; client policy and URLs cannot pass through', () => {
  for (const extra of [{ model: 'expensive' }, { url: 'https://evil.test' }, { credits: 100 }, { tools: [] }, { headers: {} }]) {
    assert.throws(() => parseInput({ ...input, ...extra }));
  }
  assert.throws(() => parseInput({ ...input, messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }));
  assert.throws(() => parseInput({ ...input, messages: [{ role: 'user', content: 'é'.repeat(65537) }] }));
  const body = upstreamBody(parseInput(input));
  assert.equal(body.model, 'google/gemini-2.5-flash-lite');
  assert.equal(body.max_tokens, 4096);
  assert.deepEqual(body.provider.max_price, { prompt: 0.1, completion: 0.4 });
  assert.equal(body.reasoning.enabled, false);
  assert.equal(upstreamBody(parseInput({ ...input, operation: 'fieldRewrite' })).max_tokens, 2048);
  assert.equal(upstreamBody(parseInput({ ...input, operation: 'document', document: { kind: 'coverLetter', source: {} } })).max_tokens, 7000);
});
test('reject malformed, truncated, empty and structurally wrong completions', () => {
  const response = content => ({ choices: [{ finish_reason: 'stop', message: { content } }] });
  assert.equal(validateCompletion(parseInput(input), response('{"answers":[{"fieldId":"x","value":true}]}')).includes('answers'), true);
  assert.equal(validateCompletion(parseInput(input), response('{"answers":[{"fieldId":"x","value":["English","French"]}]}')).includes('French'), true);
  for (const content of ['{}', 'bad', '{"answers":[{"value":"x"}]}']) assert.throws(() => validateCompletion(parseInput(input), response(content)));
  assert.throws(() => validateCompletion(parseInput(input), { choices: [{ finish_reason: 'length', message: { content: '{"answers":[]}' } }] }));
});
test('body cap applies while reading even without content-length', async () => {
  const req = new Request('https://test', { method: 'POST', body: 'x'.repeat(262145) });
  await assert.rejects(readBody(req), /INPUT_TOO_LARGE/);
});
