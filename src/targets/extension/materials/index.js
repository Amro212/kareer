import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { decodeMaterial } from '../shared/binary.js';
import { materialJobKey } from '../../../core/materials-model.js';
import { extractResume, previewPdf, setupPdfWorker } from './import.js';

setupPdfWorker(api.runtime.getURL('materials/pdf.worker.mjs'));
const $ = id => document.getElementById(id);
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const query = new URLSearchParams(location.search);
const originalSessionId = query.get('session');
let sessionId = originalSessionId, originJobKey = '', kind = query.get('kind') === 'coverLetter' ? 'coverLetter' : 'resume';
let job = { localId: crypto.randomUUID(), title: '', company: '', description: '' }, selected = null, task = null, records = [], savedBaseText = '';
let previewVersion = 0, loadVersion = 0;

async function request(operation, input = {}) {
  const result = await sendMessage({ type: MSG.MATERIALS, operation, input });
  if (result?.error && !result.status) throw new Error(result.error);
  return ['get', 'save'].includes(operation) ? decodeMaterial(result) : result;
}
function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').classList.toggle('error', error); }
function readJob() { return { ...job, title: $('job-title').value.trim(), company: $('job-company').value.trim(), description: $('job-description').value.trim() }; }
function options() { return { pageTarget: Number($('page-target').value), tone: $('tone').value, length: $('length').value, instructions: $('instructions').value.trim() }; }

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
  $('document-status').innerHTML = model ? '<span class="badge ok">Saved locally</span>' : '';
  $('document-editor').innerHTML = !model ? '' : kind === 'coverLetter' ? model.paragraphs.map((p, i) => `<div class="editor-block"><div class="editor-block-header"><h3>Paragraph ${i + 1}</h3><button class="secondary" data-rewrite="paragraph:${i}">Rewrite paragraph</button></div><label><textarea data-paragraph="${i}" rows="4">${escape(p)}</textarea></label></div>`).join('') :
    `<div class="editor-block"><div class="editor-block-header"><h3>Summary</h3><button class="secondary" data-rewrite="summary">Rewrite summary</button></div><label><textarea id="resume-summary" rows="3">${escape(model.summary)}</textarea></label></div>` + model.sections.map((s, i) => `<div class="editor-block"><div class="editor-block-header"><h3>${escape(s.heading)}</h3><span class="badge">${escape(s.category)}</span></div>${s.facts ? `<p class="muted">${escape(s.facts)}</p>` : ''}<label>${s.category === 'Skills' ? 'Skills, one per line' : 'Bullets, one per line'}<textarea data-section="${i}" rows="${Math.max(3, Math.min(8, s.bullets.length + 1))}">${escape(s.bullets.join('\n'))}</textarea></label><button class="secondary" data-rewrite="section:${escape(s.id)}">Rewrite this section</button></div>`).join('');
  for (const button of document.querySelectorAll('[data-rewrite]')) button.onclick = async () => {
    try { await saveDocument(); await generate({ path: button.dataset.rewrite, revision: selected.revision }); }
    catch (error) { feedback(error.message, true); }
  };
  $('changes-section').hidden = kind !== 'resume' || !selected;
  $('changes').innerHTML = !selected?.changes?.length ? '<p class="muted">No section wording changed.</p>' : selected.changes.map(change => {
    const badgeClass = change.type === 'omitted' ? 'err' : change.type === 'reordered' ? 'warn' : 'ok';
    const typeLabel = change.type === 'omitted' ? 'Omitted' : change.type === 'reordered' ? 'Moved' : 'Updated';
    return `<div class="change"><div class="change-header"><h3>${escape(change.heading)}</h3><span class="badge ${badgeClass}">${typeLabel}</span></div>${change.before && change.type !== 'reordered' ? `<p><del>${escape(change.before)}</del></p>` : ''}${change.after ? `<p class="change-after">${escape(change.after)}</p>` : ''}</div>`;
  }).join('');
}

