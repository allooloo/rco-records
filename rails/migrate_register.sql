-- RCO-03 (2026-10-30): the Register. Customer keys (held only as sha256), issued statements, per-key export log.
CREATE TABLE IF NOT EXISTS keys (key_id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, parent TEXT, key_hash TEXT NOT NULL UNIQUE, caller TEXT NOT NULL, export_bucket TEXT, export_region TEXT, export_prefix TEXT, export_cred TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS keys_caller ON keys (caller);
CREATE TABLE IF NOT EXISTS statements (id TEXT PRIMARY KEY, key_id TEXT NOT NULL, period_from TEXT NOT NULL, period_to TEXT NOT NULL, issued_at TEXT NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS statements_no_update BEFORE UPDATE ON statements BEGIN SELECT RAISE(ABORT, 'statements is append-only'); END;
CREATE TRIGGER IF NOT EXISTS statements_no_delete BEFORE DELETE ON statements BEGIN SELECT RAISE(ABORT, 'statements is append-only'); END;
CREATE TABLE IF NOT EXISTS key_exports (key_id TEXT NOT NULL, day TEXT NOT NULL, status INTEGER, error TEXT, manifest_hash TEXT, at TEXT NOT NULL, PRIMARY KEY (key_id, day));
