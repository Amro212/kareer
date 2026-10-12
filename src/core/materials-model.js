/** Host-independent profile source and output validation. */
const text = value => String(value ?? '').trim();
const lines = value => text(value).split(/\n+|(?<=\.)\s+(?=[A-Z])/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
// shortcut: literal matches cannot prove proficiency or negation; add evidence annotations if semantic false positives recur.
const mentions = (facts, phrase) => new RegExp(`(^|[^\\p{L}\\p{N}+#])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}+#])`, 'iu').test(facts.replace(/\s+/g, ' '));
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

export function buildMaterialSource(profile = {}) {
  const sections = [];
  for (const [key, category, heading, facts] of [
    ['workExperiences', 'Experience', r => [r.title, r.company].filter(Boolean).join(' — '), r => [r.location, r.startDate, r.current ? 'Present' : r.endDate].filter(Boolean).join(' · ')],
    ['education', 'Education', r => [r.degree, r.fieldOfStudy, r.institution].filter(Boolean).join(' — '), r => [r.startDate, r.current ? 'Present' : r.endDate, r.gpa ? `GPA ${r.gpa}` : ''].filter(Boolean).join(' · ')],
    ['projects', 'Projects', r => [r.name, r.role].filter(Boolean).join(' — '), r => [r.startDate, r.current ? 'Present' : r.endDate].filter(Boolean).join(' · ')],
  ]) {
    for (const [index, record] of (profile[key] || []).entries()) {
      const id = record.id || `${key}_${index}`;
      if (record.enabled === false) continue;
      sections.push({ id, category, heading: heading(record), facts: facts(record),
        title: text(record.title || record.degree || record.name),
        subtitle: [record.company || record.institution || record.role, record.fieldOfStudy].filter(Boolean).join(' — '),
        dates: [record.startDate, record.current ? 'Present' : record.endDate].filter(Boolean).join(' – '),
        location: key === 'education' ? [record.location, record.gpa ? `GPA ${record.gpa}` : ''].filter(Boolean).join(' · ') : text(key === 'projects' ? '' : record.location),
        link: key === 'projects' ? text(record.url) : '',
        bullets: lines(record.description), protected: true });
    }
  }
  const skills = (profile.skills || []).filter(s => typeof s === 'string' || s.enabled !== false).map(s => text(typeof s === 'string' ? s : s.name || s.skill)).filter(Boolean);
  if (skills.length) sections.push({ id: 'skills', category: 'Skills', heading: 'Skills', facts: '', bullets: skills, protected: true });
  return {
    kind: 'resume', name: text(profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ')),
    contact: [
      profile.email,
      profile.phone,
      [profile.city, profile.stateProvince, profile.country].filter(Boolean).join(', '),
      profile.linkedin,
      profile.github,
      profile.portfolio,
      profile.website,
      profile.additionalUrl,
      profile.twitter,
      profile.behance,
      profile.dribbble,
    ].filter(Boolean).join(' · '),
    summary: '', sections, text: '', notes: text(profile.applicantNotes),
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
  const skillFacts = source.sections.filter(s => s.category !== 'Skills').flatMap(s => s.bullets).join('\n');
  const sections = output.sections.map(section => {
    const original = source.sections.find(s => s.id === section.id) || (section.id === 'skills' && skillFacts.trim() ? { id: 'skills', category: 'Skills', heading: 'Skills', facts: '', bullets: [], protected: true } : null);
    if (!original || ids.has(section.id)) throw new Error('Resume includes an unknown or duplicate source section.');
    ids.add(section.id);
    if (!Array.isArray(section.bullets) || section.bullets.length > 100 || section.bullets.some(b => typeof b !== 'string')) throw new Error('Resume bullets are invalid.');
    const bullets = section.bullets.map(text).filter(Boolean);
    if (!manual && original.category === 'Skills' && bullets.some(b => !original.bullets.includes(b) && !mentions(skillFacts, b))) throw new Error('Resume includes an unsupported skill. Use saved skills or explicit source descriptions.');
    if (section.relevance !== undefined && (!Number.isInteger(section.relevance) || section.relevance < 1 || section.relevance > 3)) throw new Error('Resume relevance must be 1, 2 or 3.');
    if (section.keywords !== undefined && (original.category !== 'Projects' || !Array.isArray(section.keywords) || section.keywords.length > 4 || section.keywords.some(k => typeof k !== 'string' || !k.trim() || k.length > 80))) throw new Error('Resume project keywords are invalid.');
    const keywords = section.keywords?.map(text);
    if (!manual && keywords?.some(k => !mentions([original.title, original.subtitle, ...original.bullets].filter(Boolean).join('\n'), k))) throw new Error('Resume project keywords require evidence in that project.');
    // Contact, employers, titles, dates and education are always taken from source.
    return { ...original, bullets, ...(section.relevance !== undefined ? { relevance: section.relevance } : {}), ...(keywords ? { keywords: [...new Set(keywords)] } : {}) };
  });
  const summary = text(output.summary);
  return { kind, name: source.name, contact: source.contact, summary, sections };
}

export function materialText(document) {
  if (document.kind === 'coverLetter') return document.paragraphs.join('\n\n');
  return [document.name, document.contact, document.summary, ...document.sections.map(s => [s.category, [s.heading, s.keywords?.join(', ')].filter(Boolean).join(' | '), s.facts, ...s.bullets].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
}

export function materialFormat(accept = '') {
  const tokens = accept.toLowerCase().split(',').map(s => s.trim());
  if (!accept.trim() || tokens.some(s => ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(s))) return 'pdf';
  if (tokens.some(s => s === '.docx' || s === DOCX_TYPE)) return 'docx';
  throw new Error('This upload does not accept PDF or DOCX. Download the document and attach a supported format manually.');
}
