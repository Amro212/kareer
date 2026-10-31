import { api } from '../shared/browser.js';
import { readApiKey, updateStoredRecord, readAiStatus } from './storage.js';
import { proxyAiRequest } from './ai.js';
import { readStored, writeStored, removeStored, listStored } from './documents.js';
import { buildMaterialSource, validateMaterial, materialJobKey, mergeMaterialRewrite, MATERIAL_KINDS } from '../../../core/materials-model.js';
import { DEFAULT_SETTINGS } from '../../../core/constants.js';
import { materialWritingInstructions } from '../../../core/ai-prompts.js';
import { exportMaterial, MATERIAL_TEMPLATE_VERSION } from '../materials/export.js';
import { encodeMaterial, encodeDocument } from '../shared/binary.js';
import { editableModel } from '../materials/editor-model.js';

const running = new Map();
let committing = Promise.resolve();
function commit(work) { const next = committing.catch(() => {}).then(work); committing = next; return next; }
const owner = crypto.randomUUID();
const recordId = (job, kind) => `material:${materialJobKey(job)}:${kind}`;
const meta = record => record && ({ id: record.id, kind: record.kind, revision: record.revision, job: record.job, pages: record.pages, updatedAt: record.updatedAt });
function stampFiles(record) {
  for (const file of Object.values(record.files)) file.name = file.name.replace(/\.(pdf|docx)$/, `-${record.revision.slice(0, 8)}.$1`);
  return record;
}

// Call under commit: migration must not overwrite concurrent edits or generation.
async function readCurrentMaterial(id) {
  const record = await readStored(id);
  if (!record || record.templateVersion === MATERIAL_TEMPLATE_VERSION) return record;
  const exported = await exportMaterial(record.model, record.job, record.options?.pageTarget || 1, { fit: false });
  const current = stampFiles({ ...record, ...exported, revision: crypto.randomUUID() });
  await writeStored(id, current);
  return current;
}

export { materialWritingInstructions };

export async function writingRequest(input, system, signal) {
  const instructions = `Write in English. ${system}`;
  if ((await readAiStatus()).mode === 'managed') {
    // The gateway rebuilds these instructions from the document kind; only the structured input is sent.
    const result = await proxyAiRequest({ operation: input.rewrite ? 'documentRewrite' : 'document', input }, signal.signal);
    if (result.error) throw new Error(result.error);
    return JSON.parse(JSON.parse(result.responseText).choices[0].message.content);
  }
  const key = await readApiKey();
  if (!key) throw new Error('Add your OpenRouter key in Settings, then retry.');
  const settings = (await api.storage.local.get('kr:settings'))['kr:settings'] || {};
  const model = settings.model || DEFAULT_SETTINGS.model;
  const timer = setTimeout(() => signal.abort('OpenRouter did not respond within 25 seconds. Retry or choose a faster model.'), 25000);
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: signal.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: true, temperature: 0.25, max_tokens: 7000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: instructions }, { role: 'user', content: JSON.stringify(input) }] }) });
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    let detail = '';
    try {
      const { error } = await response.json();
      let raw = error?.metadata?.raw;
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
      detail = [error?.message, raw?.error?.message || raw?.message].filter(value => typeof value === 'string').join(': ');
    } catch {}
    detail = detail.split(key).join('[REDACTED]').replace(/sk-or-v1-[\w-]+/g, '[REDACTED]').slice(0, 500);
    throw new Error(`OpenRouter returned ${response.status} using ${model}${detail ? `: ${detail}` : ''}. Retry or check the selected model's settings.`);
  }
  let content = '', finishReason;
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json();
    content = data.choices?.[0]?.message?.content || '';
    finishReason = data.choices?.[0]?.finish_reason;
  } else {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = pending.split('\n'); pending = lines.pop();
      if (done && pending) { lines.push(pending); pending = ''; }
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.error) throw new Error('OpenRouter could not complete this generation. Retry or select another model.');
        content += event.choices?.[0]?.delta?.content || '';
        finishReason = event.choices?.[0]?.finish_reason || finishReason;
      }
      if (content.length > 150000) throw new Error('AI response was too large. Shorten your source and retry.');
      if (done) break;
    }
  }
  if (finishReason === 'length') throw new Error('The model reached its output limit and returned an incomplete document. Shorten the writing instructions or source, then retry.');
  try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('AI returned malformed document data. Retry or choose another model.'); }
}

