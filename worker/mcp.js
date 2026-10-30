// mcp.js — rco-door (RCO-MOVE, 2026-10-29: Allooloo Technologies Corp.). Streamable HTTP, stateless, JSON-RPC 2.0.
//   write_receipt  — bearer token per writer; appends one chained, signed v1 receipt; idempotent on (writer, subject, subject_type, market,
//                    rule_version, cleared_at, answer_hash); returns the receipt
//   verify_receipt — public; by id (rco:… v1, dec_… v0); returns the receipt and the verification result
// Typed errors ride in the tool result as { code, message } with isError: true. Nothing is answered from memory.
import { hashOf, idOf, sign, sha256hex, second, unb64u, PUBLIC } from "./chain.js";
import { JWKS, ORIGIN, DEFINITION } from "./kit.js";

export const SERVER = { name: "rco-records", title: "RCO Records — Record of Cleared Orders", protocolVersion: "2025-06-18" };
export const TOOLS = [
  {
    name: "write_receipt",
    description: "Write one v1 receipt for a read a gate has cleared. Authenticated: Authorization: Bearer <writer token>. Idempotent on (writer, subject, subject_type, market, rule_version, cleared_at, answer_hash). Returns the receipt.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "what was read: the identifier (an ISIN, LEI, GTIN, ticker, record id …)" },
        subject_type: { type: "string", description: "isin | lei | gtin | ticker | cmr | … (open list)" },
        market: { type: "string", description: "ISO country or exchange code of the read" },
        rule_version: { type: "string", description: "the rule set and version the gate cleared under" },
        cleared_at: { type: "string", description: "RFC 3339 UTC; stored to the second; the door's clock when absent" },
        answer_hash: { type: "string", description: "sha256:<hex> of the canonical answer bytes the agent received" },
        caller: { type: "string", description: "who asked: a customer key id or an x402 wallet handle; stored only as its sha256" },
      },
      required: ["subject", "subject_type", "rule_version"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "verify_receipt",
    description: "Return one receipt by id (rco:… for v1, dec_… for v0) with the verification result (hash, id, signature) and the public key (JWK) that checks it. Public.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "rco:… or dec_…" } }, required: ["id"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const rpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
export const typed = (code, message, extra) => ({ isError: true, content: [{ type: "text", text: JSON.stringify({ code, message, ...(extra || {}) }) }], structuredContent: { code, message, ...(extra || {}) } });
export const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], structuredContent: obj });
export const RID = /^(rco:[a-z2-7]{20}|dec_[0-9a-f]{8,48})$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const enc = new TextEncoder();

// Writers: the bearer's sha256 is compared with the hash placed as a Worker secret; the token itself never sits on the door. One writer (§2): allooloo.
export async function writerOf(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || ""); if (!m) return null;
  const d = await sha256hex(m[1]);
  const table = { allooloo: [env.RCO_WRITER_HASH, env.WRITER_HASH_ALLOOLOO] };   // WRITER_HASH_ALLOOLOO = the office-era token, removed at rotation (revoked)
  for (const [w, hashes] of Object.entries(table)) for (const hash of hashes) if (hash && d === String(hash).trim().toLowerCase()) return w;
  return null;
}

function normalise(a) {
  const s = (v, n) => (v === undefined || v === null || v === "" ? null : String(v).trim().slice(0, n));
  const r = a || {};
  const t = r.cleared_at && !isNaN(Date.parse(r.cleared_at)) ? r.cleared_at : new Date().toISOString();
  return { subject: s(r.subject, 120), subject_type: s(r.subject_type, 24) && String(r.subject_type).trim().toLowerCase(), market: s(r.market, 16) && String(r.market).trim().toUpperCase(),
    rule_version: s(r.rule_version, 160), cleared_at: second(t), answer_hash: s(r.answer_hash, 80) || "", caller_raw: s(r.caller, 200) };
}