function collectModel() {
  const model = structuredClone(selected.model);
  if (model.kind === 'coverLetter') model.paragraphs = [...document.querySelectorAll('[data-paragraph]')].map(el => el.value.trim()).filter(Boolean);
  else { model.summary = $('resume-summary').value; for (const el of document.querySelectorAll('[data-section]')) model.sections[Number(el.dataset.section)].bullets = el.value.split('\n').map(s => s.trim()).filter(Boolean); }
  return model;
}

async function renderDocument(record) {
  if (record && (record.kind !== kind || materialJobKey(record.job) !== materialJobKey(job))) return;
  const version = ++previewVersion;
  selected = record;
  renderEditor();
  if (record) {
    $('page-target').value = String(record.options?.pageTarget || 1);
    $('tone').value = record.options?.tone || 'professional'; $('length').value = record.options?.length || 'standard'; $('instructions').value = record.options?.instructions || '';
    $('page-count').textContent = `${record.pages} page${record.pages === 1 ? '' : 's'}`;
    $('pdf-preview').setAttribute('aria-busy', 'true');
    $('pdf-preview').innerHTML = '<p class="muted">Rendering PDF preview…</p>';
    try { await previewPdf(record.files.pdf.buffer, $('pdf-preview'), { isCurrent: () => version === previewVersion }); }
    finally { if (version === previewVersion) $('pdf-preview').setAttribute('aria-busy', 'false'); }
  } else { $('page-count').textContent = ''; $('pdf-preview').setAttribute('aria-busy', 'false'); $('pdf-preview').innerHTML = '<p class="muted">Your finished document will appear here.</p>'; }
}

async function refreshLibrary() {
  records = await request('list');
  const jobs = new Map();
  for (const record of records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) if (!jobs.has(materialJobKey(record.job))) jobs.set(materialJobKey(record.job), record.job);
  $('saved-jobs').innerHTML = [...jobs.entries()].map(([key, item]) => `<button class="secondary" data-job="${escape(key)}">${escape(item.title || 'Untitled job')}<small>${escape(item.company || 'Company not specified')}</small></button>`).join('') || '<p class="muted">Your generated documents will be saved here.</p>';
  for (const button of document.querySelectorAll('[data-job]')) button.onclick = () => void selectJob(jobs.get(button.dataset.job)).catch(error => feedback(error.message, true));
  updateSelectedJobNav();
}

async function selectJob(nextJob, load = true) {
  if (task?.status === 'running') { feedback('Wait for generation to finish or cancel it before switching jobs.', true); return; }
  job = nextJob;
  sessionId = originJobKey && materialJobKey(job) === originJobKey ? originalSessionId : null;
  $('job-title').value = job.title || ''; $('job-company').value = job.company || ''; $('job-description').value = job.description || '';
  $('job-heading').textContent = job.title || 'Prepare for a job';
  updateSelectedJobNav();
  if (load) await loadCurrentDocument();
}

async function loadCurrentDocument() {
  const version = ++loadVersion;
  const record = records.find(r => r.kind === kind && materialJobKey(r.job) === materialJobKey(job));
  const document = record ? await request('get', { id: record.id }) : null;
  if (version === loadVersion) await renderDocument(document);
}

async function switchKind(next) {
  if (task?.status === 'running') return;
  kind = next;
  for (const type of ['resume', 'coverLetter']) $('tab-' + type).setAttribute('aria-selected', String(type === kind));
  $('page-control').hidden = kind !== 'resume'; $('tone-control').hidden = kind === 'resume'; $('length-control').hidden = kind === 'resume';
  $('generate').textContent = kind === 'resume' ? 'Tailor resume' : 'Generate cover letter';
  feedback('');
  await loadCurrentDocument();
}

async function saveDocument() {
  if (!selected) return;
  const record = await request('save', { id: selected.id, revision: selected.revision, model: collectModel(), pageTarget: Number($('page-target').value), sessionId });
  await renderDocument(record); await refreshLibrary(); feedback('Changes saved. The next Autofill uses this version.');
}

