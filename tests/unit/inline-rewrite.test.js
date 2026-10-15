import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { saveSettings } from '../../src/core/storage.js';
import { UI_IDS } from '../../src/core/constants.js';
import { initInlineRewriteBadge, destroyInlineRewriteBadge } from '../../src/core/fields/highlight.js';

let dom;

beforeEach(() => {
  saveSettings({ narrativeStyle: 'natural' });
  dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Ashby production CSS regression condition */
          div { line-height: 0; }
        </style>
      </head>
      <body>
        <main>
          <textarea id="cover_letter" placeholder="Type cover letter..."></textarea>
        </main>
      </body>
    </html>
  `, { url: 'https://jobs.ashbyhq.com/example/application' });

  for (const key of ['window', 'document', 'HTMLElement', 'HTMLTextAreaElement', 'Element', 'requestAnimationFrame']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.Node = dom.window.Node;
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
});

afterEach(() => {
  destroyInlineRewriteBadge();
  dom.window.close();
});

test('inline rewrite badge mounts with Shadow DOM and defends against host line-height: 0', () => {
  let rewriteClicked = false;
  let receivedStateSetter = null;

  initInlineRewriteBadge((field, setState) => {
    rewriteClicked = true;
    receivedStateSetter = setState;
  });

  const badgeHost = dom.window.document.getElementById(UI_IDS.INLINE_REWRITE);
  assert.ok(badgeHost, 'Badge host element is attached to body');

  // Verify Shadow DOM isolation
  assert.ok(badgeHost.shadowRoot, 'Badge uses Shadow DOM for style isolation');
  const btn = badgeHost.shadowRoot.querySelector('.kr-rewrite-btn');
  assert.ok(btn, 'Rewrite button rendered inside shadow root');
  assert.match(btn.textContent, /Rewrite with AI/);

  // Focus textarea triggers positioning
  const textarea = dom.window.document.getElementById('cover_letter');
  textarea.getBoundingClientRect = () => ({
    top: 200,
    bottom: 350,
    left: 100,
    right: 600,
    width: 500,
    height: 150,
  });

  textarea.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));

  // Simulate click on shadow button
  btn.click();
  assert.equal(rewriteClicked, true, 'Clicking badge triggers rewrite callback');
  assert.equal(typeof receivedStateSetter, 'function', 'Callback receives setBadgeState function');

  // Verify state transitions
  receivedStateSetter('loading', 'Rewriting response...');
  assert.equal(btn.getAttribute('data-state'), 'loading');
  assert.match(btn.textContent, /Rewriting response\.\.\./);

  receivedStateSetter('success', 'Done ✓');
  assert.equal(btn.getAttribute('data-state'), 'success');
  assert.match(btn.textContent, /Done ✓/);
});

function focusField(id = 'cover_letter') {
  const field = document.getElementById(id);
  field.getBoundingClientRect = () => ({ top: 200, bottom: 350, left: 5, right: 295, width: 290, height: 150 });
  field.focus();
  return field;
}

test('style choice makes no request, stays focused, and resets for another field', async () => {
  saveSettings({ narrativeStyle: 'warm-personal' });
  const calls = [];
  initInlineRewriteBadge((field, setState, style) => calls.push({ field, style }));
  const first = focusField();
  const badge = document.getElementById(UI_IDS.INLINE_REWRITE);
  const select = badge.shadowRoot.querySelector('select');
  assert.equal(select.value, 'warm-personal');
  assert.equal(select.labels.length, 1);
  assert.equal(select.options.length, 5);
  select.value = 'light-wit';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(calls.length, 0);
  select.focus();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.notEqual(badge.style.display, 'none');
  first.focus();
  assert.equal(select.value, 'light-wit', 'returning to same field preserves override');
  badge.shadowRoot.querySelector('button').click();
  assert.equal(calls[0].field, first);
  assert.equal(calls[0].style, 'light-wit');
  const next = document.createElement('div');
  next.id = 'other';
  next.setAttribute('contenteditable', 'true');
  next.tabIndex = 0;
  document.body.append(next);
  focusField('other');
  assert.equal(select.value, 'warm-personal');
});

test('rewrite disables both controls and ignores double clicks and stale state updates', async () => {
  let release, oldState;
  const calls = [];
  initInlineRewriteBadge(async (field, setState, style) => {
    calls.push(style);
    oldState = setState;
    await new Promise(resolve => { release = resolve; });
    setState('success');
  });
  focusField();
  const shadow = document.getElementById(UI_IDS.INLINE_REWRITE).shadowRoot;
  const btn = shadow.querySelector('button'), select = shadow.querySelector('select');
  btn.click(); btn.click();
  assert.equal(calls.length, 1);
  assert.equal(btn.disabled, true);
  assert.equal(select.disabled, true);
  const other = document.createElement('textarea');
  other.id = 'other';
  document.body.append(other);
  focusField('other');
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(btn.disabled, false);
  assert.equal(select.disabled, false);
  oldState('success');
  assert.equal(btn.dataset.state, 'idle', 'previous field must not paint success onto another field');
});

test('badge fits a narrow viewport and hides when focus leaves all of its controls', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
  initInlineRewriteBadge(() => {});
  const badge = document.getElementById(UI_IDS.INLINE_REWRITE);
  badge.getBoundingClientRect = () => ({ width: 300, height: 60 });
  focusField();
  assert.ok(parseFloat(badge.style.left) >= 8);
  assert.ok(parseFloat(badge.style.left) + 300 <= 320);
  const btn = badge.shadowRoot.querySelector('button');
  btn.focus();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.notEqual(badge.style.display, 'none');
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(badge.style.display, 'none');
});
