import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { captureJob, isJobPage } from '../../src/core/jobs.js';
import { visibleText } from '../../src/core/pageClassifier.js';

let dom;
afterEach(() => dom?.window.close());
function page(html, url = 'https://job-boards.greenhouse.io/reddit/jobs/8089959') {
  dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return document;
}

test('captures Greenhouse header location and company independently of the description', () => {
  const job = captureJob(page('<main><img alt="Reddit Logo"><h1>Partner Manager</h1><div class="job__location">New York City, NY</div><div class="job__description">Build partnerships.</div><form><label>Applicant location</label><input value="Toronto, Canada"></form></main>'));
  assert.equal(job.company, 'Reddit');
  assert.equal(job.location, 'New York City, NY');
  assert.equal(job.workCountry, 'United States');
  assert.equal(job.description, 'Build partnerships.');
});

test('captures Ashby sidebar location without JSON-LD', () => {
  const job = captureJob(page('<div class="ashby-job-posting-header"><a href="https://sift.com"><p>Sift</p></a></div><h1>Engineer</h1><div class="ashby-job-posting-left-pane"><h2>Location</h2><p>San Francisco, California; Remote - USA; Seattle, Washington</p></div>', 'https://jobs.ashbyhq.com/sift/42/application'));
  assert.equal(job.company, 'Sift');
  assert.match(job.location, /Remote - USA/);
  assert.equal(job.workCountry, 'United States');
});

test('all job locations and remote country requirements survive JSON-LD capture', () => {
  const job = captureJob(page('<script type="application/ld+json">' + JSON.stringify({ '@type': 'JobPosting', title: 'Engineer', jobLocation: [{ address: { addressCountry: { name: 'CA' } } }, { address: { addressCountry: 'USA' } }], applicantLocationRequirements: { '@type': 'Country', name: 'United Kingdom' } }) + '</script>'));
  assert.deepEqual(job.workCountries.sort(), ['Canada', 'United Kingdom', 'United States'].sort());
  assert.equal(job.workCountry, '');
  assert.equal(job.locationAmbiguous, true);
  assert.doesNotMatch(job.location, /object Object/);
});

test('a remote or ambiguous location never borrows the applicant country', () => {
  const job = captureJob(page('<h1>Engineer</h1><div class="job__location">Remote</div><form><input value="Canada"></form>'));
  assert.equal(job.workCountry, '');
  assert.equal(job.locationAmbiguous, true);
});

test('a different job on the same SPA URL does not inherit the previous work country', () => {
  captureJob(page('<h1>Engineer A</h1><div class="job__location">New York City, NY</div>'));
  const job = captureJob(page('<h1>Engineer B</h1><div class="job__location">Remote</div>'));
  assert.equal(job.workCountry, '');
  assert.deepEqual(job.workCountries, []);
});

test('visible text visits ancestor styles once and preserves hidden content boundaries', () => {
  page('<main><div><p>Hello <span>world</span></p><p hidden>Hidden</p><div aria-hidden="true">Also hidden</div><script>secret</script></div></main>');
  const original = window.getComputedStyle;
  let calls = 0;
  window.getComputedStyle = (...args) => { calls++; return original(...args); };
  assert.equal(visibleText(document.body), 'Hello world');
  assert.ok(calls <= document.querySelectorAll('*').length, `Repeated ancestor walks made ${calls} style reads`);
});

test('job-page eligibility excludes ordinary pages with search/comment inputs', () => {
  assert.equal(isJobPage(page('<h1>Video</h1><input type="search"><textarea placeholder="Comment"></textarea>', 'https://www.youtube.com/watch?v=example')), false);
  assert.equal(isJobPage(page('<h1>Video</h1><article>A resume tutorial</article><form><textarea placeholder="Comment"></textarea></form>', 'https://www.youtube.com/watch?v=example')), false);
  assert.equal(isJobPage(page('<h1>Login</h1><input type="email"><input type="password">', 'https://example.com/login')), false);
  assert.equal(isJobPage(page('<h1>Job Application</h1><input type="email">')), true);
  assert.equal(isJobPage(page('<h1>Engineer</h1>', 'https://jobs.ashbyhq.com/sift/42')), true);
  assert.equal(isJobPage(page('<iframe src="https://boards.greenhouse.io/embed/job_app?token=42"></iframe>', 'https://example.com/openings/42')), true);
});
