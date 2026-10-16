import { UI_IDS } from './constants.js';
import { detectAdapter } from './adapters/index.js';
import { accessibleRoots } from './domRoots.js';

export function isVisible(element) {
  if (!element || element.hidden || element.closest(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}, script, style, template`)) return false;
  if (element.matches('select.select2-hidden-accessible')) {
    const presentation = element.nextElementSibling;
    return Boolean(presentation?.matches('.select2-container') && isVisible(presentation));
  }
  for (let node = element; node && node.nodeType === 1; node = node.parentElement || node.getRootNode?.()?.host) {
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
    if (node.nodeType === 11) return Array.from(node.childNodes, read).join(' ');
    if (node.nodeType !== 1 || node.hidden || node.getAttribute('aria-hidden') === 'true' ||
      node.matches(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}, script, style, template`)) return '';
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return '';
    return [...Array.from(node.childNodes, read), ...(node.shadowRoot ? [read(node.shadowRoot)] : [])].join(' ');
  };
  return Array.from(root.childNodes, read).join(' ').replace(/\s+/g, ' ').trim();
}

export const CONTINUE_LABEL = /^(?:next(?: step)?|continue|save (?:and|&) continue|review(?: application)?|proceed)(?:\s*[→›»])?$/i;

export function controlLabel(element) {
  const root = element.getRootNode();
  const referenced = (element.getAttribute('aria-labelledby') || '').split(/\s+/)
    .map(id => root.getElementById?.(id)?.textContent || '').join(' ').trim();
  return (referenced || element.getAttribute('aria-label') ||
    (element.matches('input') ? element.value : visibleText(element)) || '').replace(/\s+/g, ' ').trim();
}

export function actionControls(doc) {
  return accessibleRoots(doc).flatMap(root => [...root.querySelectorAll('button,input[type=submit],input[type=button],a[href],[role=button]')])
    .filter(element => isVisible(element) && !element.matches('[role=combobox],[aria-haspopup=listbox]') && !element.closest('[role=listbox],.select__menu,[role=menu]'));
}

export function isApplicationForm(form) {
  if (form.closest('header,nav,footer,[role=navigation],[role=search]')) return false;
  const controls = [...form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),textarea,select,[contenteditable=true],[role=combobox]')]
    .filter(element => isVisible(element) || element.type === 'file' && isVisible(element.parentElement));
  if (!controls.length) return false;
  const purpose = [form.id, form.getAttribute('name'), form.getAttribute('aria-label'), form.getAttribute('role'),
    ...controls.flatMap(element => [element.id, element.name, element.getAttribute('aria-label'), ...[...(element.labels || [])].map(label => label.textContent)])].join(' ').replace(/[_-]+/g, ' ');
  if (/\b(?:newsletter|subscribe|subscription|search|login|log in|sign in|sign up)\b/i.test(purpose)) return false;
  return /\b(?:application|applicant|candidate|resume|cover\s*letter|cv|(?:full|first|last|given|family)\s*name)\b/i.test(purpose) ||
    [...form.querySelectorAll('button,input[type=submit],[role=button]')].some(element => /\b(?:submit|send|finish|complete) (?:my |your |the )?application\b/i.test(controlLabel(element)));
}

export function isSubmitControl(element) {
  const label = controlLabel(element);
  if (element.closest('[role=tablist]')) return false;
  if (element.closest('header,nav,footer') &&
      !(element.form && !element.form.closest('header,nav,footer')) && !/\bapplication\b/i.test(label)) return false;
  if (CONTINUE_LABEL.test(label)) return false;
  if (/^(?:submit(?: (?:my|your|the))? application|submit|apply(?: now)?|send(?: (?:my|your|the))? application|final submit|finish(?: application)?|complete application)(?:\s*[→›»])?$/i.test(label)) return true;
  // Native form semantics cover labels and languages without an ATS recipe.
  return Boolean(element.matches('button,input[type=submit]') && element.type === 'submit' && element.form &&
    !/\b(?:save|delete|remove|upload|attach|add|reset|search|subscribe|sign in|log in)\b/i.test(label) &&
    element.form.querySelector('input:not([type=hidden]):not([type=submit]):not([type=button]),textarea,select'));
}

export function classifyPage(doc = document) {
  const roots = accessibleRoots(doc);
  const all = selector => roots.flatMap(root => [...root.querySelectorAll(selector)]);
  const text = visibleText(doc.body);
  const headings = all('h1,h2,h3,h4,h5,h6,legend,[role=heading]').filter(isVisible).map(visibleText).join(' ');
  if (detectAdapter(doc.location, doc).confirmation?.(doc)) return {type:'confirmation',reason:'Application confirmation detected.'};
  if (/application (?:has been |was )?(?:submitted|received)|thank you for applying/i.test(text)) return { type: 'confirmation', reason: 'Application confirmation detected.' };
  if (/review (?:your )?application|final review|review and submit/i.test(headings)) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  const adapter = detectAdapter(doc.location, doc);
  const fields = all('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]),textarea,select,[role=combobox],[contenteditable=true],button,input[type=search],spl-input,spl-textarea,spl-checkbox,spl-autocomplete,spl-phone-field,spl-dropzone').some(el => isVisible(el) &&
    (!el.matches('button,input[type=search]') || !el.closest('header,nav,footer') && (el.matches('button[aria-haspopup=listbox]') || adapter.isCombobox?.(el))));
  if (fields) return { type: 'application', reason: 'Application fields detected.' };
  const final = actionControls(doc).some(isSubmitControl);
  if (final) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  if (doc.querySelector('script[type="application/ld+json"]') && /JobPosting/.test(doc.querySelector('script[type="application/ld+json"]')?.textContent || '') || /job description|about (?:the|this) (?:role|job)/i.test(text)) return { type: 'listing', reason: 'Job listing detected.' };
  return { type: 'unrelated', reason: 'No application step detected.' };
}
