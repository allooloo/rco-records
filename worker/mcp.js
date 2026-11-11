// mcp.js — rco-door (RCO-MOVE, 2026-10-29: Allooloo Technologies Corp.). Streamable HTTP, stateless, JSON-RPC 2.0.
//   write_receipt  — bearer token per writer; appends one chained, signed v1 receipt; idempotent on (writer, subject, subject_type, market,
//                    rule_version, cleared_at, answer_hash); returns the receipt
//   verify_receipt — public; by id (rco:… v1, dec_… v0); returns the receipt and the verification result
// Typed errors ride in the tool result as { code, message } with isError: true. Nothing is answered from memory.
import { hashOf, idOf, decOf, idOk, sign, sha256hex, second, unb64u, PUBLIC } from "./chain.js";
import { JWKS, ORIGIN, DEFINITION } from "./kit.js";
import { keyFromValue } from "./register.js";

export const SERVER = { name: "rco-records", title: "RCO Records — Record of Cleared Orders", protocolVersion: "2025-06-18" };
export const TOOLS = [
  {
    name: "write_receipt",
    description: "Write one v1 receipt for a read a gate has cleared. Authenticated: Authorization: Bearer <writer token>. Idempotent on (writer, subject, subject_type, market, rule_version, cleared_at, answer_hash). Returns the receipt.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "what was read: the identifier (an ISIN, LEI, GTIN, ticker, record id …)" },
        subject_type: { type: "string", description: "isin | lei | gtin | ticker | cmr | fo-record | … (open list)" },
        market: { type: "string", description: "ISO country or exchange code of the read" },
        rule_version: { type: "string", description: "the rule set and version the gate cleared under" },
        cleared_at: { type: "string", description: "RFC 3339 UTC; stored to the second; the door's clock when absent" },
        answer_hash: { type: "string", description: "sha256:<hex> of the canonical answer bytes the agent received" },
        caller: { type: "string", description: "who asked, when the gate knows it: x402:<wallet address>; stored only as its sha256" },
        caller_key: { type: "string", description: "the customer key the reader presented to the gate (RCO-Key); the door checks it and stores sha256(\"key:\" + key id) as caller" },
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
// RCO-KEY-FO (2026-11-04): fo-record = a Family Office Record id as familyofficeknowledgegraph.ai serves it: an LEI (20), a national register id
// <CC>-<REG>-<id> (SG-UEN-…, AU-ABN-…, CH-UID-…, NL-AFM-…), an association record AS-<slug>, or a TEST-<slug> proof record.
export const SUBJECT_FORMS = { "fo-record": "LEI (20 A-Z0-9) · <CC>-<REG>-<id> · AS-<slug> · TEST-<slug>" };
const SUBJECT_FORMATS = { "fo-record": /^(?:[0-9A-Z]{20}|[A-Z]{2}-[A-Z]{2,5}-[A-Za-z0-9_]{3,80}|AS-[a-z0-9-]{2,90}|TEST-[A-Za-z0-9-]{2,90})$/ };
export const RID = /^(rco:[a-z2-7]{20}|dec_[0-9a-f]{8,48})$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const enc = new TextEncoder();

// Writers: the bearer's sha256 is compared with the hash placed as a Worker secret; the token itself never sits on the door. One writer (§2): allooloo.
export const NODE_WRITERS = {"ae-cm-kg":"https://mcp.ae-cm-kg.ai","at-cm-kg":"https://at.eu-cm-kg.ai","au-cm-kg":"https://mcp.au-cm-kg.ai","be-cm-kg":"https://be.eu-cm-kg.ai","bm-cm-kg":"https://mcp.bm-cm-kg.ai","br-cm-kg":"https://mcp.br-cm-kg.ai","ca-cm-kg":"https://mcp.ca-cm-kg.ai","ch-cm-kg":"https://mcp.ch-cm-kg.ai","cz-cm-kg":"https://cz.eu-cm-kg.ai","de-cm-kg":"https://mcp.de-cm-kg.ai","dk-cm-kg":"https://dk.eu-cm-kg.ai","es-cm-kg":"https://es.eu-cm-kg.ai","fi-cm-kg":"https://fi.eu-cm-kg.ai","fr-cm-kg":"https://mcp.fr-cm-kg.ai","gr-cm-kg":"https://gr.eu-cm-kg.ai","hk-cm-kg":"https://mcp.hk-cm-kg.ai","ie-cm-kg":"https://ie.eu-cm-kg.ai","in-cm-kg":"https://mcp.in-cm-kg.ai","it-cm-kg":"https://it.eu-cm-kg.ai","je-cm-kg":"https://mcp.je-cm-kg.ai","jp-cm-kg":"https://mcp.jp-cm-kg.ai","kr-cm-kg":"https://mcp.kr-cm-kg.ai","ky-cm-kg":"https://mcp.ky-cm-kg.ai","lu-cm-kg":"https://mcp.lu-cm-kg.ai","mx-cm-kg":"https://mcp.mx-cm-kg.ai","nl-cm-kg":"https://mcp.nl-cm-kg.ai","no-cm-kg":"https://no.eu-cm-kg.ai","pl-cm-kg":"https://pl.eu-cm-kg.ai","pt-cm-kg":"https://pt.eu-cm-kg.ai","se-cm-kg":"https://se.eu-cm-kg.ai","sg-cm-kg":"https://mcp.sg-cm-kg.ai","tw-cm-kg":"https://mcp.tw-cm-kg.ai","uk-cm-kg":"https://mcp.uk-cm-kg.ai","us-cm-kg":"https://mcp.us-cm-kg.ai"};   // AIO-01 (2026-10-31): node gates, from the roster of record (mcp.getissuer.ai/nodes.json, live nodes)
// TMKT-02 (2026-11-01): the door writers — a door that is not a node gate writes under its own name (the Target Market door: filings and statement reads, written by the
// node gate that holds the statement, under the holder's credential)
export const DOOR_WRITERS = { gettargetmarket: "https://mcp.gettargetmarket.ai/mcp" };
export const WRITERS_DOC = { standard: "RCO-10060", holder: "Allooloo Technologies Corp.", door: "https://mcp.rco-records.ai/mcp",
  note: "The published mapping of writer identifiers to authorised gates (RCO-10060: writer — the authorised gate that cleared the read). One writing organisation, the holder, operating its own gates; a node gate writes with the holder's credential and names itself (X-RCO-Writer).",
  writers: [{ writer: "allooloo", gates: "the holder's own gates without a node of their own: the getissuer.ai apex, the signal and ECO pages, the digest" }].concat(Object.entries(NODE_WRITERS).map(([w, d]) => ({ writer: w, gate: "cmkg-node-gate on the node door", door: d, tools: ["resolve_issuer", "get_orderability"] })))
    .concat([{ writer: "gsc-hubs", chain: "gsc-hubs", gate: "GreenCore Solutions Corp.'s hub gates — a customer of the door (RCO-03), writing under its own customer key on its own chain", subject_types: ["gtin"], ids: "dec_<first 24 hex of the receipt hash>", caller: "the gsc-hubs key (sha256 of key:<key id>)", note: "receipts are written per customer key and per subject type; no cross-reading" }])
    .concat([{ writer: "agent-bev", chain: "agent-bev", gate: "agent-bev's doors (bev-buyer gate, bev-seller seat) — a customer of the door (RCO-KEY-BEV), writing under its own customer key on its own chain", subject_types: ["gtin"], ids: "dec_<first 24 hex of the receipt hash>", caller: "the agent-bev key (sha256 of key:<key id>)", note: "receipts are written per customer key and per subject type; no cross-reading" }])   // RCO-LIST-01
    .concat([{ writer: "fo-kg", chain: "fo-kg", gate: "Agentic KG Holdings' family-office door (fo-kg: familyofficeknowledgegraph.ai, its apex and node doors) — a customer of the door (RCO-KEY-FO), writing under its own customer key on its own chain", subject_types: ["fo-record"], subject_form: SUBJECT_FORMS["fo-record"], ids: "dec_<first 24 hex of the receipt hash>", caller: "the fo-kg key (sha256 of key:<key id>)", scope: "write_receipt only (the key cannot list, take statements or issue keys)", rule_version: "the door tool that cleared the read", note: "receipts are written per customer key and per subject type; no cross-reading" }])   // RCO-KEY-FO
    .concat([{ writer: "gettargetmarket", gate: "cmkg-node-gate on the home node door of the subject (the Target Market door, routed by mcp.gettargetmarket.ai)", door: DOOR_WRITERS.gettargetmarket, tools: ["file_target_market", "get_target_market"], caller: "the filer (sha256 of filer:<filer id>) on a filing; the reader's customer key or x402 wallet on a read", answer_hash: "sha256 over the canonical statement version filed or served" }]) };
export async function writerOf(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || ""); if (!m) return null;
  const d = await sha256hex(m[1]);
  const table = { allooloo: [env.RCO_WRITER_HASH, env.WRITER_HASH_ALLOOLOO] };   // WRITER_HASH_ALLOOLOO = the office-era token, removed at rotation (revoked)
  let who = null;
  for (const [w, hashes] of Object.entries(table)) for (const hash of hashes) if (hash && d === String(hash).trim().toLowerCase()) who = w;
  if (!who) return null;
  // AIO-01: a node gate writes with the holder's credential and names itself; the name must be in the published writer mapping (/writers.json), else refused
  const claim = String(request.headers.get("x-rco-writer") || "").trim().toLowerCase();
  if (!claim) return who;
  return who === "allooloo" && (Object.prototype.hasOwnProperty.call(NODE_WRITERS, claim) || Object.prototype.hasOwnProperty.call(DOOR_WRITERS, claim)) ? claim : null;   // TMKT-02: + the door writers
}

function normalise(a) {
  const s = (v, n) => (v === undefined || v === null || v === "" ? null : String(v).trim().slice(0, n));
  const r = a || {};
  const t = r.cleared_at && !isNaN(Date.parse(r.cleared_at)) ? r.cleared_at : new Date().toISOString();
  return { subject: s(r.subject, 120), subject_type: s(r.subject_type, 24) && String(r.subject_type).trim().toLowerCase(), market: s(r.market, 16) && String(r.market).trim().toUpperCase(),
    rule_version: s(r.rule_version, 160), cleared_at: second(t), answer_hash: s(r.answer_hash, 80) || "", caller_raw: s(r.caller, 200) };
}

// RCO-03: the tip of one chain (cm: the rows before RCO-03, chain NULL, and those written as 'cm'); a chain with no row yet starts at its genesis (chains table)
async function chainTip(env, chain) {
  const t = chain === "cm" ? await env.DB.prepare("SELECT seq, hash FROM receipts WHERE chain IS NULL OR chain = 'cm' ORDER BY seq DESC LIMIT 1").first()
    : await env.DB.prepare("SELECT seq, hash FROM receipts WHERE chain = ?1 ORDER BY seq DESC LIMIT 1").bind(chain).first();
  if (t) return t.hash;
  const g = await env.DB.prepare("SELECT genesis FROM chains WHERE chain = ?1").bind(chain).first(); return g ? g.genesis : null;
}
export async function writeReceipt(env, writer, args, callerHash, opts = {}) {   // RCO-03: opts { chain, subject_types } for a writer key
  if (!env.DB) return typed("store_unavailable", "the receipt store is not bound on this door");
  const r = normalise(args);
  if (!r.subject) return typed("invalid_receipt", "subject (what was read) is required");
  if (!r.subject_type || !/^[a-z0-9_-]{2,24}$/.test(r.subject_type)) return typed("invalid_receipt", "subject_type is required (isin | lei | gtin | …)");
  if (!r.rule_version) return typed("invalid_receipt", "rule_version is required");
  if (r.answer_hash && !HASH.test(r.answer_hash)) return typed("invalid_receipt", "answer_hash must be sha256:<64 hex>");
  const chain = opts.chain || "cm";
  if (opts.subject_types && !String(opts.subject_types).split(",").map((x) => x.trim()).includes(r.subject_type)) return typed("subject_type_refused", `this key writes subject_type ${opts.subject_types} only; receipts are written per customer key and per subject type`, { chain, allowed: String(opts.subject_types).split(",") });
  // RCO-KEY-FO (2026-11-04): a subject type with a published id form is checked against it (fo-record = the ids the family-office door serves)
  if (SUBJECT_FORMATS[r.subject_type] && !SUBJECT_FORMATS[r.subject_type].test(r.subject)) return typed("invalid_subject", `subject is not a ${r.subject_type} id as the door serves them`, { subject_type: r.subject_type, form: SUBJECT_FORMS[r.subject_type] });
  const caller = callerHash !== undefined ? callerHash : r.caller_raw ? "sha256:" + (await sha256hex(r.caller_raw)) : "";
  const base = { v: 1, writer, caller, subject: r.subject, subject_type: r.subject_type, market: r.market, rule_version: r.rule_version, cleared_at: r.cleared_at, answer_hash: r.answer_hash, kid: env.KID };
  const idem = "sha256:" + (await sha256hex(JSON.stringify([writer, base.subject, base.subject_type, base.market, base.rule_version, base.cleared_at, base.answer_hash])));
  const have = await env.DB.prepare("SELECT * FROM receipts WHERE idem = ?1").bind(idem).first();
  if (have) return ok({ receipt: PUBLIC(have), idempotent: true, verify: `${ORIGIN}/receipts/${have.id}` });
  for (let attempt = 0; attempt < 5; attempt++) {
    const prev = await chainTip(env, chain); if (!prev) return typed("store_error", `no genesis for chain ${chain}`);
    const top = await env.DB.prepare("SELECT seq FROM receipts ORDER BY seq DESC LIMIT 1").first();   // RCO-03: one seq across the store; each chain links its own tip
    const row = { ...base, seq: top.seq + 1, prev_hash: prev, chain };
    row.hash = await hashOf(row); row.id = chain === "cm" ? idOf(row.hash) : decOf(row.hash); row.sig = await sign(env, row.hash);
    try {
      await env.DB.prepare("INSERT INTO receipts (seq,decision_id,v,id,caller,subject,subject_type,market,rule_version,cleared_at,answer_hash,writer,prev_hash,hash,sig,kid,idem,chain) VALUES (?1,?2,1,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)")
        .bind(row.seq, row.id, row.id, row.caller, row.subject, row.subject_type, row.market, row.rule_version, row.cleared_at, row.answer_hash, row.writer, row.prev_hash, row.hash, row.sig, row.kid, idem, chain).run();
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
  const verification = { hash_ok: recomputed === row.hash, recomputed, ...(v1 ? { id_ok: idOk(row) } : {}), sig_ok: sig, kid: row.kid, chain: row.chain || "cm",
    note: sig === null ? "ledger-era v0 receipt: no signature on this record; its hash is chained and its original lodge sits in the ledger" : undefined };
  verification.valid = verification.hash_ok && (v1 ? verification.id_ok : true) && sig !== false;
  const out = { receipt: PUBLIC(row), version: v1 ? 1 : 0, seq: row.seq, verification, key, keyring: `${ORIGIN}/.well-known/jwks.json`,
    method: v1 ? "hash = sha256 over the canonical v1 receipt without hash, sig, id; id = rco: + base32 of the first 100 bits of hash (the cm chain) or dec_ + the first 24 hex of hash (receipts on a customer writer's own chain: gsc-hubs and agent-bev for gtin, fo-kg for fo-record); sig = Ed25519 over the hash string"
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
          // RCO-03: a customer writer key (rcok_, kind writer) writes on its own chain, as its own caller, the subject types it holds only
          const wm = !w && /^Bearer\s+(rcok_\S+)$/i.exec(request.headers.get("authorization") || ""); const wk = wm ? await keyFromValue(env, wm[1]) : null;
          if (wk && wk.kind === "writer" && wk.chain) out.push(rpc(id, await writeReceipt(env, wk.chain, args, wk.caller, { chain: wk.chain, subject_types: wk.subject_types })));
          else {
          let ch; if (w && args.caller_key) { const k = await keyFromValue(env, args.caller_key); ch = k ? k.caller : ""; }
          out.push(rpc(id, w ? await writeReceipt(env, w, args, ch) : typed("not_authorised", "write_receipt needs Authorization: Bearer <writer token> issued by Allooloo, or a customer writer key on its own chain")));
          }
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
