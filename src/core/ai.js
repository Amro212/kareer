import { hasApiKey, getSettings, getProfile, gmGet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';
import { logger } from './debug.js';
import { platform } from './platform.js';
import { findExactOption } from './fields/combobox.js';
import { profileForAI, fixedProfileAnswer, workEligibilityAnswer, formatStructuredBackground } from './profile.js';
import { adapterById, detectAdapter } from './adapters/index.js';
import { isResidenceLabel, locationMatches } from './location.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const AUTOFILL_TIMEOUT_MS = 120000;
const OPTION_FIELD_TYPES = new Set(['select', 'combobox', 'radio', 'checkbox']);
const STRUCTURED_TYPES = new Set(['select', 'combobox', 'radio', 'checkbox', 'date', 'number', 'tel', 'email', 'url']);

export const CANDIDATE_VOICE_PROFILE = `VOICE PROFILE

The candidate is direct and relatively informal.
He doesn't write like a cover letter unless specifically asked for one.
He tends to explain his interest through the actual thing that interests him
rather than announcing that he is "passionate" or "excited."

He uses contractions naturally.
He prefers concrete technical details.
He rarely uses ceremonial conclusions.
He does not oversell himself.
He is comfortable saying "I built...", "I wanted...", "I ran into...",
"I ended up...", "I liked...", and "what interested me was..."

His writing should feel like a smart 23-year-old engineer typed the answer,
not like somebody from HR polished it.`;

export const NARRATIVE_VOICE_RULES = `NARRATIVE VOICE

Write as the candidate himself, not as a recruiter, career coach, copywriter,
LinkedIn creator, or company spokesperson.

The answer should sound natural if spoken aloud in an interview.

Priorities:
1. Answer the question immediately. Never restate or echo the question in the opening sentence (e.g. never start with "I have experience with...", "My most significant project is...", or "During my education at..."). Jump straight into what you actually built, did, or solved.
2. Use concrete facts, experiences, or reasons from the supplied context. Never use "This involved [gerund], [gerund]" or passive task catalogs; use direct active verbs ("I set up...", "I built...", "I fixed...").
3. Explain only what needs explaining. Never write corporate marketing copy, PR statements, or product landing page summaries.
4. Stop when the question has been answered. Never append an essay conclusion, meta-evaluative summary, or ceremonial closing sentence (e.g. "I'm eager to contribute...", "This opportunity aligns perfectly...", "This project demonstrates my ability to...").

Writing style:
- Use first person ("I") and normal contractions (I've, wasn't, didn't, it's).
- Prefer simple verbs: built, used, fixed, tried, learned, worked, wrote.
- Keep sentences reasonably short, but vary sentence rhythm and length (burstiness).
- Use specific details instead of adjectives about yourself.
- Usually write 2-5 sentences unless the question clearly requires more.
- It's okay for the prose to feel slightly informal. It should not feel polished to the point of sounding manufactured.
- Do not manufacture enthusiasm.
- Never use em dashes (\u2014), en dashes (\u2013), or spaced double hyphens as dashes. Use a period, comma, colon, or parentheses.
- Do not append unprompted skill or keyword lists to the end of a narrative.
- Avoid inflated corporate jargon and AI buzzwords: leverage, utilize, optimize, streamline, pivotal, crucial, testament, landscape, delve, underscore, showcase, robust, meticulous, vibrant, groundbreaking, foster, boasts, serves as, stands as, facilitate, empower, elevate, enhance, augment. Use plain words: used, built, fixed, ran, set up, handled, helped.

SPECIFICITY TEST

Any sentence that could be pasted unchanged into applications for 50 different
companies is probably useless. Remove it or replace it with something specific
from the candidate or job context.

For employer-motivation answers ("Why this company?", "Why this role?", "What interests you about us?"):
- Only mention company qualities, products, technical problems, culture, mission, or values when the supplied context actually contains something specific supporting them. Never invent generic praise or corporate flattery ("strong engineering culture", "innovative environment", "prioritizes user trust") to complete the answer.
- Preferred structure:
  1. Specific thing about the product/company/problem that actually interests the candidate.
  2. Why that technical/product problem is interesting.
  3. Concrete connection to the candidate's real work/projects.
  4. Stop.
- If company context is thin, write a shorter truthful answer rather than inventing praise.

SPOKEN TEST

Before returning the answer, silently read it as if the candidate were saying
it to an interviewer.

If a sentence sounds like a cover letter, corporate website, AI assistant,
career coach, or LinkedIn post, rewrite it in simpler spoken English.

Never add a ceremonial closing sentence such as:
"I'm eager to contribute..."
"I would be excited to bring..."
"This opportunity aligns perfectly..."
"I look forward to..."
"This experience demonstrates..."`;

export const USER_APPROVED_WRITING_EXAMPLES = [];

export const BASELINE_STYLE_EXAMPLES = `STYLE EXAMPLES (Style demonstrations only, do not memorize):

Example 1: Why this company?
Question: "Why 1Password?"
BAD (Generic corporate AI):
"I'm excited by 1Password's mission to secure digital lives and its reputation for a strong engineering culture. My background in building practical software, particularly in automation and API integrations, aligns well with the challenges of developing robust security products. I'm eager to contribute to a company that prioritizes user trust and innovation."

GOOD (Conversational Human):
"I've used password managers for years, so 1Password is one of those products where I already understand the problem it's solving. Security software also has an interesting engineering constraint: it has to be extremely reliable without making the user's life harder. Most of my own projects have involved automation, APIs, and taking messy workflows and making them simpler, so that kind of product work genuinely interests me."

Example 2: Technical experience
Question: "Describe your experience with Linux and open source"
BAD (Robotic AI summary):
"I have experience with Linux and open source through deploying and operating self-hosted AI agent infrastructure on Oracle Cloud Ubuntu VPS. This involved provisioning the server, expanding storage, deploying multiple containerized services with persistent workspaces... My technical skills also include Python, Docker..."

GOOD (Direct developer):
"I run my self-hosted AI workflows on an Ubuntu VPS in Oracle Cloud. I set up the server, expanded the storage volumes, and deployed several containerized services with persistent disk storage. When internal Docker networking caused routing issues between containers, I reconfigured the service routes and added automatic provider fallbacks."

Example 3: Personal project
Question: "Describe your best personal software project, outside of curriculum or work"
BAD (Product brochure):
"My most significant personal software project is Kareer, a browser-based tool designed to reduce repetitive job application work. It uses structured personal and professional context... This project demonstrates my ability to build practical tools..."

GOOD (Builder explanation):
"I built Kareer, a browser extension and userscript that automates repetitive job application forms. Standard autofill extensions constantly fail on custom UI components like Workday comboboxes, so I engineered a DOM observer and event dispatcher that reliably selects those options across different ATS platforms."

Example 4: Leadership / Team responsibility
Question: "Describe any significant leadership or organizational / team responsibility that you took on during your education"
BAD (Robotic formula):
"During my education at the University of Guelph, I was involved in several projects that required organizational and team responsibilities. For the Senior Engineering Design Competition Robot project, our team placed 2nd, which involved coordinating efforts... requiring organizational skills to handle multiple students..."

GOOD (Honest recount):
"In our Senior Engineering Design Competition, I helped lead a team of four to build and program an autonomous robot under tight competition deadlines, taking 2nd place overall. Outside of classes, I also tutored math and programming for Paper, managing concurrent student sessions and breaking down difficult technical concepts on the fly."`;

export function getNarrativeStyleExamples(profile, settings) {
  const customExamples = settings?.writingExamples || profile?.writingExamples || USER_APPROVED_WRITING_EXAMPLES;
  if (!customExamples || !customExamples.length) {
    return BASELINE_STYLE_EXAMPLES;
  }
  const formattedCustom = customExamples.map((ex, idx) => `Custom Example ${idx + 1}:
Question: "${ex.question}"
Approved Answer: "${ex.answer}"`).join('\n\n');
  return `${BASELINE_STYLE_EXAMPLES}\n\nUSER-APPROVED EXAMPLES:\n${formattedCustom}`;
}

export function isNarrativeField(field) {
  if (!field) return false;
  if (STRUCTURED_TYPES.has(field.type)) return false;
  if (field.type === 'textarea' || field.type === 'contenteditable') return true;

  const label = String(field.label || '').toLowerCase();
  const desc = String(field.description || '').toLowerCase();
  const combined = `${label} ${desc}`;

  const isShortStructured = /^(?:first\s*name|last\s*name|full\s*name|middle\s*name|name|email|phone|mobile|tel|phone\s*number|linkedin|github|portfolio|website|url|address|street|city|state|province|region|zip|postal|postal\s*code|country|salary|compensation|currency|pay|start\s*date|earliest\s*start|notice\s*period|years\s*(?:of\s*)?experience|gender|pronouns|race|ethnicity|disability|veteran|birth)/i.test(label.trim());
  if (isShortStructured && (!field.constraints?.maxLength || field.constraints.maxLength <= 150)) {
    return false;
  }

  const isNarrativePrompt = /\b(?:why|describe|explain|tell\s+us|share|what\s+interests|cover\s*letter|summary|statement|background|bio|about\s+yourself|projects?|experience|responsibilities|achievements?|challenges?)\b/i.test(combined);
  if (isNarrativePrompt) return true;

  if (field.constraints?.maxLength && field.constraints.maxLength > 200) return true;
  return false;
}

export function buildStructuredSystemPrompt({ allowSearch = true } = {}) {
  return `You are Kareer, filling structured fields in an online job application for a candidate.

CRITICAL OPERATING RULES:
1. Ground all candidate claims strictly in the provided applicant profile, resume highlights, and applicant notes.
2. Use saved facts first, then infer the best-supported answer from all available candidate and job context. Never invent facts out of thin air. Mark grounded contextual answers with provenance="inferred"; mark uncertain context-based estimates with provenance="guessed" and inferred=true.
3. For structured questions (radio, select, checkbox, short text) where candidate preferences or standard defaults apply:
   - Explicit structured applicantProfile answers have priority over conflicting resume context, applicant notes, previous answers, and generic defaults. Preserve explicit No answers.
   - Work authorization and sponsorshipNow/sponsorshipFuture: match the question or job country to applicantProfile.workEligibilities (or workCountry). An implicit country may use the single configured eligibility record. Do not present another country's authorization as a saved fact. Use resume context and applicant notes for remaining eligibility questions, marking contextual answers inferred and uncertain context-based estimates guessed. Distinguish authorization from requiring sponsorship and account for negation such as "without sponsorship".
   - For sponsorship "now OR in the future", answer Yes if either scoped answer is Yes; answer No when BOTH scoped answers are No. Use contextual evidence for unset values and distinguish current from future sponsorship.
   - Years of experience dropdowns: infer the candidate's level (e.g. Senior, Mid, 5+ years) from their resume context and select the best matching option. Set "inferred": true.
   - Demographic surveys / EEOD / gender / pronouns / race or ethnicity / disability / veteran status: prioritize the corresponding explicit profile answer, then relevant applicant notes and context. Preserve an explicit preference not to answer using an offered decline option. Mark contextual answers inferred and uncertain context-based estimates guessed. Match the specific question: protected veteran status, Hispanic ethnicity, and sex assigned at birth are distinct facts. Use genderDescription for Self-describe. Do not mention demographics in unrelated narrative answers.
   - "How did you hear about us?" and equivalent job discovery/source questions: always LinkedIn. For option fields choose only an offered LinkedIn option; if unavailable return empty (combobox may search LinkedIn). Do not invent a referrer or replace a LinkedIn profile URL with this source answer.
   - Compensation must preserve expectedSalary, salaryCurrency and salaryPeriod together. Do not silently convert currency or annual/hourly pay. Total yearsExperience is not years with a particular tool. Use relevant applicant context to resolve work arrangements and availability, including outdated start dates.
   - Consent / Privacy / Background check / Application acknowledgment / Accuracy certification / Electronic signature agreement checkboxes: set value to true; for radio or select agreements choose the offered affirmative acknowledgment. These questions do not pause the form.
4. For "select", "combobox", "radio", or "checkbox" fields:
   - Your "value" MUST be chosen strictly from the provided "options" list (matching either the option value or option label). Never leave a select on a placeholder like "-- Please Select --" or "Select...".
   - Options belong ONLY to their own fieldId. Never reuse a choice from another field.
   - For comboboxes, return the exact option label. If no options were discovered, or the candidate context does not support any available option, return an empty string. Never invent a label or choose the first/closest option just to fill the field.
   - Match the specific question against applicant context (phone dialing country, work location, nationality, degree and discipline are separate questions).
   - ${allowSearch ? 'Some comboboxes load only the first page of options. If the candidate\'s known answer is missing, leave value empty and include an optional "searchQuery" with a short search term grounded in the applicant context (e.g. the actual university name). A search query is NOT a selection. Omit it when the answer is unknown.' : 'These options are final search results. Do not request another search; leave value empty if there is no supported choice.'}
5. Return an answer object for EVERY field provided in "fieldsToFill".
6. Respond ONLY with a valid JSON object in this exact schema, without markdown code blocks:
{
  "answers": [
    {
      "fieldId": "string (must match fieldId from input)",
      "value": "string or boolean",
      "provenance": "inferred or guessed",
      "inferred": boolean${allowSearch ? ',\n      "searchQuery": "optional; only for an empty value requiring option discovery"' : ''}
    }
  ]
}`;
}

export function buildNarrativeSystemPrompt(profile, settings) {
  return `You are Kareer, writing open-ended job application responses for the candidate.

Ground every factual claim in the supplied applicant profile, resume context, applicant notes, and job context. Never invent experience or company facts.
Explicit structured profile answers take precedence over conflicting notes.

${CANDIDATE_VOICE_PROFILE}

${NARRATIVE_VOICE_RULES}

${getNarrativeStyleExamples(profile, settings)}

Return an answer object for EVERY field provided in "fieldsToFill".
Respond ONLY with a valid JSON object in this exact schema, without markdown code blocks:
{
  "answers": [
    {
      "fieldId": "string (must match fieldId from input)",
      "value": "string (the narrative answer)",
      "inferred": false
    }
  ]
}`;
}

export function buildNarrativeEditorSystemPrompt() {
  return `You are editing a job-application answer for voice only.

Do not add facts.
Do not remove important factual details.
Do not make the candidate sound more experienced than the source says.
Do not add company claims that are not present in the supplied context.

Make it sound like the candidate typed it himself.
Prefer plain spoken English.
Remove generic cover-letter language, corporate praise, ceremonial conclusions,
and sentences that could be pasted unchanged into dozens of applications.

If the existing answer already sounds natural, make minimal or no changes.

Respond ONLY with a valid JSON object in this exact schema, without markdown code blocks:
{
  "answers": [
    {
      "fieldId": "string (must match fieldId from input)",
      "value": "string (edited answer)"
    }
  ]
}`;
}

function stripModelDashes(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ');
}

// The host attaches Authorization; core never holds the key.
const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://github.com/Amro212/kareer',
  'X-Title': 'Kareer',
};

