import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { captureJob } from '../../src/core/jobs.js';
import { createSession, restoreSession, saveSession } from '../../src/core/sessions.js';
import { rememberAnswer, recallAnswer } from '../../src/core/memory.js';
import { classifyPage, isVisible } from '../../src/core/pageClassifier.js';
import { inspectValidation } from '../../src/core/validation.js';
import { findContinue } from '../../src/core/navigation.js';
import { pageSignature } from '../../src/core/navigation.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { saveProfile, saveSettings, gmGet } from '../../src/core/storage.js';

let dom;
beforeEach(() => {
  dom = new JSDOM('<body><main></main></body>', { url: 'https://example.com/jobs/42/apply' });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => structuredClone(storage.has(key) ? storage.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => storage.delete(key);
  globalThis.GM_getTab = undefined;
  saveSettings({ autoContinue: true });
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com' });
});
afterEach(() => dom.window.close());
const render = html => { document.querySelector('main').innerHTML = html; };
const input = (id = 'name', label = 'Full name') => `<label for="${id}">${label}</label><input id="${id}" required>`;
const job = () => ({ title: 'Engineer', company: 'Example', listingUrl: 'https://example.com/jobs/42', applicationUrl: window.location.href });

const workflowAnswers = async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) });

test('an unresolved required canonical answer receives bounded contextual repair',async()=>{
  dom.reconfigure({url:'https://jobs.ashbyhq.com/acme/1/application'});
  render('<h1>Job Application</h1><form data-ashby-root>'+input('email','Email')+'</form>');
  saveSettings({autoContinue:false});
  let calls=0;
  const engine=createApplicationEngine({settleMs:0,answer:async fields=>{
    calls++;
    return {answers:fields.map(field=>({fieldId:field.fieldId,value:calls===1?'':'test@example.com',source:'ai',inferred:true}))};
  }});
  try {
    await engine.start();
    assert.equal(calls,2);
    assert.equal(document.querySelector('#email').value,'test@example.com');
    assert.equal(engine.session.reason,'Page filled. Auto Continue is off.');
  } finally {engine.destroy();}
});

test('destroy during initialization does not restore a session or register observers', async () => {
  render('<h1>Job Application</h1>' + input());
  let emissions = 0;
  const engine = createApplicationEngine({ onChange: () => emissions++ });
  const initializing = engine.initialize();
  engine.destroy();
  await initializing;
  assert.equal(engine.session, null);
  assert.equal(emissions, 0);
});

test('destroy during a request discards queued job context and late emissions', async () => {
  render('<h1>Engineer A</h1>' + input() + '<button>Continue</button>');
  let release, emissions = 0;
  const engine = createApplicationEngine({ settleMs: 0, answer: () => new Promise(resolve => { release = resolve; }), onChange: () => emissions++ });
  const pending = engine.start(captureJob());
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  const oldId = engine.session.id;
  engine.updateJob({ ...engine.session.job, title: 'Engineer B' });
  engine.destroy();
  const count = emissions;
  release({ answers: [{ fieldId: 'name', value: 'Late answer' }] });
  await pending;
  assert.equal(engine.session.id, oldId);
  assert.equal(emissions, count);
  assert.equal(gmGet('kr:sessions').length, 1);
});

test('queued automatic capture preserves a restored same-application POST redirect', async () => {
  const old = createSession({ ...job(), applicationUrl: 'https://example.com/apply/42/step1', workCountry: 'Canada', workCountries: ['Canada'] });
  old.active = true;
  old.pendingUrl = old.job.applicationUrl;
  old.pendingAt = Date.now();
  saveSession(old);
  globalThis.GM_getTab = callback => callback({ kareerSession: old.id });
  dom.reconfigure({ url: 'https://example.com/apply/42/step2' });
  render('<h1>Application · Experience</h1>' + input());
  const engine = createApplicationEngine({ answer: workflowAnswers, settleMs: 0 });
  try {
    const pending = engine.initialize();
    engine.updateJob(captureJob());
    await pending;
    engine.updateJob(captureJob());
    assert.equal(engine.session.id, old.id);
    assert.equal(engine.session.job.title, 'Engineer');
    assert.equal(engine.session.job.workCountry, 'Canada');
  } finally { engine.destroy(); }
});

test('capture queued during initialization replaces stale same-URL job context', async () => {
  const old = createSession({ ...job(), title: 'Engineer A', listingUrl: window.location.href, workCountry: 'United States' });
  render('<h1>Engineer B</h1><div class="job__location">Canada</div>' + input());
  const captured = captureJob();
  const engine = createApplicationEngine();
  try {
    const initializing = engine.initialize();
    engine.updateJob(captured);
    await initializing;
    assert.equal(engine.session.job.title, 'Engineer B');
    assert.equal(engine.session.job.workCountry, 'Canada');
    assert.notEqual(engine.session.id, old.id);
    assert.equal(document.querySelector('#name').value, '');
  } finally { engine.destroy(); }
});

test('a different job clears a paused workflow while a genuine step heading preserves it', async () => {
  render('<h1>Engineer A</h1>' + input() + '<button>Continue</button>');
  saveSettings({ autoContinue: false });
  const engine = createApplicationEngine({ answer: workflowAnswers, settleMs: 0 });
  try {
    await engine.start(captureJob());
    const oldId = engine.session.id;
    assert.equal(engine.stepReview, true);
    render('<h1>My Information</h1>' + input() + '<button>Continue</button>');
    engine.updateJob(captureJob());
    assert.equal(engine.session.id, oldId);
    assert.equal(engine.session.job.title, 'Engineer A');
    render('<h1>Engineer B</h1>' + input() + '<button>Continue</button>');
    engine.updateJob(captureJob());
    assert.notEqual(engine.session.id, oldId);
    assert.equal(engine.session.job.title, 'Engineer B');
    assert.deepEqual(engine.session.answers, {});
    assert.equal(engine.stepReview, false);
  } finally { engine.destroy(); }
});

