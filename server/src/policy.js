import { validateMaterial, mergeMaterialRewrite } from '../../src/core/materials-model.js';
import { buildAiMessages } from '../../src/core/ai-prompts.js';

export class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new ApiError(code, status); };

// One copy of customer-facing error text, shared by the JSON API and the hosted plans page.
export const MESSAGES = {
  ACTIVATION_NEEDED: 'Activate your Kareer key in Settings.', INVALID_KEY: 'That key could not be verified.',
  KEY_DISABLED: 'This key is disabled. Contact support for help.',
  NO_CREDITS: 'Out of credits. Buy a credit pack or renew your plan.',
  BUSY: 'Two AI requests are already running. Wait for one to finish.', RATE_LIMIT: 'Too many requests. Wait a minute and try again.',
  INPUT_TOO_LARGE: 'This request is too large. Reduce the supplied text and retry.',
  INVALID_COMPLETION: 'AI returned an incomplete or invalid result. No credit was charged.',
  GENERATION_FAILED: 'AI is temporarily unavailable. No credit was charged.',
  ID_CONFLICT: 'This request ID was already used for different content.',
  SUBSCRIPTION_EXISTS: 'You already have a monthly plan. Manage it from Manage billing in Kareer.',
  SALES_DISABLED: 'Purchases are not available yet.',
  WALLET_FLAGGED: 'Purchases are paused for this key while a payment issue is reviewed. Contact support.',
  NO_BILLING: 'This key has no billing account yet.',
};

// Optional Cloudflare rate limiting binding for unauthenticated purchase creation.
export async function limited(request, env) {
  if (!env.PURCHASE_LIMITER) return;
  const { success } = await env.PURCHASE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!success) fail('RATE_LIMIT', 429);
}

