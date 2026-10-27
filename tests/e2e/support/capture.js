import { build } from 'esbuild';

let bundle;
// Fixture collection is test tooling, not a public extension tab or export control.
export async function capturePage(page, kr) {
  bundle ||= build({ entryPoints: ['src/core/capture.js'], bundle: true, format: 'iife', globalName: '__fixtureCapture', write: false }).then(result => result.outputFiles[0].text);
  const script = await bundle, profile = await kr.readStorage('kr:profile') || {};
  const children = page.frames().filter(frame => frame !== page.mainFrame() && /^https?:/.test(frame.url()));
  const frameFiles = children.map((_, i) => `captured-frame${i + 1}.html`);
  const capture = (frame, name, files = []) => frame.evaluate(({ script, profile, files }) => {
    const previous = window.GM_getValue;
    window.GM_getValue = (key, fallback) => key === 'kr:profile' ? profile : fallback;
    try { (0, eval)(script); return window.__fixtureCapture.captureFixture(document, { frameFiles: files }).html; }
    finally { delete window.__fixtureCapture; if (previous) window.GM_getValue = previous; else delete window.GM_getValue; }
  }, { script, profile, files }).then(body => ({ name, body }));
  return Promise.all([capture(page.mainFrame(), 'captured.html', frameFiles), ...children.map((frame, i) => capture(frame, frameFiles[i]))]);
}