async function sourceForGeneration() {
  const profile = (await api.storage.local.get('kr:profile'))['kr:profile'] || {};
  const source = buildMaterialSource(profile);
  if (!source.sections.length) throw new Error('Add experience, education, projects, or skills in Profile before generating.');
  return source;
}

async function sessionUpdate(sessionId, record) {
  if (!sessionId) return;
  return updateStoredRecord(`kr:sessions:${sessionId}`, session => {
    if (!session || materialJobKey(session.job) !== materialJobKey(record.job)) return null;
    return { ...session, materialRefs: { ...session.materialRefs, [record.kind]: { id: record.id, revision: record.revision } } };
  });
}

async function taskStatus(task) {
  if (task.status === 'running' && task.owner !== owner) {
    task.status = 'error'; task.error = 'Generation was interrupted. Retry when ready; no request was automatically repeated.';
    await writeStored(task.id, task);
  }
  return task;
}

async function execute(task, options, controller) {
  const timer = setTimeout(() => controller.abort('Generation timed out after 120 seconds. Retry or select a faster model.'), 120000);
  // Extension API activity is bounded to the task, not an indefinitely alive worker.
  const heartbeat = setInterval(() => { void api.storage.local.get('kr:settings').catch(() => {}); }, 20000);
  try {
    const initialDocument = await commit(() => readCurrentMaterial(task.documentId));
    const previous = options.rewrite ? initialDocument : null;
    if (options.rewrite && (!previous || previous.revision !== options.rewrite.revision)) throw new Error('A newer document exists. Reopen it before rewriting.');
    const source = await sourceForGeneration();
    const currentDocument = previous ? validateMaterial(task.kind, previous.model, source) : null;
    const output = await writingRequest({ kind: task.kind, source, job: task.job, pageTarget: options.pageTarget || 1,
      tone: options.tone || 'professional', length: options.length || 'standard', instructions: options.instructions || '',
      rewrite: options.rewrite || null, currentDocument },
      materialWritingInstructions(task.kind), controller);
    const model = validateMaterial(task.kind, previous ? mergeMaterialRewrite(currentDocument, output, options.rewrite.path) : output, source);
    task.phase = 'Formatting PDF and Word files'; await writeStored(task.id, task);
    const exported = await exportMaterial(model, task.job, options.pageTarget || 1, { fit: false, signal: controller.signal });
    if (controller.signal.aborted) throw new Error(String(controller.signal.reason || 'Generation cancelled.'));
    const record = stampFiles({ id: recordId(task.job, task.kind), kind: task.kind, job: task.job, source,
      ...exported, revision: crypto.randomUUID(), updatedAt: new Date().toISOString(), options });
    await commit(async () => {
      const latest = await readStored(record.id);
      if (latest?.revision !== initialDocument?.revision) throw new Error('Newer edits were saved while generation was running. Your edits remain active; reopen the document before regenerating.');
      if (controller.signal.aborted) throw new Error(String(controller.signal.reason || 'Generation cancelled.'));
      await writeStored(record.id, record); await sessionUpdate(task.sessionId, record);
    });
    task.status = 'ready'; task.material = meta(record); task.phase = 'Ready for next Autofill';
  } catch (error) {
    task.status = 'error'; task.error = controller.signal.aborted ? String(controller.signal.reason || 'Generation cancelled.') : error.message;
  } finally {
    clearTimeout(timer); clearInterval(heartbeat); running.delete(task.documentId);
    await writeStored(task.id, task);
  }
}

