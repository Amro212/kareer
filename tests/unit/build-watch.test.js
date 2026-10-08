import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Three independent polling phases each allow 15s, plus copy/build startup.
test('watch builds refresh copied CSS and HTML for both browsers', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kareer-build-watch-'));
  let child;
  let output = '';
  const until = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await delay(100);
    }
    assert.fail(`Watch build did not update assets: ${output}`);
  };
  try {
    for (const name of ['src', 'tools', 'package.json']) {
      fs.cpSync(path.join(root, name), path.join(dir, name), { recursive: true });
    }
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    child = spawn(process.execPath, ['tools/build.js', '--target=extension', '--watch'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    await until(() => output.includes('extension:firefox watching'));
    const htmlPath = browser => path.join(dir, 'dist', browser, 'options/index.html');
    const oldHtml = fs.readFileSync(htmlPath('chrome'), 'utf8');
    const marker = '.watch-regression-marker { color: red; }';
    fs.appendFileSync(path.join(dir, 'src/targets/extension/shared/pages.css'), `\n${marker}\n`);
    await until(() => ['chrome', 'firefox'].every(browser =>
      fs.readFileSync(path.join(dir, 'dist', browser, 'assets/theme.css'), 'utf8').includes(marker)
      && fs.readFileSync(htmlPath(browser), 'utf8') !== oldHtml));
    const html = fs.readFileSync(htmlPath('chrome'), 'utf8');
    assert.match(html, /theme\.css\?v=[a-f0-9]{12}/);
    fs.appendFileSync(path.join(dir, 'src/targets/extension/options/index.html'), '\n<!-- watch HTML regression -->\n');
    await until(() => ['chrome', 'firefox'].every(browser =>
      fs.readFileSync(htmlPath(browser), 'utf8').includes('watch HTML regression')));
  } finally {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // Windows tempdir file handles may take time to release
    }
  }
});
