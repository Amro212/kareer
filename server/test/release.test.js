import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease, productionPlaceholders } from '../tools/release-gate.js';
test('release requires every external acceptance gate and recorded evidence', () => {
  assert.equal(checkRelease({}).length, 9);
  assert.ok(checkRelease({}).includes('stripeSandbox'));
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: 'Verified sandbox deployment' } }).length, 8);
  assert.equal(checkRelease({ gatewayStaging: { passed: true, evidence: '' } }).length, 9);
});
test('production config placeholders block release; staging values do not', () => {
  const production = `[env.staging.vars]
STRIPE_PRICE_MONTHLY = "CONFIGURE_STAGING_PRICE"
[env.production]
[env.production.vars]
STRIPE_PRICE_MONTHLY = "CONFIGURE_LIVE_PRICE_MONTHLY"
STRIPE_PRICE_PACK = "CONFIGURE_LIVE_PRICE_PACK"
ALLOWED_ORIGINS = "CONFIGURE_LIVE_ORIGIN"`;
  assert.deepEqual(productionPlaceholders(production), ['STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_PACK', 'ALLOWED_ORIGINS']);
  assert.deepEqual(productionPlaceholders(production.replace(/"CONFIGURE_[^"]*"/g, '"configured"')), []);
  assert.deepEqual(productionPlaceholders('[env.staging.vars]\nA = "CONFIGURE_X"\n[env.production]\nname = "x"'), []);
});
