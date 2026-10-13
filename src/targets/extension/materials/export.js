import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from './fonts/vfs.json' with { type: 'json' };
import { Document, Packer, Paragraph, TextRun, Header, TabStopType, BorderStyle, ExternalHyperlink } from 'docx';
import { DOCX_TYPE, validateMaterial } from '../../../core/materials-model.js';
import { formatContactRuns, formatRightLink } from './document-format.js';

// Bump when document formatting changes so saved bytes cannot retain an older template.
export const MATERIAL_TEMPLATE_VERSION = 9;

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
const letterMargins = [72, 115, 72, 54];

function letterLayout(model) {
  const words = model.paragraphs.join(' ').split(/\s+/).length;
  const lineHeight = words < 225 ? 1.8 : words < 375 ? 1.5 : 1.35;
  const gap = words < 225 ? 24 : words < 375 ? 18 : 12;
  return { ...letterStyles,
    opening: { ...letterStyles.opening, margin: [0, 0, 0, 4] },
    body: { ...letterStyles.body, lineHeight, margin: [0, 0, 0, gap] },
    closing: { ...letterStyles.closing, lineHeight: 1.2, margin: [0, 4, 0, 0] },
  };
}


function blocks(model, job) {
  const result = [{ text: model.name, style: 'name' }, { text: formatContactRuns(model.contact), style: 'contact' }];
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
    for (const rawSection of model.sections.filter(s => s.category === category)) {
      const isProject = category === 'Projects';
      let section = rawSection;
      if (isProject) {
        const urlMatch = (String(section.link || '') + ' ' + String(section.location || '') + ' ' + String(section.facts || '') + ' ' + String(section.heading || ''))
          .match(/(https?:\/\/[^\s·•|]+|(?:github\.com|gitlab\.com)[^\s·•|]+|[a-zA-Z0-9-]+\.(?:com|org|io|dev|app|net|me)\S*)/i);
        const rawUrl = section.link || urlMatch?.[0];
        const normalizedUrl = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`) : null;
        const headingParts = String(section.heading || '').split(/\s*—\s*/);
        const baseTitle = section.title || headingParts[0] || section.heading;
        const keywords = (section.keywords || []).filter(k => !baseTitle.toLowerCase().includes(k.toLowerCase()));
        const title = [baseTitle, keywords.join(', ')].filter(Boolean).join(' | ');
        const subtitle = section.subtitle || (headingParts.length > 1 ? headingParts.slice(1).join(' — ') : '');
        const cleanDates = (section.dates || section.facts || '').split(/\s*[·•|]\s*/).filter(p => !/(?:https?:\/\/|github\.com|gitlab\.com|\.(?:com|org|io|dev|app|net|me))/i.test(p)).join(' · ');
        const titleRun = normalizedUrl ? { text: title, link: normalizedUrl } : title;
        result.push({ text: titleRun, right: cleanDates ? { text: cleanDates } : null, style: 'title' });
        if (subtitle) result.push({ text: subtitle, style: 'facts' });
      } else if (section.title) {
        result.push({ text: section.title, right: section.dates ? { text: section.dates } : null, style: 'title' });
        const right = formatRightLink(section.location);
        if (section.subtitle || right) result.push({ text: section.subtitle || '', right, style: 'facts' });
      } else {
        if (section.heading !== category) result.push({ text: section.heading, style: 'title' });
        if (section.facts) result.push({ text: formatContactRuns(section.facts), style: 'facts' });
      }
      if (section.bullets?.length) {
        if (category === 'Skills' && section.bullets.some(s => /^[^:]+:/.test(s))) result.push(...section.bullets.map(text => ({ text, style: 'body' })));
        else result.push(category === 'Skills' ? { text: section.bullets.join(' · '), style: 'body' } : { ul: [...section.bullets], style: 'bullet' });
      }
    }
  }
  return result;
}

async function makePdf(model, job) {
  const letter = model.kind === 'coverLetter', margins = letter ? letterMargins : resumeMargins;
  const projectLinks = new Map();
  const content = blocks(model, job).flatMap(block => {
    const projectId = block.style === 'title' && typeof block.text?.link === 'string' ? `project-link-${projectLinks.size}` : null;
    if (projectId) projectLinks.set(projectId, block.text.link);
    if (block.right) {
      const leftCol = typeof block.text?.link === 'string'
        ? { text: block.text.text, ...(projectId ? { id: projectId } : { link: block.text.link }), decoration: 'underline', width: '*' }
        : { text: block.text?.text || block.text, width: '*' };
      const rightCol = typeof block.right?.link === 'string'
        ? { text: block.right.text, link: block.right.link, decoration: 'underline', width: 'auto', alignment: 'right', bold: false }
        : { text: block.right.text || block.right, width: 'auto', alignment: 'right', bold: false };
      return [{ columns: [leftCol, rightCol], style: block.style, columnGap: 12 }];
    }
    if (typeof block.text?.link === 'string') return [{ text: block.text.text, ...(projectId ? { id: projectId } : { link: block.text.link }), decoration: 'underline', style: block.style }];
    if (block.style === 'closing') return [{ stack: [block], unbreakable: true }];
    if (block.ul) return block.ul.map(text => ({ columns: [{ text: '-', width: 7 }, { text, width: '*' }], style: 'bullet' }));
    if (block.style === 'section') return [block, { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 612 - margins[0] - margins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 0, 0, 2] }];
    return [block];
  });
  const definition = { pageSize: 'LETTER', pageMargins: margins,
    defaultStyle: { font: letter ? 'Charter' : 'CMU Serif', fontSize: letter ? 12 : 9, lineHeight: 1, color: '#000000' },
    styles: letter ? letterLayout(model) : resumeStyles,
    ...(letter ? {
      background: { canvas: [{ type: 'rect', x: 0, y: 0, w: 612, h: 93.6, color: '#e1e1e1' }] },
      header: { stack: content.slice(0, 2), margin: [72, 23, 72, 0] },
    } : {}),
    content: letter ? content.slice(2) : content,
    info: { title: `${model.name} ${letter ? 'Cover Letter' : 'Resume'}`, author: model.name } };
  const pdf = pdfMake.createPdf(definition, { bufferPages: projectLinks.size > 0 });
  const stream = await pdf.getStream();
  // pdfmake links each word; annotate complete laid-out titles instead, retaining wrapping.
  // shortcut: uses pinned pdfmake layout markers; rerun link geometry tests when upgrading pdfmake.
  let activeTitle;
  if (projectLinks.size) for (const [number, page] of stream._pdfMakePages.entries()) {
    const areas = new Map();
    for (const { type, item: line } of page.items) {
      if (type !== 'line') continue;
      if (line._node) activeTitle = projectLinks.has(line.id) ? line.id : null;
      if (activeTitle) {
        const area = areas.get(activeTitle) || [Infinity, Infinity, -Infinity, -Infinity];
        area[0] = Math.min(area[0], line.x); area[1] = Math.min(area[1], line.y);
        area[2] = Math.max(area[2], line.x + line.getWidth()); area[3] = Math.max(area[3], line.y + line.getHeight());
        areas.set(activeTitle, area);
      }
      if (line.lastLineInParagraph) activeTitle = null;
    }
    stream.switchToPage(number);
    for (const [id, [x, y, right, bottom]] of areas) stream.link(x, y, right - x, bottom - y, projectLinks.get(id));
  }
  const buffer = await pdf.getBuffer();
  const pages = stream._pdfMakePages.length;
  return { buffer: Uint8Array.from(buffer).buffer, pages };
}

function docxDocument(model, job) {
  const letter = model.kind === 'coverLetter', styles = letter ? letterLayout(model) : resumeStyles;
  const margins = letter ? letterMargins : resumeMargins, font = letter ? 'Charter' : 'CMU Serif';
  const width = 612 - margins[0] - margins[2];
  const paragraphs = [];
  for (const block of blocks(model, job)) {
    const style = styles[block.style];
    const run = { font, size: style.fontSize * 2, bold: style.bold, italics: style.italics, smallCaps: ['name', 'section'].includes(block.style) };
    if (Array.isArray(block.text)) {
      paragraphs.push(new Paragraph({
        children: block.text.map(item => typeof item.link === 'string'
          ? new ExternalHyperlink({ children: [new TextRun({ ...run, text: item.text, style: 'Hyperlink', underline: { type: 'single' } })], link: item.link })
          : new TextRun({ ...run, text: item.text })),
        alignment: style.alignment,
        indent: { left: Math.round((style.margin[0] || 0) * 20), firstLine: (block.leadingIndent || 0) * 20 },
        spacing: { before: style.margin[1] * 20, after: (style.margin[3] + (block.style === 'section' ? 2 : 0)) * 20, line: letter ? Math.round((style.lineHeight || 1) * 240) : Math.round(style.fontSize * 1.2 * 20), lineRule: letter ? 'auto' : 'exact' },
        ...(letter && ['name', 'contact'].includes(block.style) ? { shading: { fill: 'E1E1E1' } } : {}),
      }));
      continue;
    }
    const rightRun = typeof block.right?.link === 'string'
      ? new ExternalHyperlink({ children: [new TextRun({ ...run, text: `\t${block.right.text}`, bold: false, style: 'Hyperlink', underline: { type: 'single' } })], link: block.right.link })
      : (block.right ? new TextRun({ ...run, text: `\t${block.right.text || block.right}`, bold: false }) : null);
    const leftRuns = typeof block.text?.link === 'string'
      ? [new ExternalHyperlink({ children: [new TextRun({ ...run, text: block.text.text, style: 'Hyperlink', underline: { type: 'single' } })], link: block.text.link })]
      : null;
    for (const text of block.ul || [block.text || '']) paragraphs.push(new Paragraph({
      children: [...(leftRuns || (block.ul ? `- ${text}` : text).split('\n').map((line, index) => new TextRun({ ...run, text: line, break: index ? 1 : 0 }))), ...(rightRun ? [rightRun] : [])],
      alignment: style.alignment,
      tabStops: block.right ? [{ type: TabStopType.RIGHT, position: Math.round(width * 20) }] : [],
      indent: { left: Math.round((style.margin[0] || 0) * 20), firstLine: (block.leadingIndent || 0) * 20 },
      spacing: { before: style.margin[1] * 20, after: (style.margin[3] + (block.style === 'section' ? 2 : 0)) * 20, line: letter ? Math.round((style.lineHeight || 1) * 240) : Math.round(style.fontSize * 1.2 * 20), lineRule: letter ? 'auto' : 'exact' },
      keepLines: letter && block.style === 'closing',
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
  // Fit by relevance, independent of chronological display order; keep depth and skills.
  if (fit && model.kind === 'resume') {
    for (let attempt = 0; pdf.pages > pageTarget && attempt < 100; attempt++) {
      checkCancelled();
      const entries = model.sections.filter(s => s.category !== 'Skills' && s.category !== 'Education')
        .reverse().sort((a, b) => (a.relevance ?? 2) - (b.relevance ?? 2));
      const weakest = entries[0], strongest = entries.at(-1);
      const section = entries.find(s => s.bullets.length > (s.relevance === 3 ? 3 : 2));
      if (entries.length > 1 && (weakest.relevance ?? 2) < (strongest.relevance ?? 2)) model.sections.splice(model.sections.indexOf(weakest), 1);
      else if (section) section.bullets.pop();
      else if (entries.length > 1) model.sections.splice(model.sections.indexOf(weakest), 1);
      else if (weakest?.bullets.length > 1) weakest.bullets.pop();
      else if (model.sections.some(s => s.category === 'Education' && s.bullets.length)) model.sections.findLast(s => s.category === 'Education' && s.bullets.length).bullets.pop();
      else if (model.sections.filter(s => s.category === 'Education').length > 1) model.sections.splice(model.sections.findLastIndex(s => s.category === 'Education'), 1);
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
