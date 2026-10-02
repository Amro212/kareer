import { captureJob, safeUrl } from './jobs.js';
import { createSession, restoreSession, saveSession, bindTab, matchesSession } from './sessions.js';
import { classifyPage, isVisible } from './pageClassifier.js';
import { inspectValidation } from './validation.js';
import { findContinue, inspectContinue, inspectSubmit, pageSignature, isDisabled, observePage, comparePages, workflowLabel, questionIdentity } from './navigation.js';
import { rememberAnswer, recallAnswer } from './memory.js';
import { getSettings, getProfile, hasApiKey } from './storage.js';
import { scanFormFields as scanAllFields, harvestComboboxOptions } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { uploadResumeAndWait, isResumeField } from './resume.js';
import { verifyField } from './fields/verify.js';
import { generateAutofillAnswers } from './ai.js';
import { resolveComboboxSearchAnswers, resolveDiscoveredAnswers } from './autofill.js';
import { platform } from './platform.js';
import { detectAdapter } from './adapters/index.js';
import { logger } from './debug.js';
import { applyRemoteResumeUploads, embeddedApplicationStates, remoteFieldId } from './remote.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const scanPageFields = () => scanAllFields().filter(f => (isVisible(f.element) || f.type === 'file' && isVisible(f.element.parentElement)) && !f.element.closest('[role=listbox],.select__menu')).map(f => ({ ...f, label: workflowLabel(f) }));
const scanFormFields = () => scanPageFields().filter(f => !f.element.disabled && !f.element.readOnly);
const unfilled = field => field.hasExistingValue ? false : field.type === 'checkbox' && !field.widget ? !field.element.checked : !String(field.currentValue ?? '').trim();
const empty = field => detectAdapter().needsFill?.(field, getProfile()) ?? unfilled(field);
const shouldFill = field => detectAdapter().needsFill?.(field, getProfile()) ?? (getSettings().overwriteExisting || empty(field));
const runnable = new Set(['running', 'captcha', 'waiting', 'submitting']);

