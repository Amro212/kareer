import { accessibleRoots, isKareerElement, FORM_CONTROLS } from './domRoots.js';
import { JOB_HEADINGS } from './jobDetection.js';

const SIGNALS = `${JOB_HEADINGS},${FORM_CONTROLS},button,[role="button"],title,label,form,main,iframe,script[type="application/ld+json"],.job__location,.job-location,.job-description,.job__description,[data-testid="job-location"],.ashby-job-posting-left-pane`;

/** Observe the same accessible roots used by eligibility; no page API patching. */
export function observeJobPage(doc, changed) {
  const observed = new Set();
  const observer = new doc.defaultView.MutationObserver(mutations => {
    const addedRoot = discover();
    const relevant = mutations.some(mutation => {
      const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
      if (isKareerElement(element)) return false;
      if (mutation.type === 'attributes') return true;
      if (element?.closest(SIGNALS)) return true;
      return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 && !isKareerElement(node) &&
        (node.matches(SIGNALS) || node.shadowRoot || node.querySelector(SIGNALS)));
    });
    if (addedRoot || relevant) changed();
  });
  function discover() {
    let added = false;
    const roots = [];
    const visit = current => {
      for (const root of accessibleRoots(current)) {
        roots.push(root);
        for (const frame of root.querySelectorAll('iframe')) {
          try { if (frame.contentDocument?.documentElement && !isKareerElement(frame)) visit(frame.contentDocument); } catch { /* Host handles cross-origin frames. */ }
        }
      }
    };
    visit(doc);
    // Detached roots must not retain observers or influence current eligibility.
    if ([...observed].some(root => !roots.includes(root))) { observer.disconnect(); observed.clear(); }
    for (const root of roots) {
      if (observed.has(root)) continue;
      observed.add(root);
      observer.observe(root.nodeType === 9 ? root.documentElement : root, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['hidden','aria-hidden','aria-label','aria-labelledby','label','autocomplete','name','id','type','role','src','class','style'],
      });
      added = true;
    }
    return added;
  }
  discover();
  const loaded = event => {
    if (event.target?.matches?.('iframe')) { discover(); changed(); }
  };
  doc.addEventListener('load', loaded, true);
  // An existing custom host can attach a root without a document mutation.
  // Probe only during initial hydration; later host insertions discover directly.
  let probes = 0;
  const timer = setInterval(() => {
    if (discover()) changed();
    if (++probes === 5) clearInterval(timer);
  }, 1000);
  return { disconnect() { clearInterval(timer); doc.removeEventListener('load', loaded, true); observer.disconnect(); observed.clear(); } };
}
