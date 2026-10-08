import { detectAdapter } from './adapters/index.js';
import { isVisible } from './pageClassifier.js';
import { accessibleRoots, FORM_CONTROLS, isKareerElement } from './domRoots.js';

export const JOB_HEADINGS = 'h1,h2,h3,h4,h5,h6,legend,[role="heading"]';
const APPLICATION_INTENT = /\b(?:job|employment) application\b|apply for (?:an? |this |the )?(?:job|role|position)|\beasy apply\b|\bsubmit (?:my |your |the )?application\b/i;
const JOB_PATH = /(?:^|[/.])(?:careers?|jobs|openings)(?:[/.]|$)/i;

export function findJobPosting(doc) {
  const visit = value => {
    if (!value || typeof value !== 'object') return null;
    if ([value['@type']].flat().includes('JobPosting')) return value;
    for (const child of Object.values(value)) {
      const result = Array.isArray(child) ? child.map(visit).find(Boolean) : visit(child);
      if (result) return result;
    }
    return null;
  };
  for (const root of accessibleRoots(doc)) for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    if (isKareerElement(script)) continue;
    try { const posting = visit(JSON.parse(script.textContent)); if (posting) return posting; } catch { /* Unrelated malformed metadata. */ }
  }
  return null;
}

function visible(element) {
  return !isKareerElement(element) && isVisible(element);
}

function controlLabel(element) {
  const root = element.getRootNode();
  const referenced = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => root.getElementById?.(id)?.textContent || '').join(' ');
  const labels = [...(element.labels || [])].map(label => label.textContent).join(' ');
  const heading = element.closest('fieldset,section,.form-section')?.querySelector(JOB_HEADINGS)?.textContent || '';
  return [element.getAttribute('aria-label'), element.getAttribute('label'), referenced, labels,
    element.querySelector('[slot="label-content"]')?.textContent,
    element.matches('button,[role="button"]') ? element.textContent : '',
    element.getAttribute('autocomplete'), element.name, element.id,
    element.matches('spl-dropzone,input[type="file"]') ? heading : ''].filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
}

/** Returns only fixed reason codes, never field values or applicant data. */
export function jobPageEvidence(doc, { continuity = false, stepHeading = null } = {}) {
  const yes = reason => ({ eligible: true, reasons: [reason] });
  const loc = doc.location || doc.defaultView?.location || {hostname:'',href:''};
  if (detectAdapter(loc, doc).id !== 'generic') return yes('ats-adapter');
  if (findJobPosting(doc)) return yes('job-posting-schema');
  const roots = accessibleRoots(doc);
  const all = selector => roots.flatMap(root => [...root.querySelectorAll(selector)]).filter(visible);
  const headingElements = all(JOB_HEADINGS);
  const headings = headingElements.map(el => el.textContent.trim());
  const titles = [doc.title || '', ...headings];
  if (titles.some(text => /^(?:job|employment) application\b/i.test(text))) return yes('application-heading');
  if (continuity && headings.some(text => stepHeading?.test(text))) return yes('application-continuity');
  if (headings.some(text => /^review(?: your)? application$/i.test(text))) return yes('application-review');
  if (titles.some(text => /job description|about (?:the|this) (?:role|job)/i.test(text))) return yes('job-description');
  const controls = all(`${FORM_CONTROLS},button,[role="button"]`).filter(el =>
    !el.matches('input[type="hidden"],input[type="search"],input[type="submit"],input[type="button"],input[type="reset"]') &&
    !el.closest('header,nav,footer,[role="navigation"]') &&
    (!el.matches('button,[role="button"]') || el.matches(FORM_CONTROLS) || /\b(?:upload|attach|choose|browse)\b.*\b(?:resume|curriculum vitae|cv|cover letter)\b/i.test(controlLabel(el))));
  const forms = all('form,[role="form"]');
  if (forms.some(form => /(?:^|[\s_-])(?:job|employment)[_-]application(?:$|[\s_-])/i.test(`${form.id} ${form.getAttribute('name') || ''}`))) return yes('application-form');
  const groups = new Map();
  for (const control of controls) {
    const scope = control.closest('form,[role="form"],section,fieldset,main,[role="main"],[role="dialog"]') || control.getRootNode();
    if (!groups.has(scope)) groups.set(scope, new Set());
    const semantics = groups.get(scope);
    const label = controlLabel(control);
    if (/\b(?:email|e mail)\b/i.test(label) || control.matches('input[type="email"]')) semantics.add('email');
    if (/\b(?:(?:first|last|full|given|family) name|name)\b/i.test(label)) semantics.add('name');
    if (/\b(?:phone|tel|telephone|mobile)\b/i.test(label) || control.matches('input[type="tel"]')) semantics.add('phone');
    if (/\b(?:resume|curriculum vitae|cover letter|cv)\b/i.test(label)) semantics.add('resume');
  }
  const candidateGroup = [...groups.values()].some(keys => [...keys].filter(key => key !== 'resume').length >= 2);
  const resumeGroup = [...groups.values()].some(keys => keys.has('resume') && (keys.has('email') || keys.has('name') || keys.has('phone')));
  const submitApplication = all('button,[role="button"],input[type="submit"]').some(el => /\bsubmit (?:my |your |the )?application\b/i.test(el.textContent || el.value || el.getAttribute('aria-label') || ''));
  if (submitApplication && controls.length) return yes('application-action-controls');
  const intent = titles.some(text => !/^(?:how to|guide to|tips for)\b/i.test(text) && APPLICATION_INTENT.test(text));
  const direct = titles.some(text => /^(?:job|employment) application\b|^apply for (?:an? |this |the )?(?:job|role|position)\b/i.test(text));
  const jobUrl = JOB_PATH.test(loc.href || '');
  const roleAndCompanyTitle = /^easy apply\s*[-|:]\s*.+\s[-|:]\s*.+/i.test(doc.title || '');
  if (intent && controls.length && (direct || resumeGroup || jobUrl || (roleAndCompanyTitle && candidateGroup))) return yes('application-intent-controls');
  if (resumeGroup) return yes('resume-candidate-controls');
  if (forms.length && (jobUrl || candidateGroup) && headings.some(text => /^application(?:\s*[·:—-]\s*.+)?$/i.test(text))) return yes('application-form-context');
  if (headings.some(text => /\bcareers?\b/i.test(text)) && jobUrl) return yes('career-page');
  if (all('article,.job-description,[itemprop="description"]').length && all('a,button').some(el => /^apply(?: now| for (?:this )?(?:job|position))?$/i.test(el.textContent.trim()))) return yes('listing-apply-control');
  for (const frame of all('iframe')) {
    try {
      if (detectAdapter(new URL(frame.src, loc.href), null).id !== 'generic') return yes('embedded-ats');
      if (frame.contentDocument && jobPageEvidence(frame.contentDocument).eligible) return yes('embedded-application');
    } catch { /* Cross-origin evidence is supplied by the frame host. */ }
  }
  return { eligible: false, reasons: ['insufficient-application-evidence'] };
}
