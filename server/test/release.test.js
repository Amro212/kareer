import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkRelease, productionPlaceholders } from '../tools/release-gate.js';
test('release requires every external acceptance gate and recorded evidence', () => {
  assert.equal(checkRelease({}).length, 9);
  assert.ok(checkRelease({}).includes('stripeSandbox'));
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: 'Verified sandbox deployment' } }).length, 8);
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: '' } }).length, 9);
});
test('production config placeholders block release; staging values do not', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.deepEqual(productionPlaceholders(toml), ['STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_PACK', 'ALLOWED_ORIGINS']);
  assert.deepEqual(productionPlaceholders(toml.replace(/"CONFIGURE_[^"]*"/g, '"price_live"')), []);
  assert.deepEqual(productionPlaceholders('[env.staging.vars]\nA = "CONFIGURE_X"\n[env.production]\nname = "x"'), []);
});
