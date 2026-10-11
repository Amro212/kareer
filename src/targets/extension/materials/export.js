import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from './fonts/vfs.json' with { type: 'json' };
import { Document, Packer, Paragraph, TextRun, Header, TabStopType, BorderStyle } from 'docx';
import { DOCX_TYPE, validateMaterial } from '../../../core/materials-model.js';

// Bump when document formatting changes so saved bytes cannot retain an older template.
export const MATERIAL_TEMPLATE_VERSION = 1;

pdfMake.addVirtualFileSystem(fonts);
const fontFaces = {
  'CMU Serif': { normal: 'cmunrm.ttf', bold: 'cmunbx.ttf', italics: 'cmunti.ttf', bolditalics: 'cmunbi.ttf' },
  Charter: { normal: 'Charter Regular.ttf', bold: 'Charter Bold.ttf', italics: 'Charter Italic.ttf', bolditalics: 'Charter Bold Italic.ttf' },
};
pdfMake.setFonts(fontFaces);

const resumeStyles = {
  name: { fontSize: 25, bold: true, alignment: 'center', fontFeatures: ['smcp'], margin: [0, 0, 0, 1] },
  contact: { fontSize: 9, alignment: 'center', margin: [0, 0, 0, 3] },
  section: { fontSize: 12, fontFeatures: ['smcp'], margin: [0, 3, 0, 0] },
  title: { fontSize: 9, bold: true, margin: [10.8, 1, 0, 0] },
  facts: { fontSize: 9, italics: true, margin: [10.8, 0, 0, 1] },
  body: { fontSize: 9, margin: [10.8, 0, 0, 0] },
  bullet: { fontSize: 8, margin: [12.96, 0, 0, 0] },
};
const letterStyles = {
  name: { fontSize: 28, alignment: 'center', fontFeatures: ['smcp'], margin: [0, 0, 0, 8] },
  contact: { fontSize: 9, alignment: 'center', margin: [0, 0, 0, 0] },
  opening: { fontSize: 12, margin: [0, 0, 0, 12] },
  body: { fontSize: 12, margin: [0, 0, 0, 12] },
  closing: { fontSize: 12, alignment: 'right', margin: [0, 12, 0, 0] },
};
const resumeMargins = [24.48, 12.96, 24.48, 15.84];
const letterMargins = [72, 115, 72, 75];

function blocks(model, job) {
  const result = [{ text: model.name, style: 'name' }, { text: model.contact, style: 'contact' }];
  if (model.kind === 'coverLetter') return [...result,
    { text: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), style: 'opening' },
    ...(job.company ? [{ text: job.company, style: 'opening' }] : []),
    ...model.paragraphs.map((text, index) => {
      const closing = index === model.paragraphs.length - 1 && text.length < 140 && text.split('\n').length <= 2 && (text === model.name || /^(?:sincerely|regards|best(?: regards| wishes)?|kind regards|warm regards|yours(?: sincerely| faithfully| truly)?|respectfully),/i.test(text));
      return { text, style: closing ? 'closing' : 'body', leadingIndent: index > 1 && !closing ? 24 : 0 };
    })];
  if (model.summary) result.push({ text: 'Summary', style: 'section' }, { text: model.summary, style: 'body' });
  const categories = [...new Set(model.sections.map(s => s.category))];
  const order = category => ({ Skills: 0, Experience: 1, Projects: 2, Education: 4, Certifications: 5 }[category] ?? 3);
  for (const category of categories.sort((a, b) => order(a) - order(b))) {
    result.push({ text: ({ Skills: 'Technical Skills', Experience: 'Professional Experience' })[category] || category, style: 'section' });
    for (const section of model.sections.filter(s => s.category === category)) {
      if (section.title) {
        result.push({ text: section.title, right: section.dates, style: 'title' });
        if (section.subtitle || section.location) result.push({ text: section.subtitle, right: section.location, style: 'facts' });
      } else {
        if (section.heading !== category) result.push({ text: section.heading, style: 'title' });
        if (section.facts) result.push({ text: section.facts, style: 'facts' });
      }
      if (section.bullets.length) {
        if (category === 'Skills' && section.bullets.some(s => /^[^:]+:/.test(s))) result.push(...section.bullets.map(text => ({ text, style: 'body' })));
        else result.push(category === 'Skills' ? { text: section.bullets.join(' · '), style: 'body' } : { ul: [...section.bullets], style: 'bullet' });
      }
    }
  }
  return result;
}

