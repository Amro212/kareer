import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../tools/release-gate.js';
test('release requires every external acceptance gate and recorded evidence', () => {
  assert.equal(checkRelease({}).length, 9);
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: 'Verified sandbox deployment' } }).length, 8);
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: '' } }).length, 9);
});
