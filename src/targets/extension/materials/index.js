import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { decodeMaterial } from '../shared/binary.js';
import { materialJobKey, buildMaterialSource } from '../../../core/materials-model.js';
import { APP_VERSION } from '../../../core/constants.js';
import { previewPdf, setupPdfWorker } from './import.js';
import { createMaterialEditor } from './editor.js';
import { editorSections, rewriteText } from './editor-model.js';
import { MaterialAutosave } from './autosave.js';
import { formatContactRuns } from './document-format.js';
import { renderApplicationLibrary } from './library.js';

setupPdfWorker(api.runtime.getURL('materials/pdf.worker.mjs'));
const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search), originalSessionId = query.get('session');
let sessionId = originalSessionId, originJobKey = '', kind = query.get('kind') === 'coverLetter' ? 'coverLetter' : 'resume';
let job = { localId: crypto.randomUUID(), title: '', company: '', description: '' }, selected = null, task = null, records = [];
let documentEditor, autosave, busy = false, switching = false, proof = false, rewritePending = false, previewVersion = 0;
let focusAfterSwitch;
let exportState = 'saved';
let saveErrorFeedback = '';

async function request(operation, input = {}) {
  const result = await sendMessage({ type: MSG.MATERIALS, operation, input });
  if (result?.error && !result.status) throw new Error(result.error);
  return ['get', 'save'].includes(operation) ? decodeMaterial(result) : result;
}
function feedback(message, error = false) {
  for (const id of ['feedback', 'library-feedback']) {
    $(id).textContent = message;
    $(id).classList.toggle('error', error);
  }
}
const readJob = () => ({ ...job, title: $('job-title').value.trim(), company: $('job-company').value.trim(), description: $('job-description').value.trim() });
const options = () => ({ pageTarget: Number($('page-target').value), tone: $('tone').value, length: $('length').value, instructions: $('instructions').value.trim() });
const readDraft = () => ({ model: documentEditor.model(), pageTarget: Number($('page-target').value) });
function showView(view) {
  for (const name of ['prepare', 'edit']) {
    $('view-' + name).setAttribute('aria-selected', String(name === view));
    $('view-' + name).tabIndex = name === view ? 0 : -1;
    $(name + '-panel').hidden = name !== view;
  }
  $('editor-actions').hidden = !selected || view !== 'edit';
  $('generate').textContent = selected ? kind === 'resume' ? 'Regenerate resume' : 'Regenerate cover letter' : kind === 'resume' ? 'Tailor resume' : 'Generate cover letter';
  if (view === 'edit') requestAnimationFrame(resizePaper);
}

function showWorkspace() {
  $('materials-library').hidden = true;
  $('application-workspace').hidden = false;
  $('recent-navigation').hidden = false;
}

function showLibrary(focus = true) {
  $('materials-library').hidden = false;
  $('application-workspace').hidden = true;
  $('recent-navigation').hidden = true;
  $('download-menu').close();
  const url = new URL(location.href);
  url.searchParams.set('view', 'library');
  history.replaceState(null, '', url);
  if (focus) $('library-heading').focus({ preventScroll: true });
}

function paintLibrary() {
  renderApplicationLibrary({
    container: $('application-list'),
    records,
    search: $('application-search').value,
    onOpen: (next, nextKind) => {
      void switchDocument(async () => {
        await selectJob(next, false);
        await switchKind(nextKind);
        $('job-heading').focus({ preventScroll: true });
      }).catch(error => feedback(error.message, true));
    },
  });
  $('application-list').setAttribute('aria-busy', 'false');
}

async function openLibrary() {
  await refreshLibrary();
  feedback('');
  showLibrary();
}

async function newApplication() {
  await selectJob({ localId: crypto.randomUUID(), title: '', company: '', description: '' }, false);
  await switchKind(kind);
  feedback('');
  focusAfterSwitch = $('job-title');
}

