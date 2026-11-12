import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { TOKENS } from '../../src/core/theme.js';

function channel(hex, index) {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
}

function luminance(hex) {
  const linear = [0, 1, 2].map(index => {
    const value = channel(hex, index);
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function token(name) {
  const match = TOKENS.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing ${name}`);
  return match[1].toLowerCase();
}

test('extension colors are the site paper palette and clear WCAG AA', () => {
  const paper = token('--kr-bg-0');
  const sheet = token('--kr-bg-1');
  const ink = token('--kr-text-1');
  const lime = token('--kr-signal');
  assert.equal(paper, '#f7f6f0');
  assert.equal(sheet, '#fffefa');
  assert.equal(ink, '#20231c');
  assert.equal(lime, '#c5f55a');
  assert.equal(token('--kr-on-signal'), ink);
  assert.ok(contrast(ink, paper) >= 4.5, 'ink on paper');
  assert.ok(contrast(ink, lime) >= 4.5, 'ink on lime buttons');
  assert.ok(contrast(token('--kr-text-2'), paper) >= 4.5, 'secondary text');
  assert.ok(contrast(token('--kr-text-3'), paper) >= 4.5, 'muted text');
  assert.ok(contrast(token('--kr-signal-ink'), paper) >= 4.5, 'olive accent text');
  assert.ok(contrast(token('--kr-focus'), paper) >= 3, 'focus ring');
  assert.ok(contrast(token('--kr-line-strong'), paper) >= 3, 'control border');
  assert.ok(contrast(token('--kr-info'), paper) >= 4.5, 'info text');
  assert.ok(contrast(token('--kr-success'), '#e3efcf') >= 4.5, 'saved badge');
  assert.ok(contrast(token('--kr-warning'), '#fff0c9') >= 4.5, 'warning badge');
  assert.ok(contrast(token('--kr-danger'), '#fdf2ed') >= 4.5, 'error badge');
  assert.ok(contrast(lime, paper) < 3, 'lime stays a fill, not text or a border');
});

test('extension chrome uses the light paper theme and keeps a visible focus ring', () => {
  const panel = fs.readFileSync(new URL('../../src/core/ui.js', import.meta.url), 'utf8');
  const pages = fs.readFileSync(new URL('../../src/targets/extension/shared/pages.css', import.meta.url), 'utf8');
  const workspace = fs.readFileSync(new URL('../../src/targets/extension/materials/workspace.css', import.meta.url), 'utf8');
  for (const source of [panel, pages, workspace]) {
    assert.match(source, /color-scheme:\s*light/);
    assert.doesNotMatch(source, /color-scheme:\s*dark/);
    assert.doesNotMatch(source, /outline:\s*none/);
  }
  assert.match(panel, /color:\s*var\(--kr-on-signal\)/);
  assert.match(pages, /color:\s*var\(--kr-on-signal\)/);
  assert.match(panel, /outline:\s*2px solid var\(--kr-focus\)/);
  assert.match(pages, /outline:\s*2px solid var\(--kr-focus\)/);
});
