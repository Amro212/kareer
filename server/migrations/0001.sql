-- A wallet is one Stripe customer's shared credit balance. Keys are minted on claim; only hashes are stored.
CREATE TABLE wallets (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL UNIQUE, flagged INTEGER NOT NULL DEFAULT 0);
CREATE TABLE credentials (
  hash TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  created_at INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  status TEXT NOT NULL, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, period_end INTEGER,
  updated_at INTEGER NOT NULL
);
-- payment_ref is the Stripe PaymentIntent that paid for the grant, so refunds and disputes revoke only that payment.
CREATE TABLE grants (
  id TEXT PRIMARY KEY, wallet_id TEXT NOT NULL REFERENCES wallets(id),
  kind TEXT NOT NULL CHECK(kind IN ('monthly','pack')), subscription_id TEXT,
  payment_ref TEXT NOT NULL, credits INTEGER NOT NULL CHECK(credits > 0),
  spent INTEGER NOT NULL DEFAULT 0 CHECK(spent >= 0 AND spent <= credits),
  starts_at INTEGER NOT NULL, expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX grants_wallet ON grants(wallet_id, expires_at);
CREATE INDEX grants_payment ON grants(payment_ref);
-- Tombstones keep a refunded or disputed payment from being granted by a late or replayed event.
CREATE TABLE revocations (payment_ref TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('refund','dispute')), PRIMARY KEY(payment_ref, reason));
CREATE TABLE disputes (id TEXT PRIMARY KEY, payment_ref TEXT NOT NULL, wallet_id TEXT, status TEXT NOT NULL);
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
-- One row per "View plans" click. secret_hash authenticates the extension's claim; key_hash is set once when the key is minted.
CREATE TABLE purchases (
  id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, offer TEXT, wallet_id TEXT REFERENCES wallets(id),
  session_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','creating','pending','fulfilled','expired')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, checked_at INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER, key_hash TEXT
);
CREATE TABLE webhook_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at INTEGER NOT NULL);
