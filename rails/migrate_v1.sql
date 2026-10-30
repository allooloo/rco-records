-- RCO-MOVE (2026-10-30): receipt v1 columns added beside the v0 columns (fields only ever added, never renamed or removed). v0 rows keep their bytes.
-- v1 rows: decision_id = id (rco:…), gtin and actor_class null. idem = sha256 of [writer, subject, subject_type, market, rule_version, cleared_at, answer_hash].
ALTER TABLE receipts ADD COLUMN v INTEGER;
ALTER TABLE receipts ADD COLUMN id TEXT;
ALTER TABLE receipts ADD COLUMN caller TEXT;
ALTER TABLE receipts ADD COLUMN subject TEXT;
ALTER TABLE receipts ADD COLUMN subject_type TEXT;
ALTER TABLE receipts ADD COLUMN answer_hash TEXT;
ALTER TABLE receipts ADD COLUMN idem TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS receipts_id ON receipts (id);
CREATE UNIQUE INDEX IF NOT EXISTS receipts_idem ON receipts (idem);
CREATE INDEX IF NOT EXISTS receipts_caller_seq ON receipts (caller, seq);
-- The register of attribution (§2): ledger-era rows written with writer null are attributed to allooloo here; the rows themselves are not rewritten.
CREATE TABLE IF NOT EXISTS attribution (seq INTEGER PRIMARY KEY, decision_id TEXT NOT NULL, writer TEXT NOT NULL, basis TEXT NOT NULL, at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS attribution_no_update BEFORE UPDATE ON attribution BEGIN SELECT RAISE(ABORT, 'attribution is append-only'); END;
CREATE TRIGGER IF NOT EXISTS attribution_no_delete BEFORE DELETE ON attribution BEGIN SELECT RAISE(ABORT, 'attribution is append-only'); END;
INSERT OR IGNORE INTO attribution (seq, decision_id, writer, basis, at) SELECT seq, decision_id, 'allooloo', 'RCO build memo v1.0 §2: ledger-era receipts with writer null are attributed to allooloo (not rewritten)', '2026-10-30' FROM receipts WHERE writer IS NULL;
