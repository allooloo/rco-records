-- rco-receipts — RCO-01 step 1. One table, append-only: the Worker issues INSERT and SELECT only, and the two triggers refuse UPDATE and DELETE
-- at the engine (D1 has no per-statement grants; this is the enforcement on the wire). Every row is chained: prev_hash is the previous row's hash
-- (genesis sha256:000…0), hash = sha256 over the canonical JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}
-- (keys sorted, no whitespace). prev_hash is UNIQUE so two concurrent writers cannot both extend the same tip; the loser re-reads and retries.
CREATE TABLE IF NOT EXISTS receipts (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id  TEXT NOT NULL UNIQUE,
  gtin         TEXT,
  market       TEXT,
  actor_class  TEXT,
  rule_version TEXT,
  cleared_at   TEXT,
  writer       TEXT,
  prev_hash    TEXT NOT NULL UNIQUE,
  hash         TEXT NOT NULL UNIQUE,
  sig          TEXT,
  kid          TEXT NOT NULL,
  ledger_txn   TEXT,
  ledger_hash  TEXT,
  written_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS receipts_writer_day ON receipts (writer, cleared_at);
CREATE TRIGGER IF NOT EXISTS receipts_no_update BEFORE UPDATE ON receipts BEGIN SELECT RAISE(ABORT, 'receipts is append-only'); END;
CREATE TRIGGER IF NOT EXISTS receipts_no_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT, 'receipts is append-only'); END;
CREATE TABLE IF NOT EXISTS export_log (
  day    TEXT PRIMARY KEY,
  rows   INTEGER,
  sha256 TEXT,
  status INTEGER,
  error  TEXT,
  at     TEXT NOT NULL
);