test('review-route recapture preserves the completed application session', async () => {
  render('<h1>Engineer</h1>' + input() + '<button>Continue</button>');
  document.querySelector('button').onclick = () => {
    window.history.replaceState({}, '', '/jobs/42/review');
    render('<h1>Review application</h1><button>Submit application</button>');
  };
  const engine = createApplicationEngine({ answer: workflowAnswers, settleMs: 0, transitionMs: 0 });
  try {
    await engine.start(captureJob());
    const id = engine.session.id;
    assert.equal(engine.session.status, 'review');
    engine.updateJob(captureJob());
    assert.equal(engine.session.id, id);
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

for (const directReview of [false, true]) {
  for (const separateUrl of [false, true]) {
    test(`confirmation recapture preserves submission (${directReview ? 'direct review' : 'filled form'}, ${separateUrl ? 'new URL' : 'same URL'})`, async () => {
      saveSettings({ autoContinue: true, autoSubmit: true });
      const review = () => {
        if (separateUrl) window.history.replaceState({}, '', '/jobs/42/review');
        render('<h1>Review application</h1><button>Submit application</button>');
        document.querySelector('button').onclick = () => {
          if (separateUrl) window.history.replaceState({}, '', '/jobs/42/confirmation');
          render('<h1>Application submitted</h1>');
        };
      };
      if (directReview) review();
      else {
        render('<h1>Engineer</h1>' + input() + '<button>Continue</button>');
        document.querySelector('button').onclick = review;
      }
      const engine = createApplicationEngine({ answer: workflowAnswers, settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
      try {
        await engine.start(captureJob());
        const id = engine.session.id;
        assert.equal(engine.session.status, 'confirmation');
        engine.updateJob(captureJob());
        assert.equal(engine.session.id, id);
        assert.equal(engine.session.status, 'confirmation');
        assert.equal(engine.session.submits, 1);
        assert.equal(engine.session.completedSteps, directReview ? 0 : 1);
      } finally { engine.destroy(); }
    });
  }
}

for (const workday of [false, true]) {
  test(`continuation preserves review edits with overwrite enabled (${workday ? 'Workday' : 'generic'})`, async () => {
    saveSettings({ autoContinue: false, overwriteExisting: true });
    if (workday) {
      dom.reconfigure({ url: 'https://acme.myworkdayjobs.com/job/apply' });
      globalThis.location = dom.window.location;
      saveProfile({ workExperiences: [{ id: 'saved', title: 'Engineer', company: 'Acme', description: 'Saved description' }] });
      render('<h2>My Experience</h2><div data-automation-id="workExperienceSection"><div data-automation-id="workExperience-1"><input id="a--jobTitle" value="Engineer"><input id="a--company" value="Acme"><label for="a--roleDescription">Description</label><textarea id="a--roleDescription"></textarea></div></div><button>Continue</button>');
    } else {
      render(`${input()}<button>Continue</button>`);
    }
    const selector = workday ? '#a--roleDescription' : '#name';
    let continuedValue;
    document.querySelector('button').onclick = () => {
      continuedValue = document.querySelector(selector).value;
      render('<h1>Review application</h1>');
    };
    const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: workday ? 'Saved description' : 'Applicant' })) }) });
    try {
      await engine.start(job());
      assert.equal(engine.stepReview, true);
      assert.equal(document.querySelector(selector).value, workday ? 'Saved description' : 'Applicant');
      document.querySelector(selector).value = 'User correction';
      await engine.continueStep();
      assert.equal(continuedValue, 'User correction');
      assert.equal(engine.session.status, 'review');
    } finally { engine.destroy(); }
  });
}

// Structure observed on RBC's Phenom Apply frontend, without applicant data.
const phenomProgress = '<div role="toolbar"><li role="button" atm-id="applicationReview"><a tabindex="-1"><span stepnum="applicationReview"></span><span>Review</span></a></li></div>';

test('Phenom progress Review does not compete with the form Next button', () => {
  render(`${phenomProgress}<div class="navigation"><button id="next" type="submit">Next</button></div>`);
  assert.equal(findContinue(), document.querySelector('#next'));
});

test('progress-only Review is never used as a forward action', () => {
  render(phenomProgress);
  assert.equal(findContinue(), null);
  render('<div role="tablist"><button role="tab">Review</button></div>');
  assert.equal(findContinue(), null);
});

test('real Review actions and ordinary action toolbars remain supported', () => {
  for (const label of ['Review', 'Review Application', 'Next', 'Save and Continue', 'Continue']) {
    render(`<div role="toolbar"><button id="forward">${label}</button></div>`);
    assert.equal(findContinue(), document.querySelector('#forward'));
  }
});

test('Phenom navigation preserves disabled state, hidden filtering and real ambiguity', () => {
  render(`${phenomProgress}<button id="next" disabled>Next</button><button hidden>Next</button>`);
  assert.equal(findContinue(), document.querySelector('#next'));
  assert.equal(findContinue().disabled, true);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<button>Continue</button>');
  assert.equal(findContinue(), null);
});

