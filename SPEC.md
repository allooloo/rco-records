# RCO receipt — specification v1 (frozen)

Licence: MIT. Operator of the reference chain: Allooloo Technologies Corp.

Canonical JSON: keys sorted, UTF-8, no whitespace. One receipt per cleared read; writes are idempotent on (`writer`, `subject`, `subject_type`, `market`, `rule_version`, `cleared_at`, `answer_hash`). Target size under 600 bytes.

| Field | Meaning |
|---|---|
| `v` | `1` |
| `id` | `rco:` + 20-char base32 of the first 100 bits of `hash`. Derived, never assigned. |
| `seq` | Monotonic integer across the whole chain. |
| `writer` | The gate that wrote it (`allooloo`). |
| `caller` | Who asked: a customer key id, or an x402 wallet handle. Stored as sha256 of the value. Empty when unknown. |
| `subject` | What was read: the identifier (ISIN, LEI, …). |
| `subject_type` | `isin` \| `lei` \| `gtin` \| … — open list. Replaces the v0 `gtin` field. |
| `market` | ISO country or exchange code of the read. |
| `rule_version` | Version of the rule set the gate cleared under. |
| `cleared_at` | RFC 3339 UTC, seconds. |
| `answer_hash` | sha256 of the canonical answer bytes the agent received. |
| `prev_hash` | `hash` of the previous receipt (`seq` − 1). |
| `hash` | sha256 over the canonical receipt without `hash`, `sig`. |
| `sig` | Ed25519 over `hash`, by `kid`. |
| `kid` | Key id, resolvable at `/.well-known/jwks.json`. |

## Encodings as implemented

- Hash strings are written `sha256:` + 64 lowercase hex (`hash`, `prev_hash`, `answer_hash`, `caller`).
- `hash` covers the canonical JSON of `{answer_hash, caller, cleared_at, kid, market, prev_hash, rule_version, seq, subject, subject_type, v, writer}`. `id` is not covered: it is derived from `hash`.
- `id` = `rco:` + the first 20 characters of the lowercase RFC 4648 base32 encoding of the hash digest (20 × 5 = 100 bits).
- `sig` = Ed25519 over the UTF-8 bytes of the `hash` string, base64url without padding.
- `caller` = `sha256:` + hex sha256 of the UTF-8 value (`key:<key id>` for a customer key, `x402:<wallet address, lowercase>` for an x402 payer); empty string when unknown.
- `answer_hash` on Allooloo's gates = sha256 over the canonical JSON (keys sorted at every level, no whitespace) of the tool answer the agent received, without the `receipt` block the gate adds to point at this receipt.
- Genesis `prev_hash` = `sha256:` + 64 zeros.

## Rules

- Fields are only ever added, never renamed or removed. Unknown fields are ignored by readers.
- `verify(receipt, jwks)` is a pure function: recompute `id` and `hash`, check `sig` against `kid`.

## History (v0)

Receipts written before 2026-10-29 keep their bytes and field names forever — the chain hashes over them:

`{decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}`

`hash` = sha256 over the canonical JSON of `{actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}`. Ledger-era rows carry `kid` `gsc-rco-2026-08` and `sig` null; rows signed 2026-10-29 carry `kid` `rco-office-2026-10`. v1 starts at the first receipt written under Allooloo's key (`rco-allooloo-2026-10`), chained to the last v0 `hash`: one chain.
