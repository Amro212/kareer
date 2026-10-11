/** Host-independent source, output validation, and change comparison. */
const text = value => String(value ?? '').trim();
const lines = value => text(value).split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
export const MATERIAL_KINDS = ['resume', 'coverLetter'];
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function materialJobKey(job) {
  if (job?.localId) return `local:${job.localId}`;
  const url = job?.listingUrl || job?.applicationUrl;
  if (!url) throw new Error('A job identity is needed. Open the workspace and paste the job description.');
  const parsed = new URL(url);
  parsed.hash = '';
  return job.jobId ? `${parsed.origin}:id:${job.jobId}` : `url:${parsed.href}`;
}

export function buildMaterialSource(profile = {}, base = {}) {
  const sections = [];
  const known = new Set();
  const matchedImports = new Set();
  for (const [key, category, heading, facts] of [
    ['workExperiences', 'Experience', r => [r.title, r.company].filter(Boolean).join(' — '), r => [r.location, r.startDate, r.current ? 'Present' : r.endDate].filter(Boolean).join(' · ')],
    ['education', 'Education', r => [r.degree, r.fieldOfStudy, r.institution].filter(Boolean).join(' — '), r => [r.startDate, r.current ? 'Present' : r.endDate, r.gpa ? `GPA ${r.gpa}` : ''].filter(Boolean).join(' · ')],
    ['projects', 'Projects', r => [r.name, r.role].filter(Boolean).join(' — '), r => [r.url, r.startDate, r.current ? 'Present' : r.endDate].filter(Boolean).join(' · ')],
  ]) {
    for (const [index, record] of (profile[key] || []).entries()) {
      const id = record.id || `${key}_${index}`;
      known.add(id);
      const anchor = text(record.company || record.institution || record.name).toLowerCase();
      const candidates = (base.sections || []).filter(s => s.id === id || (anchor && text(s.heading).toLowerCase().includes(anchor) && s.category === category));
      const exact = candidates.find(s => s.id === id) || candidates.find(s => text(s.heading).toLowerCase().includes(text(record.title || record.degree || record.role).toLowerCase()));
      const imported = exact || (candidates.length === 1 ? candidates[0] : null);
      if (imported) matchedImports.add(imported.id);
      if (record.enabled === false) continue;
      sections.push({ id, category, heading: heading(record), facts: facts(record),
        title: text(record.title || record.degree || record.name),
        subtitle: [record.company || record.institution || record.role, record.fieldOfStudy].filter(Boolean).join(' — '),
        dates: [record.startDate, record.current ? 'Present' : record.endDate].filter(Boolean).join(' – '),
        location: key === 'education' ? [record.location, record.gpa ? `GPA ${record.gpa}` : ''].filter(Boolean).join(' · ') : text(key === 'projects' ? record.url : record.location),
        bullets: lines(record.description || imported?.bullets?.join('\n')), protected: true });
    }
  }
  for (const section of base.sections || []) {
    if (!known.has(section.id) && !matchedImports.has(section.id) && !(section.category === 'Skills' && profile.skills?.length)) sections.push({ id: text(section.id), category: text(section.category || 'Additional experience'), heading: text(section.heading), facts: text(section.facts), bullets: (section.bullets || []).map(text), protected: true });
  }
  const skills = (profile.skills || []).filter(s => typeof s === 'string' || s.enabled !== false).map(s => text(typeof s === 'string' ? s : s.name || s.skill)).filter(Boolean);
  if (skills.length) sections.push({ id: 'skills', category: 'Skills', heading: 'Skills', facts: '', bullets: skills, protected: true });
  return {
    kind: 'resume', name: text(profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || base.name),
    contact: [profile.email, profile.phone, [profile.city, profile.stateProvince, profile.country].filter(Boolean).join(', '), profile.linkedin, profile.github, profile.website].filter(Boolean).join(' · ') || text(base.contact),
    summary: text(base.summary), sections,
    text: base.sections?.length ? '' : text(base.text || profile.resumeContext), notes: text(profile.applicantNotes),
  };
}

