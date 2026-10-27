import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reserve, settle, release, grant, balances } from '../src/ledger.js';

const { outputFiles } = await build({ entryPoints: [new URL('../src/index.js', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], bundle: true, write: false, format: 'esm', platform: 'browser' });
const runtime = new Miniflare(convertV4MiniflareOptions({ name: 'gateway', modules: true, script: outputFiles[0].text, compatibilityDate: '2026-10-01', d1Databases: ['DB'], bindings: { SALES_ENABLED: 'false' } }));
try {
  const db = await runtime.getD1Database('DB', 'gateway');
  // D1 exec uses line-separated statements; keep the trigger body on one line.
  await db.exec(readFileSync(new URL('../migrations/0001.sql', import.meta.url), 'utf8').replace(/\n/g, ' '));
  await db.prepare('INSERT INTO wallets VALUES (?,?)').bind('w', '7').run();
  await grant(db, { id: 'p', wallet: 'w', credits: 1, kind: 'pack' });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => reserve(db, { wallet: 'w', credential: 'h', id: `request-${i}`, hash: 'inputhash', operation: 'autofill' })));
  assert.equal(results.filter(r => r.status === 'reserved').length, 1);
  const winner = results.findIndex(r => r.status === 'reserved');
  assert.equal(await settle(db, 'w', `request-${winner}`), true);
  assert.equal((await balances(db, 'w')).total, 0);
  await grant(db, { id: 'failure-pack', wallet: 'w', credits: 1, kind: 'pack' });
  await reserve(db, { wallet: 'w', credential: 'h', id: 'failed-request', hash: 'inputhash', operation: 'autofill' });
  await release(db, 'w', 'failed-request', 'INVALID_COMPLETION', Date.now(), { outputTokens: 3, cost: 0.0001, latency: 100 });
  assert.equal((await balances(db, 'w')).total, 1);
  assert.equal((await db.prepare('SELECT provider_cost FROM requests WHERE id=?').bind('failed-request').first()).provider_cost, 0.0001);
  const response = await runtime.dispatchFetch('https://test/v1/checkouts', { method: 'POST' });
  assert.equal(response.status, 503);
  console.log('Actual workerd/D1: migration, concurrent reservation, settlement, released-credit metadata and disabled-sales HTTP smoke passed.');
} finally { await runtime.dispose(); }
