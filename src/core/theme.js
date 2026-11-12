// Shared by the Shadow DOM panel and the packaged extension pages.
export const VISUAL_NAME = 'Kareer';
export const TOKENS = `
  --kr-bg-0: #f7f6f0;
  --kr-bg-1: #fffefa;
  --kr-bg-2: #efeee6;
  --kr-bg-3: #e4e3d9;
  --kr-line: #d5d7ca;
  --kr-line-strong: #777d6d;
  --kr-text-1: #20231c;
  --kr-text-2: #51564a;
  --kr-text-3: #62665a;
  --kr-signal: #c5f55a;
  --kr-signal-hover: #b6ea45;
  --kr-signal-dim: rgba(197, 245, 90, 0.45);
  --kr-signal-ink: #385008;
  --kr-on-signal: #20231c;
  --kr-focus: #496b18;
  --kr-info: #1e4d82;
  --kr-success: #3b5918;
  --kr-warning: #775210;
  --kr-danger: #9a3412;
  --kr-radius-xs: 6px;
  --kr-radius-sm: 9px;
  --kr-radius-md: 10px;
  --kr-radius-lg: 14px;
  --kr-radius-round: 999px;
  --kr-space-1: 4px;
  --kr-space-2: 8px;
  --kr-space-3: 12px;
  --kr-space-4: 16px;
  --kr-space-6: 24px;
  --kr-font: 'Kareer Geist', sans-serif;
  --kr-font-mono: 'Kareer Geist Mono', monospace;
`;

export const FONT_FILES = [
  ['Kareer Geist', 'Geist-Variable.woff2'],
  ['Kareer Geist Mono', 'GeistMono-Variable.woff2'],
];

export function fontFaceCSS(source) {
  return FONT_FILES.map(([family, file]) => `@font-face {
    font-family: '${family}'; src: url('${source(file)}') format('woff2');
    font-style: normal; font-weight: 100 900; font-display: swap;
  }`).join('\n');
}

let fontsInstalled = false;
export function installPanelFonts() {
  if (fontsInstalled || typeof FontFace === 'undefined' || !document.fonts) return;
  if (typeof __UI_FONTS__ === 'undefined') return;
  fontsInstalled = true;
  // Binary FontFace sources work across Shadow DOM boundaries without a remote
  // request or dependence on the host page's font-src policy. Bytes are bundled.
  for (const [family, file] of FONT_FILES) {
    const bytes = Uint8Array.from(atob(__UI_FONTS__[file]), ch => ch.charCodeAt(0));
    const face = new FontFace(family, bytes, { weight: '100 900', style: 'normal', display: 'swap' });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}
