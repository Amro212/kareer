import { hasAi, isManagedAi, getSettings, getProfile, gmGet } from './storage.js';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';
import { logger } from './debug.js';
import { platform } from './platform.js';
import { findExactOption } from './fields/combobox.js';
import { profileForAI, fixedProfileAnswer, workEligibilityAnswer, formatStructuredBackground } from './profile.js';
import { adapterById, detectAdapter } from './adapters/index.js';
import { isResidenceLabel, locationMatches } from './location.js';
import { buildAiMessages } from './ai-prompts.js';

export { CANDIDATE_VOICE_PROFILE, NARRATIVE_VOICE_RULES, USER_APPROVED_WRITING_EXAMPLES, BASELINE_STYLE_EXAMPLES, getNarrativeStyleExamples, buildNarrativeVoicePrompt, isNarrativeField, buildStructuredSystemPrompt, buildNarrativeSystemPrompt, buildNarrativeEditorSystemPrompt } from './ai-prompts.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const AUTOFILL_TIMEOUT_MS = 120000;
const OPTION_FIELD_TYPES = new Set(['select', 'combobox', 'radio', 'checkbox']);

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

function aiStyle(profile, settings) {
  const examples = settings.writingExamples || profile.writingExamples;
  return { narrativeStyle: settings.narrativeStyle || 'natural', ...(Array.isArray(examples) && examples.length ? { writingExamples: examples.map(({ question, answer }) => ({ question: String(question ?? ''), answer: String(answer ?? '') })) } : {}) };
}

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

// `input` is the structured operation the managed gateway accepts; it builds the
// same messages server-side. BYOK sends the locally built messages to OpenRouter.
async function requestAiJson({ model, input, temperature = 0.2, timeout = AUTOFILL_TIMEOUT_MS, tag = 'AI', operation = 'autofill' }) {
  const startTime = Date.now();
  const payload = JSON.stringify({
    model,
    messages: buildAiMessages(operation, input),
    response_format: { type: 'json_object' },
    temperature,
  });
  logger.info(`${tag} request: model=${model}, temp=${temperature}, payload=${payload.length} chars, timeout=${timeout / 1000}s`);

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout,
    operation,
    input,
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
    logger.error(`Failed to parse ${tag} answers JSON`);
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.answers)) {
    throw new Error('AI response missing "answers" array');
  }

  return { answers: parsed.answers, latencyMs };
}

export async function testConnection() {
  if (isManagedAi()) {
    const status = await platform.ai.refresh();
    return { ok: status.state === 'ready', model: 'Kareer AI', error: status.state === 'ready' ? '' : 'Open Settings to activate Kareer AI or check your credits.' };
  }
  const settings = getSettings();
  const model = isManagedAi() ? 'Kareer AI' : settings.model || DEFAULT_SETTINGS.model;

  if (!hasAi()) {
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
    const savedOptions = field.ats?.multiple && Array.isArray(saved) ? saved.map(value => findExactOption(field.options || [], value, field)) : null;
    const resolved = deterministic && deterministic.value !== '' && deterministic.value != null && (!Array.isArray(deterministic.value) || deterministic.value.length > 0 || field.ats?.multiple && !field.required);
    if (resolved || deterministic?.searchQuery) {
      if (!deterministic.source) deterministic.source = 'profile';
      if (!deterministic.provenance) deterministic.provenance = deterministic.value ? 'saved' : 'unresolved';
      answers.push(deterministic);
    } else if (savedOptions && (savedOptions.length || !field.required) && savedOptions.every(Boolean)) {
      answers.push({ fieldId: field.fieldId, value: savedOptions.map(option => field.type === 'combobox' ? option.label : option.value), inferred: false, provenance: 'saved', source: 'saved' });
    } else if (saved !== undefined && !Array.isArray(saved) && (!['combobox', 'select', 'radio'].includes(field.type) || findExactOption(field.options || [], saved, field))) {
      answers.push({ fieldId: field.fieldId, value: saved, inferred: false, provenance: 'saved', source: 'saved' });
    } else {
      unresolved.push(field);
      if (deterministic) answers.push({ ...deterministic, source: 'profile', provenance: 'unresolved' });
    }
  }
  const model = isManagedAi() ? 'Kareer AI' : settings.model || DEFAULT_SETTINGS.model;
  if (!unresolved.length && fields.length) return { answers, latencyMs: 0, model };
  if (!hasAi()) return { answers, latencyMs: 0, model };
  const currentAdapter = detectAdapter();
  const tag = currentAdapter?.label ? `${currentAdapter.label} page` : 'ATS page';
  if (jobContext?.description) {
    logger.info(`Grounding ${unresolved.length} questions in job context: "${jobContext.title || 'Untitled'}" at "${jobContext.company || 'Unknown'}" (${jobContext.description.length} chars)`);
  }
  const result = await requestAiJson({ model, tag, operation: repairErrors?.length ? 'repair' : allowSearch ? 'autofill' : 'optionDiscovery', input: {
    allowSearch, applicantProfile: profileForAI(profile), resumeContext: formatStructuredBackground(profile) || profile.resumeContext || '',
    applicantNotes: profile.applicantNotes || '', pageContext: { url: window.location.href.slice(0, 4096), host: window.location.hostname },
    jobContext: jobContext || null, repairErrors: repairErrors || [], fieldsToFill: unresolved, style: aiStyle(profile, settings),
  } });
  const byId = new Map(unresolved.map(field => [field.fieldId, field]));
  const seen = new Set();
  for (const answer of result.answers) {
    const field = byId.get(answer?.fieldId);
    if (!field || seen.has(answer.fieldId)) continue;
    seen.add(answer.fieldId);
    if (answer.value == null || (typeof answer.value === 'object' && !Array.isArray(answer.value))) continue;
    if (Array.isArray(answer.value) && (!field.ats?.multiple || !answer.value.length && (field.required || field.type !== 'radio') || answer.value.some(value => typeof value !== 'string'))) continue;
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
export async function rewriteNarrativeField({ fieldLabel, currentValue, feedback, constraints, style }) {
  const settings = { ...getSettings(), ...(style === undefined ? {} : { narrativeStyle: style }) };
  const profile = getProfile();
  const model = isManagedAi() ? 'Kareer AI' : settings.narrativeModel || settings.model || DEFAULT_SETTINGS.model;
  if (!hasAi()) {
    throw new Error('AI is unavailable. Open Settings to check your connection or credits.');
  }

  const job = gmGet(STORAGE_KEYS.JOB);
  const input = {
    fieldLabel: String(fieldLabel || ''), currentValue: String(currentValue ?? ''), feedback: feedback || '', maxLength: constraints?.maxLength || null,
    applicantProfile: profileForAI(profile), resumeContext: formatStructuredBackground(profile) || profile.resumeContext || '',
    applicantNotes: profile.applicantNotes || '', style: aiStyle(profile, settings),
    jobContext: job?.description ? { title: job.title || '', company: job.company || '', description: job.description } : null,
  };

  logger.info(`Narrative rewrite request for "${fieldLabel}" using ${model}`);
  const startTime = Date.now();

  const payload = JSON.stringify({
    model,
    messages: buildAiMessages('fieldRewrite', input),
    temperature: 0.6,
  });

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout: isManagedAi() ? 120000 : 25000,
    operation: 'fieldRewrite',
    input,
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
