import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('website staging preserves download bytes, update feeds, domain and verification files', async () => {
  const { stagePublicFiles } = await import('../../site/build.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kareer-site-'));
  try {
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await fs.mkdir(path.join(source, 'downloads'), { recursive: true });
    await fs.mkdir(path.join(source, 'assets'), { recursive: true });
    await fs.mkdir(output);
    const files = {
      'CNAME': 'kareer.itsamro.me\n',
      'version.json': '{"version":"0.5.143"}',
      'firefox-updates.json': '{"addons":{"kareer@amro212":{"updates":[]}}}',
      'googleac1b6f91c85aa7d4.html': 'google-site-verification: test',
      'downloads/kareer-firefox.xpi': 'signed-xpi-bytes',
      'assets/mark.svg': '<svg></svg>',
    };
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(source, name), content);
    await fs.writeFile(path.join(output, 'index.html'), 'built-homepage');
    await stagePublicFiles(source, output);
    for (const [name, content] of Object.entries(files)) {
      assert.equal(await fs.readFile(path.join(output, name), 'utf8'), content, name);
      assert.equal(await fs.readFile(path.join(source, name), 'utf8'), content, `source preserved: ${name}`);
    }
    assert.equal(await fs.readFile(path.join(output, 'index.html'), 'utf8'), 'built-homepage');
    assert.equal(await fs.readFile(path.join(output, '.nojekyll'), 'utf8'), '');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('website staging works before a signed Firefox download is available', async () => {
  const { stagePublicFiles } = await import('../../site/build.mjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kareer-site-'));
  try {
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await fs.mkdir(source);
    await fs.mkdir(output);
    await fs.writeFile(path.join(source, 'CNAME'), 'kareer.itsamro.me');
    await stagePublicFiles(source, output);
    assert.equal(await fs.readFile(path.join(output, 'CNAME'), 'utf8'), 'kareer.itsamro.me');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
