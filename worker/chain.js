// chain.js — the record and its chain (RCO-MOVE, 2026-10-29: Allooloo Technologies Corp.). Two receipt versions on one chain, one spec shared with
// the reference verify() in sdk/ (TypeScript, Python, Go):
//   v0 (history): hash = "sha256:" + hex sha256 over canonical JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version,
//      writer}; bytes and field names kept forever (§2). kids gsc-rco-2026-08 (ledger era, sig null) and rco-office-2026-10.
//   v1 (from the first receipt under Allooloo's key, kid rco-allooloo-2026-10): hash = "sha256:" + hex sha256 over canonical JSON of the receipt
//      without hash, sig and id (id is derived from hash); id = "rco:" + the first 20 characters of the lowercase RFC 4648 base32 of the hash digest
//      (= its first 100 bits). Canonical JSON = keys sorted, no whitespace, UTF-8. sig = Ed25519 over the UTF-8 bytes of the hash string, base64url.
// Genesis prev_hash = "sha256:" + 64 zeros. The first v1 receipt's prev_hash is the last v0 receipt's hash: one chain.
export const GENESIS = "sha256:" + "0".repeat(64);
export const V0_FIELDS = ["actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"];
export const V1_FIELDS = ["answer_hash", "caller", "cleared_at", "kid", "market", "prev_hash", "rule_version", "seq", "subject", "subject_type", "v", "writer"];
const enc = new TextEncoder();
export const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const pick = (row, fields) => Object.fromEntries(fields.map((k) => [k, row[k] === undefined ? null : row[k]]));
export const canonical = (row) => JSON.stringify(pick(row, Number(row.v) === 1 ? V1_FIELDS : V0_FIELDS));
export async function sha256hex(s) { return hex(await crypto.subtle.digest("SHA-256", typeof s === "string" ? enc.encode(s) : s)); }
export async function hashOf(row) { return "sha256:" + (await sha256hex(canonical(row))); }
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export function idOf(hash) {
  const bytes = String(hash).replace(/^sha256:/, "").match(/../g).slice(0, 13).map((h) => parseInt(h, 16));
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < 100; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return "rco:" + out;
}
export const second = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

let KEY = null;
async function signingKey(env) {
  if (KEY) return KEY;
  const seed = unb64u(String(env.RCO_ALLOOLOO_SEED || "").replace(/^﻿/, "").trim());
  // PKCS#8 wrapper for a raw Ed25519 seed (RFC 8410): 302e020100300506032b657004220420 || seed
  const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...seed]);
  KEY = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  return KEY;
}
export async function sign(env, hash) { return b64u(await crypto.subtle.sign("Ed25519", await signingKey(env), enc.encode(hash))); }

// The public shape of a stored row, by version. v0 keeps its own field names forever.
export function PUBLIC(row) {
  if (Number(row.v) === 1) return { v: 1, id: row.id, seq: row.seq, writer: row.writer, caller: row.caller, subject: row.subject, subject_type: row.subject_type, market: row.market,
    rule_version: row.rule_version, cleared_at: row.cleared_at, answer_hash: row.answer_hash, prev_hash: row.prev_hash, hash: row.hash, sig: row.sig, kid: row.kid };
  return { decision_id: row.decision_id, gtin: row.gtin, market: row.market, actor_class: row.actor_class, rule_version: row.rule_version,
    cleared_at: row.cleared_at, writer: row.writer, prev_hash: row.prev_hash, hash: row.hash, sig: row.sig, kid: row.kid };
}
