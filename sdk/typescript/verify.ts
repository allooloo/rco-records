// verify.ts — the reference verify() for RCO receipts (MIT). A pure function over (receipt, jwks): recompute hash (and id for v1), check sig
// against kid. WebCrypto only (Node 20+, Deno, Bun, browsers, Workers). A receipt verifies forever without asking Allooloo anything.
//   import { verify } from "./verify.ts";  const result = await verify(receipt, jwks);  // { valid, hash_ok, id_ok, sig_ok, ... }
// carry(receipt) returns the one value an order, trade or audit record should hold to point back at the read (RCO Link).
export type Jwk = { kty: string; crv?: string; x?: string; y?: string; kid: string; alg?: string };
export type Jwks = { keys: Jwk[] };
export type Receipt = Record<string, unknown> & { hash: string; sig?: string | null; kid: string; v?: number; id?: string; prev_hash: string };

export const V0_FIELDS = ["actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"];
export const V1_FIELDS = ["answer_hash", "caller", "cleared_at", "kid", "market", "prev_hash", "rule_version", "seq", "subject", "subject_type", "v", "writer"];
export const GENESIS = "sha256:" + "0".repeat(64);
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

// The field lists are already sorted; JSON.stringify keeps that order and writes no whitespace.
export function canonical(r: Receipt): string {
  const fields = r.v === 1 ? V1_FIELDS : V0_FIELDS;
  return JSON.stringify(Object.fromEntries(fields.map((k) => [k, r[k] === undefined ? null : r[k]])));
}
export async function hashOf(r: Receipt): Promise<string> { return "sha256:" + hex(await crypto.subtle.digest("SHA-256", enc.encode(canonical(r)))); }
export function idOf(hash: string): string {
  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  const bits = (hash.replace(/^sha256:/, "").match(/../g) || []).slice(0, 13).map((h) => parseInt(h, 16).toString(2).padStart(8, "0")).join("");
  let out = ""; for (let i = 0; i < 100; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return "rco:" + out;
}
export async function sigOk(r: Receipt, jwks: Jwks): Promise<boolean | null> {
  if (!r.sig) return null;   // ledger-era v0 receipts carry no signature
  const k = jwks.keys.find((x) => x.kid === r.kid);
  if (!k || k.crv !== "Ed25519" || !k.x) return false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: k.x }, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, unb64u(r.sig), enc.encode(r.hash));
  } catch { return false; }
}
export async function verify(r: Receipt, jwks: Jwks) {
  const recomputed = await hashOf(r);
  const hash_ok = recomputed === r.hash;
  const id_ok = r.v === 1 ? idOf(r.hash) === r.id : null;
  const sig_ok = await sigOk(r, jwks);
  return { version: r.v === 1 ? 1 : 0, valid: hash_ok && id_ok !== false && sig_ok !== false, hash_ok, id_ok, sig_ok, recomputed };
}
export async function verifyChain(receipts: Receipt[], jwks: Jwks, prev: string | null = null) {
  for (const r of receipts) {
    const v = await verify(r, jwks);
    if (!v.valid) return { ok: false, at: r.id ?? r.decision_id, why: v };
    if (prev !== null && r.prev_hash !== prev) return { ok: false, at: r.id ?? r.decision_id, why: "prev_hash does not match the previous hash" };
    prev = r.hash;
  }
  return { ok: true, tip: prev };
}
export const carry = (r: Receipt) => ({ rco_receipt: (r.id ?? r.decision_id) as string, rco_verify: `https://rco-records.ai/receipts/${r.id ?? r.decision_id}` });