function sendAiRequest(options) {
  return platform.ai.request({ ...options, headers: { ...REQUEST_HEADERS, ...options.headers } });
}

function cleanJsonFence(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
  return cleaned;
}

async function requestAiJson({ model, messages, temperature = 0.2, timeout = AUTOFILL_TIMEOUT_MS, tag = 'AI' }) {
  const startTime = Date.now();
  const payload = JSON.stringify({
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature,
  });
  logger.info(`${tag} request: model=${model}, temp=${temperature}, payload=${payload.length} chars, timeout=${timeout / 1000}s`);

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout,
  }).catch(err => {
    logger.warn(`${tag} request failed after ${Date.now() - startTime}ms using ${model}: ${err.message}`);
    throw err;
  });

  const latencyMs = Date.now() - startTime;

  if (response.status !== 200) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(response.responseText);
      if (errJson.error?.message) errorDetail = errJson.error.message;
    } catch {}
    throw new Error(`OpenRouter Error (${response.status}) using model ${model}: ${errorDetail}`);
  }

  let rawContent = '';
  try {
    const data = JSON.parse(response.responseText);
    rawContent = data.choices?.[0]?.message?.content || '';
  } catch (err) {
    throw new Error(`Failed to parse OpenRouter response: ${err.message}`);
  }

  const cleaned = cleanJsonFence(rawContent);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error(`Failed to parse ${tag} answers JSON:`, cleaned);
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.answers)) {
    throw new Error('AI response missing "answers" array');
  }

  return { answers: parsed.answers, latencyMs };
}

