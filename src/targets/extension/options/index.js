import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { APP_VERSION, POPULAR_MODELS, DEFAULT_SETTINGS, DEFAULT_PROFILE, STORAGE_KEYS } from '../../../core/constants.js';
import { PROFILE_SECTIONS, createWorkExperience, createEducation, createProject, createWorkEligibility, createLanguage, calculateProfileStrength } from '../../../core/profile.js';
import { exportPayload, importPayload } from '../../../core/migration.js';

let currentWork = [];
let currentEducation = [];
let currentProjects = [];
let currentSkills = [];
let currentEligibilities = [];
let currentLanguages = [];

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTH_OPTIONS = [
  { val: '01', label: 'January' },
  { val: '02', label: 'February' },
  { val: '03', label: 'March' },
  { val: '04', label: 'April' },
  { val: '05', label: 'May' },
  { val: '06', label: 'June' },
  { val: '07', label: 'July' },
  { val: '08', label: 'August' },
  { val: '09', label: 'September' },
  { val: '10', label: 'October' },
  { val: '11', label: 'November' },
  { val: '12', label: 'December' },
];

function generateMonthOptions(selected) {
  let html = '<option value="">Month</option>';
  for (const m of MONTH_OPTIONS) {
    html += `<option value="${m.val}" ${m.val === selected ? 'selected' : ''}>${m.label}</option>`;
  }
  return html;
}

function generateYearOptions(selected, minYear = 1960, maxYear = new Date().getFullYear() + 8) {
  let html = '<option value="">Year</option>';
  for (let y = maxYear; y >= minYear; y--) {
    const s = String(y);
    html += `<option value="${s}" ${s === String(selected) ? 'selected' : ''}>${s}</option>`;
  }
  return html;
}

function parseYearMonth(val) {
  if (!val) return { year: '', month: '' };
  const str = String(val).trim();
  if (str.startsWith('--')) {
    return { year: '', month: str.slice(2).padStart(2, '0') };
  }
  const parts = str.split('-');
  if (parts.length >= 2) {
    return { year: parts[0], month: parts[1].padStart(2, '0') };
  }
  if (parts.length === 1 && /^\d{4}$/.test(parts[0])) {
    return { year: parts[0], month: '' };
  }
  return { year: '', month: '' };
}

function buildYearMonth(year, month) {
  if (!year && !month) return '';
  if (year && month) return `${year}-${month.padStart(2, '0')}`;
  if (year) return year;
  if (month) return `--${month.padStart(2, '0')}`;
  return '';
}

function formatMonthYear(val) {
  if (!val) return '';
  const { year, month } = parseYearMonth(val);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mName = month ? monthNames[parseInt(month, 10) - 1] || month : '';
  if (year && mName) return `${mName} ${year}`;
  if (year) return year;
  if (mName) return mName;
  return '';
}

const CORE_CONTACT_FIELDS = [
  { name: 'firstName', label: 'First name', type: 'text', placeholder: 'e.g. Alex' },
  { name: 'middleName', label: 'Middle name / Initial', type: 'text', placeholder: 'e.g. Morgan (optional)' },
  { name: 'lastName', label: 'Last name', type: 'text', placeholder: 'e.g. Chen' },
  { name: 'preferredName', label: 'Preferred first name', type: 'text', placeholder: 'e.g. Alex (optional)' },
  { name: 'preferredLastName', label: 'Preferred last name', type: 'text', placeholder: 'e.g. Chen (optional)' },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'e.g. alex@example.com' },
  { name: 'phone', label: 'Phone number', type: 'tel', placeholder: 'e.g. +1 555-0199' },
  { name: 'phoneCountry', label: 'Phone country', type: 'text', placeholder: 'e.g. Canada or United States' },
  { name: 'phoneType', label: 'Phone type', options: ['Mobile', 'Home', 'Work'] },
  { name: 'phoneExtension', label: 'Phone extension', type: 'text', placeholder: 'e.g. 101 (optional)' },
  { name: 'birthDate', label: 'Date of birth', type: 'date' },
];

const ADDRESS_FIELDS = [
  { name: 'streetAddress', label: 'Street address', type: 'text', placeholder: 'e.g. 123 Main Street', fullWidth: true },
  { name: 'addressLine2', label: 'Apt, Suite, Unit', type: 'text', placeholder: 'e.g. Apt 4B (optional)' },
  { name: 'addressLine3', label: 'Address line 3', type: 'text', placeholder: 'e.g. Building / Department (optional)' },
  { name: 'city', label: 'City', type: 'text', placeholder: 'e.g. San Francisco' },
  { name: 'stateProvince', label: 'State / Province / Region', type: 'text', placeholder: 'e.g. CA or California' },
  { name: 'postalCode', label: 'Postal / Zip code', type: 'text', placeholder: 'e.g. 94107' },
  { name: 'country', label: 'Country', type: 'text', placeholder: 'e.g. United States', fullWidth: true },
];

const LINK_FIELDS = [
  { name: 'linkedin', label: 'LinkedIn URL', type: 'url', placeholder: 'e.g. https://linkedin.com/in/username' },
  { name: 'github', label: 'GitHub URL', type: 'url', placeholder: 'e.g. https://github.com/username' },
  { name: 'portfolio', label: 'Portfolio URL', type: 'url', placeholder: 'e.g. https://alexmorgan.dev', fullWidth: true },
  { name: 'website', label: 'Website URL', type: 'url', placeholder: 'https://...' },
  { name: 'additionalUrl', label: 'Additional URL', type: 'url', placeholder: 'https://...' },
  { name: 'twitter', label: 'Twitter / X URL', type: 'url', placeholder: 'https://...' },
  { name: 'behance', label: 'Behance URL', type: 'url', placeholder: 'https://...' },
  { name: 'dribbble', label: 'Dribbble URL', type: 'url', placeholder: 'https://...' },
];

const IDENTITY_FIELDS = [...CORE_CONTACT_FIELDS, ...ADDRESS_FIELDS, ...LINK_FIELDS];

const $ = (id) => document.getElementById(id);

function flash(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('error', isError);
  if (!isError) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 2500);
}

function group(field, value) {
  const wrap = document.createElement('div');
  wrap.className = 'group' + (field.fullWidth ? ' full-width' : '');
  const label = document.createElement('label');
  label.htmlFor = `pf-${field.name}`;
  label.textContent = field.label;
  wrap.append(label);

  let input;
  if (field.options) {
    input = document.createElement('select');
    for (const option of ['', ...field.options]) {
      const el = document.createElement('option');
      el.value = option;
      el.textContent = option || 'Not set';
      input.append(el);
    }
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.min !== undefined) input.min = field.min;
    if (field.step !== undefined) input.step = field.step;
  }
  input.id = `pf-${field.name}`;
  input.name = field.name;
  input.value = value ?? '';
  wrap.append(input);
  return wrap;
}

