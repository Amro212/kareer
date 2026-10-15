import test from 'node:test';
import assert from 'node:assert/strict';

const records = {};
globalThis.chrome = { runtime: {}, storage: { local: {
  async get(key) {
    await new Promise(resolve => setTimeout(resolve, 2));
    return { [key]: structuredClone(records[key]) };
  },
  async set(values) {
    await new Promise(resolve => setTimeout(resolve, 2));
    Object.assign(records, structuredClone(values));
  },
} } };
const { applyProfilePatch, applySet } = await import('../../src/targets/extension/background/storage.js');

test('simultaneous section saves merge their current profile without dropping either patch', async () => {
  records['kr:profile'] = { email: 'old@example.org', skills: ['Python'], customMetadata: 'retained' };
  await Promise.all([
    applyProfilePatch({ email: 'new@example.org' }, { email: 'old@example.org' }),
    applyProfilePatch({ skills: ['Python', 'SQL'] }, { skills: ['Python'] }),
  ]);
  assert.equal(records['kr:profile'].email, 'new@example.org');
  assert.deepEqual(records['kr:profile'].skills, ['Python', 'SQL']);
  assert.equal(records['kr:profile'].customMetadata, 'retained');
});

test('two overlapping saves accept one version and reject the stale version', async () => {
  records['kr:profile'] = { email: 'old@example.org' };
  const results = await Promise.allSettled([
    applyProfilePatch({ email: 'first@example.org' }, { email: 'old@example.org' }),
    applyProfilePatch({ email: 'second@example.org' }, { email: 'old@example.org' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /changed in another window/);
  assert.equal(records['kr:profile'].email, 'first@example.org');
});

test('whole-profile writes share the queue and subsequent stale patches cannot overwrite them', async () => {
  records['kr:profile'] = { email: 'old@example.org' };
  const results = await Promise.allSettled([
    applySet('kr:profile', { email: 'imported@example.org' }),
    applyProfilePatch({ email: 'stale@example.org' }, { email: 'old@example.org' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(records['kr:profile'].email, 'imported@example.org');
  await assert.rejects(applyProfilePatch({ email: 'unverified@example.org' }, {}), /changed in another window/);
  await applyProfilePatch({ email: 'recovered@example.org' }, { email: 'imported@example.org' });
  assert.equal(records['kr:profile'].email, 'recovered@example.org');
});

test('structured eligibility updates keep the existing flat autofill fields synchronized', async () => {
  records['kr:profile'] = { workEligibilities: [] };
  await applyProfilePatch({ workEligibilities: [
    { country: 'Canada', enabled: false },
    { country: 'United States', enabled: true, workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'No' },
  ] }, { workEligibilities: [] });
  assert.equal(records['kr:profile'].workCountry, 'United States');
  assert.equal(records['kr:profile'].workAuthorization, 'Yes');
  assert.equal(records['kr:profile'].sponsorshipNow, 'No');
});
