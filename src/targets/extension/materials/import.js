// Required by PDF.js legacy builds on Chrome 110. No remote workers or fonts.
if (!Promise.withResolvers) Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth/mammoth.browser.js';

export function setupPdfWorker(url) { pdfjs.GlobalWorkerOptions.workerSrc = url; }
export async function extractResume(file) {
  if (file.buffer.byteLength > 10 * 1024 * 1024) throw new Error('Import a resume smaller than 10 MB.');
  let text = '';
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const loading = pdfjs.getDocument({ data: new Uint8Array(file.buffer.slice(0)), isEvalSupported: false, useWasm: false });
    try {
      const doc = await loading.promise;
      if (doc.numPages > 30) throw new Error('Import a resume with at most 30 pages.');
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
      }
      text = pages.join('\n\n');
    } catch (error) {
      if (/at most 30/.test(error.message)) throw error;
      throw new Error('This PDF could not be read. Import a text-based PDF or paste the resume text.');
    } finally { await loading.destroy(); }
  } else if (/\.docx$/i.test(file.name)) {
    try { text = (await mammoth.extractRawText({ arrayBuffer: file.buffer })).value; }
    catch { throw new Error('This Word file could not be read. Import a valid DOCX or paste the resume text.'); }
  } else throw new Error('Import a text-based PDF or DOCX, or paste the resume text.');
  if (!text.trim()) throw new Error('No resume text could be extracted. Paste the text instead; scanned resumes need OCR.');
  return text.trim();
}

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
