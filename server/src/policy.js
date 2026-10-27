import { validateMaterial, mergeMaterialRewrite } from '../../src/core/materials-model.js';

export class ApiError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new ApiError(code, status); };
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
export function parseInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(k => !['id', 'operation', 'messages', 'document'].includes(k))) fail('INVALID_REQUEST');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.id || '') || !Object.hasOwn(limits, input.operation)) fail('INVALID_REQUEST');
  if (!Array.isArray(input.messages) || !input.messages.length || input.messages.length > 10) fail('INVALID_REQUEST');
  let size = 0;
  for (const m of input.messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string'
      || Object.keys(m).some(k => !['role', 'content'].includes(k))) fail('TEXT_ONLY');
    size += new TextEncoder().encode(m.content).byteLength;
  }
  if (!size || size > 128 * 1024) fail('INPUT_TOO_LARGE', 413);
  if (input.operation.startsWith('document')) {
    if (!['resume', 'coverLetter'].includes(input.document?.kind) || !input.document?.source) fail('INVALID_REQUEST');
  } else if (input.document !== undefined) fail('INVALID_REQUEST');
  return input;
}

export function upstreamBody(input) {
  return {
    model: 'google/gemini-2.5-flash-lite', messages: input.messages,
    max_tokens: limits[input.operation], temperature: input.operation === 'fieldRewrite' ? 0.6 : 0.2,
    reasoning: { enabled: false }, plugins: [],
    provider: { max_price: { prompt: 0.1, completion: 0.4 }, require_parameters: true, allow_fallbacks: true },
    ...(input.operation === 'fieldRewrite' ? {} : { response_format: { type: 'json_object' } }),
    stream: false,
  };
}

export function validateCompletion(input, body) {
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (body?.error || choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) fail('INVALID_COMPLETION', 502);
  if (input.operation === 'fieldRewrite') return content.trim();
  let output;
  try { output = JSON.parse(content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { fail('INVALID_COMPLETION', 502); }
  if (input.operation.startsWith('document')) {
    const d = input.document;
    try { validateMaterial(d.kind, d.current ? mergeMaterialRewrite(d.current, output, d.path) : output, d.source); }
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
