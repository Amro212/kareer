import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadChrome } from '../../tools/chrome-store.js';

test('store upload is gated and submission uses staged review without public publication', async () => {
  await assert.rejects(uploadChrome({ checks: {} }), /blocked/);
  const checks = Object.fromEntries(['gatewayStaging', 'lemonSandbox', 'chromeStagingPurchaseAi', 'firefoxStagingPurchaseAi', 'releaseVerification', 'multiUserCosts', 'productionGateway'].map(k => [k, { passed: true, evidence: 'verified' }]));
  const env = { CWS_PUBLISHER_ID: 'publisher', CWS_EXTENSION_ID: 'a'.repeat(32), CWS_CLIENT_ID: 'id', CWS_CLIENT_SECRET: 'secret', CWS_REFRESH_TOKEN: 'refresh' };
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return Response.json(url.includes('oauth2') ? { access_token: 'private' } : url.endsWith(':upload') ? { uploadState: 'SUCCEEDED' } : {}); };
  const result = await uploadChrome({ checks, env, fetcher, submit: true, zip: new Uint8Array([1]) });
  assert.equal(result.submittedForStagedReview, true);
  assert.equal(calls.length, 3);
  assert.equal(JSON.parse(calls[2].options.body).publishType, 'STAGED_PUBLISH');
});
