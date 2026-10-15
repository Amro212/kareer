import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationGroups } from '../../src/targets/extension/materials/library.js';

test('the application library groups both documents and orders jobs by their newest document', () => {
  const first = { localId: 'first', title: 'Engineer' };
  const second = { localId: 'second', title: 'Engineer' };
  const records = [
    { id: 'resume:first', job: first, kind: 'resume', updatedAt: '2026-10-10T12:00:00Z' },
    { id: 'resume:second', job: second, kind: 'resume', updatedAt: '2026-10-11T12:00:00Z' },
    { id: 'letter:first', job: first, kind: 'coverLetter', updatedAt: '2026-10-12T12:00:00Z' },
  ];
  const before = structuredClone(records);
  const groups = applicationGroups(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].job.localId, 'first');
  assert.deepEqual(groups[0].documents.map(record => record.kind), ['coverLetter', 'resume']);
  assert.equal(groups[0].updatedAt, '2026-10-12T12:00:00Z');
  assert.deepEqual(records, before);
});

test('an empty application library has no synthetic jobs', () => {
  assert.deepEqual(applicationGroups([]), []);
});
