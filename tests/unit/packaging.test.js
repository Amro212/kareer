import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipDirectory } from '../../tools/zip.js';

test('zip writer produces a readable archive of a directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-zip-'));
  fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'nested.txt'), 'nested');
  const out = path.join(dir, 'out.zip');
  zipDirectory(dir, out);
  const buf = fs.readFileSync(out);
  assert.ok(buf.length > 30);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Firefox first-run page exists and requests host permission', () => {
  const html = fs.readFileSync(new URL('../../src/targets/extension/first-run/index.html', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../../src/targets/extension/first-run/index.js', import.meta.url), 'utf8');
  assert.match(html, /Grant access/);
  assert.match(js, /permissions\.request/);
  assert.match(js, /<all_urls>/);
});

test('Firefox declares the personal data transmitted by optional AI and billing', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../src/targets/extension/manifest.firefox.json', import.meta.url), 'utf8'));
  const types = manifest.browser_specific_settings.gecko.data_collection_permissions.required;
  for (const type of ['authenticationInfo', 'personallyIdentifyingInfo', 'healthInfo', 'financialAndPaymentInfo', 'locationInfo', 'browsingActivity', 'websiteContent']) {
    assert.ok(types.includes(type), `Missing Firefox data disclosure: ${type}`);
  }
});

test('Chrome uses host access instead of a redundant tabs permission', () => {
  const base = JSON.parse(fs.readFileSync(new URL('../../src/targets/extension/manifest.base.json', import.meta.url), 'utf8'));
  assert.ok(!base.permissions.includes('tabs'));
  assert.ok(base.host_permissions.includes('<all_urls>'));
});