test('Phenom workflow clicks Next, never progress Review, then stops before submission', async () => {
  render(`<h2>My experience</h2>${phenomProgress}${input()}<button id="next" type="button">Next</button>`);
  let nextClicks = 0, progressClicks = 0, submissions = 0;
  document.querySelector('[atm-id]').onclick = () => progressClicks++;
  document.querySelector('#next').onclick = () => {
    nextClicks++;
    assert.equal(document.querySelector('#name').value, 'Applicant');
    render('<h1>Review application</h1><button>Submit application</button>');
    document.querySelector('button').onclick = () => submissions++;
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(nextClicks, 1);
    assert.equal(progressClicks, 0);
    assert.equal(submissions, 0);
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

test('navigation pause distinguishes competing forward actions from missing controls', async () => {
  for (const [controls, expected] of [
    ['<button>Next</button><button>Continue</button>', /Multiple forward buttons found: Next, Continue/],
    [phenomProgress, /No Next or Continue button found.*progress/i],
  ]) {
    render(`${input()}${controls}`);
    const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
    try {
      await engine.start(job());
      assert.equal(engine.session.status, 'paused');
      assert.match(engine.session.reason, expected);
    } finally { engine.destroy(); }
  }
});

test('same-step validation headings and changing accessible labels finish remaining fields', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Save and Continue</button>`);
  let clicks = 0, requests = 0;
  document.querySelector('#city').oninput = event => {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
    event.target.setAttribute('aria-label', 'City Applicant');
  };
  document.querySelector('button').onclick = () => {
    clicks++;
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(clicks, 1);
    assert.equal(requests, 1);
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

test('conditional optional fields get a bounded late request within the original step', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => {
    if (!document.querySelector('#region')) document.querySelector('button').insertAdjacentHTML('beforebegin', '<label for="region">Region</label><input id="region">');
  };
  const batches = [];
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#region').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { batches.push(fields.map(f => f.fieldId)); return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.deepEqual(batches, [['city'], ['region']]);
    assert.equal(engine.session.history.length, 1);
    assert.equal(Object.values(engine.session.steps)[0].requests, 1);
  } finally { engine.destroy(); }
});

test('temporarily disabled dependent field is filled before Continue', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  let enable, clicks = 0;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#postal').disabled = true;
    enable = setTimeout(() => { document.querySelector('#postal').disabled = false; }, 40);
  };
  document.querySelector('button').onclick = () => {
    clicks++;
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 500, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(clicks, 1);
    assert.equal(engine.session.history.length, 1);
  } finally { clearTimeout(enable); engine.destroy(); }
});

test('heading-only post-click change does not create a step or an extra click', async () => {
  render(`<h2>My Information</h2>${input()}<button>Continue</button>`);
  let clicks = 0;
  document.querySelector('button').onclick = () => {
    clicks++;
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(clicks, 1);
    assert.equal(engine.session.history.length, 1);
    assert.equal(engine.session.completedSteps, 0);
    assert.match(engine.session.reason, /Continue did not change/);
  } finally { engine.destroy(); }
});

test('Resume after same-step mutation reuses primary answers and completion stays zero', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  let requests = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  document.querySelector('#city').oninput = () => engine.pause();
  try {
    await engine.start(job());
    document.querySelector('#city').oninput = null;
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
    await engine.start();
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    assert.equal(requests, 1);
    assert.equal(engine.session.history.length, 1);
    assert.equal(engine.session.completedSteps, 0);
  } finally { engine.destroy(); }
});

test('question changed during AI response never receives the old answer', async () => {
  render(`<h2>My Information</h2>${input('answer', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    document.querySelector('label[for=answer]').textContent = 'Salary';
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(engine.session.status, 'paused');
    assert.match(engine.session.reason, /question.*changed|changed.*question/i);
  } finally { engine.destroy(); }
});

test('markerless conditional fields stay on one step', async () => {
  render(`${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => {
    if (!document.querySelector('#postal')) document.querySelector('button').insertAdjacentHTML('beforebegin', input('postal', 'Postal Code'));
  };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('legacy workflow sessions get fresh automatic context without replaying uncertain answers', async () => {
  render(`${input()}<button>Continue</button>`);
  const legacy = createSession(job());
  delete legacy.identityVersion;
  legacy.active = true;
  legacy.status = 'running';
  legacy.history = [{ signature: 'old', url: window.location.href }];
  saveSession(legacy);
  let requests = 0;
  const engine = createApplicationEngine({ answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.initialize();
    assert.equal(requests, 0);
    assert.notEqual(engine.session.id, legacy.id);
    assert.equal(engine.session.identityVersion, 2);
    assert.equal(engine.session.status, 'idle');
    assert.equal(engine.session.active, false);
    assert.deepEqual(engine.session.history, []);
    assert.equal(document.querySelector('#name').value, '');
  } finally { engine.destroy(); }
});

test('same-step asynchronous rerender settles before continuing saved answers', async () => {
  render(`<h2>My Information</h2><section id="fields">${input('city', 'City')}${input('postal', 'Postal Code')}</section><button>Continue</button>`);
  let restore;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#fields').innerHTML = '';
    restore = setTimeout(() => {
      document.querySelector('#fields').innerHTML = `${input('city', 'City')}${input('postal', 'Postal Code')}`;
      document.querySelector('#city').value = 'Applicant';
    }, 40);
  };
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 300, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { clearTimeout(restore); engine.destroy(); }
});

test('active step marker cannot make an empty rerender look ready', async () => {
  render(`<span aria-current="step">My Information</span><section id="fields">${input('city', 'City')}${input('postal', 'Postal Code')}</section><button>Continue</button>`);
  let restore, postalAtClick;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#fields').innerHTML = '';
    restore = setTimeout(() => {
      document.querySelector('#fields').innerHTML = `${input('city', 'City')}${input('postal', 'Postal Code')}`;
      document.querySelector('#city').value = 'Applicant';
    }, 40);
  };
  document.querySelector('button').onclick = () => {
    postalAtClick = document.querySelector('#postal')?.value;
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 300, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(postalAtClick, 'Applicant');
    assert.equal(engine.session.status, 'review');
  } finally { clearTimeout(restore); engine.destroy(); }
});

test('late request failure can resume without forgetting optional pending fields', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  let lateCalls = 0;
  document.querySelector('#city').oninput = () => document.querySelector('button').insertAdjacentHTML('beforebegin', '<label for="region">Region</label><input id="region">');
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#region').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    if (fields.some(f => f.fieldId === 'region') && ++lateCalls === 1) throw new Error('Temporary late-field request failure');
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'paused');
    await engine.start();
    assert.equal(lateCalls, 2);
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('dynamic field budget survives Resume and never advances unresolved additions', async () => {
  render(`<h2>My Information</h2>${input('field0', 'Question 0')}<button>Continue</button>`);
  let clicks = 0, requests = 0;
  document.querySelector('button').onclick = () => clicks++;
  document.querySelector('main').addEventListener('input', event => {
    const n = Number(event.target.id.replace('field', '')) + 1;
    if (!document.getElementById(`field${n}`)) document.querySelector('button').insertAdjacentHTML('beforebegin', input(`field${n}`, `Question ${n}`));
  });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.match(engine.session.reason, /Dynamic field limit/);
    await engine.start();
    assert.match(engine.session.reason, /Dynamic field limit/);
    assert.equal(requests, 3);
    assert.equal(clicks, 0);
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('same-URL real transition during AI response discards stale answers explicitly', async () => {
  render(`<h2>My Information</h2>${input('answer', 'City')}<button>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    render(`<h2>My Experience</h2>${input('answer', 'City')}<button>Continue</button>`);
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(engine.session.status, 'paused');
    assert.match(engine.session.reason, /Page changed/);
  } finally { engine.destroy(); }
});

test('baseline disabled controls do not prevent filling actionable questions', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<label for="country">Country</label><input id="country" disabled value="Canada"><button>Continue</button>`);
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  let requests = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 1);
  } finally { engine.destroy(); }
});

test('duplicate HTML IDs revealed during filling receive distinct answers without pausing', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => {
    document.querySelector('#city').oninput = null;
    document.querySelector('button').insertAdjacentHTML('beforebegin', '<label>Alternate postal code<input id="postal"></label>');
  };
  saveSettings({ autoContinue: false });
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.reason, 'Page filled. Auto Continue is off.');
    assert.deepEqual([...document.querySelectorAll('[id=postal]')].map(input => input.value), ['Applicant', 'Applicant']);
    assert.equal(new Set(scanFormFields().map(field => field.id)).size, 3);
    assert.equal(clicks, 0);
  } finally { engine.destroy(); }
});

test('full reload after Continue counts verified advancement exactly once', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  const first = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  document.querySelector('button').onclick = () => first.destroy(); // document unload cancels the old run
  await first.start(job());
  render('<h1>Review application</h1>');
  const restored = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await restored.initialize();
    assert.equal(restored.session.status, 'review');
    assert.equal(restored.session.completedSteps, 1);
    await restored.start();
    assert.equal(restored.session.completedSteps, 1);
  } finally { restored.destroy(); }
});

test('conditional hiding before a section heading does not change the step', async () => {
  render(`<h3>My Information</h3>${input('city', 'City')}<h2>Address</h2>${input('postal', 'Postal Code')}<button>Continue</button>`);
  document.querySelector('#city').oninput = event => { event.target.hidden = true; };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('failed primary retry cannot bless a cached answer for a changed question', async () => {
  render(`<h2>My Information</h2>${input('answer', 'Full name')}${input('other', 'Postal Code')}<button>Continue</button>`);
  rememberAnswer(createSession(job()), { label: 'Full name', type: 'text', options: [] }, { value: 'Applicant' });
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    if (++calls === 1) throw new Error('Temporary failure');
    return { answers: [{ fieldId: 'other', value: '12345' }] };
  } });
  try {
    await engine.start(job());
    document.querySelector('label[for=answer]').textContent = 'Salary';
    await engine.start();
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(Object.values(engine.session.steps)[0].answers.answer, undefined);
  } finally { engine.destroy(); }
});

test('Resume accepts markerless replacement and fills the current page', async () => {
  render(`${input('city', 'City')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    render(`${input('new', 'Unrelated question')}<button>Continue</button>`);
    await engine.start();
    assert.equal(calls, 2);
    assert.equal(engine.session.history.length, 2);
    assert.equal(document.querySelector('#new').value, 'Applicant');
  } finally { engine.destroy(); }
});

test('Workday language selection with dynamic aria-label fills proficiency and continues', async () => {
  render('<h2>My Experience</h2><label for="language">Language</label><button id="language" type="button" aria-label="Language Select One" aria-haspopup="listbox" aria-controls="options">Select One</button>' + input('reading', 'Reading') + '<button id="next" type="button">Save and Continue</button>');
  const button = document.querySelector('#language');
  button.onclick = () => {
    document.querySelector('#options')?.remove();
    document.querySelector('main').insertAdjacentHTML('beforeend', '<div id="options" role="listbox"><div role="option">English</div></div>');
    document.querySelector('[role=option]').onclick = () => {
      button.textContent = 'English';
      button.setAttribute('aria-label', 'Language English');
      document.querySelector('#options').remove();
    };
  };
  let reading;
  document.querySelector('#next').onclick = () => {
    reading = document.querySelector('#reading').value;
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'language' ? 'English' : 'Fluent' })) }) });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(reading, 'Fluent');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('transient listbox search controls do not become late applicant questions', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="listbox"><label for="search">Search options</label><input id="search"></div>');
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const batches = [];
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { batches.push(fields.map(f => f.fieldId)); return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.deepEqual(batches, [['city']]);
    assert.equal(engine.session.status, 'review');
  } finally { engine.destroy(); }
});

