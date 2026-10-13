import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { decodeMaterial } from '../shared/binary.js';
import { materialJobKey } from '../../../core/materials-model.js';
import { APP_VERSION } from '../../../core/constants.js';
import { previewPdf, setupPdfWorker } from './import.js';

setupPdfWorker(api.runtime.getURL('materials/pdf.worker.mjs'));
const $ = id => document.getElementById(id);
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const query = new URLSearchParams(location.search);
const originalSessionId = query.get('session');
let sessionId = originalSessionId, originJobKey = '', kind = query.get('kind') === 'coverLetter' ? 'coverLetter' : 'resume';
let job = { localId: crypto.randomUUID(), title: '', company: '', description: '' }, selected = null, task = null, records = [];
let previewVersion = 0, loadVersion = 0;
let activeSection = 'summary', dirty = false, busy = false, switching = false, view = 'prepare';

async function request(operation, input = {}) {
  const result = await sendMessage({ type: MSG.MATERIALS, operation, input });
  if (result?.error && !result.status) throw new Error(result.error);
  return ['get', 'save'].includes(operation) ? decodeMaterial(result) : result;
}
function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').classList.toggle('error', error); }
function readJob() { return { ...job, title: $('job-title').value.trim(), company: $('job-company').value.trim(), description: $('job-description').value.trim() }; }
function options() { return { pageTarget: Number($('page-target').value), tone: $('tone').value, length: $('length').value, instructions: $('instructions').value.trim() }; }

function showView(next) {
  view = next;
  for (const name of ['prepare', 'edit']) {
    $('view-' + name).setAttribute('aria-selected', String(name === view));
    $('view-' + name).tabIndex = name === view ? 0 : -1;
    $(name + '-panel').hidden = name !== view;
  }
  $('save-document').classList.toggle('secondary', view === 'prepare');
}

function setBusy(value) {
  busy = value;
  for (const control of document.querySelectorAll('button, input, textarea, select')) {
    if (!control.closest('dialog')) control.disabled = value;
  }
  $('cancel').disabled = false;
}

function updateDirty() {
  dirty = Boolean(selected) && (JSON.stringify(collectModel()) !== JSON.stringify(selected.model) || Number($('page-target').value) !== Number(selected.options?.pageTarget || 1));
  $('document-status').textContent = !selected ? '' : dirty ? 'Unsaved changes' : 'Saved locally';
  $('document-status').className = dirty ? 'status-unsaved' : 'status-saved';
  $('preview-status').textContent = dirty ? 'Saved version · Save to refresh preview' : 'Saved version';
}