async function readStore() {
  const snapshot = await sendMessage({ type: MSG.SNAPSHOT });
  if (!snapshot || snapshot.error) throw new Error(snapshot?.error || 'Could not read extension storage');
  return snapshot;
}

function getLiveProfileForStrength() {
  const city = $('pf-city')?.value || '';
  const stateProvince = $('pf-stateProvince')?.value || '';
  const country = $('pf-country')?.value || '';
  const synthesizedLocation = [city, stateProvince, country].filter(Boolean).join(', ');
  const firstName = $('pf-firstName')?.value || '';
  const middleName = $('pf-middleName')?.value || '';
  const lastName = $('pf-lastName')?.value || '';
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || $('pf-fullName')?.value || '';
  return {
    fullName,
    firstName,
    middleName,
    lastName,
    preferredName: $('pf-preferredName')?.value || '',
    preferredLastName: $('pf-preferredLastName')?.value || '',
    email: $('pf-email')?.value || '',
    phone: $('pf-phone')?.value || '',
    phoneCountry: $('pf-phoneCountry')?.value || '',
    phoneType: $('pf-phoneType')?.value || '',
    phoneExtension: $('pf-phoneExtension')?.value || '',
    birthDate: $('pf-birthDate')?.value || '',
    streetAddress: $('pf-streetAddress')?.value || '',
    addressLine2: $('pf-addressLine2')?.value || '',
    addressLine3: $('pf-addressLine3')?.value || '',
    city,
    stateProvince,
    postalCode: $('pf-postalCode')?.value || '',
    country,
    location: synthesizedLocation,
    linkedin: $('pf-linkedin')?.value || '',
    github: $('pf-github')?.value || '',
    portfolio: $('pf-portfolio')?.value || '',
    workExperiences: currentWork,
    education: currentEducation,
    projects: currentProjects,
    skills: currentSkills,
    workEligibilities: currentEligibilities,
    languageRecords: currentLanguages,
  };
}

function updateProfileStrength() {
  const profile = getLiveProfileForStrength();
  const strength = calculateProfileStrength(profile);
  const fill = $('sidebar-strength-fill');
  const val = $('sidebar-strength-value');
  const tier = $('sidebar-strength-tier');

  if (fill) {
    fill.style.width = `${strength.percentage}%`;
    fill.className = 'strength-fill ' + (strength.percentage >= 80 ? 'high' : strength.percentage >= 50 ? 'med' : 'low');
  }
  if (val) {
    val.textContent = `${strength.percentage}%`;
  }
  if (tier) {
    tier.textContent = strength.tierLabel;
  }
}

function updateSubnavBadges() {
  const setBadge = (id, count) => {
    const el = $(id);
    if (el) {
      el.textContent = count > 0 ? String(count) : '';
      el.style.display = count > 0 ? 'inline-block' : 'none';
    }
  };
  setBadge('subnav-work-count', currentWork.length);
  setBadge('subnav-edu-count', currentEducation.length);
  setBadge('subnav-proj-count', currentProjects.length);
  setBadge('subnav-skills-count', currentSkills.length);
  setBadge('subnav-languages-count', currentLanguages.filter((l) => l && l.enabled !== false && String(l.language || '').trim()).length);
  setBadge('subnav-eligibility-count', currentEligibilities.filter((e) => e && e.enabled !== false && String(e.country || '').trim()).length);
  updateProfileStrength();
  checkProfileDirty();
}

let savedProfileSnapshot = null;
let saveHideTimeout = null;

function serializeCurrentProfile() {
  const form = $('profile-form');
  if (!form) return '';
  const data = {};
  for (const input of form.querySelectorAll('input, select, textarea')) {
    if (input.name && !input.closest('.repeatable-card') && !input.closest('.skill-input-row')) {
      data[input.name] = input.value;
    }
  }
  const fn = $('pf-firstName')?.value?.trim() || '';
  const mn = $('pf-middleName')?.value?.trim() || '';
  const ln = $('pf-lastName')?.value?.trim() || '';
  data.fullName = [fn, mn, ln].filter(Boolean).join(' ') || $('pf-fullName')?.value || data.fullName || '';
  data.workExperiences = currentWork.map(({ _collapsed, ...rest }) => rest);
  data.education = currentEducation.map(({ _collapsed, ...rest }) => rest);
  data.projects = currentProjects.map(({ _collapsed, ...rest }) => rest);
  data.skills = [...currentSkills];
  data.workEligibilities = currentEligibilities.map(({ _collapsed, ...rest }) => rest);
  data.languageRecords = currentLanguages.map(({ _collapsed, ...rest }) => rest);
  return JSON.stringify(data);
}

function checkProfileDirty() {
  if (!savedProfileSnapshot) return;
  const current = serializeCurrentProfile();
  const isDirty = current !== savedProfileSnapshot;
  const dock = $('profile-floating-dock');
  const dot = $('dock-status-dot');
  const message = $('dock-status-message');
  if (dock) {
    if (saveHideTimeout) {
      clearTimeout(saveHideTimeout);
      saveHideTimeout = null;
    }
    dock.classList.toggle('is-visible', isDirty);
    if (dot) {
      dot.className = 'dock-dot' + (isDirty ? '' : ' saved');
    }
    if (message) {
      message.textContent = isDirty ? 'Unsaved profile changes' : 'All changes saved';
    }
  }
}

function renderSkillsChips() {
  const container = $('skills-chip-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentSkills.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'skills-empty-hint';
    hint.textContent = 'No skills added yet. Type a skill name below and press Enter or comma.';
    container.append(hint);
    updateSubnavBadges();
    return;
  }

  currentSkills.forEach((skill, index) => {
    const chip = document.createElement('span');
    chip.className = 'skill-chip';
    chip.innerHTML = `<span>${escapeHtml(skill)}</span><button type="button" class="remove-chip" aria-label="Remove ${escapeHtml(skill)}">✕</button>`;
    chip.querySelector('.remove-chip').addEventListener('click', (e) => {
      e.stopPropagation();
      currentSkills.splice(index, 1);
      renderSkillsChips();
    });
    container.append(chip);
  });
  updateSubnavBadges();
}

function addSkillFromInput() {
  const input = $('skill-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!currentSkills.some((s) => s.toLowerCase() === part.toLowerCase())) {
      currentSkills.push(part);
    }
  }
  input.value = '';
  renderSkillsChips();
}