for (const changedBy of ['self', 'later field']) {
  test(`question changed by ${changedBy} during filling pauses before Continue`, async () => {
    render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
    let clicks = 0;
    document.querySelector(changedBy === 'self' ? '#city' : '#postal').oninput = () => {
      document.querySelector('label[for=city]').textContent = 'Salary';
    };
    document.querySelector('button').onclick = () => clicks++;
    const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
    try {
      await engine.start(job());
      assert.equal(clicks, 0);
      assert.match(engine.session.reason, /question.*changed/i);
    } finally { engine.destroy(); }
  });
}

test('captures JSON-LD JobPosting and an explicit application link', () => {
  render('<h1>Engineer</h1><a href="/apply/42">Apply now</a><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","hiringOrganization":{"name":"Example"},"description":"<p>Build useful software.</p>","identifier":{"value":"42"}}</script>');
  const captured = captureJob();
  assert.equal(captured.company, 'Example');
  assert.equal(captured.description, 'Build useful software.');
  assert.equal(captured.applicationUrl, 'https://example.com/apply/42');
});
test('Lever /apply captures postingUrl as listingUrl and avoids form text in description', () => {
  const leverDom = new JSDOM('<!DOCTYPE html><html><head><meta property="og:description" content="Build spacecraft software."></head><body><div class="posting-header"><h2>Embedded Engineer</h2></div><form><input id="name" /></form></body></html>', { url: 'https://jobs.lever.co/kepler/42/apply' });
  const captured = captureJob(leverDom.window.document);
  assert.equal(captured.listingUrl, 'https://jobs.lever.co/kepler/42');
  assert.equal(captured.applicationUrl, 'https://jobs.lever.co/kepler/42/apply');
  assert.equal(captured.description, 'Build spacecraft software.');
  leverDom.window.close();
});
test('Lever /apply hydrates full description asynchronously when parent page has JSON-LD', async () => {
  const leverDom = new JSDOM('<!DOCTYPE html><html><head><meta property="og:description" content="Short summary."></head><body><div class="posting-header"><h2>Embedded Engineer</h2></div><form><input id="name" /></form></body></html>', { url: 'https://jobs.lever.co/kepler/42/apply' });
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === 'https://jobs.lever.co/kepler/42') {
      return {
        ok: true,
        text: async () => '<html><head><script type="application/ld+json">{"@type":"JobPosting","title":"Embedded Engineer","hiringOrganization":{"name":"Kepler"},"description":"Full detailed responsibilities and qualifications."}</script></head><body><div class="posting-headline"><h2>Embedded Engineer</h2></div><a class="postings-btn" href="/kepler/42/apply">Apply for this job</a><a href="https://kepler.space">Company site</a></body></html>',
      };
    }
    return { ok: false };
  };
  try {
    const captured = captureJob(leverDom.window.document);
    assert.equal(captured.description, 'Short summary.');
    assert.ok(captured.pendingHydration);
    assert.doesNotThrow(() => structuredClone(captured));
    const session = createSession(captured);
    assert.equal(gmGet(`kr:sessions:${session.id}`).job.applicationUrl, captured.applicationUrl);
    await captured.pendingHydration;
    assert.equal(captured.description, 'Full detailed responsibilities and qualifications.');
    assert.equal(captured.company, 'Kepler');
    assert.equal(captured.companyUncertain, false);
    assert.doesNotThrow(() => structuredClone(captured));
    saveSession(session);
    const savedJob = gmGet('kr:job');
    const savedSession = gmGet(`kr:sessions:${session.id}`);
    assert.equal(savedJob.applicationUrl, captured.applicationUrl);
    assert.equal(savedJob.description, captured.description);
    assert.equal(savedSession.job.description, captured.description);
    assert.equal(Object.hasOwn(savedJob, 'pendingHydration'), false);
    assert.equal(Object.hasOwn(savedSession.job, 'pendingHydration'), false);
  } finally {
    globalThis.fetch = origFetch;
    leverDom.window.close();
  }
});
for (const stalledStage of ['fetch', 'body']) {
  test(`Lever hydration times out during ${stalledStage} and ignores late results`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const leverDom = new JSDOM('<head><meta property="og:description" content="Captured summary."></head><body><h1>Engineer</h1></body>', { url: 'https://jobs.lever.co/example/42/apply' });
    const origFetch = globalThis.fetch;
    let release;
    let signal;
    const stalled = new Promise(resolve => { release = resolve; });
    const html = '<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","description":"Late parent description must never replace the captured fallback job."}</script>';
    globalThis.fetch = (_url, options) => {
      signal = options?.signal;
      return stalledStage === 'fetch' ? stalled : Promise.resolve({ ok: true, text: () => stalled });
    };
    try {
      const captured = captureJob(leverDom.window.document);
      let completed = false;
      captured.pendingHydration.then(() => { completed = true; });
      for (let i = 0; i < 10; i++) await Promise.resolve();
      assert.equal(completed, false);
      t.mock.timers.tick(5000);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      assert.equal(completed, true, 'hydration must settle within five seconds');
      assert.equal(signal.aborted, true);
      assert.equal(captured.description, 'Captured summary.');
      release(stalledStage === 'fetch' ? { ok: true, text: async () => html } : html);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      assert.equal(captured.description, 'Captured summary.');
      assert.equal(gmGet('kr:job').description, 'Captured summary.');
      assert.equal(gmGet('kr:job').applicationUrl, captured.applicationUrl);
    } finally {
      globalThis.fetch = origFetch;
      leverDom.window.close();
    }
  });
}

