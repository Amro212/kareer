import { genericAdapter } from './generic.js';

function uploadOwner(element) {
  for (let node = element; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (node.matches?.('spl-dropzone')) return node;
  }
  return null;
}

export const smartrecruitersAdapter = {
  ...genericAdapter,
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  detect(loc, doc) {
    return /(?:^|\.)smartrecruiters\.com$/i.test(loc?.hostname || '') ||
      Boolean(doc?.querySelector('oc-oneclick-form,spl-dropzone[data-test="resume-upload"]'));
  },
  fieldMetadata(element) {
    const owner = uploadOwner(element);
    const id = owner?.getAttribute('data-test');
    if (!['resume-upload', 'apply-with-resume-container'].includes(id) || owner.closest('oc-easy-apply,[data-test*="prefill"]')) return null;
    return { id, label: id === 'resume-upload' ? 'Resume' : 'Autofill with resume',
      ats: { adapter: 'smartrecruiters', canonicalKey: 'resume' } };
  },
  uploadState(element) {
    const owner = uploadOwner(element);
    if (!owner) return null;
    let files;
    try { files = JSON.parse(owner.getAttribute('files') || '[]'); } catch { files = []; }
    const names = Array.isArray(files) ? files.map(file => file?.fileName || file?.name).filter(name => typeof name === 'string' && name.trim()) : [];
    const name = names.length === 1 ? names[0] : '';
    const busy = owner.hasAttribute('disabled') || owner.getAttribute('aria-busy') === 'true';
    const rejected = owner.getAttribute('aria-invalid') === 'true';
    return { name, busy, accepted: Boolean(name && !busy && !rejected) };
  },
  uploadBusy(doc) {
    // SmartRecruiters binds the parser request's isLoading state to this host.
    return Boolean(doc.querySelector('spl-dropzone[data-test="apply-with-resume-container"][disabled]'));
  },
};