function renderWorkExperiencesList() {
  const container = $('work-experience-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentWork.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No work experience added yet. Click "+ Add experience" to add your first role.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentWork.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Present' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.title || 'Untitled Role')} ${item.company ? 'at ' + escapeHtml(item.company) : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="work-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary work-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary work-move-down" title="Move Down" ${index === currentWork.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger work-delete" title="Remove role">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Job title</label>
            <input type="text" class="work-title" placeholder="e.g. Senior Software Engineer" value="${escapeHtml(item.title)}" />
            <span class="field-guide">Your official title or primary functional role.</span>
          </div>
          <div class="group">
            <label>Company / Employer</label>
            <input type="text" class="work-company" placeholder="e.g. Stripe, Acme Corp" value="${escapeHtml(item.company)}" />
            <span class="field-guide">Employer name or client.</span>
          </div>
          <div class="group full-width">
            <label>Location</label>
            <input type="text" class="work-location" placeholder="e.g. San Francisco, CA or Remote" value="${escapeHtml(item.location)}" />
            <span class="field-guide">City and state/country, or Remote.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="work-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="work-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year you began this role.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="work-current-toggle" ${item.current ? 'checked' : ''} />
                <span>I currently work here</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="work-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="work-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide work-end-guide">${item.current ? 'Currently active role' : 'Month and year you finished this role.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Responsibilities &amp; achievements</label>
          <textarea class="work-description" rows="3" placeholder="• Architected event-driven microservices processing 50M daily events&#10;• Reduced latency by 35% with Redis caching and query indexing&#10;• Mentored 4 engineers and led sprint planning">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Use action verbs, concrete metrics, and quantifiable impact.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.work-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.work-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentWork[index];
        currentWork[index] = currentWork[index - 1];
        currentWork[index - 1] = temp;
        renderWorkExperiencesList();
      }
    });

    const moveDown = card.querySelector('.work-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentWork.length - 1) {
        const temp = currentWork[index];
        currentWork[index] = currentWork[index + 1];
        currentWork[index + 1] = temp;
        renderWorkExperiencesList();
      }
    });

    const delBtn = card.querySelector('.work-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentWork.splice(index, 1);
      renderWorkExperiencesList();
    });

    const titleInput = card.querySelector('.work-title');
    const companyInput = card.querySelector('.work-company');
    function updateWorkTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.title || 'Untitled Role'} ${item.company ? 'at ' + item.company : ''}`;
    }
    titleInput.addEventListener('input', () => { item.title = titleInput.value; updateWorkTitle(); });
    companyInput.addEventListener('input', () => { item.company = companyInput.value; updateWorkTitle(); });
    card.querySelector('.work-location').addEventListener('input', (e) => { item.location = e.target.value; });

    const startMonthSelect = card.querySelector('.work-start-month');
    const startYearSelect = card.querySelector('.work-start-year');
    const endMonthSelect = card.querySelector('.work-end-month');
    const endYearSelect = card.querySelector('.work-end-year');
    const currentToggle = card.querySelector('.work-current-toggle');
    const endGuide = card.querySelector('.work-end-guide');

    function updateWorkDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Present' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateWorkDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateWorkDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently active role' : 'Month and year you finished this role.';
      }
      updateWorkDates();
    });

    card.querySelector('.work-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderEducationList() {
  const container = $('education-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentEducation.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No education entries added yet. Click "+ Add education" to add your school or degree.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentEducation.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Present (Expected)' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.degree || 'Degree')} ${item.fieldOfStudy ? 'in ' + escapeHtml(item.fieldOfStudy) : ''} ${item.institution ? '– ' + escapeHtml(item.institution) : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="edu-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary edu-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary edu-move-down" title="Move Down" ${index === currentEducation.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger edu-delete" title="Remove education">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Institution / University</label>
            <input type="text" class="edu-institution" placeholder="e.g. Stanford University" value="${escapeHtml(item.institution)}" />
            <span class="field-guide">Official name of the university, college, or school.</span>
          </div>
          <div class="group">
            <label>Degree</label>
            <input type="text" class="edu-degree" placeholder="e.g. Bachelor of Science, Master of Science" value="${escapeHtml(item.degree)}" />
            <span class="field-guide">Degree level (e.g. Bachelor's, Master's, PhD).</span>
          </div>
          <div class="group">
            <label>Field of study / Major</label>
            <input type="text" class="edu-field" placeholder="e.g. Computer Science, Electrical Engineering" value="${escapeHtml(item.fieldOfStudy)}" />
            <span class="field-guide">Your primary discipline or concentration.</span>
          </div>
          <div class="group">
            <label>GPA (optional)</label>
            <input type="text" class="edu-gpa" placeholder="e.g. 3.8 / 4.0" value="${escapeHtml(item.gpa)}" />
            <span class="field-guide">Cumulative GPA or academic honors.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="edu-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="edu-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year you started.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date (or expected)</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="edu-current-toggle" ${item.current ? 'checked' : ''} />
                <span>Currently enrolled</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="edu-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="edu-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide edu-end-guide">${item.current ? 'Currently enrolled (expected completion)' : 'Month and year completed.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Honors, activities &amp; coursework</label>
          <textarea class="edu-description" rows="2" placeholder="e.g. Dean's Honor List, Relevant coursework: Distributed Systems, Algorithms, Machine Learning">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Notable achievements, thesis, or relevant coursework.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.edu-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.edu-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentEducation[index];
        currentEducation[index] = currentEducation[index - 1];
        currentEducation[index - 1] = temp;
        renderEducationList();
      }
    });

    const moveDown = card.querySelector('.edu-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentEducation.length - 1) {
        const temp = currentEducation[index];
        currentEducation[index] = currentEducation[index + 1];
        currentEducation[index + 1] = temp;
        renderEducationList();
      }
    });

    const delBtn = card.querySelector('.edu-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentEducation.splice(index, 1);
      renderEducationList();
    });

    function updateEduTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.degree || 'Degree'} ${item.fieldOfStudy ? 'in ' + item.fieldOfStudy : ''} ${item.institution ? '– ' + item.institution : ''}`;
    }

    card.querySelector('.edu-institution').addEventListener('input', (e) => { item.institution = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-degree').addEventListener('input', (e) => { item.degree = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-field').addEventListener('input', (e) => { item.fieldOfStudy = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-gpa').addEventListener('input', (e) => { item.gpa = e.target.value; });

    const startMonthSelect = card.querySelector('.edu-start-month');
    const startYearSelect = card.querySelector('.edu-start-year');
    const endMonthSelect = card.querySelector('.edu-end-month');
    const endYearSelect = card.querySelector('.edu-end-year');
    const currentToggle = card.querySelector('.edu-current-toggle');
    const endGuide = card.querySelector('.edu-end-guide');

    function updateEduDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Present (Expected)' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateEduDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateEduDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently enrolled (expected completion)' : 'Month and year completed.';
      }
      updateEduDates();
    });

    card.querySelector('.edu-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderProjectsList() {
  const container = $('projects-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentProjects.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No projects added yet. Click "+ Add project" to highlight a personal, academic, or open-source project.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentProjects.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Ongoing' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.name || 'Untitled Project')} ${item.role ? '(' + escapeHtml(item.role) + ')' : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="proj-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary proj-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary proj-move-down" title="Move Down" ${index === currentProjects.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger proj-delete" title="Remove project">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Project name</label>
            <input type="text" class="proj-name" placeholder="e.g. Distributed Task Orchestrator" value="${escapeHtml(item.name)}" />
            <span class="field-guide">Title of the product, tool, or repository.</span>
          </div>
          <div class="group">
            <label>Your role</label>
            <input type="text" class="proj-role" placeholder="e.g. Creator, Lead Developer, Contributor" value="${escapeHtml(item.role)}" />
            <span class="field-guide">Your specific contribution or role.</span>
          </div>
          <div class="group full-width">
            <label>Project URL / Repository</label>
            <input type="url" class="proj-url" placeholder="https://github.com/..." value="${escapeHtml(item.url)}" />
            <span class="field-guide">Public demo link, live app, or GitHub repository.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="proj-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="proj-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year started.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="proj-current-toggle" ${item.current ? 'checked' : ''} />
                <span>Ongoing project</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="proj-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="proj-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide proj-end-guide">${item.current ? 'Currently ongoing project' : 'Month and year completed.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Description &amp; tech stack</label>
          <textarea class="proj-description" rows="3" placeholder="• Built using TypeScript, Next.js, Redis, and TailwindCSS&#10;• Designed high-throughput queue handling 10k req/sec&#10;• Deployed on AWS with automated CI/CD pipeline">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Technologies used, architecture, key features, and outcomes.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.proj-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.proj-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentProjects[index];
        currentProjects[index] = currentProjects[index - 1];
        currentProjects[index - 1] = temp;
        renderProjectsList();
      }
    });

    const moveDown = card.querySelector('.proj-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentProjects.length - 1) {
        const temp = currentProjects[index];
        currentProjects[index] = currentProjects[index + 1];
        currentProjects[index + 1] = temp;
        renderProjectsList();
      }
    });

    const delBtn = card.querySelector('.proj-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentProjects.splice(index, 1);
      renderProjectsList();
    });

    function updateProjTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.name || 'Untitled Project'} ${item.role ? '(' + item.role + ')' : ''}`;
    }

    card.querySelector('.proj-name').addEventListener('input', (e) => { item.name = e.target.value; updateProjTitle(); });
    card.querySelector('.proj-role').addEventListener('input', (e) => { item.role = e.target.value; updateProjTitle(); });
    card.querySelector('.proj-url').addEventListener('input', (e) => { item.url = e.target.value; });

    const startMonthSelect = card.querySelector('.proj-start-month');
    const startYearSelect = card.querySelector('.proj-start-year');
    const endMonthSelect = card.querySelector('.proj-end-month');
    const endYearSelect = card.querySelector('.proj-end-year');
    const currentToggle = card.querySelector('.proj-current-toggle');
    const endGuide = card.querySelector('.proj-end-guide');

    function updateProjDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Ongoing' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateProjDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateProjDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently ongoing project' : 'Month and year completed.';
      }
      updateProjDates();
    });

    card.querySelector('.proj-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderEligibilityList() {
  const container = $('eligibility-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentEligibilities.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No eligible countries added yet. Click "+ Add eligible country" to specify your work authorization.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentEligibilities.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const authText = item.workAuthorization === 'Yes' ? 'Authorized' : item.workAuthorization === 'No' ? 'Not authorized' : 'Authorization unset';
    const countryTitle = item.country ? escapeHtml(item.country) : 'New Eligible Country';

    const sponsorParts = [];
    if (item.sponsorshipNow === 'Yes') sponsorParts.push('Needs sponsorship now');
    else if (item.sponsorshipNow === 'No') sponsorParts.push('No immediate sponsorship');
    if (item.sponsorshipFuture === 'Yes') sponsorParts.push('Needs future sponsorship');
    else if (item.sponsorshipFuture === 'No') sponsorParts.push('No future sponsorship');
    const sponsorText = sponsorParts.length ? sponsorParts.join(' • ') : (item.workAuthorization ? 'Sponsorship not specified' : 'Country and visa requirements');

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${countryTitle} – ${authText}</div>
          <div class="card-summary-date">${escapeHtml(sponsorText)}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="elig-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary elig-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary elig-move-down" title="Move Down" ${index === currentEligibilities.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger elig-delete" title="Remove country">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label for="${index === 0 ? 'pf-workCountry' : 'elig-country-' + index}">Country</label>
            <input type="text" class="elig-country" ${index === 0 ? 'id="pf-workCountry" name="workCountry"' : 'id="elig-country-' + index + '"'} placeholder="e.g. Canada, United States, United Kingdom" value="${escapeHtml(item.country)}" />
            <span class="field-guide">Country where you hold citizenship, residency, or work rights.</span>
          </div>
          <div class="group">
            <label for="${index === 0 ? 'pf-workAuthorization' : 'elig-auth-' + index}">Authorized to work in this country?</label>
            <select class="elig-auth" ${index === 0 ? 'id="pf-workAuthorization" name="workAuthorization"' : 'id="elig-auth-' + index + '"'}>
              <option value="" ${!item.workAuthorization ? 'selected' : ''}>Not set</option>
              <option value="Yes" ${item.workAuthorization === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${item.workAuthorization === 'No' ? 'selected' : ''}>No</option>
            </select>
            <span class="field-guide">Are you legally authorized to work in this country?</span>
          </div>
          <div class="group">
            <label for="${index === 0 ? 'pf-sponsorshipNow' : 'elig-sponsor-now-' + index}">Require sponsorship now?</label>
            <select class="elig-sponsor-now" ${index === 0 ? 'id="pf-sponsorshipNow" name="sponsorshipNow"' : 'id="elig-sponsor-now-' + index + '"'}>
              <option value="" ${!item.sponsorshipNow ? 'selected' : ''}>Not set</option>
              <option value="Yes" ${item.sponsorshipNow === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${item.sponsorshipNow === 'No' ? 'selected' : ''}>No</option>
            </select>
            <span class="field-guide">Do you now require employer sponsorship for employment visa status?</span>
          </div>
          <div class="group">
            <label for="${index === 0 ? 'pf-sponsorshipFuture' : 'elig-sponsor-future-' + index}">Require sponsorship in the future?</label>
            <select class="elig-sponsor-future" ${index === 0 ? 'id="pf-sponsorshipFuture" name="sponsorshipFuture"' : 'id="elig-sponsor-future-' + index + '"'}>
              <option value="" ${!item.sponsorshipFuture ? 'selected' : ''}>Not set</option>
              <option value="Yes" ${item.sponsorshipFuture === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${item.sponsorshipFuture === 'No' ? 'selected' : ''}>No</option>
            </select>
            <span class="field-guide">Will you in the future require visa sponsorship in this country?</span>
          </div>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.elig-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
      updateSubnavBadges();
      checkProfileDirty();
    });

    const moveUp = card.querySelector('.elig-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentEligibilities[index];
        currentEligibilities[index] = currentEligibilities[index - 1];
        currentEligibilities[index - 1] = temp;
        renderEligibilityList();
        checkProfileDirty();
      }
    });

    const moveDown = card.querySelector('.elig-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentEligibilities.length - 1) {
        const temp = currentEligibilities[index];
        currentEligibilities[index] = currentEligibilities[index + 1];
        currentEligibilities[index + 1] = temp;
        renderEligibilityList();
        checkProfileDirty();
      }
    });

    const delBtn = card.querySelector('.elig-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentEligibilities.splice(index, 1);
      renderEligibilityList();
      checkProfileDirty();
    });

    const countryInput = card.querySelector('.elig-country');
    const authSelect = card.querySelector('.elig-auth');
    const sponsorNowSelect = card.querySelector('.elig-sponsor-now');
    const sponsorFutureSelect = card.querySelector('.elig-sponsor-future');

    function updateCardLabels() {
      const aText = item.workAuthorization === 'Yes' ? 'Authorized' : item.workAuthorization === 'No' ? 'Not authorized' : 'Authorization unset';
      const cTitle = item.country ? item.country : 'New Eligible Country';
      card.querySelector('.card-summary-title').textContent = `${cTitle} – ${aText}`;

      const sParts = [];
      if (item.sponsorshipNow === 'Yes') sParts.push('Needs sponsorship now');
      else if (item.sponsorshipNow === 'No') sParts.push('No immediate sponsorship');
      if (item.sponsorshipFuture === 'Yes') sParts.push('Needs future sponsorship');
      else if (item.sponsorshipFuture === 'No') sParts.push('No future sponsorship');
      card.querySelector('.card-summary-date').textContent = sParts.length ? sParts.join(' • ') : (item.workAuthorization ? 'Sponsorship not specified' : 'Country and visa requirements');
    }

    countryInput.addEventListener('input', () => {
      item.country = countryInput.value;
      updateCardLabels();
      updateSubnavBadges();
      checkProfileDirty();
    });

    authSelect.addEventListener('change', () => {
      item.workAuthorization = authSelect.value;
      updateCardLabels();
      checkProfileDirty();
    });

    sponsorNowSelect.addEventListener('change', () => {
      item.sponsorshipNow = sponsorNowSelect.value;
      updateCardLabels();
      checkProfileDirty();
    });

    sponsorFutureSelect.addEventListener('change', () => {
      item.sponsorshipFuture = sponsorFutureSelect.value;
      updateCardLabels();
      checkProfileDirty();
    });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderLanguagesList() {
  const container = $('languages-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentLanguages.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No languages added yet. Click "+ Add language" to add languages and proficiency levels.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentLanguages.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const profParts = [
      item.reading ? `Reading: ${item.reading}` : '',
      item.writing ? `Writing: ${item.writing}` : '',
      item.speaking ? `Speaking: ${item.speaking}` : '',
    ].filter(Boolean);

    const fluencyLabel = item.fluent === 'Yes' ? 'Fluent' : item.fluent === 'No' ? 'Not fluent' : '';
    const subtitle = proficienciesSummary(profParts, fluencyLabel);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.language || 'New Language')} ${fluencyLabel ? '• ' + escapeHtml(fluencyLabel) : ''}</div>
          <div class="card-summary-date">${escapeHtml(subtitle)}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="lang-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary lang-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary lang-move-down" title="Move Down" ${index === currentLanguages.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger lang-delete" title="Remove language">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label for="pf-lang-${item.id}-language">Language</label>
            <input type="text" class="lang-language" id="pf-lang-${item.id}-language" placeholder="e.g. English, French, Spanish" value="${escapeHtml(item.language)}" />
            <span class="field-guide">Full name of the language.</span>
          </div>
          <div class="group">
            <label for="pf-lang-${item.id}-fluent">Fluent?</label>
            <select class="lang-fluent" id="pf-lang-${item.id}-fluent">
              <option value="" ${!item.fluent ? 'selected' : ''}>Not set</option>
              <option value="Yes" ${item.fluent === 'Yes' ? 'selected' : ''}>Yes</option>
              <option value="No" ${item.fluent === 'No' ? 'selected' : ''}>No</option>
            </select>
            <span class="field-guide">Whether you have native or fluent mastery.</span>
          </div>
          <div class="group">
            <label for="pf-lang-${item.id}-reading">Reading</label>
            <input type="text" class="lang-reading" id="pf-lang-${item.id}-reading" placeholder="e.g. Advanced, Intermediate, Native" value="${escapeHtml(item.reading)}" />
            <span class="field-guide">Exact reading proficiency for ATS forms.</span>
          </div>
          <div class="group">
            <label for="pf-lang-${item.id}-writing">Writing</label>
            <input type="text" class="lang-writing" id="pf-lang-${item.id}-writing" placeholder="e.g. Advanced, Intermediate, Native" value="${escapeHtml(item.writing)}" />
            <span class="field-guide">Exact writing proficiency for ATS forms.</span>
          </div>
          <div class="group full-width">
            <label for="pf-lang-${item.id}-speaking">Speaking</label>
            <input type="text" class="lang-speaking" id="pf-lang-${item.id}-speaking" placeholder="e.g. Advanced, Intermediate, Native" value="${escapeHtml(item.speaking)}" />
            <span class="field-guide">Exact speaking and conversational proficiency.</span>
          </div>
        </div>
      </div>
    `;

    function proficienciesSummary(parts, fluency) {
      if (parts.length > 0) return parts.join(' • ');
      if (fluency) return fluency;
      return 'Proficiency levels';
    }

    function updateLanguageLabels() {
      const fLabel = item.fluent === 'Yes' ? 'Fluent' : item.fluent === 'No' ? 'Not fluent' : '';
      card.querySelector('.card-summary-title').textContent = `${item.language || 'New Language'}${fLabel ? ' • ' + fLabel : ''}`;
      const parts = [
        item.reading ? `Reading: ${item.reading}` : '',
        item.writing ? `Writing: ${item.writing}` : '',
        item.speaking ? `Speaking: ${item.speaking}` : '',
      ].filter(Boolean);
      card.querySelector('.card-summary-date').textContent = proficienciesSummary(parts, fLabel);
    }

    const header = card.querySelector('.card-header');
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    });

    header.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.card-controls')) {
        e.preventDefault();
        item._collapsed = !item._collapsed;
        card.classList.toggle('is-collapsed', item._collapsed);
      }
    });

    card.querySelector('.lang-enabled-toggle').addEventListener('change', (e) => {
      e.stopPropagation();
      item.enabled = e.target.checked;
      card.classList.toggle('is-disabled', !item.enabled);
      updateSubnavBadges();
      checkProfileDirty();
    });

    card.querySelector('.lang-move-up').addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentLanguages[index];
        currentLanguages[index] = currentLanguages[index - 1];
        currentLanguages[index - 1] = temp;
        renderLanguagesList();
        checkProfileDirty();
      }
    });

    card.querySelector('.lang-move-down').addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentLanguages.length - 1) {
        const temp = currentLanguages[index];
        currentLanguages[index] = currentLanguages[index + 1];
        currentLanguages[index + 1] = temp;
        renderLanguagesList();
        checkProfileDirty();
      }
    });

    card.querySelector('.lang-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      currentLanguages.splice(index, 1);
      renderLanguagesList();
      checkProfileDirty();
    });

    const langInput = card.querySelector('.lang-language');
    const fluentSelect = card.querySelector('.lang-fluent');
    const readingInput = card.querySelector('.lang-reading');
    const writingInput = card.querySelector('.lang-writing');
    const speakingInput = card.querySelector('.lang-speaking');

    langInput.addEventListener('input', () => {
      item.language = langInput.value;
      updateLanguageLabels();
      updateSubnavBadges();
      checkProfileDirty();
    });

    fluentSelect.addEventListener('change', () => {
      item.fluent = fluentSelect.value;
      updateLanguageLabels();
      checkProfileDirty();
    });

    readingInput.addEventListener('input', () => {
      item.reading = readingInput.value;
      updateLanguageLabels();
      checkProfileDirty();
    });

    writingInput.addEventListener('input', () => {
      item.writing = writingInput.value;
      updateLanguageLabels();
      checkProfileDirty();
    });

    speakingInput.addEventListener('input', () => {
      item.speaking = speakingInput.value;
      updateLanguageLabels();
      checkProfileDirty();
    });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderProfile(profile) {
  const identity = $('identity-fields');
  if (identity) {
    if (profile.fullName && !profile.firstName && !profile.lastName) {
      const parts = profile.fullName.trim().split(/\s+/);
      profile.firstName = parts[0] || '';
      if (parts.length === 2) {
        profile.lastName = parts[1];
      } else if (parts.length > 2) {
        profile.middleName = parts.slice(1, -1).join(' ');
        profile.lastName = parts.at(-1);
      }
    }
    identity.replaceChildren(...CORE_CONTACT_FIELDS.map((field) => group(field, profile[field.name])));
    const hiddenFullName = document.createElement('input');
    hiddenFullName.type = 'hidden';
    hiddenFullName.id = 'pf-fullName';
    hiddenFullName.name = 'fullName';
    hiddenFullName.value = profile.fullName || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ');
    identity.append(hiddenFullName);

    const syncFullName = () => {
      const fn = $('pf-firstName')?.value?.trim() || '';
      const mn = $('pf-middleName')?.value?.trim() || '';
      const ln = $('pf-lastName')?.value?.trim() || '';
      const full = [fn, mn, ln].filter(Boolean).join(' ');
      const hidden = $('pf-fullName');
      if (hidden) hidden.value = full;
    };
    $('pf-firstName')?.addEventListener('input', syncFullName);
    $('pf-middleName')?.addEventListener('input', syncFullName);
    $('pf-lastName')?.addEventListener('input', syncFullName);
  }

  const address = $('address-fields');
  if (address) {
    address.replaceChildren(...ADDRESS_FIELDS.map((field) => group(field, profile[field.name])));
  }

  const links = $('links-fields');
  if (links) {
    links.replaceChildren(...LINK_FIELDS.map((field) => group(field, profile[field.name])));
  }

  currentWork = (profile.workExperiences || []).map((w) => createWorkExperience({ ...w, _collapsed: true }));
  currentEducation = (profile.education || []).map((e) => createEducation({ ...e, _collapsed: true }));
  currentProjects = (profile.projects || []).map((p) => createProject({ ...p, _collapsed: true }));
  currentSkills = Array.isArray(profile.skills) ? [...profile.skills] : [];
  currentLanguages = (profile.languageRecords || []).map((l) => createLanguage({ ...l, _collapsed: true }));
  currentEligibilities = (profile.workEligibilities || []).map((e) => createWorkEligibility({ ...e, _collapsed: true }));
  if (currentEligibilities.length === 0) {
    currentEligibilities = [createWorkEligibility({
      country: profile.workCountry || '',
      workAuthorization: profile.workAuthorization || '',
      sponsorshipNow: profile.sponsorshipNow || '',
      sponsorshipFuture: profile.sponsorshipFuture || '',
      _collapsed: true,
    })];
  }

  renderWorkExperiencesList();
  renderEducationList();
  renderProjectsList();
  renderSkillsChips();
  renderLanguagesList();
  renderEligibilityList();
  updateSubnavBadges();

  const prefSectionsContainer = $('profile-preferences-sections');
  if (prefSectionsContainer) {
    const prefSections = PROFILE_SECTIONS.filter((s) => ['Work preferences', 'Compensation', 'Background'].includes(s.title));
    prefSectionsContainer.replaceChildren(...prefSections.map((section) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = section.title;
      fieldset.append(legend);
      if (section.description) {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = section.description;
        fieldset.append(hint);
      }
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.append(...section.fields.map((field) => group(field, profile[field.name])));
      fieldset.append(grid);
      return fieldset;
    }));
  }

  const demoContainer = $('demographics-fields');
  if (demoContainer) {
    const demoSection = PROFILE_SECTIONS.find((s) => s.title === 'Demographics & disclosures');
    if (demoSection) {
      demoContainer.replaceChildren(...demoSection.fields.map((field) => group(field, profile[field.name])));
    }
  }

  $('applicantNotes').value = profile.applicantNotes || '';
  savedProfileSnapshot = serializeCurrentProfile();
  const dock = $('profile-floating-dock');
  if (dock) dock.classList.remove('is-visible');
}