export async function readBody(request, cap = 256 * 1024) {
  if (Number(request.headers.get('content-length')) > cap) fail('INPUT_TOO_LARGE', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) { await reader.cancel(); fail('INPUT_TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const limits = { autofill: 4096, repair: 4096, optionDiscovery: 4096, fieldRewrite: 2048, document: 7000, documentRewrite: 7000 };
const isObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const only = (value, keys) => isObject(value) && Object.keys(value).every(k => keys.includes(k));
const text = (value, max, optional = true) => (optional && (value === undefined || value === null)) || (typeof value === 'string' && value.length <= max);
const style = value => value === undefined || (only(value, ['narrativeStyle', 'writingExamples']) && text(value.narrativeStyle, 64)
  && (value.writingExamples === undefined || (Array.isArray(value.writingExamples) && value.writingExamples.length <= 20
    && value.writingExamples.every(e => only(e, ['question', 'answer']) && text(e.question, 2000) && text(e.answer, 4000)))));
const job = value => value === undefined || value === null || isObject(value);

// Structured Kareer operations only. The gateway writes every system prompt; clients
// supply application data (fields, options, profile facts, job context), never messages.
const shapes = {
  page: input => only(input, ['allowSearch', 'applicantProfile', 'resumeContext', 'applicantNotes', 'pageContext', 'jobContext', 'repairErrors', 'fieldsToFill', 'style'])
    && (input.allowSearch === undefined || typeof input.allowSearch === 'boolean')
    && isObject(input.applicantProfile) && text(input.resumeContext, 64000) && text(input.applicantNotes, 16000)
    && (input.pageContext === undefined || (only(input.pageContext, ['url', 'host']) && text(input.pageContext.url, 4096) && text(input.pageContext.host, 255)))
    && job(input.jobContext) && (input.repairErrors === undefined || (Array.isArray(input.repairErrors) && input.repairErrors.length <= 500))
    && Array.isArray(input.fieldsToFill) && input.fieldsToFill.length > 0 && input.fieldsToFill.length <= 500
    && input.fieldsToFill.every(f => isObject(f) && typeof f.fieldId === 'string' && f.fieldId && (f.options === undefined || Array.isArray(f.options))) && style(input.style),
  fieldRewrite: input => only(input, ['fieldLabel', 'currentValue', 'feedback', 'maxLength', 'applicantProfile', 'resumeContext', 'applicantNotes', 'jobContext', 'style'])
    && text(input.fieldLabel, 2000, false) && text(input.currentValue, 32000) && text(input.feedback, 4000)
    && (input.maxLength === undefined || input.maxLength === null || (Number.isSafeInteger(input.maxLength) && input.maxLength > 0))
    && (input.applicantProfile === undefined || isObject(input.applicantProfile)) && text(input.resumeContext, 64000) && text(input.applicantNotes, 16000)
    && (input.jobContext === undefined || input.jobContext === null || (only(input.jobContext, ['title', 'company', 'description'])
      && text(input.jobContext.title, 500) && text(input.jobContext.company, 500) && text(input.jobContext.description, 64000))) && style(input.style),
  document: input => only(input, ['kind', 'source', 'job', 'pageTarget', 'tone', 'length', 'instructions', 'rewrite', 'currentDocument'])
    && ['resume', 'coverLetter'].includes(input.kind) && isObject(input.source) && job(input.job)
    && text(input.tone, 64) && text(input.length, 64) && text(input.instructions, 4000)
    && (input.pageTarget === undefined || [1, 2].includes(input.pageTarget))
    && (input.rewrite === undefined || input.rewrite === null || (only(input.rewrite, ['path']) && text(input.rewrite.path, 200, false)))
    && (input.currentDocument === undefined || input.currentDocument === null || isObject(input.currentDocument)),
};
const shapeFor = operation => operation === 'fieldRewrite' ? shapes.fieldRewrite : operation.startsWith('document') ? shapes.document : shapes.page;

export function parseInput(body) {
  if (!only(body, ['id', 'operation', 'input'])) fail('INVALID_REQUEST');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(body.id || '') || !Object.hasOwn(limits, body.operation)) fail('INVALID_REQUEST');
  if (new TextEncoder().encode(JSON.stringify(body.input ?? null)).byteLength > 128 * 1024) fail('INPUT_TOO_LARGE', 413);
  if (!shapeFor(body.operation)(body.input)) fail('INVALID_REQUEST');
  const rewrite = Boolean(body.input.rewrite?.path && body.input.currentDocument);
  if ((body.operation === 'documentRewrite') !== (body.operation.startsWith('document') && rewrite)) fail('INVALID_REQUEST');
  return body;
}

export function upstreamBody(request) {
  return {
    model: 'google/gemini-2.5-flash-lite', messages: buildAiMessages(request.operation, request.input),
    max_tokens: limits[request.operation], temperature: request.operation === 'fieldRewrite' ? 0.6 : 0.2,
    reasoning: { enabled: false }, plugins: [],
    provider: { max_price: { prompt: 0.1, completion: 0.4 }, require_parameters: true, allow_fallbacks: true },
    ...(request.operation === 'fieldRewrite' ? {} : { response_format: { type: 'json_object' } }),
    stream: false,
  };
}

export function validateCompletion(request, body) {
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (body?.error || choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) fail('INVALID_COMPLETION', 502);
  if (request.operation === 'fieldRewrite') return content.trim();
  let output;
  try { output = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { fail('INVALID_COMPLETION', 502); }
  if (request.operation.startsWith('document')) {
    const d = request.input;
    try { validateMaterial(d.kind, request.operation === 'documentRewrite' ? mergeMaterialRewrite(d.currentDocument, output, d.rewrite.path) : output, d.source); }
    catch { fail('INVALID_COMPLETION', 502); }
  } else if (!output || !Array.isArray(output.answers) || output.answers.length > 1000 || output.answers.some(a => !a || typeof a.fieldId !== 'string' || !a.fieldId
    || !(['string', 'boolean'].includes(typeof a.value) || Array.isArray(a.value) && a.value.length <= 100 && a.value.every(v => typeof v === 'string')))) {
    fail('INVALID_COMPLETION', 502);
  }
  return JSON.stringify(output);
}

export async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
