import { platform } from './platform.js';
import { materialFormat, materialText } from './materials-model.js';
import { isResumeField, uploadResumeAndWait } from './resume.js';
import { fillField, fillFileInput } from './fields/fillers.js';
import { verifyField } from './fields/verify.js';
import { scanFormFields } from './fields/scanner.js';

export function materialKind(field, allFiles = []) {
  if (field.ats?.canonicalKey === 'coverLetter' || /\bcover[\s-]*letter\b/i.test([field.label, field.name, field.id].filter(Boolean).join(' '))) return ['file', 'textarea', 'text', 'contenteditable'].includes(field.type) ? 'coverLetter' : null;
  return field.type === 'file' && isResumeField(field, allFiles) ? 'resume' : null;
}

export async function snapshotMaterials(session, options = {}) {
  if (!session?.id || !platform.capabilities.materials) return {};
  const current = await platform.materials.request('snapshot', { sessionId: session.id, ...options });
  session.materialRefs = current.refs;
  session.materialTasks = current.tasks;
  session.materialRunRef = current.runRef;
  return current.records;
}

export async function applyGeneratedMaterials(fields, snapshot, { isCurrent = () => true } = {}) {
  const results = [], files = fields.filter(f => f.type === 'file');
  for (const original of fields) {
    if (!isCurrent()) break;
    const kind = materialKind(original, files), record = snapshot[kind];
    if (!kind || !record) continue;
    let field = original;
    if (field.element && !field.element.isConnected) field = scanFormFields().find(f => f.id === original.id) || original;
    if (field.element?.disabled || field.element?.readOnly) continue;
    try {
      if (record.error) throw new Error(record.error);
      let value, verification;
      if (field.type === 'file') {
        const file = record.files[materialFormat(field.element.getAttribute('accept') || '')];
        const max = Number(field.element.getAttribute('data-max-size') || field.element.getAttribute('data-max-file-size'));
        if (max > 0 && file.size > max) throw new Error(`Document exceeds this upload's size limit. Download a smaller version and attach it manually.`);
        value = file.name;
        verification = await verifyField(field, value);
        if (!verification.verified) {
          const filled = kind === 'resume' ? await uploadResumeAndWait(field, { isCurrent, document: file }) : await fillFileInput(field.element, file);
          if (!isCurrent()) break;
          const live = scanFormFields().find(f => f.id === field.id);
          if (live) field = live;
          verification = filled ? await verifyField(field, value) : { verified: false, error: 'Application did not accept the selected document. Attach it manually.' };
        }
      } else {
        value = materialText(record.model);
        if (String(field.element.value ?? field.element.textContent).trim() !== value.trim()) await fillField(field, value);
        verification = await verifyField(field, value);
      }
      results.push({ fieldId: field.id, label: field.label, status: verification.verified ? 'verified' : 'failed', value: verification.actualValue || value,
        error: verification.error || '', source: 'material', materialRevision: record.revision });
    } catch (error) { results.push({ fieldId: field.id, label: field.label, status: 'failed', value: '', error: error.message, source: 'material' }); }
  }
  return results;
}
