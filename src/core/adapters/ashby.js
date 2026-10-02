/**
 * Ashby: custom selects without always exposing ARIA, plus dynamic sections
 * that appear after a radio choice. Detection is hostname + distinctive markup.
 */
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const ashbyAdapter = {
  id: 'ashby',
  label: 'Ashby',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)ashbyhq\.com$/i.test(host)) return true;
    return Boolean(doc?.querySelector?.('#ashby_embed, [data-ashby-root], .ashby-application-form, .ashby-select-input, .ashby-application-form-field-entry'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: false,
  },
  fieldMetadata(element) {
    const container = element?.closest?.('.ashby-application-form-field-entry, fieldset');
    const title = container?.querySelector('.ashby-application-form-question-title');
    if (!title) return null;
    return {
      id: container.getAttribute('data-field-path') || container.getAttribute('data-field-entry-id') || title.getAttribute('for') || element.id || element.name,
      label: title.textContent.trim(),
      description: container.querySelector('.ashby-application-form-question-description')?.textContent.trim() || '',
      required: Boolean(element.required || element.getAttribute('aria-required') === 'true' || /(?:^|\s)_required_/.test(title.className)),
    };
  },
  choiceGroups(root) {
    return Array.from(root.querySelectorAll('.ashby-application-form-input-yesno')).map(container => {
      const elements = Array.from(container.querySelectorAll('button[data-option]'));
      const field = {
        ...this.fieldMetadata(container), type: 'radio', widget: 'ashby-yesno', element: container, elements,
        options: elements.map(el => ({ value: el.textContent.trim(), label: el.textContent.trim() })),
        constraints: {}, isNarrative: false,
      };
      field.currentValue = this.readChoice(field).join(', ');
      return field;
    }).filter(field => field.id && field.options.length);
  },
  readChoice(field) {
    if (field.widget !== 'ashby-yesno') return null;
    return field.elements.filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.textContent.trim());
  },
  fillChoice(field, value, { click }) {
    if (field.widget !== 'ashby-yesno') return null;
    const target = field.elements.find(el => el.textContent.trim() === value && !el.disabled);
    if (!target) return false;
    click(target);
    return true;
  },
  isSectionHeading() {
    return false;
  },
  uploadState(element) {
    const root = element?.closest('.ashby-application-form-input-file');
    if (!root) return null;
    const busy = root.getAttribute('aria-busy') === 'true' ||
      /^(?:loading|uploading|processing|parsing)$/.test(root.getAttribute('data-state') || '') ||
      Boolean(root.querySelector('[role="progressbar"], [aria-busy="true"]'));
    const failed = Boolean(root.querySelector('[role="alert"], [aria-invalid="true"]'));
    const filename = root.querySelector('.ashby-application-form-input-file-filename, [class*="_fileName_"], [class*="_filename_"]');
    // Ashby clears FileList after persisting an upload. Its filename and Replace
    // control belong to this widget, not a neighboring cover-letter upload.
    const replace = Array.from(root.querySelectorAll('button')).some(button => /^replace$/i.test(button.textContent.trim()));
    const name = filename?.textContent.trim() || (replace ? root.textContent.match(/([^\n<>]+\.(?:pdf|docx?|odt|rtf|txt|md))\b/i)?.[1]?.trim() : '') || '';
    return { name, accepted: Boolean(name && replace && !busy && !failed), busy };
  },
  isCombobox(element) {
    return Boolean(element?.matches?.('.ashby-select-input, .ashby-application-form-input-autocomplete, [data-ashby-field]'));
  },
  comboboxToggle(element) {
    return element?.parentElement?.querySelector('button[class*="_toggleButton_"]') || null;
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element) return null;
    const root = element.closest('.ashby-select, .ashby-application-form-field-entry, fieldset') || element.parentElement;
    const menus = root ? Array.from(root.querySelectorAll('.ashby-select-menu, [role="listbox"]')) : [];
    return menus.length ? menus : null;
  },
  comboboxOptionSelector() {
    return '.ashby-select-option, [role="option"]';
  },
};
