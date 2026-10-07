import { scanFormFields, harvestComboboxOptions, deduplicateFields, refreshField } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { uploadResumeAndWait, isResumeField } from './resume.js';
import { verifyField } from './fields/verify.js';
import { scrollToField, highlightActiveField, highlightVerifiedField, highlightFailedField } from './fields/highlight.js';
import { inspectValidation } from './validation.js';
import { captureFixture } from './capture.js';
import { classifyPage } from './pageClassifier.js';
import { FILL_STATUS } from './constants.js';
import { logger } from './debug.js';
import { detectAdapter } from './adapters/index.js';
import { getProfile } from './storage.js';
import { inspectContinue, inspectSubmit, observePage, isDisabled } from './navigation.js';

/**
 * Field agent for a document the panel cannot reach through the DOM, i.e. a
 * cross-origin iframe. It performs the same observe -> locate -> scroll -> act ->
 * verify steps as the panel, but decides nothing: the top frame owns the AI
 * request and sends answers back.
 */
export function createFieldAgent() {
  let cache = new Map();
  let generation = 0;

  function unfilled(field, overwrite = false) {
    const adapterNeeds = detectAdapter().needsFill?.(field, getProfile());
    if (adapterNeeds != null) return adapterNeeds;
    if (overwrite) return true;
    if (field.hasExistingValue) return false;
    const value = field.currentValue;
    return !value || value === 'false' || value === '0' || String(value).trim().length === 0;
  }

  function resolveLive(field) {
    return refreshField(field);
  }

  async function scan({ overwriteExisting = false } = {}) {
    const token=generation, isCurrent=()=>token===generation;
    const page = classifyPage();
    if (['confirmation','captcha'].includes(page.type)) { cache.clear(); return {fields:[],pageType:page.type,reason:page.reason}; }
    if (page.type === 'application') await detectAdapter().prepareSections?.(document, getProfile(),{isCurrent});
    if (page.type === 'application') await detectAdapter().prepareFields?.(document, getProfile(), { overwrite: overwriteExisting,isCurrent });
    if (!isCurrent()) return {error:'Frame operation cancelled.'};
    const scanned = scanFormFields(document);
    cache = new Map(scanned.map((field) => [field.id, field]));

    const targets = scanned.filter((field) => field.type !== 'file' && unfilled(field, overwriteExisting));
    if (!targets.length) return { fields: [], pageType: page.type };

    await harvestComboboxOptions(targets);
    return {
      fields: normalizeFieldsForAI(targets, { overwriteExisting }),
      pageType: page.type,
    };
  }

  async function searchOptions({ queries = [] } = {}) {
    const wanted = new Map(queries.map((query) => [query.fieldId, query.searchQuery]));
    const fields = [...cache.values()].filter((field) => field.type === 'combobox' && wanted.has(field.id));
    if (!fields.length) return { fields: [] };

    await harvestComboboxOptions(fields, wanted);
    const discovered = fields.filter((field) => field.options.length);
    return { fields: normalizeFieldsForAI(discovered) };
  }

  async function fill({ answers = [] } = {}) {
    const results = [];
    const token=generation;

    for (const answer of answers) {
      if (token!==generation) return {error:'Frame fill cancelled.',results};
      if (['confirmation','captcha'].includes(classifyPage().type)) return {error:classifyPage().reason,results};
      const field = cache.get(answer.fieldId);
      if (!field) {
        results.push({ fieldId: answer.fieldId, status: FILL_STATUS.FAILED, error: 'Field no longer present in frame' });
        continue;
      }

      if (answer.value === '' || answer.value === null || answer.value === undefined) {
        results.push({
          fieldId: answer.fieldId,
          status: field.required ? FILL_STATUS.FAILED : FILL_STATUS.SKIPPED,
          value: field.currentValue || '',
          ...(field.required ? { error: 'Required field left empty by AI' } : {}),
        });
        continue;
      }

      try {
        field.element = resolveLive(field);
        scrollToField(field.element);
        highlightActiveField(field.element);

        const didFill = await fillField(field, answer.value);
        await new Promise((resolve) => setTimeout(resolve, field.type === 'combobox' ? 250 : 80));

        field.element = resolveLive(field);
        const verification = didFill
          ? await verifyField(field, answer.value)
          : { verified: false, actualValue: '', error: 'No exact option was selected or the field rejected the value' };

        if (verification.verified) {
          highlightVerifiedField(field.element);
          results.push({
            fieldId: answer.fieldId,
            status: answer.provenance === 'guessed' ? FILL_STATUS.GUESSED : answer.inferred ? FILL_STATUS.INFERRED : FILL_STATUS.VERIFIED,
            provenance: answer.provenance || (answer.inferred ? 'inferred' : 'saved'),
            value: verification.actualValue || answer.value,
            inferred: Boolean(answer.inferred),
            source: answer.source || (answer.inferred ? 'ai' : 'profile'),
            label: field.label,
          });

        } else {
          highlightFailedField(field.element);
          results.push({
            fieldId: answer.fieldId,
            status: FILL_STATUS.FAILED,
            value: verification.actualValue || '',
            error: verification.error || 'Value did not stick in DOM',
            label: field.label,
          });
        }
      } catch (err) {
        logger.error(`Frame agent failed on "${field.label}":`, err);
        results.push({ fieldId: answer.fieldId, status: FILL_STATUS.FAILED, error: err?.message || 'Fill failed', label: field.label });
      }
    }

    return { results };
  }

  async function uploadResume({ overwriteExisting = false } = {}) {
    const token=generation;
    if (['confirmation','captcha'].includes(classifyPage().type)) return {error:classifyPage().reason};
    const allFileFields = scanFormFields(document).filter((field) => field.type === 'file');
    deduplicateFields(allFileFields);
    const fields = allFileFields.filter((field) => isResumeField(field, allFileFields));
    const results = [];
    for (const field of fields) {
      field.element = field.element?.isConnected ? field.element : (scanFormFields(document).find(f => f.id === field.id)?.element || field.element);
      if (!overwriteExisting && !unfilled(field)) continue;
      cache.set(field.id, field);
      const didFill = await uploadResumeAndWait(field,{isCurrent:()=>token===generation});
      field.element = field.element?.isConnected ? field.element : (scanFormFields(document).find(f => f.id === field.id)?.element || field.element);
      const verification = didFill ? await verifyField(field, '') : { verified: false, actualValue: '', error: 'No stored resume' };
      results.push({
        fieldId: field.id,
        status: verification.verified ? FILL_STATUS.VERIFIED : FILL_STATUS.FAILED,
        value: verification.actualValue || '',
        error: verification.error,
        label: field.label,
      });
    }
    return { results };
  }

  async function validation() {
    const fields = cache.size ? [...cache.values()] : scanFormFields(document);
    return {
      errors: inspectValidation(fields).map((error) => ({ ...error, frameUrl: window.location.href })),
    };
  }

  async function locate({ fieldId } = {}) {
    const field = cache.get(fieldId) || scanFormFields(document).find((f) => f.id === fieldId);
    if (!field) return { error: 'Field not found in frame' };
    field.element = resolveLive(field);
    if (field.element) {
      scrollToField(field.element);
      highlightActiveField(field.element);
      return { ok: true };
    }
    return { error: 'Field element not found' };
  }

  async function inspect() {
    const scanned = scanFormFields(document);
    deduplicateFields(scanned);
    cache = new Map(scanned.map((field) => [field.id, field]));
    return {
      fields: scanned.map((field) => ({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
        currentValue: field.currentValue || '',
        ats: field.ats,
      })),
    };
  }

  function stepState() {
    const page = classifyPage();
    const fields = scanFormFields(document);
    const next = inspectContinue(), submit = inspectSubmit();
    const observation=observePage(fields);
    return {pageType:page.type,reason:page.reason,url:location.href,adapter:detectAdapter().id,
      signature:JSON.stringify(observation),observation,fieldCount:fields.length,canContinue:Boolean(next.control && !isDisabled(next.control)),
      canSubmit:Boolean(submit.control && !isDisabled(submit.control)),errors:inspectValidation(fields),
      fields:normalizeFieldsForAI(fields),uploads:fields.filter(field => field.type === 'file').map(field => ({fieldId:field.id,required:field.required,currentValue:field.currentValue,label:field.label}))};
  }

  function navigate(command) {
    const state = stepState();
    if (!command.expectedSignature || command.expectedSignature !== state.signature) return {error:'Frame step changed. Inspect before continuing.'};
    if (!['application','review'].includes(state.pageType)) return {error:state.reason};
    if (state.errors.length) return {error:'Embedded validation needs manual input.',errors:state.errors};
    const control = command.action === 'submit' ? inspectSubmit().control : inspectContinue().control;
    if (!control || isDisabled(control)) return {error:'No unambiguous enabled application control.'};
    if (command.action === 'submit' && state.canContinue) return {error:'Continue the application before submitting.'};
    control.click();
    return {ok:true};
  }

  async function handle(command) {
    if (command?.expectedSignature && command.expectedSignature !== stepState().signature) return {error:'Frame step changed. Inspect before continuing.'};
    switch (command?.action) {
      case 'cancel': generation++;return {ok:true};
      case 'scan': return scan(command);
      case 'inspect': return inspect();
      case 'searchOptions': return searchOptions(command);
      case 'fill': return fill(command);
      case 'locate': return locate(command);
      case 'uploadResume': return uploadResume(command);
      case 'validation': return validation();
      case 'stepState': return stepState();
      case 'continue': case 'submit': return navigate(command);
      // An embedded frame captures its own document; the parent cannot read it.
      case 'captureFixture': return captureFixture(document, { label: command.label || '' });
      case 'ping': return { ok: true, url: window.location.href, fieldCount: scanFormFields(document).length };
      default: return { error: `Unknown agent action "${command?.action}"` };
    }
  }

  return { handle, get fieldCount() { return cache.size; } };
}