export async function handleMaterials(operation, input = {}, sender = {}) {
  if (['get', 'save', 'delete', 'getDraft', 'putDraft', 'discardDraft', 'rewriteDraft', 'cancelRewrite'].includes(operation) && !input.id?.startsWith('material:')) throw new Error('Unknown application document.');
  if (['status', 'cancel'].includes(operation) && !input.id?.startsWith('task:')) throw new Error('Unknown generation task.');
  switch (operation) {
    case 'start': {
      if (!MATERIAL_KINDS.includes(input.kind)) throw new Error('Unknown material type.');
      let job = input.job;
      if (input.sessionId) {
        const key = `kr:sessions:${input.sessionId}`;
        let session;
        // Cached storage writes may be finishing when the first panel click arrives.
        for (let i = 0; i < 10 && !session; i++) { session = (await api.storage.local.get(key))[key]; if (!session) await new Promise(resolve => setTimeout(resolve, 20)); }
        if (!session) throw new Error('Application session is unavailable. Reopen the panel and retry.');
        job = { ...session.job, ...job };
        if (materialJobKey(session.job) !== materialJobKey(job)) throw new Error('The job changed. Reopen the workspace for this application.');
      }
      const contextId = `job-context:${materialJobKey(job)}`;
      if (input.jobEdited) await writeStored(contextId, { id: contextId, corrections: { title: job.title, company: job.company, description: job.description } });
      else {
        const savedContext = await readStored(contextId);
        if (savedContext) job = { ...job, ...savedContext.corrections };
      }
      if (!job?.description?.trim()) return { needsWorkspace: true, reason: 'Paste the job description to generate tailored documents.' };
      const profile = (await api.storage.local.get('kr:profile'))['kr:profile'] || {};
      const source = buildMaterialSource(profile);
      if (!source.sections.length) return { needsWorkspace: true, reason: 'Add experience, education, projects, or skills in Profile before generating.' };
      const documentId = recordId(job, input.kind);
      if (running.has(documentId)) throw new Error('This document is already being generated.');
      const task = { id: `task:${crypto.randomUUID()}`, owner, documentId, sessionId: input.sessionId, job, kind: input.kind, status: 'running', phase: 'Writing your document', createdAt: Date.now() };
      const controller = new AbortController();
      controller.taskId = task.id;
      running.set(documentId, controller);
      await writeStored(task.id, task);
      if (task.sessionId) {
        await updateStoredRecord(`kr:sessions:${task.sessionId}`, session => session && ({ ...session, materialTasks: { ...session.materialTasks, [task.kind]: task.id } }));
      }
      const previous = await readStored(documentId);
      const { rewrite: _previousRewrite, ...savedOptions } = previous?.options || {};
      void execute(task, input.options ?? savedOptions, controller);
      return task;
    }
    case 'status': { const task = await readStored(input.id); if (!task) throw new Error('Generation task is unavailable. Retry from the panel.'); return taskStatus(task); }
    case 'cancel': {
      const task = await readStored(input.id), controller = running.get(task?.documentId);
      if (task?.status === 'running' && controller?.taskId === task.id) controller.abort('Generation cancelled. Previous documents remain available.');
      return { ok: true };
    }
    case 'get': return commit(async () => encodeMaterial(await readCurrentMaterial(input.id)));
    case 'getDraft': return commit(async () => {
      const draft = await readStored(`draft:${input.id}`);
      const record = await readStored(input.id);
      return draft ? { ...draft, conflict: draft.baseRevision !== record?.revision } : null;
    });
    case 'putDraft': return commit(async () => {
      const record = await readStored(input.id), previous = await readStored(`draft:${input.id}`);
      if (!record || record.revision !== input.revision || (previous && previous.baseRevision !== record.revision)) throw new Error('A newer document exists. Your draft is retained. Discard the draft to load the newer version.');
      if ((previous?.revision || null) !== (input.draftRevision || null)) throw new Error('A newer draft exists in another window. Your edits are retained here; reopen the document before retrying.');
      const draft = { id: `draft:${input.id}`, baseRevision: record.revision, revision: crypto.randomUUID(),
        model: editableModel(record.model, input.model), pageTarget: input.pageTarget === 2 ? 2 : 1, updatedAt: new Date().toISOString() };
      await writeStored(draft.id, draft);
      return draft;
    });
    case 'discardDraft': return commit(async () => {
      const draft = await readStored(`draft:${input.id}`);
      if (draft && draft.revision !== input.draftRevision) throw new Error('A newer draft exists. Reopen the document before discarding.');
      await removeStored(`draft:${input.id}`);
      return { ok: true };
    });
    case 'cancelRewrite': {
      const controller = running.get(input.id);
      if (controller?.draftRewrite) controller.abort('Rewrite cancelled. Your text is unchanged.');
      return { ok: true };
    }
    case 'rewriteDraft': {
      if (running.has(input.id)) throw new Error('Wait for the current rewrite or generation, or cancel it.');
      const previous = await readStored(input.id);
      if (!previous || previous.revision !== input.revision) throw new Error('A newer document exists. Reopen it before rewriting.');
      const currentDocument = editableModel(previous.model, input.model), source = await sourceForGeneration();
      const controller = new AbortController(); controller.draftRewrite = true;
      running.set(input.id, controller);
      const timer = setTimeout(() => controller.abort('Rewrite timed out. Your text is unchanged; retry when ready.'), 120000);
      const heartbeat = setInterval(() => { void api.storage.local.get('kr:settings').catch(() => {}); }, 20000);
      try {
        const output = await writingRequest({ kind: previous.kind, source, job: previous.job,
          ...input.options, rewrite: { path: input.path }, currentDocument }, materialWritingInstructions(previous.kind), controller);
        if (controller.signal.aborted) throw new Error(String(controller.signal.reason));
        const model = validateMaterial(previous.kind, mergeMaterialRewrite(currentDocument, output, input.path), previous.source);
        return { model: editableModel(currentDocument, model) };
      } finally { clearTimeout(timer); clearInterval(heartbeat); running.delete(input.id); }
    }
    case 'snapshot': return commit(async () => {
      const key = `kr:sessions:${input.sessionId}`, session = (await api.storage.local.get(key))[key];
      const jobKey = session && materialJobKey(session.job);
      const frozen = input.resumeRun && session?.materialRunRef && await readStored(session.materialRunRef.id);
      if (frozen && frozen.revision === session.materialRunRef.revision && frozen.jobKey === jobKey) return { refs: session.materialRefs || {}, tasks: session.materialTasks || {}, runRef: session.materialRunRef, records: Object.fromEntries(Object.entries(frozen.records).map(([kind, record]) => [kind, encodeMaterial(record)])) };
      const records = {};
      for (const [kind, ref] of Object.entries(session?.materialRefs || {})) {
        const stored = await readStored(ref.id);
        const record = stored && materialJobKey(stored.job) === jobKey ? await readCurrentMaterial(ref.id) : null;
        records[kind] = record && materialJobKey(record.job) === jobKey ? record : { error: 'Selected document is unavailable for this job. Generate it again or delete it in the workspace.' };
      }
      let runRef = session?.materialRunRef;
      if (input.persistRun && session) {
        runRef = { id: `material-run:${session.id}`, revision: crypto.randomUUID() };
        await writeStored(runRef.id, { ...runRef, jobKey, records });
        await updateStoredRecord(key, current => current && ({ ...current, materialRunRef: runRef }));
      }
      return { refs: session?.materialRefs || {}, tasks: session?.materialTasks || {}, runRef, records: Object.fromEntries(Object.entries(records).map(([kind, record]) => [kind, encodeMaterial(record)])) };
    });
    case 'endRun': return commit(async () => {
      const key = `kr:sessions:${input.sessionId}`, session = (await api.storage.local.get(key))[key];
      if (session?.materialRunRef?.revision === input.runRef?.revision) {
        await removeStored(session.materialRunRef.id);
        await updateStoredRecord(key, current => current && ({ ...current, materialRunRef: null }));
      }
      return { ok: true };
    });
    case 'list': return (await listStored('material:')).map(meta);
    case 'session': {
      const key = `kr:sessions:${input.sessionId}`, session = (await api.storage.local.get(key))[key];
      return session || null;
    }
    case 'save': {
      const previous = await readStored(input.id);
      if (!previous) throw new Error('Document no longer exists. Generate it again.');
      if (input.revision !== previous.revision) throw new Error('A newer document exists. Reopen it before saving edits.');
      const model = validateMaterial(previous.kind, input.draftRevision ? editableModel(previous.model, input.model) : input.model, previous.source);
      const exported = await exportMaterial(model, previous.job, input.pageTarget || previous.options.pageTarget || 1, { fit: false });
      const { changes: _legacyChanges, ...saved } = previous;
      const record = stampFiles({ ...saved, ...exported, revision: crypto.randomUUID(), options: { ...previous.options, pageTarget: input.pageTarget || previous.options.pageTarget || 1 }, updatedAt: new Date().toISOString() });
      await commit(async () => {
        const latest = await readStored(record.id);
        if (latest?.revision !== input.revision) throw new Error('A newer document exists. Reopen it before saving edits.');
        const draft = await readStored(`draft:${record.id}`);
        if (input.draftRevision && (draft?.revision !== input.draftRevision || draft.baseRevision !== input.revision)) throw new Error('A newer draft exists. Your edits are retained; reopen the document before exporting.');
        await writeStored(record.id, record); await sessionUpdate(input.sessionId, record);
        if (input.draftRevision) await removeStored(`draft:${record.id}`);
      });
      return encodeMaterial(record);
    }
    case 'delete': {
      if (running.has(input.id)) throw new Error('Cancel generation before deleting this document.');
      await commit(async () => {
        await removeStored(input.id);
        await removeStored(`draft:${input.id}`);
        const stored = await api.storage.local.get(null);
        for (const [key, session] of Object.entries(stored)) {
          if (!key.startsWith('kr:sessions:') || !session?.materialRefs) continue;
          await updateStoredRecord(key, current => {
            if (!current) return null;
            const materialRefs = { ...current.materialRefs };
            for (const [kind, ref] of Object.entries(materialRefs)) if (ref.id === input.id) delete materialRefs[kind];
            return { ...current, materialRefs };
          });
        }
      });
      return { ok: true };
    }
    case 'document': return commit(async () => {
      const record = await readCurrentMaterial(input.ref?.id);
      if (!record) throw new Error('Selected document was deleted. Generate a new version or use the original resume.');
      const file = record.files[input.format || 'pdf'];
      if (!file) throw new Error('Requested document format is unavailable.');
      return encodeDocument({ ...file, revision: record.revision });
    });
    case 'open': {
      const query = new URLSearchParams();
      if (input.sessionId) query.set('session', input.sessionId);
      if (input.id) query.set('document', input.id);
      if (input.kind) query.set('kind', input.kind);
      if (input.job && !input.sessionId) {
        const id = input.job.localId || crypto.randomUUID();
        await writeStored(`job:${id}`, { ...input.job, id: `job:${id}`, localId: id }); query.set('job', id);
      }
      await api.tabs.create({ url: api.runtime.getURL(`materials/index.html?${query}`) }); return { ok: true };
    }
    case 'job': return readStored(`job:${input.id}`);
    default: throw new Error('Unknown materials operation.');
  }
}
