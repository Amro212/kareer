import { UI_IDS } from './constants.js';

export function isVisible(element) {
  if (!element || element.hidden || element.closest(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}, script, style, template`)) return false;
  if (element.matches('select.select2-hidden-accessible')) {
    const presentation = element.nextElementSibling;
    return Boolean(presentation?.matches('.select2-container') && isVisible(presentation));
  }
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    const view = node.ownerDocument?.defaultView;
    if (view && typeof view.getComputedStyle === 'function') {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  }
  return true;
}

export function visibleText(root = document.body) {
  if (!root || !isVisible(root)) return '';
  // Ancestors were checked at entry. Descendants only need their own visibility
  // checked; walking every ancestor again makes classification quadratic in depth.
  const read = node => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || node.hidden || node.getAttribute('aria-hidden') === 'true' ||
      node.matches(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}, script, style, template`)) return '';
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return '';
    return Array.from(node.childNodes, read).join(' ');
  };
  return Array.from(root.childNodes, read).join(' ').replace(/\s+/g, ' ').trim();
}

export function classifyPage(doc = document) {
  const text = visibleText(doc.body);
  const headings = Array.from(doc.querySelectorAll('h1,h2,[role=heading]')).filter(isVisible).map(visibleText).join(' ');
  // A background anti-abuse widget is not an application-wide autofill boundary.
  // Its controls are excluded by the scanner; site validation still governs Continue.
  const boundary = /assessment|identity verification|verify your identity|(?:recorded|video) interview|e-signature|electronic signature/i.exec(headings)
    || /\bI (?:certify|attest|declare under penalty)|\b(?:sign electronically|provide your electronic signature|start (?:the |your )?(?:assessment|video interview)|verify your identity)\b/i.exec(text);
  if (boundary) return { type: 'boundary', reason: `Manual action required: ${boundary[0]}.` };
  if (/application (?:has been |was )?(?:submitted|received)|thank you for applying/i.test(text)) return { type: 'confirmation', reason: 'Application confirmation detected.' };
  if (/review (?:your )?application|final review|review and submit/i.test(headings)) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  const fields = Array.from(doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]),textarea,select,[role=combobox],[contenteditable=true]')).some(isVisible);
  if (fields) return { type: 'application', reason: 'Application fields detected.' };
  const final = Array.from(doc.querySelectorAll('button,input[type=submit],[role=button]')).filter(isVisible).some(el => /\bsubmit (?:my |your |the )?application\b|\bfinal submit\b|^submit$|^apply now$/i.test(visibleText(el) || el.value || el.getAttribute('aria-label') || ''));
  if (final) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  if (doc.querySelector('script[type="application/ld+json"]') && /JobPosting/.test(doc.querySelector('script[type="application/ld+json"]')?.textContent || '') || /job description|about (?:the|this) (?:role|job)/i.test(text)) return { type: 'listing', reason: 'Job listing detected.' };
  return { type: 'unrelated', reason: 'No application step detected.' };
}
