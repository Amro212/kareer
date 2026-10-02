import { gmGet, gmSet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';
import { isVisible, visibleText } from './pageClassifier.js';
import { logger } from './debug.js';
import { countryCode, countryNames, countryCodes } from './adapters/canonical.js';
import { detectAdapter } from './adapters/index.js';

const JOB_HYDRATION_TIMEOUT_MS = 5000;
const capturedJobs = new WeakMap();

function countryName(value) {
  const name = typeof value === 'object' ? value?.name || value?.['@id'] : value;
  const code = countryCode(String(name || ''));
  return code ? countryNames.of(code) : String(name || '').trim();
}

function locationCountries(text) {
  const normalized = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const found = [];
  for (const code of countryCodes) {
    const name = countryNames.of(code);
    if (normalized.includes(` ${name.toLowerCase()} `)) found.push(name);
  }
  if (/\b(?:usa|u s a|united states of america)\b/i.test(normalized) || /(?:^|[;,\s-])US(?:$|[;,\s])/u.test(text)) found.push('United States');
  if (/\b(?:uk|u k)\b/i.test(normalized)) found.push('United Kingdom');
  // Named subnational regions can establish a work country. Bare CA and city
  // names remain ambiguous rather than being interpreted as residence/country.
  if (/\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/i.test(text) || /,\s*(?:NY|WA|TX|MA|IL|FL|OH|NJ|PA|CO|NC|VA|AZ|GA)(?:\b)/.test(text)) found.push('United States');
  if (/\b(?:Ontario|Quebec|Québec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Nunavut|Yukon)\b/i.test(text) || /,\s*(?:ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)(?:\b)/.test(text)) found.push('Canada');
  return [...new Set(found)];
}

export function isJobPage(doc = document) {
  if (detectAdapter(doc.location || window.location, doc).id !== 'generic') return true;
  if (Array.from(doc.querySelectorAll('iframe[src]')).some(frame => {
    try { return detectAdapter(new URL(frame.src, doc.location?.href), null).id !== 'generic'; } catch { return false; }
  })) return true;
  if (Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).some(script => /"JobPosting"/.test(script.textContent))) return true;
  const headings = Array.from(doc.querySelectorAll('h1,h2,[role="heading"]')).map(el => el.textContent).join(' ');
  if (/job description|about (?:the|this) (?:role|job)|\bapplication\b|apply for (?:this |the )?(?:job|role|position)|careers?/i.test(`${doc.title} ${headings}`)) return true;
  if (doc.querySelector('article, .job-description, [itemprop="description"]') && Array.from(doc.querySelectorAll('a,button')).some(el => /^apply(?: now| for (?:this )?(?:job|position))?$/i.test(el.textContent.trim()))) return true;
  return Array.from(doc.querySelectorAll('input[type="file"], input[type="email"], textarea')).some(field => {
    const context = field.closest('form,[role="form"]')?.textContent || Array.from(field.labels || []).map(label => label.textContent).join(' ') || field.getAttribute('aria-label') || '';
    return /\b(?:resume|curriculum vitae|cover letter|work experience|submit application)\b/i.test(context);
  });
}

export function safeUrl(value, base = window.location.href) {
  try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
}

