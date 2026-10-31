const DAY = 86400000;
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);

// Grants are keyed by payment identity, so replaying an event cannot reset spent credits or extend expiry.
// A refund or dispute tombstone on the paying PaymentIntent blocks the grant even if that event arrived first.
export async function grant(db, { id, wallet, credits, kind, payment, expires = null, starts = 0, subscription = null, now = Date.now() }) {
  return stmt(db, `INSERT OR IGNORE INTO grants(id,wallet_id,kind,subscription_id,payment_ref,credits,starts_at,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM revocations WHERE payment_ref=?)`,
  id, wallet, kind, subscription, payment, credits, starts || now, expires, payment).run();
}

export async function revokePayment(db, payment, reason) {
  await db.batch([
    stmt(db, 'INSERT OR IGNORE INTO revocations(payment_ref,reason) VALUES (?,?)', payment, reason),
    stmt(db, 'UPDATE grants SET revoked=1 WHERE payment_ref=?', payment),
  ]);
}

export async function restorePayment(db, payment, reason) {
  await db.batch([
    stmt(db, 'DELETE FROM revocations WHERE payment_ref=? AND reason=?', payment, reason),
    stmt(db, 'UPDATE grants SET revoked=0 WHERE payment_ref=? AND NOT EXISTS(SELECT 1 FROM revocations WHERE payment_ref=?)', payment, payment),
  ]);
}

export async function reserve(db, { wallet, credential, id, hash, operation, now = Date.now() }) {
  const previous = await stmt(db, 'SELECT status,input_hash,grant_id FROM requests WHERE wallet_id=? AND id=?', wallet, id).first();
  if (previous) return previous.input_hash !== hash ? { code: 'ID_CONFLICT' } : { ...previous, duplicate: true };
  const attempt = crypto.randomUUID();
  const results = await db.batch([
    stmt(db, 'DELETE FROM attempts WHERE created_at < ?', now - 60000),
    stmt(db, `INSERT INTO attempts SELECT ?,?,? WHERE (SELECT COUNT(*) FROM attempts WHERE credential=?) < 10`, attempt, credential, now, credential),
    stmt(db, `INSERT OR IGNORE INTO requests(wallet_id,id,credential,input_hash,operation,grant_id,status,created_at,expires_at)
      SELECT ?,?,?,?,?,g.id,'reserved',?,? FROM grants g
      WHERE g.wallet_id=? AND g.revoked=0 AND g.starts_at<=? AND (g.expires_at IS NULL OR g.expires_at>?)
      AND g.credits-g.spent > (SELECT COUNT(*) FROM requests r WHERE r.grant_id=g.id AND r.status='reserved' AND r.expires_at>?)
      AND EXISTS(SELECT 1 FROM attempts WHERE id=?)
      AND (SELECT COUNT(*) FROM requests WHERE credential=? AND status='reserved' AND expires_at>?)<2
      ORDER BY g.expires_at IS NULL,g.expires_at,g.id LIMIT 1`, wallet, id, credential, hash, operation, now, now + 150000, wallet, now, now, now, attempt, credential, now),
    stmt(db, 'SELECT status,input_hash,grant_id FROM requests WHERE wallet_id=? AND id=?', wallet, id),
    stmt(db, 'SELECT COUNT(*) AS n FROM attempts WHERE id=?', attempt),
    stmt(db, "SELECT COUNT(*) AS n FROM requests WHERE credential=? AND status='reserved' AND expires_at>?", credential, now),
  ]);
  const row = results[3].results[0];
  if (row) return row.input_hash !== hash ? { code: 'ID_CONFLICT' } : { ...row, duplicate: results[2].meta.changes === 0 };
  return { code: !results[4].results[0].n ? 'RATE_LIMIT' : results[5].results[0].n >= 2 ? 'BUSY' : 'NO_CREDITS' };
}

export async function settle(db, wallet, id, usage = {}, now = Date.now()) {
  const result = await stmt(db, `UPDATE requests SET status='completed',finished_at=?,input_tokens=?,output_tokens=?,provider_cost=?,latency_ms=?
    WHERE wallet_id=? AND id=? AND status='reserved' AND expires_at>?
    AND EXISTS(SELECT 1 FROM grants WHERE id=requests.grant_id AND revoked=0)
    AND NOT EXISTS(SELECT 1 FROM credentials WHERE hash=requests.credential AND disabled=1) RETURNING id`,
  now, usage.inputTokens ?? null, usage.outputTokens ?? null, usage.cost ?? null, usage.latency ?? null, wallet, id, now).first();
  // D1 changes includes the debit trigger; the returned row identifies this settlement.
  return Boolean(result);
}

export async function release(db, wallet, id, code, now = Date.now(), usage = {}) {
  await stmt(db, `UPDATE requests SET status='failed',error_code=?,finished_at=?,input_tokens=?,output_tokens=?,provider_cost=?,latency_ms=?
    WHERE wallet_id=? AND id=? AND status='reserved'`, code, now, usage.inputTokens ?? null, usage.outputTokens ?? null, usage.cost ?? null, usage.latency ?? null, wallet, id).run();
}

export async function balances(db, wallet, now = Date.now()) {
  const { results } = await stmt(db, `SELECT kind,expires_at,MAX(0,credits-spent-(SELECT COUNT(*) FROM requests r
    WHERE r.grant_id=g.id AND r.status='reserved' AND r.expires_at>?)) AS available FROM grants g
    WHERE wallet_id=? AND revoked=0 AND starts_at<=? AND (expires_at IS NULL OR expires_at>?)`, now, wallet, now, now).all();
  const monthly = results.filter(r => r.kind === 'monthly').reduce((n, r) => n + r.available, 0);
  const purchased = results.filter(r => r.kind === 'pack').reduce((n, r) => n + r.available, 0);
  const expiries = results.filter(r => r.kind === 'monthly').map(r => r.expires_at);
  return { monthly, purchased, total: monthly + purchased, monthlyExpiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null };
}

export async function cleanup(db, now = Date.now()) {
  await db.batch([
    stmt(db, "UPDATE requests SET status='failed',error_code='EXPIRED',finished_at=? WHERE status='reserved' AND expires_at<=?", now, now),
    stmt(db, 'DELETE FROM requests WHERE created_at<?', now - 30 * DAY),
    stmt(db, 'DELETE FROM attempts WHERE created_at<?', now - 60000),
    stmt(db, 'DELETE FROM purchases WHERE expires_at<?', now - 30 * DAY),
    stmt(db, 'DELETE FROM webhook_events WHERE created_at<?', now - 30 * DAY),
  ]);
}