test('isVisible safely evaluates nodes in DOMParser parsed documents without defaultView', () => {
  const parsed = new dom.window.DOMParser().parseFromString('<div><a href="#test">Link</a></div>', 'text/html');
  const link = parsed.querySelector('a');
  assert.equal(parsed.defaultView, null);
  assert.equal(isVisible(link), true);
});
test('session restores exact known URLs, not unrelated applications on the same host', async () => {
  const session = createSession(job());
  session.answers.example = { value: 'kept' };
  session.pendingUrl = 'https://example.com/jobs/42/step2';
  saveSession(session);
  assert.equal((await restoreSession(session.pendingUrl)).id, session.id);
  assert.equal((await restoreSession(window.location.href)).answers.example.value, 'kept');
  assert.equal(await restoreSession('https://example.com/jobs/99/apply'), null);
});
test('common memory reuses verified profile answers while narratives stay application-specific', () => {
  const a = createSession(job());
  const b = createSession({ ...job(), listingUrl: 'https://example.com/jobs/99' });
  const common = { label: 'Full name', type: 'text', options: [] };
  const narrative = { label: 'Why this company?', type: 'textarea', options: [] };
  rememberAnswer(a, common, { value: 'Test Applicant', inferred: false });
  rememberAnswer(a, narrative, { value: 'Company-specific reason', inferred: false });
  assert.equal(recallAnswer(b, common).value, 'Test Applicant');
  assert.equal(recallAnswer(b, narrative), null);
  saveProfile({ fullName: 'Different Person' });
  assert.equal(recallAnswer(b, common), null);
});
test('required, native and ARIA errors map to their owning field', () => {
  render('<label for="email">Email</label><input id="email" type="email" required value="invalid" aria-invalid="true" aria-describedby="error"><p id="error" role="alert">Use a company email.</p>');
  const errors = inspectValidation(scanFormFields());
  assert.equal(errors[0].fieldId, 'email');
  assert.match(errors[0].message, /company email/);
});
test('final submit cannot become a Continue candidate', () => {
  render('<h1>Review application</h1><button>Submit application</button>');
  assert.equal(classifyPage().type, 'review');
  assert.equal(findContinue(), null);
});
test('hidden content and visible legal attestations do not pause application forms', () => {
  render(`${input()}<div hidden>Assessment</div><button>Continue</button>`);
  assert.equal(classifyPage().type, 'application');
  render(`${input()}<label><input type="checkbox">I certify that all information is accurate</label><button>Continue</button>`);
  assert.equal(classifyPage().type, 'application');
});
test('engine repairs server rejection, advances two steps and stops before submit', async () => {
  render(`${input('answer', 'Describe your skills')}<p id="error" hidden role="alert"></p><button type="button">Continue</button>`);
  let clicks = 0, submitted = false, primary = 0, repairs = 0;
  document.querySelector('button').onclick = () => {
    clicks++;
    if (document.querySelector('input').value !== 'Accepted answer') {
      document.querySelector('input').setAttribute('aria-invalid', 'true');
      document.querySelector('input').setAttribute('aria-describedby', 'error');
      document.querySelector('#error').hidden = false;
      document.querySelector('#error').textContent = 'Answer needs more detail';
    } else {
      render(`${input('email', 'Email')}<button type="button">Review</button>`);
      document.querySelector('button').onclick = () => {
        render('<h1>Review application</h1><button>Submit application</button>');
        document.querySelector('button').onclick = () => { submitted = true; };
      };
    }
  };
  document.querySelector('input').oninput = () => {
    document.querySelector('input').removeAttribute('aria-invalid');
    document.querySelector('#error').hidden = true;
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async (fields, context) => {
    if (context.repairErrors?.length) repairs++; else primary++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: context.repairErrors?.length ? 'Accepted answer' : f.fieldId === 'email' ? 'test@example.com' : 'Short', inferred: false })) };
  }});
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(submitted, false);
  assert.equal(primary, 2);
  assert.equal(repairs, 1);
  assert.equal(clicks, 2);
  assert.ok(engine.session.errors.some(e => e.fieldId === 'answer'));
  engine.destroy();
});
test('background CAPTCHA and assessment headings do not block applicant fields', async () => {
  render(`<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>${input()}<button>Continue</button>`);
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Test Applicant' })) }; } });
  document.querySelector('button').onclick = () => {
    render('<h1>Skills assessment</h1><label>Answer<input id="answer" required></label><button>Continue</button>');
    document.querySelector('button').onclick = () => render('<h1>Thank you for applying</h1>');
  };
  await engine.start(job());
  assert.equal(engine.session.status, 'confirmation');
  assert.equal(calls, 2);
  engine.destroy();
});

test('CAPTCHA response controls are never offered as applicant fields', () => {
  render(`${input()}<textarea name="g-recaptcha-response"></textarea><div class="h-captcha"><input name="challenge-answer"></div>`);
  assert.deepEqual(scanFormFields().map(f => f.id), ['name']);
});
test('unchanged pages have bounded navigation attempts and no repeat primary request', async () => {
  render(`${input()}<button type="button">Continue</button>`);
  let calls = 0, clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Name' })) }; } });
  await engine.start(job());
  await engine.tick();
  assert.equal(calls, 1);
  assert.equal(clicks, 1);
  assert.equal(engine.session.status, 'paused');
  engine.destroy();
});