function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('#prepare-panel button, #prepare-panel input, #prepare-panel textarea, #prepare-panel select, .tabs button, .task-tabs button, #new-job, #start-new-application, #materials-home, #back-to-library, #delete-document, #saved-jobs button, #application-list button, #application-search')) control.disabled = value;
  $('cancel').disabled = false;
  documentEditor?.editor.setEditable(!value, false);
}
function activeSection(id) {
  for (const button of $('editor-sections').querySelectorAll('button')) {
    if (button.dataset.editorSection === id) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
  }
  updateHistory();
}
function updateHistory() {
  $('undo').disabled = !documentEditor?.editor.can().undo();
  $('redo').disabled = !documentEditor?.editor.can().redo();
}
function saveState(state, error) {
  exportState = state;
  const label = { saving: 'Saving…', draft: 'Saved locally · preparing downloads', compiling: 'Preparing downloads…', saved: 'Saved locally', error: 'Save needs attention' }[state];
  $('document-status').textContent = selected ? label : '';
  $('document-status').className = state === 'error' ? 'status-error' : state === 'saved' || state === 'draft' ? 'status-saved' : 'status-unsaved';
  $('preview-status').textContent = state === 'saved' ? 'Current export · exact page breaks' : 'Last completed export · updating after edits';
  if (state === 'error') $('preview-status').textContent = 'Last completed export · latest edits need an update';
  if (selected) updatePages();
  $('discard-draft').hidden = state !== 'error';
  if (state === 'saved' && saveErrorFeedback && $('feedback').textContent === saveErrorFeedback) {
    feedback(''); saveErrorFeedback = '';
  }
  if (error) {
    saveErrorFeedback = `${error.message} Your text stays in the editor. Use Save now to retry.`;
    feedback(saveErrorFeedback, true);
  }
}
function resizePaper() {
  if (!selected || $('editor-section').hidden) return;
  const available = Math.max(200, $('editor-section').clientWidth - (innerWidth <= 650 ? 24 : 48));
  const compact = innerWidth <= 650 && $('zoom').value === 'fit';
  const width = compact ? available : 816;
  const scale = compact ? 1 : $('zoom').value === 'fit' ? Math.min(1, available / 816) : Number($('zoom').value);
  const paper = $('document-paper'); paper.classList.toggle('compact-paper', compact);
  paper.style.width = `${width}px`; paper.style.transform = `scale(${scale})`;
  $('paper-frame').style.width = `${width * scale}px`;
  $('paper-frame').style.height = `${paper.offsetHeight * scale}px`;
}
function updatePages() {
  const count = `${selected.pages} page${selected.pages === 1 ? '' : 's'}`;
  const current = exportState === 'saved';
  $('export-page-count').textContent = current ? `PDF · ${count}` : `Last PDF · ${count} · ${exportState === 'error' ? 'needs update' : 'updating'}`;
  $('page-count').textContent = count + (current ? '' : ' · last export');
  const overflow = kind === 'resume' && selected.pages > Number($('page-target').value);
  $('overflow-status').hidden = !overflow;
  $('overflow-status').textContent = `${current ? 'PDF' : 'Last PDF'}: ${selected.pages} pages · Your ${$('page-target').value}-page target is exceeded. Shorten the text or choose two pages in Prepare. All text is preserved.`;
}
function resizeProof() {
  const container = $('pdf-preview');
  if (!proof || !container.clientWidth) return;
  for (const figure of container.querySelectorAll('.pdf-page')) {
    const canvas = figure.querySelector('canvas');
    const width = $('proof-zoom').value === 'page'
      ? Math.min(container.clientWidth, Math.max(120, container.clientHeight - 44) * canvas.width / canvas.height)
      : container.clientWidth;
    figure.style.width = `${width}px`;
  }
}
async function renderProof() {
  if (!proof || !selected) return;
  const version = ++previewVersion;
  $('pdf-preview').setAttribute('aria-busy', 'true');
  try {
    await previewPdf(selected.files.pdf.buffer, $('pdf-preview'), { isCurrent: () => proof && version === previewVersion });
    if (version === previewVersion) resizeProof();
  }
  finally { if (version === previewVersion) $('pdf-preview').setAttribute('aria-busy', 'false'); }
}
async function toggleProof() {
  proof = !proof;
  $('proof-toggle').setAttribute('aria-pressed', String(proof));
  $('proof-toggle').textContent = proof ? 'Back to editing' : 'PDF proof';
  $('proof-panel').hidden = !proof; $('editor-section').hidden = proof;
  $('editor-zoom-control').hidden = proof; $('proof-zoom-control').hidden = !proof;
  $('undo').hidden = proof; $('redo').hidden = proof;
  $('canvas-hint').textContent = proof ? 'Exact PDF layout' : 'Click text to edit';
  if (proof) {
    // Show the last good export while the latest edits compile; never call it current.
    await renderProof();
    try { await autosave.flush(); } catch (error) { feedback(error.message, true); }
  } else resizePaper();
}
function updateSelectedJobNav() {
  for (const button of $('saved-jobs').querySelectorAll('button')) {
    const current = button.dataset.job === materialJobKey(job);
    button.classList.toggle('active', current);
    if (current) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
  }
}
async function refreshLibrary() {
  records = await request('list');
  const jobs = new Map();
  for (const record of records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) if (!jobs.has(materialJobKey(record.job))) jobs.set(materialJobKey(record.job), record.job);
  $('saved-jobs').replaceChildren();
  for (const [key, item] of jobs) {
    const button = document.createElement('button'); button.className = 'secondary'; button.dataset.job = key;
    button.append(document.createTextNode(item.title || 'Untitled job'));
    const company = document.createElement('small'); company.textContent = item.company || 'Company not specified'; button.append(company);
    button.onclick = () => { if (key !== materialJobKey(job)) void switchDocument(() => selectJob(item)).catch(error => feedback(error.message, true)); };
    $('saved-jobs').append(button);
  }
  if (!jobs.size) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Prepared documents appear here.'; $('saved-jobs').append(p); }
  paintLibrary();
  updateSelectedJobNav(); setBusy(busy);
}
function paperHeader(model) {
  $('document-paper').classList.toggle('letter-paper', model.kind === 'coverLetter');
  const name = document.createElement('p'); name.className = 'paper-name'; name.textContent = model.name;
  const contact = document.createElement('p'); contact.className = 'paper-contact';
  for (const run of formatContactRuns(model.contact)) {
    const el = document.createElement(run.link ? 'a' : 'span'); el.textContent = run.text;
    if (run.link) { el.href = run.link; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
    contact.append(el);
  }
  $('paper-header').replaceChildren(name, contact);
  $('letter-context').hidden = model.kind !== 'coverLetter';
  $('letter-context').replaceChildren();
  if (model.kind === 'coverLetter') {
    for (const text of [new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), job.company].filter(Boolean)) {
      const p = document.createElement('p'); p.textContent = text; $('letter-context').append(p);
    }
  }
}
async function renderDocument(record) {
  showWorkspace();
  ++previewVersion;
  autosave?.dispose(); documentEditor?.destroy(); autosave = null; documentEditor = null;
  selected = record; proof = false;
  rewritePending = false;
  $('rewrite-status').hidden = true;
  // Keep navigation identity in the URL so reload restores the same local draft.
  const url = new URL(location.href);
  url.searchParams.set('kind', kind);
  if (record) url.searchParams.set('document', record.id); else url.searchParams.delete('document');
  if (sessionId) url.searchParams.set('session', sessionId); else url.searchParams.delete('session');
  url.searchParams.delete('job');
  url.searchParams.delete('view');
  history.replaceState(null, '', url);
  $('proof-toggle').setAttribute('aria-pressed', 'false'); $('proof-toggle').textContent = 'PDF proof';
  $('proof-panel').hidden = true; $('editor-section').hidden = false;
  $('editor-zoom-control').hidden = false; $('proof-zoom-control').hidden = true;
  $('undo').hidden = false; $('redo').hidden = false;
  $('empty-editor').hidden = Boolean(record); $('editor-layout').hidden = !record;
  $('editor-actions').hidden = !record;
  $('document-status').textContent = ''; $('discard-draft').hidden = true;
  $('pdf-preview').replaceChildren(); $('pdf-preview').setAttribute('aria-busy', 'false');
  if (!record) return;
  const draft = await request('getDraft', { id: record.id });
  const model = draft?.model || record.model;
  $('page-target').value = String(draft?.pageTarget || record.options?.pageTarget || 1);
  $('tone').value = record.options?.tone || 'professional'; $('length').value = record.options?.length || 'standard'; $('instructions').value = record.options?.instructions || '';
  paperHeader(model);
  $('editor-sections').replaceChildren();
  for (const section of editorSections(model)) {
    const button = document.createElement('button'); button.className = 'secondary'; button.dataset.editorSection = section.id; button.textContent = section.label; button.title = section.label;
    if (section.category && section.category !== section.label) { const small = document.createElement('small'); small.textContent = section.category; button.append(small); }
    button.onclick = () => { if (proof) void toggleProof(); documentEditor.focusSection(section.id); activeSection(section.id); };
    $('editor-sections').append(button);
  }
  documentEditor = createMaterialEditor({ container: $('document-editor'), model,
    onUpdate: () => { autosave?.change(); updateHistory(); resizePaper(); }, onSelection: activeSection,
    onRewrite: id => void rewriteSection(id).catch(error => feedback(error.message, true)),
  });
  const coordinator = new MaterialAutosave({ record, draft, read: readDraft,
    request: (operation, input) => request(operation, { ...input, sessionId }), onState: saveState,
    onCompiled: saved => { selected = saved; updatePages(); void renderProof().catch(error => feedback(error.message, true)); },
  });
  autosave = coordinator;
  if (draft?.conflict) { autosave.error = new Error('A newer version exists. Discard this draft to load it.'); autosave.notify(); }
  else if (draft) { feedback('Recovered your locally saved draft.'); autosave.change(); }
  activeSection(editorSections(model)[0].id); updatePages(); resizePaper();
}
async function discardDraft() {
  if (!autosave) return;
  await autosave.tail.catch(() => {});
  await request('discardDraft', { id: selected.id, draftRevision: autosave.draftRevision });
  await renderDocument(await request('get', { id: selected.id }));
  feedback('Draft discarded. Loaded the last completed document.');
}
async function leaveDraft() {
  if (!autosave || !autosave.pending) return true;
  try { await autosave.persist(); return true; }
  catch (error) {
    const dialog = $('draft-dialog'); $('draft-error').textContent = error.message;
    return new Promise(resolve => {
      dialog.onclose = () => resolve(dialog.returnValue === 'continue');
      dialog.oncancel = event => { event.preventDefault(); dialog.close('stay'); };
      $('draft-stay').onclick = () => dialog.close('stay');
      $('draft-discard').onclick = async () => { try { await discardDraft(); dialog.close('continue'); } catch (error) { $('draft-error').textContent = error.message; } };
      $('draft-save').onclick = async () => { try { await autosave.persist(); dialog.close('continue'); } catch (error) { $('draft-error').textContent = error.message; } };
      dialog.showModal();
    });
  }
}
async function switchDocument(action) {
  if (busy || switching) return;
  switching = true;
  const previous = autosave;
  try {
    if (!await leaveDraft()) return;
    // A persisted but unexportable draft can still be left and recovered later.
    // Successful exports update the next Autofill before switching context.
    try { await autosave?.flush(); } catch { if (autosave?.pending) return; }
    autosave?.dispose();
    await autosave?.tail.catch(() => {});
    if (rewritePending) await request('cancelRewrite', { id: selected.id });
    setBusy(true); await action();
  } finally {
    if (autosave === previous) autosave?.resume();
    setBusy(false);
    switching = false;
    focusAfterSwitch?.focus({ preventScroll: true });
    focusAfterSwitch = null;
  }
}
function updateJobContext() {
  $('job-heading').textContent = job.title || 'Prepare for a job';
  $('company-heading').textContent = job.company || '';
  $('job-heading').title = job.title || '';
  $('company-heading').title = job.company || '';
}
async function selectJob(next, load = true) {
  job = next;
  sessionId = originJobKey && materialJobKey(job) === originJobKey ? originalSessionId : null;
  $('job-title').value = job.title || ''; $('job-company').value = job.company || ''; $('job-description').value = job.description || '';
  updateJobContext();
  updateSelectedJobNav(); if (load) await loadCurrentDocument();
}
async function loadCurrentDocument() {
  const record = records.find(r => r.kind === kind && materialJobKey(r.job) === materialJobKey(job));
  await renderDocument(record ? await request('get', { id: record.id }) : null);
  showView(selected ? 'edit' : 'prepare');
}
async function switchKind(next) {
  kind = next;
  for (const type of ['resume', 'coverLetter']) { $('tab-' + type).setAttribute('aria-selected', String(type === kind)); $('tab-' + type).tabIndex = type === kind ? 0 : -1; }
  $('document-workspace').setAttribute('role', 'tabpanel'); $('document-workspace').setAttribute('aria-labelledby', 'tab-' + kind);
  $('page-control').hidden = kind !== 'resume'; $('tone-control').hidden = kind === 'resume'; $('length-control').hidden = kind === 'resume';
  feedback(''); await loadCurrentDocument();
}
async function generate() {
  if (task?.status === 'running') return;
  job = readJob();
  if (!job.description) { feedback('Paste the job description first.', true); $('job-description').focus(); return; }
  if (autosave) { await autosave.flush(); autosave.dispose(); }
  feedback('Generating…'); setBusy(true);
  try {
    task = await request('start', { kind, job, jobEdited: true, sessionId, options: options() });
    if (task.needsWorkspace) { feedback(task.reason, true); showView('prepare'); task = null; return; }
    $('cancel').hidden = false;
    while (task.status === 'running') { feedback(task.phase || 'Writing your document…'); await new Promise(resolve => setTimeout(resolve, 700)); task = await request('status', { id: task.id }); }
    if (task.status === 'error') {
      if (/^Generation (cancelled|canceled)\./i.test(task.error)) {
        feedback('Generation canceled. No documents were changed.');
        return;
      }
      throw new Error(task.error);
    }
    await refreshLibrary(); await renderDocument(await request('get', { id: task.material.id }));
    updateJobContext();
    showView('edit'); feedback('Ready. Edit directly on the document. Changes save locally.');
  } finally { $('cancel').hidden = true; setBusy(false); autosave?.resume(); }
}
async function rewriteSection(id) {
  if (!selected || rewritePending || busy) return;
  const editor = documentEditor, coordinator = autosave, path = editor.rewritePath(id), snapshot = editor.model();
  const captured = rewriteText(snapshot, path);
  rewritePending = true; $('rewrite-status').hidden = false;
  try {
    await coordinator.persist();
    const result = await request('rewriteDraft', { id: coordinator.record.id, revision: coordinator.record.revision, model: snapshot, path, options: options() });
    if (documentEditor !== editor) return;
    if (rewriteText(editor.model(), path) !== captured) { feedback('The selected text changed while rewriting. Your newer edits were kept; retry the rewrite if needed.'); return; }
    editor.replace(result.model, path); feedback('Rewrite applied. Undo to restore your previous wording.');
  } catch (error) { if (documentEditor === editor) throw error; }
  finally {
    if (documentEditor === editor) {
      rewritePending = false;
      $('rewrite-status').hidden = true;
    }
  }
}
async function download(format) {
  if (!autosave) return;
  $('download-menu').close();
  const coordinator = autosave;
  $('download-toggle').disabled = true;
  try {
    let record = await coordinator.flush();
    // If typing continued during compilation, finish that version before downloading.
    if (coordinator.needsCompile) record = await coordinator.flush();
    if (coordinator.needsCompile) throw new Error('Text is still changing. Pause briefly and download again.');
    const file = record.files[format], url = URL.createObjectURL(new Blob([file.buffer], { type: file.type }));
    const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000); feedback(`Downloaded ${file.name}`);
  } finally { $('download-toggle').disabled = false; }
}
async function init() {
  $('workspace-version').textContent = `Kareer v${APP_VERSION}`;
  const profile = (await api.storage.local.get('kr:profile'))['kr:profile'] || {};
  renderProfileSource(profile);
  const session = sessionId ? await request('session', { sessionId }) : null;
  if (session) { job = session.job; originJobKey = materialJobKey(job); }
  else if (query.get('job')) job = await request('job', { id: query.get('job') }) || job;
  await refreshLibrary();
  if (query.get('document')) { const record = await request('get', { id: query.get('document') }); if (record) { job = record.job; kind = record.kind; } }
  const hasContext = ['document', 'job', 'session', 'kind'].some(name => query.has(name));
  if (query.get('view') === 'library' || !hasContext) {
    showLibrary(false);
  } else {
    await selectJob(job, false);
    await switchKind(kind);
  }
}