export async function hydrateJob(job, doc = document) {
  if (!job) return job;
  const host = doc.location?.hostname || '';
  const path = doc.location?.pathname || '';
  const isLever = /(?:^|\.)lever\.co$/i.test(host);
  const isLeverApply = isLever && /\/apply(?:\/|\?|#|$)/i.test(path);
  const postingUrl = isLeverApply && doc.location?.href ? doc.location.href.replace(/\/apply(?:\/.*|\?.*|#.*)?$/i, '') : '';
  if (postingUrl && typeof fetch === 'function') {
    const controller = new AbortController();
    let timer;
    try {
      logger.info(`Hydrating job description from parent posting: ${postingUrl}`);
      // Bound both the request and body read; late results cannot mutate the fallback job.
      const { res, html } = await Promise.race([
        (async () => {
          const res = await fetch(postingUrl, { signal: controller.signal });
          return { res, html: res.ok ? await res.text() : '' };
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Parent job posting timed out after 5 seconds. Using captured job.'));
          }, JOB_HYDRATION_TIMEOUT_MS);
        }),
      ]);
      if (res.ok) {
        const DOMParserClass = doc.defaultView?.DOMParser || globalThis.DOMParser;
        const postingDoc = DOMParserClass ? new DOMParserClass().parseFromString(html, 'text/html') : null;
        if (postingDoc) {
          const parentJob = captureJob(postingDoc);
          if (parentJob.description && parentJob.description.length > (job.description?.length || 0)) {
            job.description = parentJob.description;
          }
          if (parentJob.company && (job.companyUncertain || !job.company)) {
            job.company = parentJob.company;
            job.companyUncertain = false;
          }
          if (parentJob.title && (!job.title || job.title === doc.title)) {
            job.title = parentJob.title;
          }
          if (parentJob.location && !job.location) {
            job.location = parentJob.location;
          }
          if (parentJob.workCountries?.length && !job.workCountries?.length) {
            job.workCountries = parentJob.workCountries;
            job.workCountry = parentJob.workCountry;
            job.locationAmbiguous = parentJob.locationAmbiguous;
          }
          gmSet(STORAGE_KEYS.JOB, job);
          logger.info(`Successfully hydrated job: "${job.title}" at "${job.company}" (${(job.description || '').length} chars)`);
        }
      } else {
        logger.warn(`Failed to fetch parent job posting (HTTP ${res.status}): ${postingUrl}`);
      }
    } catch (err) {
      logger.warn(`Job hydration failed: ${err?.message || err}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return job;
}

export function captureJob(doc = document) {
  let posting;
  const visit = value => {
    if (!value || typeof value !== 'object' || posting) return;
    if ([value['@type']].flat().includes('JobPosting')) { posting = value; return; }
    for (const child of Object.values(value)) if (typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch { /* Ignore unrelated malformed metadata. */ }
  }
  const plain = html => {
    const el = doc.createElement ? doc.createElement('div') : document.createElement('div');
    el.innerHTML = String(html || '');
    return el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30000);
  };
  const apply = Array.from(doc.querySelectorAll('a[href]')).find(el => isVisible(el) && /^(?:apply|apply now|apply for (?:this )?(?:job|position)|start application)$/i.test(visibleText(el)));
  const logo = doc.querySelector('main img[alt$=" Logo"], .company-logo img[alt]');
  const company = posting?.hiringOrganization?.name || doc.querySelector('[itemprop=hiringOrganization], .ashby-job-posting-header a p, .posting-company, [data-testid="company-name"]')?.textContent?.trim() || logo?.getAttribute('alt')?.replace(/\s+Logo$/i, '') || '';
  const addresses = [posting?.jobLocation].flat().filter(Boolean).map(place => place.address).filter(Boolean);
  const locationHeading = Array.from(doc.querySelectorAll('.ashby-job-posting-left-pane h2, [data-automation-id="locations"] h2, main h2')).find(el => /^location$/i.test(el.textContent.trim()));
  const locationElement = Array.from(doc.querySelectorAll('[itemprop="jobLocation"], .job__location, .job-location, .posting-categories .location, [data-automation-id="locations"], [data-testid="job-location"]')).find(el => !el.closest('form, .ashby-application-form-container'));
  const locations = addresses.map(address => typeof address === 'string' ? address : [address.addressLocality, address.addressRegion, countryName(address.addressCountry)].filter(Boolean).join(', '));
  const domLocation = locationElement?.textContent.trim() || locationHeading?.nextElementSibling?.textContent.trim() || '';
  if (domLocation && !locations.includes(domLocation)) locations.push(domLocation);
  const workCountries = [...new Set([
    ...addresses.map(address => countryName(address.addressCountry)).filter(Boolean),
    ...[posting?.applicantLocationRequirements].flat().filter(Boolean).map(country => countryName(country.name || country.address?.addressCountry)).filter(Boolean),
    ...locationCountries(locations.join('; ')),
  ])];

  const host = doc.location?.hostname || '';
  const path = doc.location?.pathname || '';
  const isLever = /(?:^|\.)lever\.co$/i.test(host);
  const isLeverApply = isLever && /\/apply(?:\/|\?|#|$)/i.test(path);
  const postingUrl = isLeverApply && doc.location?.href ? doc.location.href.replace(/\/apply(?:\/.*|\?.*|#.*)?$/i, '') : doc.location?.href || '';

  const descEl = doc.querySelector('[itemprop=description],.job__description,.job-description,#job-description,.ashby-job-posting-description,.posting-page .content') || doc.querySelector('article,main');
  const metaDesc = doc.querySelector('meta[property="og:description"],meta[name="twitter:description"]')?.content?.trim() || '';
  const rawDescription = posting?.description || (descEl ? visibleText(descEl) : (metaDesc || visibleText(doc.body)));

  const job = {
    title: plain(posting?.title || doc.querySelector('h1, .posting-header h2')?.textContent || doc.title),
    company: plain(company), companyUncertain: !company,
    location: plain(locations.join('; ')),
    workCountries,
    workCountry: workCountries.length === 1 ? workCountries[0] : '',
    locationAmbiguous: workCountries.length !== 1,
    jobId: plain(posting?.identifier?.value || (typeof posting?.identifier === 'string' ? posting.identifier : '')),
    description: plain(rawDescription),
    listingUrl: isLeverApply ? postingUrl : (doc.location?.href || ''),
    applicationUrl: isLeverApply ? (doc.location?.href || '') : (apply ? safeUrl(apply.getAttribute('href'), doc.location?.href || '') : ''),
    capturedAt: new Date().toISOString(),
  };
  // Application steps often omit listing details. Only carry context whose
  // recorded URL/identity belongs to this application; never borrow another job.
  const previous = gmGet(STORAGE_KEYS.JOB);
  const sameListing = previous?.listingUrl === job.listingUrl && previous?.title === job.title && !(previous?.jobId && job.jobId && previous.jobId !== job.jobId);
  const applicationTransition = previous?.listingUrl !== job.listingUrl && previous?.applicationUrl === doc.location?.href;
  if (previous && (sameListing || applicationTransition)) {
    const missingLocation = !job.location;
    for (const key of ['company', 'location', 'jobId']) if (!job[key] && previous[key]) job[key] = previous[key];
    if (missingLocation && !job.workCountries.length && previous.workCountries?.length) {
      job.workCountries = previous.workCountries;
      job.workCountry = previous.workCountry;
      job.locationAmbiguous = previous.locationAmbiguous;
    }
    if (previous.description?.length > job.description.length && !posting?.description) job.description = previous.description;
    if (!company && job.company) job.companyUncertain = previous.companyUncertain;
  }
  const signature = JSON.stringify({ ...job, capturedAt: undefined });
  const cached = capturedJobs.get(doc);
  if (cached?.signature === signature) return cached.job;
  capturedJobs.set(doc, { signature, job });
  gmSet(STORAGE_KEYS.JOB, job);
  if (isLeverApply && postingUrl && typeof fetch === 'function') {
    // Runtime coordination only: storage and extension messages must contain plain job data.
    Object.defineProperty(job, 'pendingHydration', { value: hydrateJob(job, doc) });
  }
  return job;
}