test('failed persistence never advances even when rejected text remains nonempty', async () => {
  render(`${input()}<button type="button">Continue</button>`);
  let clicks = 0;
  document.querySelector('input').oninput = e => { e.target.value = 'Wrong value'; };
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Expected value' })) }) });
  await engine.start(job());
  assert.equal(clicks, 0);
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /limit/);
  engine.destroy();
});
test('hidden required controls are never filled', async () => {
  render(`${input()}<section hidden><label for="secret">Private hidden field</label><input id="secret" required></section><button type="button">Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Expected value' })) }) });
  await engine.start(job());
  assert.equal(document.querySelector('#secret').value, '');
  engine.destroy();
});
test('pause during AI request prevents delayed writes and navigation', async () => {
  render(`${input()}<button>Continue</button>`);
  let release;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: () => new Promise(resolve => { release = resolve; }) });
  const pending = engine.start(job());
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  engine.pause();
  release({ answers: [{ fieldId: 'name', value: 'Late answer' }] });
  await pending;
  assert.equal(document.querySelector('input').value, '');
  assert.equal(engine.session.status, 'paused');
  engine.destroy();
});
test('review stays manual when Auto Submit is off', async () => {
  saveSettings({ autoContinue: true, autoSubmit: false });
  render('<h1>Review application</h1><button>Submit application</button>');
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Submit clicks a single unambiguous submit after a zero countdown', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button id="submit">Submit application</button>');
  let clicks = 0;
  document.querySelector('#submit').onclick = () => {
    clicks++;
    render('<h1>Application submitted</h1><p>Thank you for applying.</p>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(clicks, 1);
  assert.equal(engine.session.status, 'confirmation');
  engine.destroy();
});

test('Auto Submit is cancelled by Pause during the countdown', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button id="submit">Submit application</button>');
  let clicks = 0;
  document.querySelector('#submit').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 2000 });
  const pending = engine.start(job());
  await new Promise(resolve => setTimeout(resolve, 50));
  engine.pause();
  await pending;
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Submit does not fire when two submit controls exist', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button>Submit application</button><button>Submit</button>');
  let clicks = 0;
  document.querySelectorAll('button').forEach(el => { el.onclick = () => clicks++; });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Continue off fills without clicking', async () => {
  saveSettings({ autoContinue: false });
  render(`${input()}<button type="button">Continue</button>`);
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Test Applicant' }] }) });
  await engine.start(job());
  assert.equal(document.querySelector('input').value, 'Test Applicant');
  assert.equal(clicks, 0);
  engine.destroy();
});
test('required upload and disabled Continue prevent navigation', () => {
  render('<input type="file" required><button disabled>Continue</button>');
  const errors = inspectValidation([], findContinue());
  assert.equal(errors.length, 2);
  assert.ok(errors.every(e => e.fieldId === null));
});
test('ambiguous navigation controls require manual action', () => {
  render('<button>Next</button><button>Continue</button>');
  assert.equal(findContinue(), null);
});
test('verification heading appearing during AI request does not block filling', async () => {
  render(input());
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h1>Identity verification</h1>');
    return { answers: [{ fieldId: 'name', value: 'Test Applicant' }] };
  } });
  await engine.start(job());
  assert.equal(document.querySelector('input').value, 'Test Applicant');
  assert.notEqual(engine.session.status, 'boundary');
  engine.destroy();
});
test('full document reload restores active session and saved answers without a primary request', async () => {
  render(`${input()}<button>Continue</button>`);
  let requests = 0;
  const options = { settleMs: 0, transitionMs: 0, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Test Applicant' }] }; } };
  const first = createApplicationEngine(options);
  await first.start(job());
  const id = first.session.id;
  first.session.active = true;
  first.session.status = 'running';
  saveSession(first.session);
  first.destroy();
  render(`${input()}<button>Continue</button>`);
  document.querySelector('button').onclick = () => render('<h1>Review application</h1><button>Submit application</button>');
  const restored = createApplicationEngine(options);
  await restored.initialize();
  assert.equal(restored.session.id, id);
  assert.equal(restored.session.status, 'review');
  assert.equal(requests, 1);
  restored.destroy();
});
test('real multi-step fixture reaches review after a semantic rejection', async () => {
  const fixture = await readFile(new URL('../../fixtures/phase3-application-fixture.html', import.meta.url), 'utf8');
  const fixtureDom = new JSDOM(fixture, { url: 'https://example.com/fixture?scenario=validation&step=1', runScripts: 'dangerously' });
  dom.window.close(); dom = fixtureDom;
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  let repairs = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async (fields, context) => {
    if (context.repairErrors?.length) repairs++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'email' ? 'test@example.com' : f.fieldId === 'fullName' ? 'Test Applicant' : 'I have built accessible web applications using my documented software skills.' })) };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(repairs, 1);
  assert.equal(new URL(window.location.href).searchParams.get('step'), 'review');
  engine.destroy();
});

test('visible inline errors map to a unique field container without ARIA linkage', () => {
  render('<div class="form-group"><label for="name">Full name</label><input id="name" value="Name"><span class="error-message">Enter your full legal name</span></div>');
  const errors = inspectValidation(scanFormFields());
  assert.equal(errors.length, 1);
  assert.equal(errors[0].fieldId, 'name');
});
test('captured jobs with unknown company mark uncertainty explicitly', () => {
  render('<h1>Engineer</h1><article>Job description: Build useful software.</article>');
  const captured = captureJob();
  assert.equal(captured.companyUncertain, true);
  assert.equal(captured.company, '');
});
test('inferred and incompatible answers never become global memory', () => {
  const a = createSession(job()), b = createSession({ ...job(), listingUrl: 'https://example.com/jobs/99' });
  const field = { label: 'Full name', type: 'text', options: [] };
  rememberAnswer(a, field, { value: 'Guess', inferred: true });
  assert.equal(recallAnswer(b, field), null);
  const choice = { label: 'Availability', type: 'select', options: [{ value: 'now', label: 'Now' }] };
  rememberAnswer(a, choice, { value: 'now' });
  assert.equal(recallAnswer(a, { ...choice, options: [{ value: 'later', label: 'Later' }] }), null);
});

test('Resume retries a failed primary instead of advancing unanswered optional fields', async () => {
  render('<label for="essay">Describe your experience</label><textarea id="essay"></textarea><button type="button">Continue</button>');
  let requests = 0;
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    if (++requests === 1) throw new Error('Temporary network failure');
    return { answers: [{ fieldId: 'essay', value: 'Grounded answer' }] };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  await engine.start();
  assert.equal(requests, 2);
  assert.equal(engine.session.status, 'review');
  assert.ok(Object.values(engine.session.answers).some(a => a.value === 'Grounded answer'));
  engine.destroy();
});
test('tab-bound recent navigation recovers a same-application POST redirect only', async () => {
  const session = createSession({ ...job(), applicationUrl: 'https://example.com/apply/42/step1' });
  session.active = true;
  session.pendingUrl = 'https://example.com/apply/42/step1';
  session.pendingAt = Date.now();
  saveSession(session);
  globalThis.GM_getTab = callback => callback({ kareerSession: session.id });
  assert.equal((await restoreSession('https://example.com/apply/42/step2'))?.id, session.id);
  assert.equal(await restoreSession('https://example.com/apply/99/step2'), null);
  assert.equal(await restoreSession('https://other.example/apply/42/step2'), null);
  session.pendingAt = Date.now() - 180000;
  saveSession(session);
  assert.equal(await restoreSession('https://example.com/apply/42/step2'), null);
});

test('unexpected step change during a field action pauses instead of filling the previous step', async () => {
  render(`${input()}<button>Continue</button>`);
  document.querySelector('input').oninput = () => {
    window.history.replaceState({}, '', '/apply/autofillWithResume');
    render('<h1>Autofill with Resume</h1><input id="resume" type="file">');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Applicant' }] }) });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /Page changed while filling/);
  engine.destroy();
});

test('button selection text in aria-labelledby does not change the question or step', () => {
  render('<h3>Application Questions</h3><label id="question" for="answer">Are you authorized?</label><button id="answer" type="button" aria-haspopup="listbox" aria-labelledby="question answer">Select One</button>');
  const before = scanFormFields();
  assert.equal(before[0].label, 'Are you authorized?');
  document.querySelector('button').textContent = 'Yes';
  const after = scanFormFields();
  assert.equal(after[0].label, before[0].label);
  assert.equal(pageSignature(after), pageSignature(before));
});

test('header language/settings controls stay outside applicant fields', () => {
  document.body.insertAdjacentHTML('afterbegin', '<header><button id="language" aria-haspopup="listbox">English</button></header>');
  render(input());
  assert.deepEqual(scanFormFields().map(f => f.id), ['name']);
});

test('same-URL steps with reused fields are distinguished by h3 heading', () => {
  render(`<h3>My Information</h3>${input()}`);
  const before = pageSignature(scanFormFields());
  document.querySelector('h3').textContent = 'My Experience';
  assert.notEqual(pageSignature(scanFormFields()), before);
});

test('Workday-style self-labelled button fills remaining fields and auto-continues to next same-URL step', async () => {
  render('<h3>Application Questions</h3><label id="question" for="answer">Are you authorized?</label><button id="answer" type="button" aria-haspopup="listbox" aria-controls="options" aria-labelledby="question answer">Select One</button>' + input('detail', 'Relevant experience') + '<button id="next" type="button">Save and Continue</button>');
  const button = document.querySelector('#answer');
  button.onclick = () => {
    document.querySelector('#options')?.remove();
    const menu = document.createElement('div'); menu.id = 'options'; menu.setAttribute('role', 'listbox');
    menu.innerHTML = '<div role="option">Yes</div><div role="option">No</div>';
    document.querySelector('main').append(menu);
    menu.querySelectorAll('[role=option]').forEach(option => option.onclick = () => { button.textContent = option.textContent; menu.remove(); });
  };
  document.querySelector('#next').onclick = () => {
    assert.equal(document.querySelector('#detail').value, 'Grounded response');
    render(`<h3>Next step</h3>${input('email', 'Email')}<button type="button">Review</button>`);
    document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  };
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    calls++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'answer' ? 'Yes' : f.fieldId === 'email' ? 'test@example.com' : 'Grounded response' })) };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(calls, 2);
  engine.destroy();
});

test('slow save disables Continue temporarily, then next step fills automatically', async () => {
  render(`${input()}<button type="button">Save and Continue</button>`);
  let clicks = 0, requests = 0, load;
  document.querySelector('button').onclick = e => {
    clicks++; e.target.disabled = true;
    // Reproduce a save taking longer than the previous fixed post-click delay.
    load = setTimeout(() => {
      render(`<h3>Next step</h3>${input('email', 'Email')}<button type="button">Review</button>`);
      document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
    }, 100);
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async fields => {
    requests++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) };
  } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 2);
    assert.equal(clicks, 1);
    assert.equal(engine.session.errors.length, 0);
  } finally { clearTimeout(load); engine.destroy(); }
});

test('Continue enabling after field validation is awaited without AI repair', async () => {
  render(`${input()}<button type="button" disabled>Continue</button>`);
  let enable, requests = 0;
  document.querySelector('input').oninput = () => { enable = setTimeout(() => { document.querySelector('button').disabled = false; }, 100); };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Applicant' }] }; } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 1);
    assert.equal(engine.session.errors.length, 0);
  } finally { clearTimeout(enable); engine.destroy(); }
});

test('permanently disabled Continue times out without clicks or repair budget consumption', async () => {
  render(`${input()}<button disabled>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 80, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Applicant' }] }) });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /page.*button.*disabled/i);
  assert.equal(Object.values(engine.session.steps)[0].repairs, 0);
  assert.equal(Object.values(engine.session.steps)[0].clicks, 0);
  engine.destroy();
});

test('Pause interrupts navigation waiting without another click or AI call', async () => {
  render(`${input()}<button>Continue</button>`);
  let clicks = 0, requests = 0, stop;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Applicant' }] }; } });
  document.querySelector('button').onclick = e => {
    clicks++; e.target.disabled = true;
    stop = setTimeout(() => engine.pause(), 20);
  };
  try {
    await engine.start(job());
    assert.equal(engine.session.reason, 'Paused by user.');
    assert.equal(clicks, 1);
    assert.equal(requests, 1);
  } finally { clearTimeout(stop); engine.destroy(); }
});

test('next page fields wait for aria-busy rendering to finish', async () => {
  render(`${input()}<button>Continue</button>`);
  let finish, calls = 0;
  document.querySelector('button').onclick = () => {
    render('<section aria-busy="true"><h3>Next step</h3><span>Loading</span></section>');
    finish = setTimeout(() => {
      render(`<h3>Next step</h3>${input('email', 'Email')}<button>Review</button>`);
      document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
    }, 150);
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) }; } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(calls, 2);
    assert.equal(engine.session.history.length, 2);
  } finally { clearTimeout(finish); engine.destroy(); }
});

