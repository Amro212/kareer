import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function runVerifier(tool, mode, args = []) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-narrative-verifier-'));
  const script = new URL(`../../tools/${tool}.js`, import.meta.url).href;
  const bootstrap = `
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      if (${JSON.stringify(mode)} === 'error') throw new Error('Offline request failure');
      let input;
      try { input = JSON.parse(body.messages[1].content); } catch {}
      const content = input ? JSON.stringify({ answers: input.fieldsToFill.map(field => ({
        fieldId: field.fieldId,
        value: field.fieldId === 'shift'
          ? (${JSON.stringify(mode)} === 'value' ? 'Night shift' : 'Day shift')
          : ${JSON.stringify(mode)} === 'blank' ? ''
          : ${JSON.stringify(mode)} === 'length' ? 'x'.repeat(700) : 'I added clear labels.',
      })) }) : 'I added clear labels.';
      return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content } }] }));
    };
    await import(${JSON.stringify(script)});
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', bootstrap, '--', ...args], {
      cwd,
      env: { ...process.env, OPENROUTER_API_KEY: 'offline-verifier-test-key' },
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    const files = fs.readdirSync(path.join(cwd, 'sample-output'));
    assert.equal(files.length, 1, result.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(cwd, 'sample-output', files[0]), 'utf8'));
    return { ...result, report };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('live verifier succeeds when all recorded contracts pass', () => {
  const result = runVerifier('verify-narrative-openrouter', 'valid');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.cases.length, 27);
  assert.ok(result.report.cases.every(entry => !entry.error && !entry.checks.length));
});

for (const [mode, check] of [['blank', 'missing:'], ['length', 'length:'], ['value', 'value:shift']]) {
  test(`live verifier exits unsuccessfully for ${mode} answers and preserves the report`, () => {
    const result = runVerifier('verify-narrative-openrouter', mode);
    assert.ok(result.report.cases.some(entry => entry.checks?.some(item => item.startsWith(check))));
    assert.ok(result.report.cases.every(entry => !entry.error), 'must fail on checks, not exceptions');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Live contract failed/);
  });
}

test('live verifier still fails on request exceptions and preserves the report', () => {
  const result = runVerifier('verify-narrative-openrouter', 'error');
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.report.cases.some(entry => entry.error?.includes('Offline request failure')));
});

test('original tone comparison works without local reports for all five styles', () => {
  const result = runVerifier('verify-narrative-tones', 'valid', ['--original', '--model=offline-test-model']);
  assert.equal(result.status, 0, result.stderr);
  const prompts = JSON.parse(fs.readFileSync(new URL('../../tools/fixtures/narrative-tone-original-prompts.json', import.meta.url), 'utf8'));
  assert.equal(result.report.cases.length, 5);
  assert.deepEqual(result.report.cases.map(entry => entry.style).sort(), Object.keys(prompts).sort());
  assert.ok(result.report.cases.every(entry => !entry.error && !entry.checks.length && entry.requestCount === 1));
  for (const request of result.report.requests) {
    assert.equal(request.messages[0].content, prompts[request.style]);
    const input = JSON.parse(request.messages[1].content);
    assert.ok(input.fieldsToFill.every(field => !Object.hasOwn(field, 'writingStyle')));
  }
});
