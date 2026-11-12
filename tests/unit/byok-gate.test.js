import test from 'node:test';
import assert from 'node:assert/strict';
const records = {};
globalThis.chrome = { runtime: {}, storage: { local: {
  async get(key) { return key === null ? structuredClone(records) : { [key]: structuredClone(records[key]) }; },
  async set(values) { Object.assign(records, structuredClone(values)); },
  async remove(key) { delete records[key]; },
} } };
globalThis.KAREER_BYOK = false;
const storage = await import('../../src/targets/extension/background/storage.js');

test('production builds ignore saved OpenRouter keys and stay on Kareer AI', async () => {
  records['kr:secrets'] = { apiKey: 'sk-or-saved', aiDataConsent: 1 };
  records['kr:settings'] = { aiMode: 'byok' };
  assert.equal(storage.BYOK_ENABLED, false);
  assert.equal(await storage.readApiKey(), '');
  assert.equal(await storage.hasApiKey(), false);
  const status = await storage.readAiStatus();
  assert.equal(status.mode, 'managed');
  assert.equal(status.state, 'activationNeeded');
  assert.equal(status.trialAvailable, true);
  await storage.writeSecret('sk-or-new');
  assert.equal(records['kr:secrets'].apiKey, '');
  records['kr:secrets'] = { licenseKey: 'kr_x', trialUsed: 1, aiDataConsent: 1 };
  assert.equal((await storage.readAiStatus()).trialAvailable, false);
});