test('Pause acts as a hard quit without tampering with filled fields or forgetting memory', async () => {
  render(`${input('name', 'Full name')}${input('phone', 'Phone')}<button>Continue</button>`);
  let requests = 0;
  const engine = createApplicationEngine({
    settleMs: 50,
    answer: async () => {
      requests++;
      return {
        answers: [
          { fieldId: 'name', value: 'Jane Doe' },
          { fieldId: 'phone', value: '555-123-4567' },
        ],
      };
    },
  });

  const startPromise = engine.start(job());
  let checks = 0;
  while ((!document.querySelector('#name').value || Object.keys(engine.session.answers).length === 0) && checks < 50) {
    await new Promise(r => setTimeout(r, 10));
    checks++;
  }
  assert.equal(document.querySelector('#name').value, 'Jane Doe');

  engine.pause();
  await startPromise;

  assert.equal(engine.session.status, 'paused');
  assert.equal(engine.session.reason, 'Paused by user.');
  assert.equal(document.querySelector('#name').value, 'Jane Doe');
  const rememberedKeys = Object.keys(engine.session.answers);
  assert.ok(rememberedKeys.length > 0, 'Remembered answer exists in session');
  assert.ok(rememberedKeys.some(k => engine.session.answers[k].value === 'Jane Doe'));
  const step = Object.values(engine.session.steps)[0];
  assert.ok(step.answers.name, 'Step answers include name');
  assert.equal(step.answers.name.value, 'Jane Doe');

  engine.destroy();
});


test('same-heading replacement after Continue advances and ignores upload success alert', async () => {
  render(`<h1>Engineer application</h1>${input('city', 'City')}<button>Continue</button>`);
  let calls = 0;
  document.querySelector('button').onclick = () => {
    render(`<h1>Engineer application</h1><div role="alert">Resume.pdf successfully uploaded</div>${input('education', 'Education')}<button>Continue</button>`);
    document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(calls, 2);
    assert.equal(engine.session.completedSteps, 2);
  } finally { engine.destroy(); }
});

test('upload success alerts are informational but error alerts still block', () => {
  render('<div role="alert">Resume.pdf successfully uploaded</div>');
  assert.deepEqual(inspectValidation([]), []);
  render('<div role="alert">That email is already registered.</div>');
  assert.equal(inspectValidation([]).length, 1);
  render('<div role="alert">Upload failed. Please try again.</div>');
  assert.equal(inspectValidation([]).length, 1);
});

test('described required-field guidance is not a validation error for a filled field', () => {
  render('<label for="name">Name</label><input id="name" required value="Applicant" aria-describedby="help"><div id="help">Required. Please enter your full name.</div>');
  assert.deepEqual(inspectValidation(scanFormFields()), []);
});