function renderProfileSource(profile) {
  const source = buildMaterialSource(profile);
  $('profile-summary').textContent = source.sections.length
    ? `${source.sections.length} enabled profile sections`
    : 'No profile sections yet. Add your experience or skills to begin.';
}

async function loadWorkspace() {
  $('workspace-load-error').hidden = true;
  setBusy(true);
  try {
    await init();
  } catch (error) {
    $('workspace-load-message').textContent = `Workspace could not load: ${error.message}`;
    $('workspace-load-error').hidden = false;
    $('application-list').setAttribute('aria-busy', 'false');
    const loading = $('application-list').querySelector('.application-loading');
    if (loading) loading.textContent = 'Your applications could not be loaded.';
    feedback('');
  } finally {
    setBusy(false);
  }
}
function bindActions() {
  const action = fn => () => void Promise.resolve().then(fn).catch(error => feedback(error.message, true));
  for (const type of ['resume', 'coverLetter']) $('tab-' + type).onclick = action(() => type !== kind && switchDocument(() => switchKind(type)));
  for (const name of ['prepare', 'edit']) $('view-' + name).onclick = () => showView(name);
  $('prepare-document').onclick = () => showView('prepare');
  $('page-target').onchange = () => { autosave?.change(); if (selected) updatePages(); };
  $('zoom').onchange = resizePaper; new ResizeObserver(resizePaper).observe($('editor-section'));
  $('proof-zoom').onchange = resizeProof; new ResizeObserver(resizeProof).observe($('pdf-preview'));
  $('undo').onclick = () => { documentEditor?.editor.chain().focus().undo().run(); updateHistory(); };
  $('redo').onclick = () => { documentEditor?.editor.chain().focus().redo().run(); updateHistory(); };
  $('proof-toggle').onclick = action(toggleProof);
  $('save-document').onclick = action(async () => { await autosave?.flush(); feedback('Changes saved. The next Autofill uses this version.'); });
  $('discard-draft').onclick = action(discardDraft);
  $('cancel-rewrite').onclick = action(() => request('cancelRewrite', { id: selected.id }));
  // A nonmodal native dialog escapes scrolling containers and works on the
  // project's Chrome 110 / Firefox 115 targets, before popover API support.
  $('download-toggle').onclick = () => {
    const menu = $('download-menu');
    if (menu.open) { menu.close(); return; }
    const rect = $('download-toggle').getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right - 174, innerWidth - 182))}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, innerHeight - 100)}px`;
    menu.show(); $('download-toggle').setAttribute('aria-expanded', 'true'); menu.querySelector('button').focus();
  };
  $('download-menu').onclose = () => $('download-toggle').setAttribute('aria-expanded', 'false');
  $('download-menu').onkeydown = event => {
    const buttons = [...$('download-menu').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); $('download-menu').close(); $('download-toggle').focus(); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }
  };
  document.addEventListener('click', event => { if ($('download-menu').open && !$('download-menu').contains(event.target) && !$('download-toggle').contains(event.target)) $('download-menu').close(); });
  for (const button of document.querySelectorAll('[data-download]')) button.onclick = action(() => download(button.dataset.download));
  for (const tabs of document.querySelectorAll('[role="tablist"]')) tabs.onkeydown = event => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')], index = buttons.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  };
  window.addEventListener('beforeunload', event => { if (autosave?.pending) { void autosave.persist().catch(() => {}); event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void autosave?.persist().catch(() => {}); });
  $('generate').onclick = action(() => switchDocument(generate));
  $('cancel').onclick = action(() => task && request('cancel', { id: task.id }));
  $('new-job').onclick = action(() => switchDocument(newApplication));
  $('start-new-application').onclick = action(() => switchDocument(newApplication));
  $('materials-home').onclick = action(() => switchDocument(openLibrary));
  $('back-to-library').onclick = action(() => switchDocument(openLibrary));
  $('application-search').oninput = paintLibrary;
  $('workspace-retry').onclick = () => void loadWorkspace();
  $('delete-document').onclick = action(async () => {
    if (!selected || busy) return;
    await autosave.tail.catch(() => {}); autosave.dispose();
    if (rewritePending) await request('cancelRewrite', { id: selected.id });
    setBusy(true);
    try { await request('delete', { id: selected.id }); await refreshLibrary(); await renderDocument(null); feedback('Document deleted. Your profile is unchanged.'); }
    catch (error) { autosave?.resume(); throw error; }
    finally { setBusy(false); }
  });
}
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['kr:profile']) renderProfileSource(changes['kr:profile'].newValue || {});
});
bindActions();
void loadWorkspace();
