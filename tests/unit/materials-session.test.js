import test from 'node:test';
import assert from 'node:assert/strict';

const records = {};
globalThis.chrome = { runtime: {}, storage: { local: {
  async get(key) { await new Promise(resolve => setTimeout(resolve, 2)); return { [key]: structuredClone(records[key]) }; },
  async set(values) { await new Promise(resolve => setTimeout(resolve, 2)); Object.assign(records, structuredClone(values)); },
} } };
const { applySet, updateStoredRecord } = await import('../../src/targets/extension/background/storage.js');

test('simultaneous artifact activation and stale session writes preserve both active references', async () => {
  const key = 'kr:sessions:application';
  records[key] = { id: 'application', status: 'running' };
  await Promise.all([
    updateStoredRecord(key, previous => ({ ...previous, materialRefs: { ...previous.materialRefs, resume: { id: 'resume', revision: 'one' } } })),
    applySet(key, { id: 'application', status: 'paused' }),
    updateStoredRecord(key, previous => ({ ...previous, materialRefs: { ...previous.materialRefs, coverLetter: { id: 'letter', revision: 'two' } } })),
  ]);
  assert.equal(records[key].status, 'paused');
  assert.deepEqual(records[key].materialRefs, { resume: { id: 'resume', revision: 'one' }, coverLetter: { id: 'letter', revision: 'two' } });
  await applySet(key, { id: 'application', materialRefs: { resume: { id: 'obsolete' } } });
  assert.equal(records[key].materialRefs.resume.revision, 'one');
  assert.equal(records[key].materialRefs.coverLetter.revision, 'two');
  await updateStoredRecord(key, previous => ({ ...previous, materialRunRef: { id: 'run', revision: 'frozen' } }));
  await applySet(key, { id: 'application', materialRunRef: { id: 'stale' } });
  assert.equal(records[key].materialRunRef.revision, 'frozen');
  await updateStoredRecord(key, previous => ({ ...previous, materialRunRef: null }));
  await applySet(key, { id: 'application', materialRunRef: { id: 'run', revision: 'frozen' } });
  assert.equal(records[key].materialRunRef, null);
});
