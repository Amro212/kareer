PRAGMA foreign_keys = ON;
CREATE TABLE wallets (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL UNIQUE);
CREATE TABLE payments (order_id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id), customer_id TEXT NOT NULL, offer TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE credentials (
  hash TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  license_id TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  order_id TEXT NOT NULL, status TEXT NOT NULL, period_end INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE grants (
  id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  kind TEXT NOT NULL CHECK(kind IN ('monthly','pack')), subscription_id TEXT,
  order_id TEXT, credits INTEGER NOT NULL CHECK(credits > 0),
  spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0 AND spent <= credits),
  starts_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX grants_wallet ON grants(wallet_id, expires_at);
CREATE TABLE revocations (id TEXT PRIMARY KEY);
CREATE TABLE requests (
  wallet_id TEXT NOT NULL REFERENCES wallets(id), id TEXT NOT NULL,
  credential TEXT NOT NULL, input_hash TEXT NOT NULL, operation TEXT NOT NULL,
  grant_id TEXT NOT NULL REFERENCES grants(id), status TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, finished_at INTEGER,
  input_tokens INTEGER, output_tokens INTEGER, provider_cost REAL, latency_ms INTEGER, error_code TEXT,
  PRIMARY KEY(wallet_id, id)
);
CREATE INDEX requests_reservations ON requests(grant_id, status, expires_at);
CREATE INDEX requests_license ON requests(credential, status, expires_at);
CREATE TRIGGER debit_completed AFTER UPDATE OF status ON requests
WHEN NEW.status = 'completed' AND OLD.status = 'reserved'
BEGIN
  UPDATE grants SET spent = spent + 1 WHERE id = NEW.grant_id;
END;
CREATE TABLE attempts (id TEXT PRIMARY KEY, credential TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX attempts_license ON attempts(credential, created_at);
CREATE TABLE checkouts (
  id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, offer TEXT NOT NULL,
  wallet_id TEXT REFERENCES wallets(id), provider_id TEXT UNIQUE, order_id TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, claimed_at INTEGER
);
