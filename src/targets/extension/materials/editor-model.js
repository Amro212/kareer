/** Small, lossless bridge between editable paragraphs and the existing exports. */
export const categoryOrder = category => ({ Skills: 0, Experience: 1, Projects: 2, Education: 4, Certifications: 5 }[category] ?? 3);
export const categoryLabel = category => ({ Skills: 'Technical Skills', Experience: 'Professional Experience' })[category] || category;
const paragraph = value => ({ type: 'paragraph', ...(value ? { content: value.split('\n').flatMap((text, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(text ? [{ type: 'text', text }] : [])]) } : {}) });

export function editorSections(model) {
  if (model.kind === 'coverLetter') return [{ id: 'letter', label: 'Cover letter', category: '', values: model.paragraphs }];
  return [{ id: 'summary', label: 'Summary', category: '', values: model.summary.split('\n') },
    ...model.sections.toSorted((a, b) => categoryOrder(a.category) - categoryOrder(b.category))
      .map(s => ({ ...s, label: s.title || s.heading, values: s.bullets }))];
}

export function modelToEditor(model) {
  return { type: 'doc', content: editorSections(model).map(s => ({ type: 'materialSection', attrs: { id: s.id },
    content: [...(s.category === 'Projects' ? [{ ...paragraph((s.keywords || []).join(', ')), type: 'materialKeywords' }] : []), ...(s.values.length ? s.values : ['']).map(paragraph)] })) };
}

export function editorToModel(document, original) {
  const result = structuredClone(original);
  const text = p => (p.content || []).map(t => t.type === 'hardBreak' ? '\n' : t.text || '').join('');
  const contents = new Map(document.content.map(s => [s.attrs.id, s.content.filter(p => p.type === 'paragraph').map(text)]));
  if (result.kind === 'coverLetter') result.paragraphs = contents.get('letter').map(s => s.trim()).filter(Boolean);
  else {
    result.summary = contents.get('summary').join('\n').trim();
    for (const section of result.sections) {
      section.bullets = contents.get(section.id).map(s => s.trim()).filter(Boolean);
      if (section.category === 'Projects') {
        const node = document.content.find(s => s.attrs.id === section.id).content.find(p => p.type === 'materialKeywords');
        const keywords = node ? text(node).split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [];
        if (keywords.length || section.keywords !== undefined) section.keywords = [...new Set(keywords)];
      }
    }
  }
  return result;
}

// Only editable text crosses this boundary; profile identity and section metadata stay intact.
export function editableModel(original, incoming) {
  if (incoming?.kind !== original.kind) throw new Error('Document type changed. Reopen the document.');
  const result = structuredClone(original);
  if (original.kind === 'coverLetter') {
    if (!Array.isArray(incoming.paragraphs) || incoming.paragraphs.length > 100 || incoming.paragraphs.some(p => typeof p !== 'string')) throw new Error('Invalid letter draft.');
    result.paragraphs = incoming.paragraphs;
  } else {
    if (typeof incoming.summary !== 'string' || !Array.isArray(incoming.sections) || incoming.sections.length !== original.sections.length) throw new Error('Invalid resume draft.');
    result.summary = incoming.summary;
    for (const section of result.sections) {
      const next = incoming.sections.find(s => s.id === section.id);
      if (!next || !Array.isArray(next.bullets) || next.bullets.length > 100 || next.bullets.some(b => typeof b !== 'string')) throw new Error('Invalid section draft.');
      section.bullets = next.bullets;
      if (section.category === 'Projects' && next.keywords !== undefined) {
        if (!Array.isArray(next.keywords) || next.keywords.length > 100 || next.keywords.some(k => typeof k !== 'string')) throw new Error('Invalid project keywords.');
        section.keywords = next.keywords;
      }
    }
  }
  if (JSON.stringify(result).length > 200000) throw new Error('Draft is too large. Shorten the text and retry.');
  return result;
}

export function rewriteText(model, path) {
  if (path === 'summary') return model.summary;
  if (path.startsWith('section:')) {
    const section = model.sections.find(s => s.id === path.slice(8));
    return JSON.stringify({ bullets: section?.bullets, keywords: section?.keywords });
  }
  if (/^paragraph:\d+$/.test(path)) return JSON.stringify(model.paragraphs.slice(0, Number(path.slice(10)) + 1));
  throw new Error('Choose text to rewrite.');
}