async function makePdf(model, job) {
  const letter = model.kind === 'coverLetter', margins = letter ? letterMargins : resumeMargins;
  const content = blocks(model, job).flatMap(block => {
    if (block.right) return [{ columns: [{ text: block.text, width: '*' }, { text: block.right, width: 'auto', alignment: 'right', bold: false }], style: block.style, columnGap: 12 }];
    if (block.ul) return block.ul.map(text => ({ columns: [{ text: '-', width: 7 }, { text, width: '*' }], style: 'bullet' }));
    if (block.style === 'section') return [block, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 612 - margins[0] - margins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 2] }];
    return [block];
  });
  const closing = content.filter(b => b.style === 'closing');
  const definition = { pageSize: 'LETTER', pageMargins: margins,
    defaultStyle: { font: letter ? 'Charter' : 'CMU Serif', fontSize: letter ? 12 : 9, lineHeight: letter ? 1.4 : 1, color: '#000000' },
    styles: letter ? letterStyles : resumeStyles,
    ...(letter ? {
      background: { canvas: [{ type: 'rect', x: 0, y: 0, w: 612, h: 93.6, color: '#e1e1e1' }] },
      header: { stack: content.slice(0, 2), margin: [72, 23, 72, 0] },
      footer: (page, pages) => page === pages ? { stack: closing, margin: [72, 0, 72, 0] } : null,
    } : {}),
    content: letter ? content.slice(2).filter(b => b.style !== 'closing') : content,
    info: { title: `${model.name} ${letter ? 'Cover Letter' : 'Resume'}`, author: model.name } };
  const pdf = pdfMake.createPdf(definition);
  const buffer = await pdf.getBuffer();
  const pages = await pdf.getStream().then(stream => stream._pdfMakePages.length);
  return { buffer: Uint8Array.from(buffer).buffer, pages };
}

function docxDocument(model, job) {
  const letter = model.kind === 'coverLetter', styles = letter ? letterStyles : resumeStyles;
  const margins = letter ? letterMargins : resumeMargins, font = letter ? 'Charter' : 'CMU Serif';
  const width = 612 - margins[0] - margins[2];
  const paragraphs = [];
  for (const block of blocks(model, job)) {
    const style = styles[block.style];
    const run = { font, size: style.fontSize * 2, bold: style.bold, italics: style.italics, smallCaps: ['name', 'section'].includes(block.style) };
    for (const text of block.ul || [block.text || '']) paragraphs.push(new Paragraph({
      children: [...(block.ul ? `- ${text}` : text).split('\n').map((line, index) => new TextRun({ ...run, text: line, break: index ? 1 : 0 })), ...(block.right ? [new TextRun({ ...run, text: `\t${block.right}`, bold: false })] : [])],
      alignment: style.alignment,
      tabStops: block.right ? [{ type: TabStopType.RIGHT, position: Math.round(width * 20) }] : [],
      indent: { left: Math.round((style.margin[0] || 0) * 20), firstLine: (block.leadingIndent || 0) * 20 },
      spacing: { before: style.margin[1] * 20, after: (style.margin[3] + (block.style === 'section' ? 2 : 0)) * 20, line: Math.round(style.fontSize * 1.2 * 20), lineRule: 'exact' },
      keepNext: ['section', 'title', 'facts'].includes(block.style),
      ...(block.style === 'section' ? { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } } } : {}),
      ...(letter && ['name', 'contact'].includes(block.style) ? { shading: { fill: 'E1E1E1' } } : {}),
    }));
  }
  const faces = fontFaces[font], bytes = file => Uint8Array.from(atob(fonts[file]), ch => ch.charCodeAt(0));
  return new Document({ creator: model.name,
    fonts: [{ name: font, data: bytes(faces.normal), bold: bytes(faces.bold), italic: bytes(faces.italics), boldItalic: bytes(faces.bolditalics) }],
    styles: { default: { document: { run: { font, size: letter ? 24 : 18 } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: Math.round(margins[1] * 20), bottom: Math.round(margins[3] * 20), left: Math.round(margins[0] * 20), right: Math.round(margins[2] * 20), header: 460 } } },
      ...(letter ? { headers: { default: new Header({ children: paragraphs.slice(0, 2) }) } } : {}),
      children: letter ? paragraphs.slice(2) : paragraphs }] });
}

export async function exportMaterial(model, job, pageTarget = 1, { fit = true, signal } = {}) {
  const checkCancelled = () => { if (signal?.aborted) throw new Error(String(signal.reason || 'Generation cancelled.')); };
  checkCancelled();
  model = structuredClone(model);
  if (model.kind === 'coverLetter') model = validateMaterial('coverLetter', model, model);
  let pdf = await makePdf(model, job);
  // Finite content-fitting pass. Every pass removes one lowest-priority item.
  if (fit && model.kind === 'resume') {
    for (let attempt = 0; pdf.pages > pageTarget && attempt < 100; attempt++) {
      checkCancelled();
      const section = [...model.sections].reverse().find(s => s.category !== 'Skills' && s.bullets.length > 1);
      if (section) section.bullets.pop();
      else if (model.sections.length > 1) model.sections.pop();
      else throw new Error(`Resume cannot fit ${pageTarget} page(s) at a readable size. Shorten the text or choose two pages.`);
      pdf = await makePdf(model, job);
    }
    if (pdf.pages > pageTarget) throw new Error('Resume is too long. Shorten the text or choose two pages.');
  }
  checkCancelled();
  const stem = [model.name || 'Applicant', job.company || job.title || 'Application', model.kind === 'resume' ? 'Resume' : 'Cover-Letter'].join('-').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 140);
  const word = await Packer.toArrayBuffer(docxDocument(model, job));
  return { model, templateVersion: MATERIAL_TEMPLATE_VERSION, pages: pdf.pages, files: {
    pdf: { name: `${stem}.pdf`, type: 'application/pdf', buffer: pdf.buffer, size: pdf.buffer.byteLength },
    docx: { name: `${stem}.docx`, type: DOCX_TYPE, buffer: word, size: word.byteLength },
  } };
}
