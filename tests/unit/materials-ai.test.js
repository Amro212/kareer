import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: {}, storage: { local: { async get(key) {
  return { [key]: key === 'kr:secrets' ? { apiKey: 'test-key' } : { model: 'google/gemini-2.5-flash-lite' } };
} } } };
const { writingRequest, materialWritingInstructions } = await import('../../src/targets/extension/background/materials.js');
const realFetch = globalThis.fetch;
const input = { kind: 'coverLetter', source: {}, job: {} };

test('materials request structured JSON for extraction, resumes and cover letters', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.response_format?.type, 'json_object');
    return Response.json({ choices: [{ message: { content: '{}' } }] });
  };
  try {
    for (const kind of ['source', 'resume', 'coverLetter']) await writingRequest({ ...input, kind }, materialWritingInstructions(kind), new AbortController());
  } finally { globalThis.fetch = realFetch; }
});

test('complete JSON fallback and fenced JSON remain supported', async () => {
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '```json\n{"paragraphs":["Hello"]}\n```' }, finish_reason: 'stop' }] });
  try { assert.deepEqual(await writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), { paragraphs: ['Hello'] }); }
  finally { globalThis.fetch = realFetch; }
});

test('HTTP rejection reports the model and provider reason without exposing the key', async () => {
  globalThis.fetch = async () => Response.json({ error: { message: 'Provider returned error', metadata: {
    raw: JSON.stringify({ error: { message: 'Invalid max_tokens for test-key' } }),
  } } }, { status: 400 });
  try {
    await assert.rejects(writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), error => {
      assert.match(error.message, /400.*google\/gemini-2\.5-flash-lite/);
      assert.match(error.message, /Invalid max_tokens/);
      assert.ok(!error.message.includes('test-key'));
      return true;
    });
  } finally { globalThis.fetch = realFetch; }
});

test('non-JSON HTTP errors retain a useful status without reflecting the response body', async () => {
  globalThis.fetch = async () => new Response('<html>private upstream body</html>', { status: 502 });
  try { await assert.rejects(writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), error => {
    assert.match(error.message, /502/); assert.ok(!error.message.includes('private upstream body')); return true;
  }); } finally { globalThis.fetch = realFetch; }
});

test('streamed document retains split UTF-8 and the final event without a newline', async () => {
  const output = { paragraphs: ['Dear Hiring Team,', 'I build APIs — including 10 services.', 'Sincerely, Applicant'] };
  const encoded = new TextEncoder().encode(`: OPENROUTER PROCESSING\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) }, finish_reason: 'stop' }] })}`);
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const byte of encoded) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  try { assert.deepEqual(await writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), output); }
  finally { globalThis.fetch = realFetch; }
});

test('token exhaustion reports an incomplete document rather than malformed JSON', async () => {
  for (const streaming of [false, true]) {
    globalThis.fetch = async () => streaming
      ? new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"paragraphs":[' }, finish_reason: 'length' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
      : Response.json({ choices: [{ message: { content: '{"paragraphs":[' }, finish_reason: 'length' }] });
    try { await assert.rejects(writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), /incomplete|output limit/i); }
    finally { globalThis.fetch = realFetch; }
  }
});

test('invalid JSON and upstream streaming errors remain recoverable errors', async () => {
  for (const response of [Response.json({ choices: [{ message: { content: 'not JSON' } }] }), new Response('data: {"error":{"message":"upstream failure"}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })]) {
    globalThis.fetch = async () => response;
    try { await assert.rejects(writingRequest(input, materialWritingInstructions(input.kind), new AbortController()), /malformed|could not complete/i); }
    finally { globalThis.fetch = realFetch; }
  }
});