test('Resume with a shared heading fills a replacement form without recapture', async () => {
  render(`<h1>Engineer application</h1>${input('city', 'City')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    render(`<h1>Engineer application</h1>${input('education', 'Education')}<button>Continue</button>`);
    await engine.start();
    assert.equal(document.querySelector('#education').value, 'Applicant');
    assert.equal(engine.session.history.length, 2);
    assert.equal(engine.session.completedSteps, 0);
  } finally { engine.destroy(); }
});

test('Workday stepReviewPause pauses filled step for user review and continueStep advances', async () => {
  if (dom) dom.window.close();
  dom = new JSDOM('<body><main></main></body>', { url: 'https://acme.myworkdayjobs.com/en-US/job/apply' });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};

  render(`<h2>My Information</h2>${input('city', 'City')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);
  let continueClicked = false;
  document.querySelector('[data-automation-id="bottom-navigation-next-button"]').onclick = () => {
    continueClicked = true;
    render(`<h2>My Experience</h2>${input('title', 'Job Title')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);
    document.querySelector('[data-automation-id="bottom-navigation-next-button"]').onclick = () => render('<h1>Review application</h1>');
  };

  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start();
    // After step 1 is filled, Workday pauses for review
    assert.equal(document.querySelector('#city').value, 'Applicant');
    assert.equal(engine.session.status, 'paused');
    assert.equal(engine.session.reason, 'Workday step filled. Ready for your review.');
    assert.equal(engine.stepReview, true);
    assert.equal(continueClicked, false);

    // Calling continueStep() triggers Continue and proceeds
    await engine.continueStep();
    assert.equal(continueClicked, true);
    // After step 2 is filled, it pauses again for review
    assert.equal(document.querySelector('#title').value, 'Applicant');
    assert.equal(engine.session.status, 'paused');
    assert.equal(engine.stepReview, true);
  } finally { engine.destroy(); }
});

test('native on-page Continue click is detected and resumes autofill when stepReview is active', async () => {
  if (dom) dom.window.close();
  dom = new JSDOM('<body><main></main></body>', { url: 'https://acme.myworkdayjobs.com/en-US/job/apply' });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};

  render(`<h2>My Information</h2>${input('city', 'City')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);

  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.initialize();
    await engine.start();
    assert.equal(engine.stepReview, true);

    // Simulate user clicking on-page Continue button directly, causing DOM to transition to next step
    render(`<h2>My Experience</h2>${input('title', 'Job Title')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);

    // Trigger mutation observer and allow scheduler + tick to run
    await new Promise(resolve => setTimeout(resolve, 700));

    // The engine should detect the step advance, clear stepReview, fill the new fields, and pause on review for the new step
    assert.equal(document.querySelector('#title').value, 'Applicant');
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

test('unfillable required field is recorded with status failed in results', async () => {
  render(`<h2>My Information</h2><label for="reqField">Required Question *</label><select id="reqField" required><option value="">Select...</option><option value="opt1">Option 1</option></select><button>Continue</button>`);
  let lastResults;
  const engine = createApplicationEngine({
    settleMs: 0,
    transitionMs: 0,
    onChange: ({ results }) => { lastResults = results; },
    answer: async () => ({ answers: [{ fieldId: 'reqField', value: '' }] }),
  });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'paused');
    assert.ok(lastResults);
    const res = lastResults.get('reqField');
    assert.ok(res, 'Result must exist for required field');
    assert.equal(res.status, 'failed', 'Result status must be failed');
  } finally { engine.destroy(); }
});

test('Workday with autoContinue disabled advances past both review gates on a single continueStep click', async () => {
  if (dom) dom.window.close();
  dom = new JSDOM('<body><main></main></body>', { url: 'https://acme.myworkdayjobs.com/en-US/job/apply' });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};

  saveSettings({ autoContinue: false });
  render(`<h2>My Information</h2>${input('city', 'City')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);
  let continueClicked = false;
  document.querySelector('[data-automation-id="bottom-navigation-next-button"]').onclick = () => {
    continueClicked = true;
    render(`<h2>My Experience</h2>${input('title', 'Job Title')}<button data-automation-id="bottom-navigation-next-button">Next</button>`);
  };

  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start();
    // After step 1 is filled, autoContinue=false triggers the first review pause
    assert.equal(document.querySelector('#city').value, 'Applicant');
    assert.equal(engine.session.status, 'paused');
    assert.equal(engine.session.reason, 'Page filled. Auto Continue is off.');
    assert.equal(engine.stepReview, true);
    assert.equal(continueClicked, false);

    // A single continueStep() must advance past the Workday review gate to Next without requiring a second click
    await engine.continueStep();
    assert.equal(continueClicked, true, 'Continue button must be clicked on first continueStep()');
    // Step 2 has been reached and filled
    assert.equal(document.querySelector('#title').value, 'Applicant');
    assert.equal(engine.session.status, 'paused');
    assert.equal(engine.stepReview, true);
  } finally {
    saveSettings({ autoContinue: true });
    engine.destroy();
  }
});

test('engine.reset resets request limit and clears session errors so autofill can run again', async () => {
  render(`<h2>My Information</h2>${input('field1', 'Question 1')}<button>Continue</button>`);
  let requests = 0;
  const engine = createApplicationEngine({
    settleMs: 0,
    transitionMs: 0,
    answer: async () => {
      requests++;
      throw new Error('AI timeout');
    },
  });
  try {
    await engine.start(job());
    const step = engine.session.steps[engine.session.currentStep];
    assert.equal(step.requests, 1);
    await engine.start();
    assert.equal(step.requests, 2);
    await engine.start();
    assert.match(engine.session.reason, /Primary request limit reached/);

    engine.reset();
    assert.equal(step.requests, 0);
    assert.equal(step.primary, false);
    assert.equal(engine.session.status, 'idle');
    assert.equal(engine.session.reason, '');

    await engine.start();
    assert.equal(step.requests, 1);
  } finally {
    engine.destroy();
  }
});


test('Workday button dropdowns classify as an application rather than the retained job listing', () => {
  dom.reconfigure({url:'https://ciena.wd5.myworkdayjobs.com/job/apply'});
  render('<h2>Application Questions 1 of 2</h2><p>About the role</p><script type="application/ld+json">{"@type":"JobPosting"}</script><label id="question-label">Graduation date</label><button data-automation-id="selectWidget" aria-haspopup="listbox" aria-labelledby="question-label">Select One</button><button data-automation-id="bottom-navigation-next-button">Save and Continue</button>');
  assert.equal(scanFormFields().length,1);
  assert.equal(classifyPage().type,'application');
});

test('restored disabled empty questions do not block actionable fields on Resume', async () => {
  dom.reconfigure({url:'https://boards.greenhouse.io/acme/jobs/42'});
  render('<h2>Application</h2>'+input('email','Email')+'<label for="consent">Consent</label><input id="consent" type="checkbox" disabled>');
  saveSettings({autoContinue:false});
  const engine=createApplicationEngine({settleMs:0,navigationTimeoutMs:40,answer:workflowAnswers});
  try {
    await engine.start(job());
    document.querySelector('#email').value='';
    const field=scanFormFields().find(f=>f.id==='consent');
    const {questionIdentity}=await import('../../src/core/navigation.js');
    engine.session.steps[engine.session.currentStep].questions.consent=questionIdentity(field);
    await engine.start();
    assert.equal(document.querySelector('#email').value,'Applicant');
    assert.equal(engine.session.reason,'Page filled. Auto Continue is off.');
  } finally {engine.destroy();}
});

test('unrelated aria-busy region does not stop the application workflow', async () => {
  render('<aside aria-busy="true">Loading recommendations</aside><h2>Application</h2>'+input());
  saveSettings({autoContinue:false});
  const engine=createApplicationEngine({settleMs:0,navigationTimeoutMs:40,answer:workflowAnswers});
  try {await engine.start(job());assert.equal(document.querySelector('#name').value,'Applicant');}
  finally {engine.destroy();}
});

test('Resume retries a failed primary request after its automatic budget was exhausted', async () => {
  render('<h2>Application</h2>'+input());
  saveSettings({autoContinue:false});
  let calls=0;
  const engine=createApplicationEngine({settleMs:0,answer:async fields=>{calls++;if(calls<=2)throw new Error('Provider unavailable');return workflowAnswers(fields);}});
  try {
    await engine.start(job());await engine.start();await engine.start();
    assert.match(engine.session.reason,/Primary request limit/);
    await engine.start();
    assert.equal(calls,3);assert.equal(document.querySelector('#name').value,'Applicant');
    assert.equal(engine.session.steps[engine.session.currentStep].requests,1);
    assert.equal(engine.session.steps[engine.session.currentStep].repairs,0);
  } finally {engine.destroy();}
});

test('Workday header language picker does not classify its entry screen as application fields', () => {
  dom.reconfigure({url:'https://ciena.wd5.myworkdayjobs.com/job/apply'});
  render('<header><button data-automation-id="utilityMenuButton" aria-haspopup="listbox">English</button></header><h1>Sign in</h1>');
  assert.equal(classifyPage().type,'unrelated');
});

test('rescan reset clears step review so Autofill cannot accidentally advance the page',async()=>{
  render('<h2>Application</h2>'+input());saveSettings({autoContinue:false});
  const engine=createApplicationEngine({settleMs:0,answer:workflowAnswers});
  try {
    await engine.start(job());assert.equal(engine.stepReview,true);
    engine.reset();
    assert.equal(engine.stepReview,false);assert.equal(engine.session.active,false);
  } finally {engine.destroy();}
});

test('captured Ciena questions classify as an application and retain four distinct button questions', async () => {
  dom.reconfigure({url:'https://ciena.wd5.myworkdayjobs.com/en-US/Careers/job/Ottawa/Embedded-Software-Engineer---New-Grad_R031571/apply'});
  document.body.innerHTML=await readFile(new URL('../../fixtures/ciena.wd5.myworkdayjobs.com-2026-10-07-03-13.html',import.meta.url),'utf8');
  assert.equal(scanFormFields().length,4);
  assert.equal(classifyPage().type,'application');
});
