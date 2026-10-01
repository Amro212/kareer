import { gmSet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';
import { isVisible, visibleText } from './pageClassifier.js';
import { detectAdapter } from './adapters/index.js';
import { logger } from './debug.js';

const JOB_HYDRATION_TIMEOUT_MS = 5000;

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
  const apply = detectAdapter(doc.defaultView?.location, doc).applyControl?.(doc) || Array.from(doc.querySelectorAll('a[href]')).find(el => isVisible(el) && /^(?:apply|apply now|apply for (?:this )?(?:job|position)|start application)$/i.test(visibleText(el)));
  const company = posting?.hiringOrganization?.name || doc.querySelector('[itemprop=hiringOrganization]')?.textContent?.trim() || '';
  const address = [posting?.jobLocation].flat()[0]?.address;

  const host = doc.location?.hostname || '';
  const path = doc.location?.pathname || '';
  const isLever = /(?:^|\.)lever\.co$/i.test(host);
  const isLeverApply = isLever && /\/apply(?:\/|\?|#|$)/i.test(path);
  const postingUrl = isLeverApply && doc.location?.href ? doc.location.href.replace(/\/apply(?:\/.*|\?.*|#.*)?$/i, '') : doc.location?.href || '';

  const descEl = doc.querySelector('[itemprop=description],.job-description,#job-description,article,main');
  const metaDesc = doc.querySelector('meta[property="og:description"],meta[name="twitter:description"]')?.content?.trim() || '';
  const rawDescription = posting?.description || (descEl ? visibleText(descEl) : (metaDesc || visibleText(doc.body)));

  const job = {
    title: plain(posting?.title || doc.querySelector('h1, .posting-header h2')?.textContent || doc.title),
    company: plain(company), companyUncertain: !company,
    location: plain(typeof address === 'string' ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(', ')),
    jobId: plain(posting?.identifier?.value || (typeof posting?.identifier === 'string' ? posting.identifier : '')),
    description: plain(rawDescription),
    listingUrl: isLeverApply ? postingUrl : (doc.location?.href || ''),
    applicationUrl: isLeverApply ? (doc.location?.href || '') : (apply ? safeUrl(apply.getAttribute('href'), doc.location?.href || '') : ''),
    capturedAt: new Date().toISOString(),
  };
  gmSet(STORAGE_KEYS.JOB, job);
  if (isLeverApply && postingUrl && typeof fetch === 'function') {
    // Runtime coordination only: storage and extension messages must contain plain job data.
    Object.defineProperty(job, 'pendingHydration', { value: hydrateJob(job, doc) });
  }
  return job;
}