export async function writeReceipt(env, writer, args, callerHash) {
  if (!env.DB) return typed("store_unavailable", "the receipt store is not bound on this door");
  const r = normalise(args);
  if (!r.subject) return typed("invalid_receipt", "subject (what was read) is required");
  if (!r.subject_type || !/^[a-z0-9_-]{2,24}$/.test(r.subject_type)) return typed("invalid_receipt", "subject_type is required (isin | lei | gtin | …)");
  if (!r.rule_version) return typed("invalid_receipt", "rule_version is required");
  if (r.answer_hash && !HASH.test(r.answer_hash)) return typed("invalid_receipt", "answer_hash must be sha256:<64 hex>");
  const caller = callerHash !== undefined ? callerHash : r.caller_raw ? "sha256:" + (await sha256hex(r.caller_raw)) : "";
  const base = { v: 1, writer, caller, subject: r.subject, subject_type: r.subject_type, market: r.market, rule_version: r.rule_version, cleared_at: r.cleared_at, answer_hash: r.answer_hash, kid: env.KID };
  const idem = "sha256:" + (await sha256hex(JSON.stringify([writer, base.subject, base.subject_type, base.market, base.rule_version, base.cleared_at, base.answer_hash])));
  const have = await env.DB.prepare("SELECT * FROM receipts WHERE idem = ?1").bind(idem).first();
  if (have) return ok({ receipt: PUBLIC(have), idempotent: true, verify: `${ORIGIN}/receipts/${have.id}` });
  for (let attempt = 0; attempt < 5; attempt++) {
    const tip = await env.DB.prepare("SELECT seq, hash FROM receipts ORDER BY seq DESC LIMIT 1").first();
    const row = { ...base, seq: tip.seq + 1, prev_hash: tip.hash };
    row.hash = await hashOf(row); row.id = idOf(row.hash); row.sig = await sign(env, row.hash);
    try {
      await env.DB.prepare("INSERT INTO receipts (seq,decision_id,v,id,caller,subject,subject_type,market,rule_version,cleared_at,answer_hash,writer,prev_hash,hash,sig,kid,idem) VALUES (?1,?2,1,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)")
        .bind(row.seq, row.id, row.id, row.caller, row.subject, row.subject_type, row.market, row.rule_version, row.cleared_at, row.answer_hash, row.writer, row.prev_hash, row.hash, row.sig, row.kid, idem).run();
      return ok({ receipt: PUBLIC(row), verify: `${ORIGIN}/receipts/${row.id}` });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/UNIQUE.*idem/i.test(msg)) { const h = await env.DB.prepare("SELECT * FROM receipts WHERE idem = ?1").bind(idem).first(); if (h) return ok({ receipt: PUBLIC(h), idempotent: true, verify: `${ORIGIN}/receipts/${h.id}` }); }
      if (!/UNIQUE/i.test(msg)) return typed("store_error", "the store refused the write", { detail: msg.slice(0, 200) });
      // another write took the tip between our read and our insert: re-read and retry
    }
  }
  return typed("chain_contention", "the chain tip moved five times during this write; retry");
}

async function sigOk(row, key) {
  if (!row.sig || !key || key.crv !== "Ed25519") return null;
  try { const k = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, { name: "Ed25519" }, false, ["verify"]); return await crypto.subtle.verify("Ed25519", k, unb64u(row.sig), enc.encode(row.hash)); }
  catch (e) { return false; }
}

export async function verifyReceipt(env, rid) {
  if (!env.DB) return typed("store_unavailable", "the receipt store is not bound on this door");
  const id = String(rid || "").trim();
  if (!RID.test(id)) return typed("invalid_id", "id must look like rco:<20 base32> (v1) or dec_<hex> (v0)");
  const row = await env.DB.prepare("SELECT * FROM receipts WHERE decision_id = ?1").bind(id).first();
  if (!row) return typed("not_found", "no receipt with that id", { id });
  const recomputed = await hashOf(row);
  const key = JWKS.keys.find((k) => k.kid === row.kid) || null;
  const v1 = Number(row.v) === 1;
  const sig = await sigOk(row, key);
  const verification = { hash_ok: recomputed === row.hash, recomputed, ...(v1 ? { id_ok: idOf(row.hash) === row.id } : {}), sig_ok: sig, kid: row.kid,
    note: sig === null ? "ledger-era v0 receipt: no signature on this record; its hash is chained and its original lodge sits in the ledger" : undefined };
  verification.valid = verification.hash_ok && (v1 ? verification.id_ok : true) && sig !== false;
  const out = { receipt: PUBLIC(row), version: v1 ? 1 : 0, seq: row.seq, verification, key, keyring: `${ORIGIN}/.well-known/jwks.json`,
    method: v1 ? "hash = sha256 over the canonical v1 receipt without hash, sig, id; id = rco: + base32 of the first 100 bits of hash; sig = Ed25519 over the hash string"
      : "hash = sha256 over canonical JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}; sig = Ed25519 over the hash string" };
  if (row.ledger_txn) out.ledger = { transaction_id: row.ledger_txn, lodged_hash: row.ledger_hash };
  return ok(out);
}