export async function testConnection() {
  const settings = getSettings();
  const model = settings.model || 'google/gemini-2.0-flash';

  if (!hasApiKey()) {
    logger.warn('Test AI invoked without an API key configured.');
    return {
      ok: false,
      model,
      latencyMs: 0,
      error: 'No OpenRouter API key found. Please add your key in Settings.',
      status: 'NO_KEY',
    };
  }

  const startTime = Date.now();

  try {
    logger.info(`Testing OpenRouter connection using model: ${model}`);

    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'user', content: "Ping test. Respond with the single word 'OK'." },
      ],
      max_tokens: 10,
    });

    const response = await sendAiRequest({
      method: 'POST',
      url: OPENROUTER_ENDPOINT,
      data: payload,
      timeout: 15000,
    });

    const latencyMs = Date.now() - startTime;
    const statusCode = response.status;

    if (statusCode === 200) {
      let reply = 'OK';
      try {
        const data = JSON.parse(response.responseText);
        reply = data.choices?.[0]?.message?.content?.trim() || 'OK';
      } catch {}

      logger.info(`OpenRouter connection test succeeded in ${latencyMs}ms. Response: "${reply}"`);
      return {
        ok: true,
        model,
        latencyMs,
        reply,
        status: 200,
      };
    }

    let errorDetail = `HTTP ${statusCode}`;
    try {
      const errorJson = JSON.parse(response.responseText);
      if (errorJson.error && errorJson.error.message) {
        errorDetail = errorJson.error.message;
      }
    } catch {
      if (response.responseText) {
        errorDetail = response.responseText.slice(0, 150);
      }
    }

    if (statusCode === 401) {
      errorDetail = 'Invalid API key or unauthorized (401). Please check your key in Settings.';
    } else if (statusCode === 402) {
      errorDetail = 'Insufficient OpenRouter credits / balance (402).';
    } else if (statusCode === 429) {
      errorDetail = 'Rate limit exceeded (429). Please try again shortly.';
    }

    logger.error(`OpenRouter connection test failed with status ${statusCode}: ${errorDetail}`);
    return {
      ok: false,
      model,
      latencyMs,
      error: errorDetail,
      status: statusCode,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err?.message || 'Network error or connection timeout';
    logger.error(`OpenRouter request encountered network exception: ${errorMsg}`);
    return {
      ok: false,
      model,
      latencyMs,
      error: `Network Error: ${errorMsg}`,
      status: 'NETWORK_ERROR',
    };
  }
}

