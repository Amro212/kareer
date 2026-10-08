import { detectAdapter } from './adapters/index.js';
import { fillField } from './fields/fillers.js';
import { UI_IDS } from './constants.js';
import { logger } from './debug.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const RESUME_PATTERN = /\b(?:resume|r[eé]sum[eé]|cv|curriculum[\s-]*vitae)\b/i;
const NON_RESUME_PATTERN = /\b(?:cover[\s-]*letter|portfolio|work[\s-]*sample|writing[\s-]*sample|references?|transcript|certification|supplement|additional[\s-]*document|avatar|headshot|profile[\s-]*(?:image|photo|picture|img)|photo|picture)\b/i;

function isImageOnlyAccept(accept) {
  if (!accept || typeof accept !== 'string') return false;
  const parts = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every(p => /^image\/|\.(?:bmp|gif|jfif|jpe?g|png|tiff?|webp|svg|ico)$/i.test(p));
}

/**
 * Returns true when a file field looks like a resume/CV upload rather than a
 * cover letter, portfolio, or other attachment type.  When the label is
 * ambiguous (e.g. just "Upload" with no further context) the field is treated
 * as a resume if it is the FIRST file field on the page — most ATS pages put
 * the resume upload first.
 */
export function isResumeField(field, allFileFields) {
  if (!field || field.type !== 'file') return false;
  if (field.ats?.canonicalKey === 'coverLetter') return false;
  if (field.ats?.canonicalKey === 'resume') return true;
  const acceptAttr = field.constraints?.accept || field.element?.getAttribute?.('accept') || '';
  if (isImageOnlyAccept(acceptAttr)) return false;
  if (field.element?.closest?.('oc-easy-apply, [data-test*="easy-apply"], [data-test*="prefill"]')) return false;
  const text = [field.label, field.name, field.id, field.description, acceptAttr].filter(Boolean).join(' ');
  // Explicit non-resume label — never attach the resume.
  if (NON_RESUME_PATTERN.test(text)) return false;
  // Explicit resume label — always attach.
  if (RESUME_PATTERN.test(text)) return true;
  // These adapters identify resume controls explicitly. Other files stay manual;
  // Ashby's separate parser uploader is the evidenced unlabelled exception.
  if (['greenhouse','ashby'].includes(field.ats?.adapter)) return Boolean(field.element?.closest('.ashby-application-form-autofill-input-root'));
  // Ambiguous label (e.g. "Attach file"): only treat the first file field on
  // the page as a resume upload; later ones are likely cover letter or other.
  if (allFileFields) {
    const candidateFileFields = allFileFields.filter(f => !isImageOnlyAccept(f.constraints?.accept || f.element?.getAttribute?.('accept') || ''));
    return candidateFileFields[0] === field;
  }
  return true;
}
const parserHosts = new Set(['ashby', 'lever', 'workday', 'greenhouse']);
const BUSY = '[aria-busy="true"], [role="progressbar"], .resume-upload-working, ' +
  '.ashby-application-form-autofill-input-root:is([data-state="loading"], [data-state="uploading"], [data-state="parsing"], [data-state="processing"])';

function visible(element) {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  for (let node = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function parserBusy(doc, uploadElement) {
  // A page may keep unrelated live regions busy. Only the upload's widget
  // describes its processing state; standalone waits retain document scope.
  const scope = uploadElement?.closest('.ashby-application-form-autofill-input-root,.ashby-application-form-input-file,.field,.form-group,[data-fkit-id],.resume-input,.upload,.file-upload') || uploadElement?.parentElement || doc;
  if (detectAdapter().uploadBusy?.(doc)) return true;
  return [...(scope.matches?.(`${BUSY}, [role="status"]`) ? [scope] : []), ...scope.querySelectorAll(`${BUSY}, [role="status"]`)]
    .some(el => !el.closest(`#${UI_IDS.CONTAINER}`) && visible(el) &&
      (el.matches(BUSY) || /\b(parsing|processing|uploading|analyzing)\b/i.test(el.textContent)));
}

// Poll properties as well as DOM structure: React and server parsers can replace
// controls or set .value without a mutation event. Never log applicant values.
function formState(doc) {
  return Array.from(doc.querySelectorAll('input:not([type="file"]), textarea, select, button[aria-pressed]'))
    .filter(el => !el.closest(`#${UI_IDS.CONTAINER}`))
    .map(el => [el, JSON.stringify([el.value, el.checked, el.disabled, el.getAttribute('aria-pressed')])]);
}

export async function waitForResumeParsing({ doc = document, isCurrent = () => true,
  minimumMs = 3000, quietMs = 1000, timeoutMs = 15000, pollMs = 100, uploadElement = null } = {}) {
  if (!parserHosts.has(detectAdapter().id)) return;
  const started = Date.now();
  const url = doc.location.href;
  let previous = formState(doc), stableSince = started, busy = false, awaitingAcceptance = false;
  logger.info('Waiting for resume parsing and stable application fields.');
  while (Date.now() - started < timeoutMs) {
    if (!isCurrent() || doc.location.href !== url) throw new Error('Resume processing wait cancelled because the run or page changed.');
    const next = formState(doc);
    const changed = next.length !== previous.length || next.some(([el, value], i) => el !== previous[i]?.[0] || value !== previous[i]?.[1]);
    const adapter = detectAdapter();
    const upload = uploadElement && adapter.uploadState?.(uploadElement);
    // Workday clears FileList before its upload item appears. Other adapters'
    // unconfirmed filenames do not establish that a parser is running.
    awaitingAcceptance = Boolean(adapter.id === 'workday' && upload?.accepted === false);
    busy = parserBusy(doc, uploadElement) || Boolean(upload?.busy) || awaitingAcceptance;
    if (changed || busy) stableSince = Date.now();
    previous = next;
    if (!busy && Date.now() - started >= minimumMs && Date.now() - stableSince >= quietMs) {
      logger.info('Resume processing settled; rescanning application fields.');
      return;
    }
    await delay(pollMs);
  }
  const cause = awaitingAcceptance ? 'Workday has not confirmed the resume attachment.' : busy ? 'The resume upload widget still reports processing.' : 'Application fields kept changing after the upload.';
  throw new Error(`Resume wait timed out after ${timeoutMs / 1000}s. ${cause} Resume Autofill retries the current page.`);
}

export async function uploadResumeAndWait(field, options) {
  const filled = await fillField(field, '');
  if (filled) await waitForResumeParsing({ ...options, uploadElement:field.element });
  return filled;
}
