import { materialJobKey } from '../../../core/materials-model.js';

export function applicationGroups(records) {
  const groups = new Map();
  const sorted = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const record of sorted) {
    const key = materialJobKey(record.job);
    if (!groups.has(key)) groups.set(key, { key, job: record.job, updatedAt: record.updatedAt, documents: [] });
    groups.get(key).documents.push(record);
  }
  return [...groups.values()];
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderApplicationLibrary({ container, records, search = '', onOpen }) {
  const query = search.trim().toLocaleLowerCase();
  const groups = applicationGroups(records).filter(group =>
    `${group.job.title || ''} ${group.job.company || ''}`.toLocaleLowerCase().includes(query));
  container.replaceChildren();

  if (!groups.length) {
    const empty = node('div', 'application-empty');
    empty.append(node('h2', '', query ? 'No matching applications' : 'Your next application starts here'));
    empty.append(node('p', 'muted', query
      ? 'Try another role or company name.'
      : 'Create a tailored resume or cover letter from your profile. Your documents will stay together here.'));
    container.append(empty);
    return;
  }

  for (const group of groups) {
    const row = node('article', 'application-row');
    const info = node('div', 'application-info');
    const heading = node('h2');
    const open = node('button', 'application-open', group.job.title || 'Untitled job');
    open.type = 'button';
    open.onclick = () => onOpen(group.job, group.documents.find(record => record.kind === 'resume')?.kind || group.documents[0].kind);
    heading.append(open);
    info.append(heading, node('p', 'application-company', group.job.company || 'Company not specified'));
    const documents = node('div', 'application-documents');
    for (const kind of ['resume', 'coverLetter']) {
      const record = group.documents.find(document => document.kind === kind);
      if (!record) continue;
      const button = node('button', 'application-document', kind === 'resume' ? 'Resume' : 'Cover letter');
      button.type = 'button';
      button.setAttribute('aria-label', `Open ${kind === 'resume' ? 'resume' : 'cover letter'} for ${group.job.title || 'untitled job'}`);
      button.onclick = () => onOpen(group.job, kind);
      documents.append(button);
    }
    const updated = node('time', 'application-updated');
    updated.dateTime = group.updatedAt;
    const date = new Date(group.updatedAt);
    updated.textContent = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    updated.title = date.toLocaleString();
    row.append(info, documents, updated);
    container.append(row);
  }
}
