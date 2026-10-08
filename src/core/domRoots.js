import { UI_IDS } from './constants.js';

export const FORM_CONTROLS = 'input,textarea,select,[contenteditable="true"],[role="combobox"],.select2-container,button[aria-haspopup="listbox"],spl-input,spl-textarea,spl-checkbox,spl-autocomplete,spl-phone-field,spl-dropzone';

export function isKareerElement(element) {
  for (let node = element; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (node.id === UI_IDS.CONTAINER || node.id === UI_IDS.INLINE_REWRITE) return true;
  }
  return false;
}

/** Only open roots are accessible. Never inspect Kareer's own panel. */
export function accessibleRoots(root) {
  const roots = [];
  const visit = current => {
    roots.push(current);
    for (const element of current.querySelectorAll('*')) {
      if (element.shadowRoot && !isKareerElement(element)) visit(element.shadowRoot);
    }
  };
  if (root) visit(root);
  return roots;
}