// extra: { tools: [...], call: async (name, args, request, env) => result | undefined } — later orders add tools without touching this file's core.
export async function handleMcp(request, env, url, extra = { tools: [], call: async () => undefined }) {
  const tools = [...TOOLS, ...extra.tools];
  const origin = request.headers.get("origin");
  if (origin && !/^https:\/\//i.test(origin)) return new Response(JSON.stringify(rpcErr(null, -32600, "origin not allowed")), { status: 403, headers: JSONH });
  const H = { ...JSONH, "access-control-allow-origin": origin || "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version", vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  if (request.method === "GET") return new Response(JSON.stringify({ server: { ...SERVER, version: env.VERSION }, transport: "streamable-http", endpoint: `${url.origin}/mcp`, usage: "POST JSON-RPC 2.0: initialize, tools/list, tools/call", tools: tools.map((t) => t.name), card: `${ORIGIN}/.well-known/mcp.json`, agent_card: `${ORIGIN}/.well-known/agent-card.json`, keyring: `${ORIGIN}/.well-known/jwks.json` }, null, 1), { status: 200, headers: H });
  if (request.method !== "POST") return new Response(JSON.stringify(rpcErr(null, -32600, "POST required")), { status: 405, headers: { ...H, allow: "POST, GET, OPTIONS" } });
  let msgs; try { msgs = await request.json(); } catch { return new Response(JSON.stringify(rpcErr(null, -32700, "parse error")), { status: 400, headers: H }); }
  const batch = Array.isArray(msgs); const out = [];
  for (const m of batch ? msgs : [msgs]) {
    const id = m && m.id !== undefined ? m.id : null;
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") { out.push(rpcErr(id, -32600, "invalid request")); continue; }
    if (m.method.startsWith("notifications/")) continue;
    try {
      if (m.method === "initialize") out.push(rpc(id, { protocolVersion: (m.params && m.params.protocolVersion) || SERVER.protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER.name, title: SERVER.title, version: env.VERSION }, instructions: DEFINITION + " Errors are typed. Nothing is answered from memory." }));
      else if (m.method === "ping") out.push(rpc(id, {}));
      else if (m.method === "tools/list") out.push(rpc(id, { tools }));
      else if (m.method === "tools/call") {
        const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
        if (name === "verify_receipt") out.push(rpc(id, await verifyReceipt(env, args.id || args.decision_id)));
        else if (name === "write_receipt") {
          const w = await writerOf(request, env);
          out.push(rpc(id, w ? await writeReceipt(env, w, args) : typed("not_authorised", "write_receipt needs Authorization: Bearer <writer token> issued by Allooloo")));
        } else {
          const r = await extra.call(name, args, request, env);
          out.push(r === undefined ? rpcErr(id, -32602, `unknown tool: ${name}`, { tools: tools.map((t) => t.name) }) : rpc(id, r));
        }
      } else out.push(rpcErr(id, -32601, `method not found: ${m.method}`));
    } catch (e) { out.push(rpcErr(id, -32603, "internal error")); }
  }
  if (!out.length) return new Response(null, { status: 202, headers: H });
  return new Response(JSON.stringify(batch ? out : out[0], null, 1), { status: 200, headers: H });
}