/** Resolve saved values first, then use one primary request for the page. */
export async function generateAutofillAnswers(normalizedFields, { allowSearch = true, jobContext = null, repairErrors = [] } = {}) {
  const settings = getSettings();
  const profile = getProfile();
  const resolvedJob = jobContext || gmGet(STORAGE_KEYS.JOB) || null;
  return generatePageAnswers(normalizedFields, { settings, profile, allowSearch, jobContext: resolvedJob, repairErrors });
}

// Adapters with resolveAnswer send only unresolved questions in one page request.
// Known record values and owned option labels never need a model or a voice-edit pass.
async function generatePageAnswers(fields, { settings, profile, allowSearch, jobContext, repairErrors }) {
  const answers = [], unresolved = [];
  for (const field of fields) {
    const resolver = (field.ats?.adapter ? adapterById(field.ats.adapter) : detectAdapter()).resolveAnswer;
    const eligibility = workEligibilityAnswer(field, profile, jobContext);
    const fixed = fixedProfileAnswer(field, profile, { allowSearch });
    const narrativeEligibility = (field.isNarrative || field.type === 'textarea') && /\b(?:authoriz|eligib|sponsor)/i.test(`${field.label} ${field.description || ''}`);
    const adapterAnswer = !narrativeEligibility && resolver ? resolver(field, profile, { allowSearch, jobContext }) : null;
    // A recognized recipe may need context for country, negation, or timing.
    // Keep that unresolved result rather than substituting a simpler fallback.
    const deterministic = adapterAnswer || (resolver && field.ats?.canonicalKey ? null : eligibility || fixed);
    const saved = profile.savedAnswers?.[field.label];
    const resolved = deterministic && deterministic.value !== '' && deterministic.value != null && (!Array.isArray(deterministic.value) || deterministic.value.length > 0);
    if (resolved || deterministic?.searchQuery) {
      if (!deterministic.source) deterministic.source = 'profile';
      if (!deterministic.provenance) deterministic.provenance = deterministic.value ? 'saved' : 'unresolved';
      answers.push(deterministic);
    } else if (saved !== undefined && (!['combobox', 'select', 'radio'].includes(field.type) || findExactOption(field.options || [], saved, field))) {
      answers.push({ fieldId: field.fieldId, value: saved, inferred: false, provenance: 'saved', source: 'saved' });
    } else {
      unresolved.push(field);
      if (deterministic) answers.push({ ...deterministic, source: 'profile', provenance: 'unresolved' });
    }
  }
  const model = settings.model || 'google/gemini-2.0-flash';
  if (!unresolved.length && fields.length) return { answers, latencyMs: 0, model };
  if (!hasApiKey()) return { answers, latencyMs: 0, model };
  const currentAdapter = detectAdapter();
  const tag = currentAdapter?.label ? `${currentAdapter.label} page` : 'ATS page';
  if (jobContext?.description) {
    logger.info(`Grounding ${unresolved.length} questions in job context: "${jobContext.title || 'Untitled'}" at "${jobContext.company || 'Unknown'}" (${jobContext.description.length} chars)`);
  }
  const result = await requestAiJson({ model, tag, messages: [
    { role: 'system', content: `${buildStructuredSystemPrompt({ allowSearch })}\n${CANDIDATE_VOICE_PROFILE}\n${NARRATIVE_VOICE_RULES}\n${getNarrativeStyleExamples(profile, settings)}\nFor declared multiple-choice fields only, value may be an array of exact owned option labels. Use all available profile, resume, notes, job, and saved-answer context for ambiguous factual or open-ended questions. Label uncertain context-based estimates with provenance=guessed and inferred=true, and grounded contextual answers provenance=inferred. Never invent facts out of thin air. Select only labels from this field's owned options. Answer every supplied application question, including eligibility, disclosures, and acknowledgments.` },
    { role: 'user', content: JSON.stringify({ applicantProfile: profileForAI(profile), resumeContext: formatStructuredBackground(profile) || profile.resumeContext, applicantNotes: profile.applicantNotes, pageContext: { url: window.location.href, host: window.location.hostname }, jobContext, repairErrors, fieldsToFill: unresolved }) },
  ] });
  const byId = new Map(unresolved.map(field => [field.fieldId, field]));
  const seen = new Set();
  for (const answer of result.answers) {
    const field = byId.get(answer?.fieldId);
    if (!field || seen.has(answer.fieldId)) continue;
    seen.add(answer.fieldId);
    if (answer.value == null || (typeof answer.value === 'object' && !Array.isArray(answer.value))) continue;
    if (Array.isArray(answer.value) && (!field.ats?.multiple || !answer.value.length || answer.value.some(value => typeof value !== 'string'))) continue;
    if (!Array.isArray(answer.value) && !['string', 'boolean', 'number'].includes(typeof answer.value)) continue;
    if (['combobox', 'select', 'radio'].includes(field.type) && answer.value !== '') {
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      const options = values.map(value => findExactOption(field.options || [], value,field));
      if (options.some(option => !option)) continue;
      const residence = profileForAI(profile).location;
      if (isResidenceLabel(field.label) && residence && options.some(option => !locationMatches(option.label, residence) && !locationMatches(residence, option.label))) continue;
      answer.value = Array.isArray(answer.value) ? options.map(option => field.type === 'combobox' ? option.label : option.value) : (field.type === 'combobox' ? options[0].label : options[0].value);
    }
    if (!allowSearch || field.type !== 'combobox' || answer.value !== '' || typeof answer.searchQuery !== 'string' || answer.searchQuery.length > 200) delete answer.searchQuery;
    answer.source = 'ai';
    answer.provenance = answer.provenance === 'guessed' ? 'guessed' : 'inferred';
    answer.inferred = true;
    if (!OPTION_FIELD_TYPES.has(field.type)) answer.value = stripModelDashes(answer.value);
    const pendingIndex = answers.findIndex(existing => existing.fieldId === answer.fieldId);
    if (pendingIndex >= 0) answers[pendingIndex] = answer;
    else answers.push(answer);
  }
  return { answers, latencyMs: result.latencyMs, model };
}