function selectSection(id) {
  const blocks = [...document.querySelectorAll('.editor-block')];
  activeSection = blocks.some(block => block.dataset.editorId === id) ? id : blocks[0]?.dataset.editorId;
  for (const block of blocks) block.hidden = block.dataset.editorId !== activeSection;
  for (const button of document.querySelectorAll('[data-editor-section]')) {
    if (button.dataset.editorSection === activeSection) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
  $('editor-section').scrollTop = 0;
}

async function leaveDraft() {
  if (!dirty) return true;
  const dialog = $('draft-dialog');
  $('draft-error').textContent = '';
  return new Promise(resolve => {
    dialog.onclose = () => resolve(dialog.returnValue === 'continue');
    dialog.oncancel = event => { event.preventDefault(); dialog.close('stay'); };
    $('draft-stay').onclick = () => dialog.close('stay');
    $('draft-discard').onclick = () => { $('page-target').value = String(selected.options?.pageTarget || 1); renderEditor(); dialog.close('continue'); };
    $('draft-save').onclick = async () => {
      for (const button of dialog.querySelectorAll('button')) button.disabled = true;
      try { await saveDocument(); dialog.close('continue'); }
      catch (error) { $('draft-error').textContent = error.message; }
      finally { for (const button of dialog.querySelectorAll('button')) button.disabled = false; }
    };
    dialog.showModal();
  });
}

async function switchDocument(action) {
  if (busy || switching) return;
  switching = true;
  try { if (await leaveDraft()) { setBusy(true); await action(); } }
  finally { setBusy(false); switching = false; }
}

function updateSelectedJobNav() {
  const currentKey = materialJobKey(job);
  for (const button of document.querySelectorAll('#saved-jobs button[data-job]')) {
    const isSelected = button.dataset.job === currentKey;
    button.classList.toggle('active', isSelected);
    button.setAttribute('aria-selected', String(isSelected));
  }
}

function renderEditor() {
  const model = selected?.model;
  $('empty-editor').hidden = Boolean(model);
  $('editor-actions').hidden = !model;
  $('editor-layout').hidden = !model;
  const sections = !model ? [] : kind === 'coverLetter' ? model.paragraphs.map((_, i) => ({ id: `paragraph:${i}`, heading: `Paragraph ${i + 1}`, category: i === 0 ? 'Opening' : i === model.paragraphs.length - 1 ? 'Closing' : 'Body' })) : [{ id: 'summary', heading: 'Summary', category: '' }, ...model.sections];
  $('editor-sections').innerHTML = sections.map(s => `<button class="secondary" data-editor-section="${escape(s.id)}">${escape(s.heading)}${s.category ? `<small>${escape(s.category)}</small>` : ''}</button>`).join('');
  for (const button of document.querySelectorAll('[data-editor-section]')) button.onclick = () => selectSection(button.dataset.editorSection);
  $('document-editor').innerHTML = !model ? '' : kind === 'coverLetter' ? model.paragraphs.map((p, i) => `<div class="editor-block" data-editor-id="paragraph:${i}"><div class="editor-block-header"><h3>Paragraph ${i + 1}</h3><button class="secondary" data-rewrite="paragraph:${i}">Rewrite paragraph</button></div><label for="paragraph-${i}">Paragraph text</label><textarea id="paragraph-${i}" data-paragraph="${i}" rows="10">${escape(p)}</textarea></div>`).join('') :
    `<div class="editor-block" data-editor-id="summary"><div class="editor-block-header"><h3>Summary</h3><button class="secondary" data-rewrite="summary">Rewrite summary</button></div><label for="resume-summary">Professional summary</label><textarea id="resume-summary" rows="10">${escape(model.summary)}</textarea></div>` + model.sections.map((s, i) => `<div class="editor-block" data-editor-id="${escape(s.id)}"><div class="editor-block-header"><div><h3>${escape(s.heading)}</h3><p class="muted">${escape(s.category)}</p></div><button class="secondary" data-rewrite="section:${escape(s.id)}">Rewrite section</button></div>${s.facts ? `<p class="muted">${escape(s.facts)}</p>` : ''}${s.category === 'Projects' ? `<label for="keywords-${i}">Project keywords, one per line</label><textarea id="keywords-${i}" data-keywords="${i}" rows="2">${escape((s.keywords || []).join('\n'))}</textarea>` : ''}<label for="section-${i}">${s.category === 'Skills' ? 'Skills, one per line' : 'Achievements, one per line'}</label><textarea id="section-${i}" data-section="${i}" rows="12">${escape(s.bullets.join('\n'))}</textarea></div>`).join('');
  for (const button of document.querySelectorAll('[data-rewrite]')) button.onclick = async () => {
    try { await saveDocument(); await generate({ path: button.dataset.rewrite, revision: selected.revision }); }
    catch (error) { feedback(error.message, true); }
  };
  selectSection(activeSection);
  updateDirty();
  setBusy(busy);
}

function collectModel() {
  const model = structuredClone(selected.model);
  if (model.kind === 'coverLetter') model.paragraphs = [...document.querySelectorAll('[data-paragraph]')].map(el => el.value.trim()).filter(Boolean);
  else {
    model.summary = $('resume-summary').value;
    for (const el of document.querySelectorAll('[data-section]')) model.sections[Number(el.dataset.section)].bullets = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    for (const el of document.querySelectorAll('[data-keywords]')) model.sections[Number(el.dataset.keywords)].keywords = el.value.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return model;
}

async function renderDocument(record, { loadOptions = true } = {}) {
  if (record && (record.kind !== kind || materialJobKey(record.job) !== materialJobKey(job))) return;
  const version = ++previewVersion;
  selected = record;
  renderEditor();
  if (record) {
    if (loadOptions) {
      $('page-target').value = String(record.options?.pageTarget || 1);
      $('tone').value = record.options?.tone || 'professional'; $('length').value = record.options?.length || 'standard'; $('instructions').value = record.options?.instructions || '';
    }
    $('page-count').textContent = `${record.pages} page${record.pages === 1 ? '' : 's'}`;
    $('pdf-preview').setAttribute('aria-busy', 'true');
    $('pdf-preview').innerHTML = '<p class="muted">Rendering PDF preview…</p>';
    try { await previewPdf(record.files.pdf.buffer, $('pdf-preview'), { isCurrent: () => version === previewVersion }); }
    finally { if (version === previewVersion) $('pdf-preview').setAttribute('aria-busy', 'false'); }
  } else { $('page-count').textContent = ''; $('pdf-preview').setAttribute('aria-busy', 'false'); $('pdf-preview').innerHTML = '<p class="muted">Your finished document will appear here.</p>'; }
  updateDirty();
}

async function refreshLibrary() {
  records = await request('list');
  const jobs = new Map();
  for (const record of records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) if (!jobs.has(materialJobKey(record.job))) jobs.set(materialJobKey(record.job), record.job);
  $('saved-jobs').innerHTML = [...jobs.entries()].map(([key, item]) => `<button class="secondary" data-job="${escape(key)}">${escape(item.title || 'Untitled job')}<small>${escape(item.company || 'Company not specified')}</small></button>`).join('') || '<p class="muted">Your generated documents will be saved here.</p>';
  for (const button of document.querySelectorAll('[data-job]')) button.onclick = () => {
    if (button.dataset.job !== materialJobKey(job)) void switchDocument(() => selectJob(jobs.get(button.dataset.job))).catch(error => feedback(error.message, true));
  };
  updateSelectedJobNav();
  setBusy(busy);
}

async function selectJob(nextJob, load = true) {
  if (task?.status === 'running') { feedback('Wait for generation to finish or cancel it before switching jobs.', true); return; }
  job = nextJob;
  sessionId = originJobKey && materialJobKey(job) === originJobKey ? originalSessionId : null;
  $('job-title').value = job.title || ''; $('job-company').value = job.company || ''; $('job-description').value = job.description || '';
  $('job-heading').textContent = job.title || 'Prepare for a job';
  $('company-heading').textContent = job.company || '';
  updateSelectedJobNav();
  if (load) await loadCurrentDocument();
}

async function loadCurrentDocument() {
  const version = ++loadVersion;
  const record = records.find(r => r.kind === kind && materialJobKey(r.job) === materialJobKey(job));
  const document = record ? await request('get', { id: record.id }) : null;
  if (version === loadVersion) { activeSection = kind === 'resume' ? 'summary' : 'paragraph:0'; await renderDocument(document); showView(document ? 'edit' : 'prepare'); }
}

async function switchKind(next) {
  if (task?.status === 'running') return;
  kind = next;
  for (const type of ['resume', 'coverLetter']) { $('tab-' + type).setAttribute('aria-selected', String(type === kind)); $('tab-' + type).tabIndex = type === kind ? 0 : -1; }
  $('document-workspace').setAttribute('role', 'tabpanel');
  $('document-workspace').setAttribute('aria-labelledby', 'tab-' + kind);
  $('page-control').hidden = kind !== 'resume'; $('tone-control').hidden = kind === 'resume'; $('length-control').hidden = kind === 'resume';
  $('generate').textContent = kind === 'resume' ? 'Tailor resume' : 'Generate cover letter';
  feedback('');
  await loadCurrentDocument();
}

async function saveDocument() {
  if (!selected) return;
  setBusy(true);
  try {
    const record = await request('save', { id: selected.id, revision: selected.revision, model: collectModel(), pageTarget: Number($('page-target').value), sessionId });
    await renderDocument(record, { loadOptions: false }); await refreshLibrary(); feedback('Changes saved. The next Autofill uses this version.');
  } finally { setBusy(false); }
}

async function generate(rewrite = null) {
  if (task?.status === 'running') return;
  job = readJob();
  if (!job.description) { feedback('Paste the job description first.', true); $('job-description').focus(); return; }
  feedback('Generating…');
  setBusy(true);
  try {
    task = await request('start', { kind, job, jobEdited: true, sessionId, options: { ...options(), rewrite } });
    if (task.needsWorkspace) { feedback(task.reason, true); showView('prepare'); task = null; return; }
    $('cancel').hidden = false;
    while (task.status === 'running') { feedback(task.phase || 'Writing your document…'); await new Promise(resolve => setTimeout(resolve, 700)); task = await request('status', { id: task.id }); }
    if (task.status === 'error') throw new Error(task.error);
    await refreshLibrary(); await renderDocument(await request('get', { id: task.material.id }));
    $('job-heading').textContent = job.title || 'Untitled job'; $('company-heading').textContent = job.company || '';
    showView('edit');
    feedback(sessionId ? 'Ready. The next Autofill uses this document for your application.' : 'Ready. Your document is saved locally and available to download.');
  } finally { $('cancel').hidden = true; setBusy(false); }
}

async function init() {
  $('workspace-version').textContent = `Kareer v${APP_VERSION}`;
  const session = sessionId ? await request('session', { sessionId }) : null;
  if (session) { job = session.job; originJobKey = materialJobKey(job); }
  else if (query.get('job')) job = await request('job', { id: query.get('job') }) || job;
  await refreshLibrary();
  if (query.get('document')) { const record = await request('get', { id: query.get('document') }); if (record) { job = record.job; kind = record.kind; } }
  await selectJob(job, false); await switchKind(kind);
}

function bindActions() {
  for (const type of ['resume', 'coverLetter']) $('tab-' + type).onclick = () => { if (type !== kind) void switchDocument(() => switchKind(type)).catch(error => feedback(error.message, true)); };
  for (const name of ['prepare', 'edit']) $('view-' + name).onclick = () => showView(name);
  $('prepare-document').onclick = () => showView('prepare');
  $('document-editor').addEventListener('input', updateDirty);
  $('page-target').addEventListener('change', updateDirty);
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  for (const tabs of document.querySelectorAll('[role="tablist"]')) tabs.onkeydown = event => {
    const buttons = [...tabs.querySelectorAll('[role="tab"]')], index = buttons.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  };
  $('generate').onclick = () => void switchDocument(() => generate()).catch(error => feedback(error.message, true));
  $('save-document').onclick = () => void saveDocument().catch(error => feedback(error.message, true));
  $('cancel').onclick = () => task && void request('cancel', { id: task.id });
  $('new-job').onclick = () => void switchDocument(() => selectJob({ localId: crypto.randomUUID(), title: '', company: '', description: '' })).catch(error => feedback(error.message, true));
  $('delete-document').onclick = async () => {
    if (!selected) return;
    setBusy(true);
    try { await request('delete', { id: selected.id }); await refreshLibrary(); await renderDocument(null); feedback('Document deleted. Your profile is unchanged.'); }
    catch (error) { feedback(error.message, true); }
    finally { setBusy(false); }
  };
  for (const button of document.querySelectorAll('[data-download]')) button.onclick = async () => {
    if (!selected) return;
    try {
      if (dirty) await saveDocument();
      const file = selected.files[button.dataset.download], url = URL.createObjectURL(new Blob([file.buffer], { type: file.type }));
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000); feedback(`Downloaded ${file.name}`);
    } catch (error) { feedback(error.message, true); }
  };
}
bindActions();
setBusy(true);
void init().catch(error => feedback(`Workspace could not load: ${error.message}`, true)).finally(() => setBusy(false));
