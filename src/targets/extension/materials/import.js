// Required by PDF.js legacy builds on Chrome 110. No remote workers or fonts.
if (!Promise.withResolvers) Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export function setupPdfWorker(url) { pdfjs.GlobalWorkerOptions.workerSrc = url; }
export async function previewPdf(buffer, container, { isCurrent = () => true } = {}) {
  const loading = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, useWasm: false });
  const doc = await loading.promise;
  try {
    if (!isCurrent()) return;
    container.replaceChildren();
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), viewport = page.getViewport({ scale: 1.15 });
      if (!isCurrent()) return;
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.setAttribute('aria-label', `Document page ${i} of ${doc.numPages}`);
      container.append(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } finally { await loading.destroy(); }
}
