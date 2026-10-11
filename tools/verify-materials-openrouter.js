import assert from 'node:assert/strict';
import { buildMaterialSource, validateMaterial, mergeMaterialRewrite } from '../src/core/materials-model.js';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('Set OPENROUTER_API_KEY to run this opt-in live test.');
const model = 'google/gemini-2.5-flash-lite';
globalThis.chrome = { runtime: {}, storage: { local: { async get(key) {
  return { [key]: key === 'kr:secrets' ? { apiKey } : { model } };
} } } };
const { writingRequest, materialWritingInstructions } = await import('../src/targets/extension/background/materials.js');
const source = buildMaterialSource({ fullName: 'Test Applicant', email: 'applicant@example.com',
  workExperiences: [{ id: 'work1', title: 'Data Engineer', company: 'Example Company', startDate: '2021-01', endDate: '2024-02', description: 'Built Python and SQL data pipelines. Supported 10 services. Reduced latency by 20%.' }],
  education: [{ id: 'edu1', degree: 'BSc', fieldOfStudy: 'Computer Science', institution: 'Example University' }], skills: ['Python', 'SQL'] });
const jobs = [
  { localId: 'live-materials', title: 'Data Engineer I', company: 'Example Learning', description: 'Build reliable Python and SQL data pipelines for a learning platform. Collaborate with the data team to improve monitoring and data quality.' },
  { localId: 'live-error-page', title: 'Sorry, Internet Explorer 11 is no longer supported by SmartRecruiters', company: '', description: 'Sorry, Internet Explorer 11 is no longer supported by SmartRecruiters. Please upgrade your browser.' },
];
const failures = [];
for (const job of jobs) {
  for (const kind of ['resume', 'coverLetter']) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('Live test timed out.'), 120000);
    try {
      const output = await writingRequest({ kind, source, job, pageTarget: 1, tone: 'professional', length: 'standard', instructions: '', rewrite: null, currentDocument: null }, materialWritingInstructions(kind), controller);
      const result = validateMaterial(kind, output, source);
      assert.ok(kind === 'resume' ? result.sections.length : result.paragraphs.length);
      console.log(`PASS ${model}: ${kind}, ${job.localId}`);
      if (job === jobs[0]) {
        const path = kind === 'resume' ? 'section:work1' : `paragraph:${Math.min(1, result.paragraphs.length - 1)}`;
        const rewritten = await writingRequest({ kind, source: { ...result, text: '' }, job, pageTarget: 1, tone: 'professional', length: 'standard', instructions: 'Make this more direct.', rewrite: { path }, currentDocument: result }, materialWritingInstructions(kind), controller);
        validateMaterial(kind, mergeMaterialRewrite(result, rewritten, path), result);
        console.log(`PASS ${model}: ${kind} targeted rewrite`);
      }
    } catch (error) {
      failures.push(`${kind}, ${job.localId}: ${error.message}`);
      console.error(`FAIL ${model}: ${failures.at(-1)}`);
    } finally { clearTimeout(timer); }
  }
}
assert.deepEqual(failures, [], 'Live generation or rewrite failed');