function renderModel(settings) {
  const select = $('model');
  const custom = $('model-custom');
  const isKnown = POPULAR_MODELS.includes(settings.model);
  select.replaceChildren(
    ...POPULAR_MODELS.map((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      option.selected = settings.model === model;
      return option;
    }),
  );
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom model...';
  customOption.selected = !isKnown;
  select.append(customOption);

  custom.hidden = isKnown;
  custom.value = settings.model || DEFAULT_SETTINGS.model;

  select.onchange = () => {
    custom.hidden = select.value !== 'custom';
    if (select.value !== 'custom') custom.value = select.value;
  };
}

function setKeyBadge(hasKey) {
  const badge = $('key-status');
  badge.textContent = hasKey ? 'Key saved' : 'No key';
  badge.className = `badge ${hasKey ? 'ok' : 'warn'}`;
}

async function init() {
  $('version').textContent = `v${APP_VERSION}`;

  const snapshot = await readStore();
  const settings = { ...DEFAULT_SETTINGS, ...(snapshot.data[STORAGE_KEYS.SETTINGS] || {}) };
  const profile = { ...DEFAULT_PROFILE, ...(snapshot.data[STORAGE_KEYS.PROFILE] || {}) };

  setKeyBadge(snapshot.hasApiKey);
  renderModel(settings);
  renderProfile(profile);

  async function refreshResume() {
    const res = await sendMessage({ type: MSG.DOC_META });
    const meta = res?.meta;
    $('resume-status').textContent = meta
      ? `Stored: ${meta.name} (${Math.round((meta.size || 0) / 1024)} KB)`
      : 'No resume stored.';
  }
  await refreshResume();

  $('save-resume').onclick = async () => {
    const file = $('resume-file').files?.[0];
    if (!file) {
      flash($('resume-feedback'), 'Choose a file first.', true);
      return;
    }
    const buffer = await file.arrayBuffer();
    await sendMessage({ type: MSG.DOC_PUT, name: file.name, mimeType: file.type, buffer });
    $('resume-file').value = '';
    await refreshResume();
    flash($('resume-feedback'), 'Resume stored.');
  };

  $('clear-resume').onclick = async () => {
    await sendMessage({ type: MSG.DOC_DELETE });
    await refreshResume();
    flash($('resume-feedback'), 'Resume removed.');
  };

  $('save-key').onclick = async () => {
    const value = $('api-key').value.trim();
    if (!value) {
      flash($('key-feedback'), 'Enter a key first.', true);
      return;
    }
    const res = await sendMessage({ type: MSG.SECRET_WRITE, apiKey: value });
    $('api-key').value = '';
    setKeyBadge(Boolean(res?.hasApiKey));
    flash($('key-feedback'), 'Key saved.');
  };

  $('clear-key').onclick = async () => {
    await sendMessage({ type: MSG.SECRET_CLEAR });
    setKeyBadge(false);
    flash($('key-feedback'), 'Key removed.');
  };

  $('test-key').onclick = async () => {
    const feedback = $('key-feedback');
    feedback.classList.remove('error');
    feedback.textContent = 'Testing...';
    const current = await readStore();
    const model = { ...DEFAULT_SETTINGS, ...(current.data[STORAGE_KEYS.SETTINGS] || {}) }.model;
    const result = await sendMessage({
      type: MSG.AI_REQUEST,
      options: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'X-Title': 'Kareer' },
        data: JSON.stringify({
          model,
          messages: [{ role: 'user', content: "Ping test. Respond with the single word 'OK'." }],
          max_tokens: 10,
        }),
        timeout: 15000,
      },
    });
    if (result?.error) flash(feedback, result.error, true);
    else if (result.status === 200) flash(feedback, `Connected using ${model}.`);
    else flash(feedback, `OpenRouter returned HTTP ${result.status}.`, true);
  };

  $('save-model').onclick = async () => {
    const select = $('model');
    const model = (select.value === 'custom' ? $('model-custom').value.trim() : select.value) || DEFAULT_SETTINGS.model;
    const current = await readStore();
    const next = { ...DEFAULT_SETTINGS, ...(current.data[STORAGE_KEYS.SETTINGS] || {}), model };
    await sendMessage({ type: MSG.STORAGE_SET, key: STORAGE_KEYS.SETTINGS, value: next });
    flash($('model-feedback'), 'Model saved.');
  };

  $('add-work-btn').onclick = () => {
    currentWork.push(createWorkExperience({ _collapsed: false }));
    renderWorkExperiencesList();
  };

  $('add-education-btn').onclick = () => {
    currentEducation.push(createEducation({ _collapsed: false }));
    renderEducationList();
  };

  $('add-project-btn').onclick = () => {
    currentProjects.push(createProject({ _collapsed: false }));
    renderProjectsList();
  };

  const addEligibilityBtn = $('add-eligibility-btn');
  if (addEligibilityBtn) {
    addEligibilityBtn.onclick = () => {
      currentEligibilities.push(createWorkEligibility({ _collapsed: false }));
      renderEligibilityList();
      checkProfileDirty();
    };
  }

  const addLanguageBtn = $('add-language-btn');
  if (addLanguageBtn) {
    addLanguageBtn.onclick = () => {
      currentLanguages.push(createLanguage({ _collapsed: false }));
      renderLanguagesList();
      checkProfileDirty();
    };
  }

  $('add-skill-btn').onclick = () => {
    addSkillFromInput();
  };

  $('skill-input').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkillFromInput();
    }
  };

  $('profile-form').onsubmit = async (event) => {
    event.preventDefault();
    const current = await readStore();
    const stored = current.data[STORAGE_KEYS.PROFILE] || {};
    const next = { ...DEFAULT_PROFILE, ...stored };
    for (const input of $('profile-form').querySelectorAll('input, select, textarea')) {
      if (input.name && !input.closest('.repeatable-card') && !input.closest('.skill-input-row')) {
        next[input.name] = input.value;
      }
    }
    const fn = $('pf-firstName')?.value?.trim() || '';
    const mn = $('pf-middleName')?.value?.trim() || '';
    const ln = $('pf-lastName')?.value?.trim() || '';
    next.fullName = [fn, mn, ln].filter(Boolean).join(' ') || $('pf-fullName')?.value || next.fullName || '';

    next.workExperiences = currentWork.map(({ _collapsed, ...rest }) => rest);
    next.education = currentEducation.map(({ _collapsed, ...rest }) => rest);
    next.projects = currentProjects.map(({ _collapsed, ...rest }) => rest);
    next.skills = [...currentSkills];
    next.workEligibilities = currentEligibilities.map(({ _collapsed, ...rest }) => rest);
    next.languageRecords = currentLanguages.map(({ _collapsed, ...rest }) => rest);

    const primaryElig = next.workEligibilities.find((e) => e && e.enabled !== false) || next.workEligibilities[0];
    if (primaryElig) {
      next.workCountry = primaryElig.country || '';
      next.workAuthorization = primaryElig.workAuthorization || '';
      next.sponsorshipNow = primaryElig.sponsorshipNow || '';
      next.sponsorshipFuture = primaryElig.sponsorshipFuture || '';
    }

    await sendMessage({ type: MSG.STORAGE_SET, key: STORAGE_KEYS.PROFILE, value: next });
    savedProfileSnapshot = serializeCurrentProfile();
    flash($('profile-feedback'), 'Profile saved.');
    updateProfileStrength();

    const dock = $('profile-floating-dock');
    const dot = $('dock-status-dot');
    const message = $('dock-status-message');
    if (dock) {
      dock.classList.add('is-visible');
      if (dot) dot.className = 'dock-dot saved';
      if (message) message.textContent = 'Profile saved';
      if (saveHideTimeout) clearTimeout(saveHideTimeout);
      saveHideTimeout = setTimeout(() => {
        dock.classList.remove('is-visible');
        saveHideTimeout = null;
      }, 1600);
    }
  };

  const floatingSaveBtn = $('floating-save-btn');
  if (floatingSaveBtn) {
    floatingSaveBtn.onclick = () => {
      $('profile-form').requestSubmit();
    };
  }

  $('profile-form').addEventListener('input', () => {
    updateProfileStrength();
    checkProfileDirty();
  });
  $('profile-form').addEventListener('change', () => {
    updateProfileStrength();
    checkProfileDirty();
  });

  $('export-data').onclick = async () => {
    const current = await readStore();
    const blob = new Blob([JSON.stringify(exportPayload(current.data), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kareer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash($('migration-feedback'), 'Exported.');
  };

  $('import-data').onclick = () => $('import-file').click();

  $('import-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const entries = importPayload(JSON.parse(await file.text()));
      for (const [key, value] of Object.entries(entries)) {
        await sendMessage({ type: MSG.STORAGE_SET, key, value });
      }
      const refreshed = await readStore();
      renderProfile({ ...DEFAULT_PROFILE, ...(refreshed.data[STORAGE_KEYS.PROFILE] || {}) });
      renderModel({ ...DEFAULT_SETTINGS, ...(refreshed.data[STORAGE_KEYS.SETTINGS] || {}) });
      flash($('migration-feedback'), `Imported ${Object.keys(entries).length} records. Re-enter your API key above.`);
    } catch (err) {
      flash($('migration-feedback'), `Import failed: ${err.message}`, true);
    } finally {
      event.target.value = '';
    }
  };

  setupNavigation();
  updateSubnavBadges();
  handleInitialHash();
}

function setupNavigation() {
  const toggleBtn = $('profile-subnav-toggle');
  const navGroup = $('profile-nav-group');
  const profileParentLink = $('profile-nav-link');

  if (toggleBtn && navGroup) {
    toggleBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      navGroup.classList.toggle('is-collapsed');
    };
  }

  if (profileParentLink && navGroup) {
    profileParentLink.addEventListener('click', (e) => {
      navGroup.classList.remove('is-collapsed');
      const target = $('profile');
      if (target) {
        e.preventDefault();
        history.pushState(null, '', '#profile');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        updateActiveNav('#profile');
      }
    });
  }

  // Smooth scroll and pulse on subsection click
  const subnavLinks = document.querySelectorAll('.subnav-item');
  subnavLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const targetId = href.slice(1);
        const target = document.getElementById(targetId);
        if (target) {
          e.preventDefault();
          history.pushState(null, '', href);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.remove('highlight-pulse');
          void target.offsetWidth;
          target.classList.add('highlight-pulse');
          setTimeout(() => target.classList.remove('highlight-pulse'), 1600);
          updateActiveNav(href);
        }
      }
    });
  });

  // Top level links smooth scroll
  const topLinks = document.querySelectorAll('.settings-nav > nav > a');
  topLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          history.pushState(null, '', href);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          updateActiveNav(href);
        }
      }
    });
  });

  // Scroll spy
  window.addEventListener('scroll', throttle(onWindowScroll, 50), { passive: true });
}