/**
 * Rewrites an individual narrative field with optional user feedback instructions
 */
export async function rewriteNarrativeField({ fieldLabel, currentValue, feedback, constraints }) {
  const settings = getSettings();
  const profile = getProfile();
  const model = settings.narrativeModel || settings.model || 'google/gemini-2.0-flash';

  if (!hasApiKey()) {
    throw new Error('No OpenRouter API key configured.');
  }

  const systemPrompt = `You are Kareer. You are rewriting a single narrative response in a job application for the candidate.

Ground every claim in the candidate's actual experience from their resume highlights. Never invent experience or company facts.

${CANDIDATE_VOICE_PROFILE}

${NARRATIVE_VOICE_RULES}

${getNarrativeStyleExamples(profile, settings)}

Rules:
1. Stay strictly faithful to the candidate's actual experience from their resume highlights.
2. Incorporate the candidate's specific feedback and revision instructions.
3. Follow NARRATIVE VOICE. First-person. Natural spoken English.
4. Output ONLY the rewritten answer text with no surrounding quotes or commentary.
5. Explicit structured profile answers take precedence over conflicting notes. Match eligibility facts to the question or job country in workEligibilities or workCountry, and use relevant applicant context for unset answers. Do not expose demographics in unrelated answers or convert compensation units. Job discovery source is always LinkedIn.`;

  const structuredBg = formatStructuredBackground(profile);
  const combinedResumeContext = structuredBg || profile.resumeContext || '';
  const job = gmGet(STORAGE_KEYS.JOB);
  const jobContextStr = job?.description
    ? `\n\nTarget Job Context:\n${job.title ? `Title: ${job.title}\n` : ''}${job.company ? `Company: ${job.company}\n` : ''}Description:\n${job.description.slice(0, 4000)}`
    : '';

  const userPrompt = `Question Label: ${fieldLabel}
Current Answer:
${currentValue}

Explicit Applicant Profile:
${JSON.stringify(profileForAI(profile))}

Candidate Resume Highlights:
${combinedResumeContext}

Applicant Notes / Rules:
${profile.applicantNotes}${jobContextStr}

User Revision Instructions:
${feedback || 'Make it clearer and more specific to this job.'}
${constraints?.maxLength ? `Maximum Length: ${constraints.maxLength} characters` : ''}`;

  logger.info(`Narrative rewrite request for "${fieldLabel}" using ${model}`);
  const startTime = Date.now();

  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
  });

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout: 25000,
  });

  const latencyMs = Date.now() - startTime;

  if (response.status !== 200) {
    throw new Error(`Rewrite request failed (HTTP ${response.status})`);
  }

  const data = JSON.parse(response.responseText);
  const rewrittenText = data.choices?.[0]?.message?.content?.trim() || '';

  logger.info(`Narrative rewritten in ${latencyMs}ms (${rewrittenText.length} chars)`);
  return stripModelDashes(rewrittenText);
}
