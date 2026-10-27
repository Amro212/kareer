import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db.js';
import { reserve, settle, release, balances, grant } from '../src/ledger.js';

const now = 1792195200000;
async function fixture() {
  const db = database();
  await db.prepare('INSERT INTO wallets(id, customer_id) VALUES (?, ?)').bind('w', 'c').run();
  return db;
}
const request = (id, extra = {}) => ({ wallet: 'w', credential: 'keyhash', id, hash: 'hash', operation: 'autofill', now, ...extra });

test('one remaining credit permits only one concurrent generation', async () => {
  const db = await fixture();
  await grant(db, { id: 'order:1', wallet: 'w', credits: 1, kind: 'pack', now });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => reserve(db, request(`r-${i}`))));
  assert.equal(results.filter(r => r.status === 'reserved').length, 1);
  assert.equal((await balances(db, 'w', now)).total, 0);
  assert.equal(await settle(db, 'w', 'r-0', {}, now + 1), true);
  assert.equal((await balances(db, 'w', now)).total, 0);
});

test('monthly first, expiry, release, and stale settlement are atomic', async () => {
  const db = await fixture();
  await grant(db, { id: 'pack', wallet: 'w', credits: 1, kind: 'pack', now });
  await grant(db, { id: 'invoice', wallet: 'w', credits: 1, kind: 'monthly', expires: now + 200000, now });
  assert.equal((await reserve(db, request('a'))).grant_id, 'invoice');
  assert.equal(await settle(db, 'w', 'a', {}, now + 150001), false);
  assert.equal((await balances(db, 'w', now + 150001)).total, 2);
  assert.equal((await reserve(db, request('b', { now: now + 150001 }))).grant_id, 'invoice');
  await release(db, 'w', 'b', 'MALFORMED', now + 150002);
  assert.equal((await balances(db, 'w', now + 250000)).total, 1);
});

test('idempotency cannot generate twice or accept a changed payload', async () => {
  const db = await fixture();
  await grant(db, { id: 'pack', wallet: 'w', credits: 10, kind: 'pack', now });
  assert.equal((await reserve(db, request('a'))).status, 'reserved');
  assert.equal((await reserve(db, request('a'))).duplicate, true);
  assert.equal((await reserve(db, request('a', { hash: 'other' }))).code, 'ID_CONFLICT');
  await settle(db, 'w', 'a', { inputTokens: 4, outputTokens: 8, cost: 0.001, latency: 100 }, now + 1);
  assert.equal((await reserve(db, request('a'))).status, 'completed');
  await release(db, 'w', 'a', 'DISCONNECT', now + 2);
  assert.equal((await balances(db, 'w', now)).total, 9);
  assert.equal(db.sql.prepare('SELECT input_tokens FROM requests').get().input_tokens, 4);
});

test('concurrency, rolling attempts and revoked entitlements are enforced', async () => {
  const db = await fixture();
  await grant(db, { id: 'pack', wallet: 'w', credits: 100, kind: 'pack', now });
  await reserve(db, request('a')); await reserve(db, request('b'));
  assert.equal((await reserve(db, request('c'))).code, 'BUSY');
  await release(db, 'w', 'a', 'FAILED', now); await release(db, 'w', 'b', 'FAILED', now);
  for (let i = 0; i < 7; i++) { await reserve(db, request(`n${i}`)); await release(db, 'w', `n${i}`, 'FAILED', now); }
  assert.equal((await reserve(db, request('limited'))).code, 'RATE_LIMIT');
  await db.prepare('UPDATE grants SET revoked = 1').run();
  assert.equal((await balances(db, 'w', now)).total, 0);
});

test('a concurrent old payment reconciliation cannot grant after order reversal', async () => {
  const db = await fixture();
  await db.prepare('INSERT INTO payments(order_id,wallet_id,customer_id,offer,revoked) VALUES (?,?,?,?,?)').bind('order', 'w', 'c', 'pack', 1).run();
  await grant(db, { id: 'order:order', wallet: 'w', credits: 300, kind: 'pack', order: 'order', now });
  assert.equal((await balances(db, 'w', now)).total, 0);
  await db.prepare('UPDATE payments SET revoked=0').run();
  await db.prepare('INSERT INTO revocations(id) VALUES (?)').bind('invoice:1').run();
  await grant(db, { id: 'invoice:1', wallet: 'w', credits: 1000, kind: 'monthly', order: 'order', expires: now + 300000, now });
  assert.equal((await balances(db, 'w', now)).total, 0, 'invoice reversal tombstones also prevent a late grant');
});