function updateActiveNav(activeHash) {
  document.querySelectorAll('.settings-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === activeHash);
  });
}

function onWindowScroll() {
  const sections = [
    { id: 'connection', el: $('connection') },
    { id: 'models', el: $('models') },
    { id: 'section-identity', el: $('section-identity') },
    { id: 'section-address', el: $('section-address') },
    { id: 'section-links', el: $('section-links') },
    { id: 'section-work', el: $('section-work') },
    { id: 'section-education', el: $('section-education') },
    { id: 'section-projects', el: $('section-projects') },
    { id: 'section-skills', el: $('section-skills') },
    { id: 'section-languages', el: $('section-languages') },
    { id: 'section-eligibility', el: $('section-eligibility') },
    { id: 'section-preferences', el: $('section-preferences') },
    { id: 'section-demographics', el: $('section-demographics') },
    { id: 'section-rules', el: $('section-rules') },
    { id: 'resume', el: $('resume') },
    { id: 'advanced', el: $('advanced') },
  ];

  const scrollY = window.scrollY;
  const threshold = scrollY + 140;

  let currentId = null;
  for (const s of sections) {
    if (s.el) {
      if (s.el.offsetTop <= threshold) {
        currentId = s.id;
      }
    }
  }

  if (!currentId && sections[0].el) {
    currentId = sections[0].id;
  }

  const profileSubIds = [
    'section-identity',
    'section-address',
    'section-links',
    'section-work',
    'section-education',
    'section-projects',
    'section-skills',
    'section-languages',
    'section-eligibility',
    'section-preferences',
    'section-demographics',
    'section-rules',
  ];
  const isProfileSub = profileSubIds.includes(currentId);

  document.querySelectorAll('.settings-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === '#' + currentId) {
      a.classList.add('active');
    } else if (href === '#profile' && isProfileSub) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
}

function throttle(fn, wait) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, wait);
    }
  };
}

function handleInitialHash() {
  const hash = window.location.hash;
  if (!hash) {
    updateActiveNav('#connection');
    return;
  }
  const target = document.querySelector(hash);
  if (target) {
    const group = $('profile-nav-group');
    if (group) group.classList.remove('is-collapsed');

    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.remove('highlight-pulse');
      void target.offsetWidth;
      target.classList.add('highlight-pulse');
      setTimeout(() => target.classList.remove('highlight-pulse'), 1600);
      updateActiveNav(hash);
    }, 150);
  }
}
window.addEventListener('hashchange', handleInitialHash);

api.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.STORAGE_CHANGED && message.secretChanged) {
    setKeyBadge(Boolean(message.hasApiKey));
  }
});

init().catch((err) => {
  document.body.prepend(Object.assign(document.createElement('p'), {
    textContent: `Failed to load options: ${err.message}`,
    style: 'color:#fca5a5',
  }));
});
