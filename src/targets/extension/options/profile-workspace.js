// The overview wraps the existing field editors. Inputs stay mounted while a
// section opens, saves or closes, so other unfinished sections keep their state.
const SECTIONS = [
  { id: 'identity', title: 'Identity & contact', group: 'about', wide: true },
  { id: 'address', title: 'Address', group: 'about' },
  { id: 'links', title: 'Online profiles', group: 'about' },
  { id: 'work', title: 'Experience', group: 'career', keys: ['workExperiences'], wide: true },
  { id: 'education', title: 'Education', group: 'career', keys: ['education'] },
  { id: 'skills', title: 'Skills', group: 'career', keys: ['skills'] },
  { id: 'projects', title: 'Projects', group: 'career', keys: ['projects'], wide: true },
  { id: 'languages', title: 'Languages', group: 'career', keys: ['languageRecords'] },
  { id: 'eligibility', title: 'Work eligibility', group: 'answers', keys: ['workEligibilities'] },
  { id: 'preferences', title: 'Job preferences', group: 'answers', wide: true },
  { id: 'demographics', title: 'Demographics & disclosures', group: 'answers' },
  { id: 'rules', title: 'Writing guidance', group: 'notes' },
];

const GROUPS = {
  about: ['About you', 'Name, contact, address, and the links you share on applications.'],
  career: ['Career', 'Experience, education, skills, projects, and languages.'],
  answers: ['Answers for applications', 'Eligibility, preferences, and demographic answers reused across applications.'],
  notes: ['Notes', 'Guidance Kareer uses when it writes for you.'],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dateRange(record) {
  const format = value => {
    if (!value) return '';
    const [year, month] = value.split('-');
    if (!year || !month) return value;
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };
  return [format(record.startDate), record.current ? 'Present' : format(record.endDate)].filter(Boolean).join(' – ');
}

function summaryRows(id, profile, fields) {
  switch (id) {
    case 'identity':
      return [
        ['Name', profile.fullName], ['Email', profile.email],
        ['Phone', profile.phone], ['Location', [profile.city, profile.country].filter(Boolean).join(', ')],
      ];
    case 'work':
      return (profile.workExperiences || []).map(record => [
        record.title || 'Untitled role',
        [record.company, dateRange(record), record.enabled === false ? 'Excluded from tailoring' : ''].filter(Boolean).join(' · '),
        record.description,
      ]);
    case 'education':
      return (profile.education || []).map(record => [
        record.institution || 'Untitled education',
        [record.degree, record.fieldOfStudy, dateRange(record), record.enabled === false ? 'Excluded from tailoring' : ''].filter(Boolean).join(' · '),
      ]);
    case 'projects':
      return (profile.projects || []).map(record => [
        record.name || 'Untitled project',
        [record.role, record.enabled === false ? 'Excluded from tailoring' : ''].filter(Boolean).join(' · '),
        record.description,
      ]);
    case 'skills':
      return (profile.skills || []).map(skill => [skill]);
    case 'languages':
      return (profile.languageRecords || []).map(record => [
        record.language || 'Unnamed language',
        [record.fluent === 'Yes' ? 'Fluent' : '', record.speaking, record.enabled === false ? 'Excluded from autofill' : ''].filter(Boolean).join(' · '),
      ]);
    case 'eligibility':
      return (profile.workEligibilities || []).filter(record => record.country || record.workAuthorization).map(record => [
        record.country || 'Country not specified',
        [record.workAuthorization === 'Yes' ? 'Authorized to work' : record.workAuthorization === 'No' ? 'Not authorized to work' : '',
          record.sponsorshipNow === 'Yes' ? 'Sponsorship required' : '', record.enabled === false ? 'Excluded from autofill' : ''].filter(Boolean).join(' · '),
      ]);
    case 'address':
      return [['Address', [profile.streetAddress, profile.addressLine2, profile.addressLine3,
        [profile.city, profile.stateProvince, profile.postalCode].filter(Boolean).join(', '), profile.country].filter(Boolean).join('\n')]];
    case 'rules':
      return [['Applicant notes', profile.applicantNotes]];
    default:
      return fields.filter(field => profile[field.name]).map(field => [field.label, profile[field.name]]);
  }
}

function renderSummary(container, section, profile) {
  const records = ['work', 'education', 'projects', 'skills', 'languages', 'eligibility'].includes(section.id);
  const rows = summaryRows(section.id, profile, section.fields).filter(row => row[0] && (row[1] || row[2] || records));
  container.replaceChildren();
  container.classList.toggle('profile-contact-summary', section.id === 'identity');
  container.classList.toggle('profile-skill-summary', section.id === 'skills');
  if (!rows.length) {
    container.append(element('p', 'profile-empty', 'No details added yet. Add them when you’re ready.'));
    return;
  }
  for (const [title, detail, description] of rows) {
    const row = element('div', 'profile-summary-row');
    row.append(element('p', 'profile-summary-title', title));
    if (detail) row.append(element('p', 'profile-summary-detail', detail));
    if (description) row.append(element('p', 'profile-summary-description', description));
    container.append(row);
  }
}

function sectionValue(profile, keys) {
  return Object.fromEntries(keys.map(key => [key, structuredClone(profile[key] ?? '')]));
}

export function createProfileWorkspace({ form, read, restore, save }) {
  const sections = [];
  const navigation = document.getElementById('profile-subsections');
  navigation?.replaceChildren();
  const jumpGroups = new Map();
  let openGroup = '';
  const dock = document.getElementById('profile-floating-dock');

  for (const config of SECTIONS) {
    const fields = document.getElementById(`section-${config.id}`);
    if (!fields) continue;
    const section = { ...config, fields: [], baseline: null, saving: false };
    const wrapper = element('section', 'profile-summary-section');
    wrapper.dataset.profileSection = config.id;
    wrapper.classList.toggle('profile-section-wide', Boolean(config.wide));
    const header = element('div', 'profile-section-heading');
    const heading = element('h2', '', config.title);
    heading.tabIndex = -1;
    if (navigation) {
      if (!jumpGroups.has(config.group)) {
        const [title] = GROUPS[config.group];
        const block = element('div', 'profile-jump-group');
        block.append(element('p', 'profile-group-label', title));
        navigation.append(block);
        jumpGroups.set(config.group, block);
      }
      const link = element('a', 'profile-section-link', config.title);
      link.href = `#section-${config.id}`;
      jumpGroups.get(config.group).append(link);
    }
    const edit = element('button', 'profile-edit-button', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${config.title.toLowerCase()}`);
    edit.setAttribute('aria-expanded', 'false');
    edit.setAttribute('aria-controls', `profile-editor-${config.id}`);
    header.append(heading, edit);

    const summary = element('div', 'profile-section-summary');
    const editor = element('div', 'profile-section-editor');
    editor.id = `profile-editor-${config.id}`;
    editor.hidden = true;
    fields.before(wrapper);
    editor.append(fields);
    const actions = element('div', 'profile-section-actions');
    const submit = element('button', '', 'Save section');
    submit.type = 'button';
    const cancel = element('button', 'secondary', 'Cancel');
    cancel.type = 'button';
    const status = element('span', 'feedback');
    status.setAttribute('role', 'status');
    actions.append(submit, cancel, status);
    editor.append(actions);
    wrapper.append(header, summary, editor);
    if (config.group !== openGroup) {
      openGroup = config.group;
      const [title, description] = GROUPS[config.group];
      const group = element('div', 'profile-group');
      group.id = `group-${config.group}`;
      const groupTitle = element('h2', '', title);
      groupTitle.tabIndex = -1;
      group.append(groupTitle, element('p', 'hint', description));
      form.insertBefore(group, dock);
    }
    form.insertBefore(wrapper, dock);
    if (config.id === 'rules') {
      const writing = document.getElementById('models');
      if (writing) wrapper.after(writing);
    }

    function refreshFields() {
      section.fields = [...fields.querySelectorAll('[name]')]
        .filter(input => !input.closest('.repeatable-card') && !input.closest('.skill-input-row'))
        .map(input => ({ name: input.name, label: input.labels?.[0]?.textContent || input.name }));
      section.keys = [...new Set([...(config.keys || []), ...section.fields.map(field => field.name)])];
    }

    function close() {
      editor.hidden = true;
      summary.hidden = false;
      edit.hidden = false;
      edit.setAttribute('aria-expanded', 'false');
      wrapper.classList.remove('is-editing');
      renderSummary(summary, section, read());
      edit.focus({ preventScroll: true });
    }

    edit.onclick = () => {
      refreshFields();
      section.baseline = sectionValue(read(), section.keys);
      status.textContent = '';
      status.classList.remove('error');
      summary.hidden = true;
      editor.hidden = false;
      edit.hidden = true;
      edit.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('is-editing');
      const first = fields.querySelector('input:not([type="hidden"]), textarea, select, button');
      first?.focus({ preventScroll: true });
    };
    cancel.onclick = () => {
      restore(config.id, section.baseline);
      close();
      form.dispatchEvent(new Event('input', { bubbles: true }));
    };
    submit.onclick = async () => {
      if (section.saving) return;
      for (const input of fields.querySelectorAll('input, select, textarea')) {
        if (!input.checkValidity()) { input.reportValidity(); return; }
      }
      section.saving = true;
      submit.disabled = true;
      cancel.disabled = true;
      // Freeze this section while its captured value is being persisted. Other
      // open sections remain editable and are not included in this write.
      const controls = [...fields.querySelectorAll('input, select, textarea, button')];
      const disabled = controls.map(control => control.disabled);
      controls.forEach(control => control.disabled = true);
      status.textContent = 'Saving…';
      status.classList.remove('error');
      try {
        await save(section.keys, sectionValue(read(), section.keys));
        close();
      } catch (error) {
        status.textContent = `${error.message} Your changes are kept here.`;
        status.classList.add('error');
      } finally {
        section.saving = false;
        submit.disabled = false;
        cancel.disabled = false;
        controls.forEach((control, index) => control.disabled = disabled[index]);
      }
    };
    editor.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
      if (!event.target.matches('input:not([type="checkbox"]):not([type="file"])')) return;
      event.preventDefault();
      submit.click();
    });
    section.refresh = () => {
      refreshFields();
      renderSummary(summary, section, read());
    };
    section.saved = () => {
      if (!editor.hidden) close();
      section.refresh();
    };
    section.refresh();
    sections.push(section);
  }

  return {
    refresh: () => sections.forEach(section => section.refresh()),
    saved: () => sections.forEach(section => section.saved()),
  };
}