async function generate(rewrite = null) {
  if (task?.status === 'running') return;
  job = readJob();
  if (!job.description) { feedback('Paste the job description first.', true); $('job-description').focus(); return; }
  if ($('base-text').value.trim() !== savedBaseText) { await request('saveBase', { text: $('base-text').value }); savedBaseText = $('base-text').value.trim(); }
  feedback('Generating…');
  task = await request('start', { kind, job, jobEdited: true, sessionId, options: { ...options(), rewrite } });
  if (task.needsWorkspace) { feedback(task.reason, true); $('base-details').open = true; task = null; return; }
  $('generate').disabled = true; $('cancel').hidden = false; $('save-document').disabled = true;
  try {
    while (task.status === 'running') { feedback(task.phase || 'Writing your document…'); await new Promise(resolve => setTimeout(resolve, 700)); task = await request('status', { id: task.id }); }
    if (task.status === 'error') throw new Error(task.error);
    await refreshLibrary(); await renderDocument(await request('get', { id: task.material.id }));
    feedback(sessionId ? 'Ready. The next Autofill uses this document for your application.' : 'Ready. Your document is saved locally and available to download.');
  } finally { $('generate').disabled = false; $('cancel').hidden = true; $('save-document').disabled = false; }
}

async function init() {
  const base = await request('base'); savedBaseText = base.text || ''; $('base-text').value = savedBaseText;
  const session = sessionId ? await request('session', { sessionId }) : null;
  if (session) { job = session.job; originJobKey = materialJobKey(job); }
  else if (query.get('job')) job = await request('job', { id: query.get('job') }) || job;
  await refreshLibrary();
  if (query.get('document')) { const record = await request('get', { id: query.get('document') }); if (record) { job = record.job; kind = record.kind; } }
  await selectJob(job, false); await switchKind(kind);
  if (!savedBaseText) {
    const original = await sendMessage({ type: MSG.DOC_GET });
    if (original?.buffer) {
      try { $('base-text').value = await extractResume(original); }
      catch (error) { feedback(`Original resume import: ${error.message}`, true); }
    }
  }
}

function bindActions() {
  $('base-file').onchange = async () => {
    const file = $('base-file').files[0]; if (!file) return;
    try { feedback('Reading resume locally…'); $('base-text').value = await extractResume({ name: file.name, type: file.type, buffer: await file.arrayBuffer() }); feedback('Resume text extracted. Save it as your base or generate a document.'); }
    catch (error) { feedback(error.message, true); }
  };
  $('save-base').onclick = () => void request('saveBase', { text: $('base-text').value }).then(() => { savedBaseText = $('base-text').value.trim(); feedback('Base resume saved. Your profile and original file are unchanged.'); }).catch(error => feedback(error.message, true));
  $('tab-resume').onclick = () => void switchKind('resume').catch(error => feedback(error.message, true));
  $('tab-coverLetter').onclick = () => void switchKind('coverLetter').catch(error => feedback(error.message, true));
  $('generate').onclick = () => void generate().catch(error => feedback(error.message, true));
  $('save-document').onclick = () => void saveDocument().catch(error => feedback(error.message, true));
  $('cancel').onclick = () => task && void request('cancel', { id: task.id });
  $('new-job').onclick = () => void selectJob({ localId: crypto.randomUUID(), title: '', company: '', description: '' });
  $('delete-document').onclick = async () => {
    if (!selected) return;
    try { await request('delete', { id: selected.id }); await refreshLibrary(); await renderDocument(null); feedback('Document deleted. The original resume remains available.'); }
    catch (error) { feedback(error.message, true); }
  };
  for (const button of document.querySelectorAll('[data-download]')) button.onclick = () => {
    if (!selected) return;
    const file = selected.files[button.dataset.download], url = URL.createObjectURL(new Blob([file.buffer], { type: file.type }));
    const link = document.createElement('a'); link.href = url; link.download = file.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000); feedback(`Downloaded ${file.name}`);
  };
}
bindActions();
const initialControls = [...document.querySelectorAll('button, input, textarea, select')];
for (const control of initialControls) control.disabled = true;
void init().catch(error => feedback(`Workspace could not load: ${error.message}`, true)).finally(() => { for (const control of initialControls) control.disabled = false; });