export function mergeMaterialRewrite(current, output, path) {
  const result = structuredClone(current);
  if (current.kind === 'resume' && path === 'summary') result.summary = output.summary;
  else if (current.kind === 'resume' && path.startsWith('section:')) {
    const id = path.slice(8), index = result.sections.findIndex(s => s.id === id), next = output.sections?.find(s => s.id === id);
    if (index < 0 || !next) throw new Error('Rewrite target is unavailable. Reopen the document and retry.');
    result.sections[index] = { ...result.sections[index], bullets: next.bullets };
  } else if (current.kind === 'coverLetter' && /^paragraph:\d+$/.test(path)) {
    const index = Number(path.slice(10)), next = output.paragraphs?.[index] ?? (output.paragraphs?.length === 1 ? output.paragraphs[0] : undefined);
    if (index >= result.paragraphs.length || typeof next !== 'string') throw new Error('Rewrite target is unavailable. Reopen the document and retry.');
    result.paragraphs[index] = next;
  } else throw new Error('Unknown rewrite target.');
  return result;
}

export function validateMaterial(kind, output, source, { manual = false } = {}) {
  if (!MATERIAL_KINDS.includes(kind)) throw new Error('Unknown document kind.');
  if (!output || typeof output !== 'object') throw new Error('AI returned invalid document data.');
  if (kind === 'coverLetter') {
    if (!Array.isArray(output.paragraphs) || !output.paragraphs.length || output.paragraphs.length > 30 || output.paragraphs.some(p => typeof p !== 'string')) throw new Error('Cover letter paragraphs are empty or invalid.');
    const paragraphs = output.paragraphs.flatMap(p => p.replace(/\r\n?/g, '\n').split(/\n\s*\n/)).map(text).filter(Boolean);
    if (!paragraphs.length) throw new Error('Cover letter is empty.');
    // Legacy AI output repeated the letterhead as its final signature block.
    if (source.contact && paragraphs.at(-1) === `${source.name}\n${source.contact}`) paragraphs[paragraphs.length - 1] = source.name;
    return { kind, name: source.name, contact: source.contact, paragraphs };
  }
  if (!Array.isArray(output.sections) || !output.sections.length || output.sections.length > 100) throw new Error('Resume sections are empty or invalid.');
  const ids = new Set();
  const sections = output.sections.map(section => {
    const original = source.sections.find(s => s.id === section.id);
    if (!original || ids.has(section.id)) throw new Error('Resume includes an unknown or duplicate source section.');
    ids.add(section.id);
    if (!Array.isArray(section.bullets) || section.bullets.length > 100 || section.bullets.some(b => typeof b !== 'string')) throw new Error('Resume bullets are invalid.');
    const bullets = section.bullets.map(text).filter(Boolean);
    if (!manual && original.category === 'Skills' && bullets.some(b => !original.bullets.includes(b))) throw new Error('Resume includes an unsupported skill. Select only saved skills.');
    // Contact, employers, titles, dates and education are always taken from source.
    return { ...original, bullets };
  });
  const summary = text(output.summary);
  return { kind, name: source.name, contact: source.contact, summary, sections };
}

export function materialChanges(source, document) {
  const changes = [];
  const retained = (source.sections || []).filter(s => document.sections?.some(next => next.id === s.id));
  if (source.summary !== document.summary) changes.push({ id: 'summary', heading: 'Summary', type: 'changed', before: source.summary || '', after: document.summary || '' });
  for (const section of source.sections || []) {
    const next = document.sections?.find(s => s.id === section.id);
    const before = section.bullets.join('\n');
    const after = next?.bullets.join('\n') || '';
    if (!next || before !== after) changes.push({ id: section.id, heading: section.heading, type: next ? 'changed' : 'omitted', before, after });
    else if (retained.findIndex(s => s.id === section.id) !== document.sections.findIndex(s => s.id === section.id)) changes.push({ id: section.id, heading: section.heading, type: 'reordered', before, after });
  }
  return changes;
}

export function materialText(document) {
  if (document.kind === 'coverLetter') return document.paragraphs.join('\n\n');
  return [document.name, document.contact, document.summary, ...document.sections.map(s => [s.category, s.heading, s.facts, ...s.bullets].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
}

export function materialFormat(accept = '') {
  const tokens = accept.toLowerCase().split(',').map(s => s.trim());
  if (!accept.trim() || tokens.some(s => ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(s))) return 'pdf';
  if (tokens.some(s => s === '.docx' || s === DOCX_TYPE)) return 'docx';
  throw new Error('This upload does not accept PDF or DOCX. Download the document and attach a supported format manually.');
}