export function createApplicationEngine({ answer = generateAutofillAnswers, onChange = () => {}, settleMs = 180, transitionMs = 1200, navigationTimeoutMs = transitionMs === 0 ? 0 : 10000, submitCountdownMs = 5000 } = {}) {
  let session = null, busy = false, generation = 0, timer = null, observer = null, interval = null, cancelDelay = null, unsubscribeNavigation = null, disposed = false;
  const delay = ms => new Promise(resolve => {
    let t = null;
    cancelDelay = () => { clearTimeout(t); cancelDelay = null; resolve(); };
    t = setTimeout(() => { cancelDelay = null; resolve(); }, ms);
  });
  const results = new Map();
  let pendingJob = null;
  let lastEmission = '';
  let lastObservationLog = '';
  function updateJob(job) {
      if (disposed) return;
      pendingJob = job;
      if (!session || busy) return;
      pendingJob = null;
      if (JSON.stringify(session.job) === JSON.stringify(job)) return;
      // Preserve the listing description across form-only application steps.
      const previous = session.job;
      if (job.applicationStep && previous?.title) job = { ...job, title: previous.title };
      const samePage = Boolean(job.listingUrl && job.listingUrl === previous?.listingUrl || job.applicationUrl && job.applicationUrl === previous?.applicationUrl);
      const differentJob = previous?.jobId && job.jobId && previous.jobId !== job.jobId || samePage && previous?.title && job.title && previous.title !== job.title;
      if (differentJob || !matchesSession(session, window.location.href)) {
        session = createSession(job);
        results.clear();
        emit();
        return;
      }
      const hasLocation = Boolean(job.location || job.workCountries?.length);
      session.job = samePage && !job.applicationStep ? job : { ...job,
        title: previous?.title || job.title,
        company: job.company || previous?.company,
        location: job.location || previous?.location,
        workCountries: hasLocation ? job.workCountries : previous?.workCountries,
        workCountry: hasLocation ? job.workCountry : previous?.workCountry,
        locationAmbiguous: hasLocation ? job.locationAmbiguous : previous?.locationAmbiguous,
        description: previous?.description || job.description,
      };
      saveSession(session);
      emit();
  }
  function compatibleSession() {
    if (session.identityVersion === 2) return true;
    status('paused', 'Step tracking was updated. Reload this job page to start a compatible session.');
    return false;
  }
  function completeStep() {
    session.currentUrl = window.location.href;
    const step = session.steps[session.currentStep];
    if (step && !step.completed) {
      step.completed = true;
      session.completedSteps++;
      session.pendingStep = '';
      session.pendingUrl = '';
    }
    saveSession(session);
  }
  function checkPage(snapshot, token, stage, fieldId) {
    if (!guard(token)) return false;
    const current = observePage(scanPageFields());
    const change = comparePages(snapshot, current);
    const detail = {
      stage, fieldId, change, urlChanged: snapshot.url !== current.url,
      markerChanged: snapshot.marker !== current.marker, headingChanged: snapshot.heading !== current.heading,
      beforeFields: snapshot.fields.length, afterFields: current.fields.length,
      added: current.fields.filter(f => !snapshot.fields.some(old => old.id === f.id)).map(f => f.id),
      removed: snapshot.fields.filter(f => !current.fields.some(next => next.id === f.id)).map(f => f.id),
      questionsChanged: current.fields.filter(f => snapshot.fields.some(old => old.id === f.id && old.question !== f.question)).map(f => f.id),
      navigationClick: false,
    };
    const observationKey = JSON.stringify([snapshot, current]);
    if (JSON.stringify(snapshot) !== JSON.stringify(current) && observationKey !== lastObservationLog) {
      lastObservationLog = observationKey;
      session.lastPageChange = detail;
      logger[change === 'same' ? 'info' : 'warn'](`Workflow page observation changed: ${JSON.stringify(detail)}`);
    }
    if (change === 'same') return true;
    status('paused', stage === 'field action' && change === 'changed'
      ? 'Page changed while filling a field. Inspect the current step before resuming.'
      : `Page changed or became ambiguous during ${stage}. Inspect the current step before resuming.`);
    return false;
  }
  async function settleFields(snapshot, token, stage = 'form settling', fieldId) {
    const deadline = Date.now() + navigationTimeoutMs;
    let previous = '', stableSince = Date.now();
    do {
      if (!guard(token)) return false;
      const fields = scanPageFields();
      if (new Set(fields.map(f => f.id)).size !== fields.length) {
        status('paused', 'Ambiguous duplicate field IDs. Fill this page manually.');
        return false;
      }
      const change = comparePages(snapshot, observePage(fields));
      if (change === 'changed') return checkPage(snapshot, token, stage, fieldId);
      const state = JSON.stringify(fields.map(f => [f.id, questionIdentity(f), f.element.disabled, f.element.readOnly]));
      if (state !== previous) { previous = state; stableSince = Date.now(); }
      const loading = Array.from(document.querySelectorAll('[aria-busy="true"]')).some(isVisible);
      const questions = session.steps[session.currentStep]?.questions || {};
      if (fields.some(f => Object.hasOwn(questions, f.id) && questions[f.id] !== questionIdentity(f))) {
        checkPage(snapshot, token, stage, fieldId);
        if (!guard(token)) return false;
        status('paused', 'A question or its options changed. Inspect the page before resuming.');
        return false;
      }
      const disabled = fields.some(f => f.element.disabled &&
        (!snapshot.fields.find(old => old.id === f.id)?.disabled || Object.hasOwn(questions, f.id) && empty(f)));
      if (change === 'same' && !loading && !disabled && Date.now() - stableSince >= Math.min(settleMs, 200)) return checkPage(snapshot, token, stage, fieldId);
      if (Date.now() >= deadline) break;
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    } while (true);
    if (checkPage(snapshot, token, stage, fieldId)) status('paused', 'Form fields are still changing or disabled. Inspect the page before resuming.');
    return false;
  }
  function validation(fields = scanFormFields(), control = null) {
    const errors = inspectValidation(fields, control);
    for (const field of fields) {
      const result = results.get(field.id);
      if (result?.status === 'failed' && String(result.value) === String(field.currentValue) && !errors.some(e => e.fieldId === field.id)) {
        errors.push({ fieldId: field.id, message: result.error, kind: 'persistence' });
      }
    }
    return errors;
  }
  function emit() {
    if (disposed) return;
    const state = JSON.stringify([session, busy, [...results]]);
    if (state === lastEmission) return;
    lastEmission = state;
    onChange({ session, busy, results, classification: classifyPage() });
  }
  function status(value, reason) {
    if (session.status === value && session.reason === reason) return;
    session.status = value;
    session.reason = reason;
    const stayActive = runnable.has(value) || (value === 'review' && getSettings().autoSubmit);
    if (!stayActive) session.active = false;
    saveSession(session);
    emit();
  }
  function guard(token) {
    if (token !== generation || !session?.active) return false;
    const page = classifyPage();
    if (['captcha', 'review', 'confirmation'].includes(page.type)) {
      status(page.type, page.reason);
      return false;
    }
    return true;
  }
  /**
   * `navBaseline` must be sampled before the Continue click, because a same-document
   * navigation can commit synchronously during click() and would otherwise already
   * be included by the time this function starts.
   */
  async function waitForNavigation(signature, token, afterClick, navBaseline = platform.navigation.marker().id) {
    const extra = (!afterClick && navigationTimeoutMs !== 0) ? (detectAdapter().quirks.continueReadyTimeoutMs || 0) : 0;
    const deadline = Date.now() + Math.max(navigationTimeoutMs, extra);
    let lastSignature = '', stableSince = Date.now();
    const stableMs = Math.min(transitionMs, 200);
    status('running', afterClick ? 'Waiting for the next page to finish loading.' : 'Waiting for the page Continue button to become ready.');
    logger.info(`Navigation wait: ${afterClick ? 'after click' : 'button readiness'}, timeout=${navigationTimeoutMs}ms`);
    do {
      if (!guard(token)) {
        if (afterClick && token === generation && ['review', 'confirmation'].includes(session.status)) completeStep();
        return 'stopped';
      }
      const fields = scanFormFields();
      const current = observePage(scanPageFields());
      const state = JSON.stringify(current);
      if (state !== lastSignature) { lastSignature = state; stableSince = Date.now(); }
      const marker = platform.navigation.marker();
      const navigated = marker.id !== navBaseline;
      const change = comparePages(signature, current, afterClick);
      const busy = Array.from(document.querySelectorAll('[aria-busy="true"]')).some(isVisible);
      const control = findContinue();
      if (!busy && Date.now() - stableSince >= stableMs) {
        // A committed navigation is proof the step advanced, even when the new
        // page's structure resembles the old one closely enough to read as "same".
        if ((change === 'changed' || (afterClick && navigated)) && fields.length) {
          logger.info(`Navigation wait: next step ready, ${fields.length} fields${navigated ? `, navigation ${marker.kind} -> ${marker.url}` : ''}`);
          if (afterClick) completeStep();
          session.currentStep = '';
          return 'changed';
        }
        if (change === 'same' && !navigated) {
          if (inspectValidation(fields).length) return 'validation';
          if (!afterClick && control && !isDisabled(control)) return 'ready';
        }
      }
      if (Date.now() >= deadline) break;
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    } while (true);
    logger.warn(`Navigation wait timed out: buttonDisabled=${isDisabled(findContinue())}, path=${window.location.pathname}`);
    return 'timeout';
  }
  function pauseDisabledButton() {
    status('paused', `The page's Continue button stayed disabled after waiting ${navigationTimeoutMs / 1000}s. Auto Continue is still on; inspect the page before resuming.`);
  }
  async function applyResumeUploads(fields, token, signature) {
    const files = fields.filter(f => f.type === 'file' && isResumeField(f, fields));
    if (!platform.capabilities.fileUpload) return true;
    const meta = await platform.documents.meta();
    for (const original of files) {
      if (!await settleFields(signature, token, 'before field action', original.id)) return false;
      const field = scanFormFields().find(f => f.id === original.id && f.type === 'file');
      if (!field) continue;
      if (!empty(field) && !getSettings().overwriteExisting) continue;
      field.element.scrollIntoView?.({ block: 'center', behavior: 'instant' });
      const filled = await uploadResumeAndWait(field, { isCurrent: () => token === generation && Boolean(session?.active) });
      await delay(settleMs);
      if (!await settleFields(signature, token, 'field action', field.id)) return false;
      const live = scanFormFields().find(f => f.id === field.id);
      const verified = filled && live ? await verifyField(live, meta?.name) : { verified: false };
      results.set(field.id, {
        status: verified.verified ? 'verified' : 'failed',
        value: verified.actualValue || '',
        inferred: false,
        source: 'profile',
        error: verified.verified ? '' : (verified.error || 'Resume was not attached.'),
      });

      emit();
    }
    const remote = await applyRemoteResumeUploads({ overwriteExisting: getSettings().overwriteExisting });
    for (const entry of remote) results.set(entry.fieldId, entry);
    return true;
  }

  function canAutoSubmit(fields) {
    if (!getSettings().autoSubmit) return false;
    const page = classifyPage();
    if (!['application', 'review'].includes(page.type)) return false;
    const continueControl = findContinue();
    const submit = inspectSubmit();
    if (!submit.control || isDisabled(submit.control) || submit.count !== 1) return false;
    if (continueControl && continueControl !== submit.control && !isDisabled(continueControl)) return false;
    if (inspectValidation(fields).length) return false;
    if (fields.some(f => f.required && empty(f))) return false;
    if ([...results.values()].some(result => result.status === 'failed')) return false;
    return true;
  }

  async function attemptAutoSubmit(token, step) {
    const fields = scanFormFields();
    if (!canAutoSubmit(fields)) return false;
    if ((step?.submits || 0) >= 1 || (session.submits || 0) >= 1) {
      status('paused', 'Auto Submit already attempted this step. Submit manually.');
      return true;
    }
    const seconds = Math.max(0, Math.ceil(submitCountdownMs / 1000));
    for (let left = seconds; left > 0; left--) {
      if (token !== generation || !session?.active) return true;
      status('submitting', `Submitting in ${left}s. Click Pause to cancel.`);
      await delay(1000);
    }
    if (token !== generation || !session?.active) return true;
    const submit = inspectSubmit();
    if (!submit.control || isDisabled(submit.control) || !canAutoSubmit(scanFormFields())) {
      status('paused', submit.reason || 'Submit is no longer safe. Submit manually.');
      return true;
    }
    if (step) step.submits = (step.submits || 0) + 1;
    session.submits = (session.submits || 0) + 1;
    status('submitting', 'Submitting application.');
    logger.info(`Auto Submit: ${submit.control.textContent?.trim() || submit.control.value || 'Submit'}`);
    submit.control.click();
    const deadline = Date.now() + Math.max(navigationTimeoutMs, 2500);
    do {
      if (token !== generation) return true;
      const next = classifyPage();
      if (next.type === 'confirmation') {
        completeStep();
        status('confirmation', next.reason);
        return true;
      }
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    } while (Date.now() < deadline);
    status('paused', 'Submit did not reach a confirmation page. Check the result, then continue manually.');
    return true;
  }
  async function applyAnswers(fields, answers, token, signature) {
    const byId = new Map(answers.map(a => [a.fieldId, a]));
    for (const original of fields) {
      if (!checkPage(signature, token, 'before field action', original.id)) return false;
      const currentFields = scanFormFields();
      const field = currentFields.find(f => f.id === original.id && f.label === original.label && f.type === original.type);
      const entry = byId.get(original.id);
      if (!entry || entry.value === '' || entry.value == null) {
        if (original.required && entry && entry.value === '') {
          results.set(original.id, {
            status: 'failed',
            provenance: entry.provenance || 'unresolved',
            value: '',
            inferred: Boolean(entry.inferred),
            source: entry.source || 'profile',
            error: 'No matching option found for required field.',
          });
          emit();
        }
        continue;
      }
      const replacement = currentFields.find(f => f.id === original.id);
      const question = session.steps[session.currentStep]?.questions[original.id];
      if (replacement && (!field || question && question !== questionIdentity(replacement))) {
        status('paused', 'A question or its options changed. Inspect the page before resuming.');
        return false;
      }
      if (!field) continue; // A conditional question can disappear on this step.
      if (field.type === 'file') continue;
      field.options = original.options;
      field.element.scrollIntoView?.({ block: 'center', behavior: 'instant' });
      logger.info(`Field action [${entry.source === 'ai' ? 'AI' : entry.source === 'saved' ? 'Saved' : 'Profile'}]: id=${field.id}, label="${field.label}"`);
      const filled = await fillField(field, entry.value);
      if (!await settleFields(signature, token, 'field action', field.id)) return false;
      const live = scanFormFields().find(f => f.id === field.id && f.label === field.label);
      const verified = filled && live ? await verifyField(live, entry.value) : { verified: false };
      // Phase 2's generic verifier only checks non-empty values. Workflow requires exact persistence.
      let exact = Boolean(field.ats?.adapter) || !['text', 'textarea', 'email', 'tel', 'url', 'number', 'contenteditable'].includes(field.type) || String(verified.actualValue ?? '').trim() === String(entry.value).trim();
      if (['select', 'radio'].includes(field.type) && !field.widget) exact = field.options.some(o => (String(o.value) === String(entry.value) || o.label === String(entry.value)) && String(o.value) === String(verified.actualValue));
      const valid = verified.verified && exact && !inspectValidation([live]).some(error => error.fieldId === live.id);
      results.set(field.id, {
        status: valid ? entry.provenance === 'guessed' ? 'guessed' : entry.inferred ? 'inferred' : 'verified' : 'failed',
        provenance: entry.provenance || (entry.inferred ? 'inferred' : 'saved'),
        value: verified.actualValue ?? '',
        inferred: Boolean(entry.inferred),
        source: entry.source || (entry.inferred ? 'ai' : 'profile'),
        error: valid ? '' : 'Value rejected or failed verification.',
      });

      if (valid) rememberAnswer(session, field, entry);
      saveSession(session);
      emit();
    }
    return true;
  }
  async function request(fields, context, token, signature) {
    if (!guard(token)) return [];
    if (session?.job?.pendingHydration) await session.job.pendingHydration;
    await harvestComboboxOptions(fields);
    if (!await settleFields(signature, token, 'option harvesting')) return [];
    let response = await answer(normalizeFieldsForAI(fields), { jobContext: session.job, ...context });
    if (!await settleFields(signature, token, 'AI response')) return [];
    if (response.answers.some(a => a.searchQuery)) response = await resolveComboboxSearchAnswers(fields, response);
    if (!await settleFields(signature, token, 'option search')) return [];
    return response.answers;
  }
  async function repair(errors, step, token, signature) {
    const blocked=errors.every(error=>{
      const field=scanFormFields().find(field=>field.id===error.fieldId);
      return field?.type==='file' || field?.ats?.canonicalKey && step.answers[field.id]?.value==='';
    });
    if (blocked) {status('paused','Required saved values or documents are unavailable. Review the highlighted questions before resuming.');return false;}
    if (answer === generateAutofillAnswers && !hasApiKey()) {status('paused','Required answers or documents need manual input. Add saved answers or an API key before resuming.');return false;}
    if (step.repairs >= 2) { status('paused', 'Repair limit reached (2/2). Review errors and resume manually.'); return false; }
    step.repairs++;
    session.errors.push(...errors.map(error => ({ ...error, attempt: step.repairs, url: window.location.href, at: new Date().toISOString() })));
    session.errors = session.errors.slice(-100);
    status('running', `Repair ${step.repairs}/2: ${errors.map(e => e.message).join(' ').slice(0, 250)}`);
    const targets = scanFormFields().filter(f => errors.some(e => e.fieldId === f.id));
    if (!targets.length) { status('paused', 'Validation needs manual input: ' + errors.map(e => e.message).join(' ').slice(0, 250)); return false; }
    const previous = targets.map(f => ({ fieldId: f.id, ...(step.answers[f.id] || recallAnswer(session, f) || {}) })).filter(a => a.value != null);
    if (!await applyAnswers(targets, previous, token, signature)) return false;
    let remaining = validation();
    if (remaining.some(e => e.fieldId)) {
      const rejected = scanFormFields().filter(f => remaining.some(e => e.fieldId === f.id));
      const repaired = await request(rejected, { repairErrors: remaining, allowSearch: false }, token, signature);
      for (const entry of repaired) step.answers[entry.fieldId] = entry;
      if (!await applyAnswers(rejected, repaired, token, signature)) return false;
      remaining = validation();
    } else if (errors.some(e => e.kind === 'semantic')) {
      // A server error can disappear on input even though the old semantic answer is still rejected.
      const repaired = await request(targets, { repairErrors: errors, allowSearch: false }, token, signature);
      for (const entry of repaired) step.answers[entry.fieldId] = entry;
      if (!await applyAnswers(targets, repaired, token, signature)) return false;
    }
    return guard(token);
  }

  async function embeddedWorkflow(token) {
    const hasTopApplicationForm = Boolean(detectAdapter().applicationRoot?.(document)) || ['workday', 'lever'].includes(detectAdapter().id);
    if (!platform.capabilities.crossFrame || hasTopApplicationForm || ['captcha','confirmation'].includes(classifyPage().type)) return false;
    const current = () => guard(token);
    const discover = async () => {
      const states = await embeddedApplicationStates();
      const candidates = states.filter(state => ['application','review','confirmation','captcha'].includes(state.pageType));
      if (candidates.length > 1) throw new Error('Application frame ownership is ambiguous. Inspect embedded forms.');
      return candidates[0];
    };
    let state = await discover();
    if (!state && !session.frameOwner) return false;
    if (!state) throw new Error('Application frame is unavailable. Wait for it to load before resuming.');
    for (let pass=0; pass<30 && current(); pass++) {
      if (!getSettings().autofillEnabled) {status('paused','Autofill is disabled in Settings.');return true;}
      if (['captcha','confirmation'].includes(state.pageType)) {
        if (state.pageType === 'confirmation') completeStep();
        status(state.pageType,state.reason);return true;
      }
      if (session.frameOwner && (session.frameOwner.adapter !== state.adapter || new URL(session.frameOwner.url).origin !== new URL(state.url).origin)) throw new Error('Application frame ownership changed. Inspect before resuming.');
      session.frameOwner = {frameId:state.frameId,adapter:state.adapter,url:state.url};
      const command = async (action, data={}) => {
        if (!current()) return null;
        const result = await platform.frames.command(state.frameId,{action,expectedSignature:state.signature,...data});
        if (result?.error) throw new Error(result.error);
        if (!result) throw new Error('Application frame did not respond.');
        return result;
      };
      const refresh = async () => {
        const next = await discover();
        if (!next || next.frameId !== state.frameId || next.url !== state.url || next.pageType !== state.pageType || next.observation && state.observation && comparePages(state.observation,next.observation) !== 'same') throw new Error('Application frame changed while filling. Inspect before resuming.');
        state=next;
      };
      const signature = `embedded:${state.adapter}:${state.signature}`;
      let step = session.steps[session.currentStep];
      if (!step || step.frameUrl !== state.url) {
        session.currentStep=signature;
        step=session.steps[signature] ||= {answers:{},questions:{},primary:false,lateRequests:0,clicks:0,frameUrl:state.url};
        results.clear();
        if (!session.history.some(entry=>entry.signature===signature)) session.history.push({url:state.url,signature,at:new Date().toISOString()});
      }
      if (platform.capabilities.fileUpload && !step.uploaded) {
        const uploaded=await command('uploadResume',{overwriteExisting:getSettings().overwriteExisting});
        if (!current()) return true;
        for (const entry of uploaded.results || []) results.set(remoteFieldId(state.frameId,entry.fieldId),entry);
        step.uploaded=true;
        await refresh();
      }
      // Agents own DOM and local recipes; only this frame generates answers.
      const scanned=await command('scan',{overwriteExisting:!step.primary && getSettings().overwriteExisting});
      if (!current()) return true;
      await refresh();
      const fields=(scanned.fields || []).map(field=>({...field,fieldId:remoteFieldId(state.frameId,field.fieldId)}));
      // Discovery and answer availability are separate: an unanswered known
      // question must not consume the budget for genuinely new conditional fields.
      const key=field=>field.fieldId.replace(/^jcf\d+::/, '');
      if (fields.some(field=>Object.hasOwn(step.questions,key(field)) && step.questions[key(field)]!==questionIdentity(field))) throw new Error('An embedded question changed. Inspect before resuming.');
      const retry=step.retryRequested;
      step.retryRequested=false;
      const missing=fields.filter(field=>!Object.hasOwn(step.questions,key(field)) || retry && (!step.answers[field.fieldId]?.value || results.get(field.fieldId)?.status==='failed'));
      if (missing.length) {
        if (step.primary && retry) {
          step.repairs=(step.repairs || 0)+1;
          if (step.repairs>2) throw new Error('Embedded repair limit reached. Review manually.');
        } else if (step.primary && step.lateRequests++ >= 2) throw new Error('Embedded dynamic field limit reached. Review manually.');
        status('running',`Resolving ${missing.length} embedded fields.`);
        for (const field of missing) step.questions[key(field)]=questionIdentity(field);
        const response=await answer(missing,{jobContext:session.job,...(retry?{repairErrors:state.errors,allowSearch:false}:{})});
        if (!current()) return true;
        await refresh();
        for (const entry of response.answers) step.answers[entry.fieldId]=entry;
        const searches=response.answers.filter(entry=>entry.searchQuery).map(entry=>({...entry,fieldId:entry.fieldId.replace(/^jcf\d+::/, '')}));
        if (searches.length) {
          const discovered=await command('searchOptions',{queries:searches});
          if (!current()) return true;
          await refresh();
          for (const entry of resolveDiscoveredAnswers((discovered.fields || []).map(field=>({...field,fieldId:remoteFieldId(state.frameId,field.fieldId)})), response.answers)) step.answers[entry.fieldId]=entry;
        }
      }
      step.primary=true;
      saveSession(session);
      const entries=fields.map(field=>step.answers[field.fieldId]).filter(Boolean);
      if (entries.length) {
        const filled=await command('fill',{answers:entries.map(entry=>({...entry,fieldId:entry.fieldId.replace(/^jcf\d+::/, '')}))});
        if (!current()) return true;
        for (const entry of filled.results || []) results.set(remoteFieldId(state.frameId,entry.fieldId),entry);
        await refresh();
        emit();
        // Conditional questions revealed by filling get their bounded late pass.
        const next=await command('scan');
        if (!current()) return true;
        await refresh();
        if (next.fields?.some(field=>!Object.hasOwn(step.questions,field.fieldId))) continue;
      }
      if (state.errors.length || [...results.values()].some(entry=>entry.status==='failed')) {
        status('paused',`Embedded application needs review: ${state.errors.map(error=>error.message).join(' ').slice(0,250) || 'A value or upload was rejected.'}`);return true;
      }
      let action;
      if (state.canContinue) {
        if (!getSettings().autoContinue && !step.forceContinue) {session.stepReview=true;status('paused','Page filled. Auto Continue is off.');return true;}
        step.forceContinue=false;
        if (step.clicks++>=3 || session.transitions++>=30) throw new Error('Embedded navigation limit reached. Continue manually.');
        action='continue';
      } else if (state.canSubmit && getSettings().autoSubmit) {
        if (session.submits) throw new Error('Auto Submit already attempted. Check the result manually.');
        for (let left=Math.ceil(submitCountdownMs/1000);left>0;left--) {
          if (!current()) return true;
          status('submitting',`Submitting in ${left}s. Click Pause to cancel.`);
          if (!current()) return true;
          await delay(1000);
        }
        if (!current()) return true;
        await refresh();
        if (!state.canSubmit || state.canContinue || state.errors.length) throw new Error('Embedded validation changed during countdown. Review manually.');
        session.submits=1;step.submits=1;action='submit';
      } else {status('paused','Embedded page filled. Review the application before proceeding.');return true;}
      status(action==='submit'?'submitting':'running',action==='submit'?'Submitting application.':'Continuing embedded application.');
      saveSession(session);
      const before=state;
      await command(action);
      const deadline=Date.now()+navigationTimeoutMs;
      let next;
      do {
        if (!current()) return true;
        next=await discover();
        if (next && (next.pageType!==before.pageType || next.url!==before.url || next.signature!==before.signature || next.frameId!==before.frameId)) break;
        if (next?.errors.length) throw new Error('Embedded navigation rejected by validation. Review manually.');
        await delay(Math.min(100,Math.max(1,deadline-Date.now())));
      } while (Date.now()<deadline);
      if (!next || next.signature===before.signature && next.pageType===before.pageType && next.url===before.url) throw new Error('Embedded navigation did not reach a new step. Check manually.');
      completeStep();session.currentStep='';state=next;
    }
    if (current()) status('paused','Embedded workflow limit reached. Continue manually.');
    return true;
  }
  async function tick() {
    if (busy || !session?.active) return;
    if (session.status === 'review' && getSettings().autoSubmit) {
      if (!compatibleSession()) return;
      busy = true;
      const token = generation;
      try {
        await attemptAutoSubmit(token, session.steps[session.currentStep]);
      } catch (error) {
        if (token === generation && session) status('paused', `Workflow stopped: ${error.message}`);
      } finally {
        busy = false;
        if (session?.status === 'review') session.active = false;
        emit();
      }
      return;
    }
    if (!runnable.has(session.status)) return;
    if (!compatibleSession()) return;
    busy = true;
    const token = generation;
    try {
      if (await embeddedWorkflow(token)) return;
      for (let pass = 0; pass < 40; pass++) {
        if (!guard(token)) {
          if (token === generation && session.status === 'review' && getSettings().autoSubmit) {
            await attemptAutoSubmit(token, session.steps[session.currentStep]);
          }
          return;
        }
        if (!getSettings().autofillEnabled) { status('paused', 'AI Autofill is disabled in Settings.'); return; }
        const page = classifyPage();
        if (page.type !== 'application') { status('paused', page.reason); return; }
        const fields = scanFormFields();
        let signature = observePage(scanPageFields());
        if (new Set(fields.map(f => f.id)).size !== fields.length) { status('paused', 'Ambiguous duplicate field IDs. Fill this page manually.'); return; }
        session.currentUrl = window.location.href;
        session.pendingUrl = '';
        let step = session.steps[session.currentStep];
        if (!step || comparePages(step.observation, signature) !== 'same') {
          session.currentStep = pageSignature(scanPageFields());
          step = session.steps[session.currentStep];
          // A shared page heading must not reuse answers or retry state from another form.
          if (step && comparePages(step.observation, signature) !== 'same') {
            session.currentStep += JSON.stringify(signature.fields.map(f => [f.id, f.question]));
            step = session.steps[session.currentStep];
          }
        }
        if (!step) {
          results.clear();
          step = session.steps[session.currentStep] = { primary: false, answers: {}, questions: {}, lateRequests: 0, repairs: 0, clicks: 0, observation: signature };
          session.history.push({ url: window.location.href, signature: session.currentStep, at: new Date().toISOString() });
        }
        step.observation = signature;
        status('running', `Application step ${session.history.length}. Repair attempts ${step.repairs}/2.`);
        if (!step.primary) {
          for (const field of fields) {
            const question = questionIdentity(field);
            if (step.questions[field.id] && step.questions[field.id] !== question) delete step.answers[field.id];
            step.questions[field.id] = question;
          }
          if (!await applyResumeUploads(fields, token, signature)) return;
          await detectAdapter().prepareSections?.(document, getProfile(), { session, isCurrent: () => guard(token) });
          await detectAdapter().prepareFields?.(document, getProfile(), { overwrite: getSettings().overwriteExisting, isCurrent: () => guard(token) });
          if (!guard(token)) return;
          signature = observePage(scanPageFields());
          step.observation = signature;
          for (const field of scanFormFields()) step.questions[field.id] = questionIdentity(field);
          const targets = scanFormFields().filter(f => f.type !== 'file' && shouldFill(f));
          const missing = [];
          for (const field of targets) {
            const cached = recallAnswer(session, field);
            if (cached) step.answers[field.id] = { fieldId: field.id, ...cached }; else missing.push(field);
          }
          if (missing.length) {
            if ((step.requests || 0) >= 2) { status('paused', 'Primary request limit reached (2/2). Fill this page manually.'); return; }
            step.requests = (step.requests || 0) + 1;
            saveSession(session);
            status('running', `Generating answers for ${missing.length} fields.`);
            const answers = await request(missing, {}, token, signature);
            if (!checkPage(signature, token, 'primary response')) return;
            if (!answers.length) throw new Error('AI returned no usable answers. Resume to retry.');
            for (const entry of answers) step.answers[entry.fieldId] = entry;
          }
          step.primary = true;
          saveSession(session);
          if (targets.length && !await applyAnswers(targets, Object.values(step.answers), token, signature)) return;
        } else {
          // Recover persisted answers after a full document reload without another primary request.
          if (!await applyResumeUploads(fields.filter(f => f.type === 'file' && isResumeField(f, fields) && empty(f)), token, signature)) return;
          await detectAdapter().prepareSections?.(document,getProfile(),{session,isCurrent:()=>guard(token)});
          await detectAdapter().prepareFields?.(document,getProfile(),{overwrite:false,isCurrent:()=>guard(token)});
          signature=observePage(scanPageFields());
          step.observation=signature;
          const missing = scanFormFields().filter(f => f.type !== 'file' && shouldFill(f) && unfilled(f));
          for (const field of normalizeFieldsForAI(missing)) {
            if (!field.ats?.canonicalKey || step.answers[field.fieldId]?.value !== '') continue;
            const refreshed = detectAdapter().resolveAnswer?.(field, getProfile(), {jobContext:session.job,allowSearch:false});
            if (refreshed?.value != null && refreshed.value !== '') step.answers[field.fieldId] = refreshed;
          }
          if (missing.length && !await applyAnswers(missing, Object.values(step.answers), token, signature)) return;
        }
        if (!checkPage(signature, token, 'fill completion')) return;
        if (!await settleFields(signature, token)) return;
        const late = scanFormFields().filter(f => !Object.hasOwn(step.questions, f.id));
        if (late.length) {
          if (step.lateRequests >= 2) { status('paused', 'Dynamic field limit reached (2/2). Inspect the page before resuming.'); return; }
          step.lateRequests++;
          saveSession(session);
          const targets = late.filter(f => f.type !== 'file' && shouldFill(f));
          if (!await applyResumeUploads(late.filter(f => f.type === 'file' && isResumeField(f, late)), token, signature)) return;
          if (targets.length) {
            const answers = await request(targets, { allowSearch: false }, token, signature);
            if (!guard(token)) return;
            if (!answers.length) throw new Error('AI returned no usable late-field answers. Resume to retry.');
            for (const entry of answers) step.answers[entry.fieldId] = entry;
            for (const field of late) step.questions[field.id] = questionIdentity(field);
            saveSession(session);
            if (!await applyAnswers(targets, answers, token, signature)) return;
          }
          for (const field of late) step.questions[field.id] = questionIdentity(field);
          saveSession(session);
          continue;
        }
        let control = findContinue();
        const errors = validation(scanFormFields());
        if (errors.length) {
          if (await repair(errors, step, token, signature)) continue;
          for (const err of errors) {
            if (err.fieldId && results.get(err.fieldId)?.status !== 'verified') {
              results.set(err.fieldId, {
                status: 'failed',
                provenance: 'unresolved',
                value: '',
                inferred: false,
                source: 'validation',
                error: err.message || 'Required field missing or rejected.',
              });
            }
          }
          emit();
          return;
        }
        if (await attemptAutoSubmit(token, step)) return;
        if (!getSettings().autoContinue && !step.forceContinue) {
          step.reviewed = true;
          session.stepReview = true;
          saveSession(session);
          status('paused', 'Page filled. Auto Continue is off.');
          return;
        }
        const wasForced = Boolean(step.forceContinue);
        step.forceContinue = false;
        if (wasForced) {
          step.reviewed = true;
        } else if (detectAdapter().quirks?.stepReviewPause && !step.reviewed) {
          step.reviewed = true;
          session.stepReview = true;
          saveSession(session);
          status('paused', 'Workday step filled. Ready for your review.');
          return;
        }
        control = findContinue();
        if (control && isDisabled(control)) {
          const readiness = await waitForNavigation(signature, token, false);
          if (readiness === 'stopped') {
            if (token === generation && session.status === 'review' && getSettings().autoSubmit) await attemptAutoSubmit(token, step);
            return;
          }
          if (readiness === 'changed' || readiness === 'validation') continue;
          if (readiness === 'timeout') { pauseDisabledButton(); return; }
          control = findContinue();
        }
        if (!control || isDisabled(control)) {
          if (await attemptAutoSubmit(token, step)) return;
          status('paused', inspectContinue().reason);
          return;
        }
        if (!await settleFields(signature, token, 'before navigation')) return;
        control = findContinue();
        if (!control || isDisabled(control)) { status('paused', `Continue changed while preparing navigation. ${inspectContinue().reason}`); return; }
        if (step.clicks >= 3 || session.transitions >= 30) { status('paused', 'Navigation limit reached. Continue manually.'); return; }
        if (!guard(token)) return;
        step.clicks++;
        session.transitions++;
        session.pendingUrl = control.tagName === 'A' ? safeUrl(control.getAttribute('href')) : safeUrl(control.getAttribute('formaction') || control.form?.getAttribute('action') || window.location.href);
        session.pendingAt = Date.now();
        session.pendingStep = session.currentStep;
        status('running', 'Continuing; waiting for the next step.');
        bindTab(session);
        logger.info(`Navigation action: ${control.textContent?.trim() || control.value || 'Continue'}, path=${window.location.pathname}`);
        const navBaseline = platform.navigation.marker().id;
        control.click();
        const transition = await waitForNavigation(signature, token, true, navBaseline);
        if (transition === 'stopped') {
          if (token === generation && session.status === 'review' && getSettings().autoSubmit) await attemptAutoSubmit(token, session.steps[session.currentStep]);
          return;
        }
        if (transition === 'changed') continue;
        session.pendingStep = '';
        session.pendingUrl = '';
        const rejected = inspectValidation(scanFormFields());
        if (rejected.length && await repair(rejected, step, token, signature)) continue;
        if (!session.active) return;
        if (isDisabled(findContinue())) { pauseDisabledButton(); return; }
        if (session.active) status('paused', 'Continue did not change the step. Check the page, then resume.');
        return;
      }
      status('paused', 'Workflow limit reached. Continue manually.');
    } catch (error) {
      if (token === generation && session) status('paused', `Workflow stopped: ${error.message}`);
    } finally { busy = false; if (!disposed) { if (pendingJob) updateJob(pendingJob); emit(); } }
  }
  return {
    get session() { return session; },
    get busy() { return busy; },
    get stepReview() { return Boolean(session?.stepReview); },
    async initialize() {
      const restored = await restoreSession();
      if (disposed) return;
      session = restored;
      if (session && session.identityVersion !== 2) session = null;
      if (session) {
        bindTab(session);
        // restoreSession also approves bounded POST redirects between steps.
        session.currentUrl = window.location.href;
      }
      if (session && pendingJob) updateJob(pendingJob);
      if (session && compatibleSession() && session.active && session.pendingStep === session.currentStep && Date.now() - session.pendingAt < 120000) {
        const previous = session.steps[session.currentStep];
        const page = classifyPage();
        // A navigation recorded after the Continue click proves the step advanced,
        // even if this document's structure still resembles the previous step.
        const navigation = platform.navigation.marker();
        const navigatedSincePending = navigation.at > 0 && navigation.at >= (session.pendingAt || 0);
        if (previous && (['review', 'confirmation'].includes(page.type) || navigatedSincePending || comparePages(previous.observation, observePage(scanPageFields()), true) === 'changed')) {
          completeStep();
          session.stepReview = false;
          if (page.type === 'application') session.currentStep = '';
        }
      } else if (!session) {
        try {
          const job = captureJob();
          if (job?.pendingHydration) await job.pendingHydration;
          if (disposed) return;
          session = createSession(job);
        } catch { /* Ignore early DOM access */ }
      }
      if (pendingJob) updateJob(pendingJob);
      emit();
      const checkNativeStepAdvance = () => {
        if (!session || !session.stepReview) return;
        const currentFields = scanPageFields();
        const currentObservation = observePage(currentFields);
        const stepObs = session.steps[session.currentStep]?.observation;
        if (stepObs && comparePages(stepObs, currentObservation, true) === 'changed') {
          logger.info('Detected step advancement via native on-page Continue action. Resuming autofill.');
          completeStep();
          session.stepReview = false;
          session.active = true;
          session.currentStep = '';
          status('running', 'Advancing to next step.');
        }
      };
      const schedule = () => {
        checkNativeStepAdvance();
        clearTimeout(timer);
        timer = setTimeout(() => void tick(), 300);
      };
      observer = new MutationObserver(mutations => {
        if (mutations.some(m => !m.target.closest?.('#kareer-root,#kareer-inline-rewrite'))) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      // A single-page step change may mutate little; the navigation event is the
      // reliable trigger. The interval stays as a safety net.
      unsubscribeNavigation = platform.navigation.onChange(marker => {
        logger.info(`Navigation ${marker.kind} in frame ${marker.frameId}: ${marker.url}`);
        schedule();
      });
      interval = setInterval(() => void tick(), 1500);
      await tick();
    },
    updateJob,
    async start(job) {
      if (busy || disposed) return;
      generation++;
      if (job || !session) session = createSession(job || captureJob());
      if (session?.job?.pendingHydration) {
        await session.job.pendingHydration;
        if (disposed) return;
        saveSession(session);
        emit();
      }
      if (!compatibleSession()) return;
      session.stepReview = false;
      const step=session.steps[session.currentStep];
      if (step?.frameUrl && step.primary) step.retryRequested=true;
      session.active = true;
      status('running', 'Starting application workflow.');
      await tick();
    },
    async continueStep() {
      if (busy || !session) return;
      generation++;
      session.stepReview = false;
      session.active = true;
      const current = session.steps[session.currentStep];
      if (current) current.forceContinue = true;
      saveSession(session);
      status('running', 'Advancing to next step.');
      await tick();
    },
    pause() {
      generation++;
      if (session?.frameOwner) void platform.frames.command(session.frameOwner.frameId,{action:'cancel'}).catch(()=>{});
      clearTimeout(timer);
      cancelDelay?.();
      busy = false;
      if (session) status('paused', 'Paused by user.');
    },
    tick,
    destroy() {
      disposed = true; pendingJob = null; generation++;
      if (session?.frameOwner) void platform.frames.command(session.frameOwner.frameId,{action:'cancel'}).catch(()=>{});
      clearTimeout(timer); cancelDelay?.(); clearInterval(interval); observer?.disconnect(); unsubscribeNavigation?.();
    },
  };
}
