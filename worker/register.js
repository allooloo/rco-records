// register.js — RCO-03 (Allooloo build memo v1.0 §4.2, §4.3, §6): the RCO Register. A customer key is issued by Allooloo to a firm (admin route),
// the firm's reads carry it through Allooloo's gates (header RCO-Key), the door stamps every such receipt with caller = sha256("key:" + key id),
// and the key reads its own slice: list_receipts (own rows only), get_statement (signed, monthly and on demand), nightly export to the firm's bucket.
// A firm may issue a read-only auditor sub-key on its own slice. Keys are held by the door only as sha256. No count is ever served to anyone but
// the key holder (§2): statements and list pages are the key holder's own record, not a statistic on a surface.
import { sha256hex, sign, b64u, PUBLIC } from "./chain.js";
import { typed, ok } from "./mcp.js";
import { ORIGIN } from "./kit.js";

const enc = new TextEncoder();
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v === undefined ? null : v);
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
const id20 = (prefix, hexs) => { const bits = hexs.match(/../g).slice(0, 13).map((h) => parseInt(h, 16).toString(2).padStart(8, "0")).join(""); let o = ""; for (let i = 0; i < 100; i += 5) o += B32[parseInt(bits.slice(i, i + 5), 2)]; return prefix + o; };
export const callerOfKey = async (keyId) => "sha256:" + (await sha256hex("key:" + keyId));
const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const hexRand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ---- keys ------------------------------------------------------------------------------------------------------------------------------------
export async function keyFromValue(env, value) {
  const v = String(value || "").trim();
  if (!/^rcok_k[0-9a-f]{10}_[A-Za-z0-9_-]{30,}$/.test(v)) return null;
  const row = await env.DB.prepare("SELECT * FROM keys WHERE key_hash = ?1").bind(await sha256hex(v)).first();
  if (!row || row.revoked_at) return null;
  if (row.parent) { const p = await env.DB.prepare("SELECT revoked_at FROM keys WHERE key_id = ?1").bind(row.parent).first(); if (!p || p.revoked_at) return null; }
  return row;
}
const bearerKey = async (request, env) => { const m = /^Bearer\s+(rcok_\S+)$/i.exec(request.headers.get("authorization") || ""); return m ? keyFromValue(env, m[1]) : null; };

async function issueKey(env, { name, kind = "customer", parent = null }) {
  const key_id = "k" + hexRand(5);
  const value = `rcok_${key_id}_${rand(32)}`;
  let caller = await callerOfKey(key_id);
  if (parent) { const p = await env.DB.prepare("SELECT * FROM keys WHERE key_id = ?1 AND revoked_at IS NULL").bind(parent).first(); if (!p) return { error: "parent_not_found" }; caller = p.caller; kind = "auditor"; }
  await env.DB.prepare("INSERT INTO keys (key_id, name, kind, parent, key_hash, caller, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(key_id, String(name).slice(0, 120), kind, parent, await sha256hex(value), caller, now()).run();
  return { key_id, name, kind, parent, caller, key: value, note: "the key value is shown once; Allooloo holds only its sha256" };
}

// ---- the slice -------------------------------------------------------------------------------------------------------------------------------
async function slice(env, caller, a) {
  const lim = Math.min(Math.max(parseInt(a.limit || 100, 10) || 100, 1), 500);
  const w = ["caller = ?1"], b = [caller];
  if (a.from_seq != null) { w.push(`seq >= ?${b.length + 1}`); b.push(parseInt(a.from_seq, 10)); }
  if (a.to_seq != null) { w.push(`seq <= ?${b.length + 1}`); b.push(parseInt(a.to_seq, 10)); }
  if (a.after_seq != null) { w.push(`seq > ?${b.length + 1}`); b.push(parseInt(a.after_seq, 10)); }
  if (a.from) { w.push(`cleared_at >= ?${b.length + 1}`); b.push(String(a.from)); }
  if (a.to) { w.push(`cleared_at < ?${b.length + 1}`); b.push(String(a.to).length === 10 ? new Date(Date.parse(a.to) + 864e5).toISOString().slice(0, 10) : String(a.to)); }
  const { results } = await env.DB.prepare(`SELECT * FROM receipts WHERE ${w.join(" AND ")} ORDER BY seq LIMIT ${lim + 1}`).bind(...b).all();
  const more = results.length > lim, rows = results.slice(0, lim);
  return { receipts: rows.map(PUBLIC), next: more ? { after_seq: rows[rows.length - 1].seq } : null };
}

async function listReceipts(request, env, a) {
  const k = await bearerKey(request, env);
  if (!k) return typed("not_authorised", "list_receipts needs Authorization: Bearer <customer key> issued by Allooloo; it returns the key's own rows only");
  return ok({ key_id: k.key_id, kind: k.kind, caller: k.caller, ...(await slice(env, k.caller, a || {})) });
}

// ---- statements ------------------------------------------------------------------------------------------------------------------------------
const monthRange = (m) => { const [y, mo] = m.split("-").map(Number); return { from: `${m}-01`, to: new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10) }; };
export async function makeStatement(env, k, period) {
  const { from, to } = period;   // [from, to) by cleared_at, UTC dates
  const hashes = []; let first = null, last = null, after = 0;
  for (;;) {
    const { results } = await env.DB.prepare("SELECT seq, id, decision_id, hash FROM receipts WHERE caller = ?1 AND cleared_at >= ?2 AND cleared_at < ?3 AND seq > ?4 ORDER BY seq LIMIT 5000").bind(k.caller, from, to, after).all();
    if (!results.length) break;
    for (const r of results) { if (!first) first = r; last = r; hashes.push(r.hash); }
    after = results[results.length - 1].seq;
  }
  const tip = await env.DB.prepare("SELECT seq, hash FROM receipts ORDER BY seq DESC LIMIT 1").first();
  const body = { type: "rco-statement", v: 1, issuer: "Allooloo Technologies Corp.", key_id: k.parent || k.key_id, caller: k.caller, period: { from, to, basis: "cleared_at UTC, from inclusive, to exclusive" },
    receipts: { count: hashes.length, first_seq: first ? first.seq : null, last_seq: last ? last.seq : null, first_id: first ? first.id || first.decision_id : null, last_id: last ? last.id || last.decision_id : null,
      slice_digest: "sha256:" + (await sha256hex(hashes.join("\n"))), digest_rule: "sha256 over the receipt hashes of the slice, seq order, joined by \\n" },
    chain_tip_at_issue: { seq: tip.seq, hash: tip.hash }, issued_at: now(), kid: env.KID, verify: `${ORIGIN}/auditors` };
  const hash = "sha256:" + (await sha256hex(canon(body)));
  const st = { ...body, id: id20("rcs:", hash.slice(7)), hash, sig: await sign(env, hash) };
  await env.DB.prepare("INSERT OR IGNORE INTO statements (id, key_id, period_from, period_to, issued_at, hash, body) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(st.id, body.key_id, from, to, body.issued_at, hash, JSON.stringify(st)).run();
  return st;
}
async function getStatement(request, env, a) {
  const k = await bearerKey(request, env);
  if (!k) return typed("not_authorised", "get_statement needs Authorization: Bearer <customer key> issued by Allooloo");
  let p;
  if (a && a.month) { if (!/^\d{4}-\d{2}$/.test(a.month)) return typed("invalid_period", "month must be YYYY-MM"); p = monthRange(a.month); }
  else if (a && a.from && a.to) { if (!/^\d{4}-\d{2}-\d{2}$/.test(a.from) || !/^\d{4}-\d{2}-\d{2}$/.test(a.to) || a.from >= a.to) return typed("invalid_period", "from and to are YYYY-MM-DD, from before to (to exclusive)"); p = { from: a.from, to: a.to }; }
  else p = monthRange(new Date().toISOString().slice(0, 7));
  return ok({ statement: await makeStatement(env, k, p) });
}
async function issueAuditorKey(request, env, a) {
  const k = await bearerKey(request, env);
  if (!k || k.kind === "auditor") return typed("not_authorised", "issue_auditor_key needs Authorization: Bearer <customer key> (an auditor key cannot issue keys)");
  const r = await issueKey(env, { name: String((a && a.name) || "auditor").slice(0, 80) + " (auditor of " + k.key_id + ")", parent: k.key_id });
  return ok(r);
}

export const REGISTER_TOOLS = [
  { name: "list_receipts", description: "Your own receipts only — the rows whose caller is your customer key — by seq range (from_seq, to_seq, after_seq) or date range (from, to: YYYY-MM-DD, to inclusive), limit ≤ 500. Authorization: Bearer <customer key>. Refuses without a key.",
    inputSchema: { type: "object", properties: { from_seq: { type: "integer" }, to_seq: { type: "integer" }, after_seq: { type: "integer" }, from: { type: "string" }, to: { type: "string" }, limit: { type: "integer" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "get_statement", description: "A signed statement of your slice for a month (month: YYYY-MM) or a date range (from, to: YYYY-MM-DD, to exclusive): count, first and last seq, slice digest, the chain tip at issue, Ed25519 signature by Allooloo. Authorization: Bearer <customer key>.",
    inputSchema: { type: "object", properties: { month: { type: "string" }, from: { type: "string" }, to: { type: "string" } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "issue_auditor_key", description: "Issue a read-only sub-key on your own slice for your auditor (list_receipts and get_statement only). Authorization: Bearer <customer key>. The key value is returned once.",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];
export const registerCall = async (name, args, request, env) =>
  name === "list_receipts" ? listReceipts(request, env, args) : name === "get_statement" ? getStatement(request, env, args) : name === "issue_auditor_key" ? issueAuditorKey(request, env, args) : undefined;

// ---- admin route (Allooloo admin token; RCO_ADMIN_HASH) --------------------------------------------------------------------------------------
const JH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const J = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: JH });
export async function handleAdmin(request, env, path) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!m || !env.RCO_ADMIN_HASH || (await sha256hex(m[1])) !== String(env.RCO_ADMIN_HASH).trim().toLowerCase()) return J({ error: "not_authorised" }, 401);
  let body = {}; if (request.method === "POST") { try { body = await request.json(); } catch { body = {}; } }
  if (path === "/admin/keys" && request.method === "GET") { const { results } = await env.DB.prepare("SELECT key_id, name, kind, parent, caller, export_bucket, export_region, export_prefix, export_cred, created_at, revoked_at FROM keys ORDER BY created_at").all(); return J({ keys: results }); }
  if (path === "/admin/keys" && request.method === "POST") { if (!body.name) return J({ error: "name required" }, 400); const r = await issueKey(env, { name: body.name, kind: body.kind === "demo" ? "demo" : "customer", parent: body.parent || null }); return J(r, r.error ? 400 : 201); }
  let k = /^\/admin\/keys\/(k[0-9a-f]{10})\/(revoke|export)$/.exec(path);
  if (k && request.method === "POST" && k[2] === "revoke") { const r = await env.DB.prepare("UPDATE keys SET revoked_at = ?2 WHERE key_id = ?1 AND revoked_at IS NULL").bind(k[1], now()).run(); return J({ key_id: k[1], revoked: r.meta.changes === 1 }); }
  if (k && request.method === "POST" && k[2] === "export") {
    if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(body.bucket || "") || !/^[A-Z][A-Z0-9_]{1,40}$/.test(body.cred || "")) return J({ error: "bucket (S3 name) and cred (secret prefix: <cred>_KEY_ID / <cred>_SECRET) required" }, 400);
    await env.DB.prepare("UPDATE keys SET export_bucket = ?2, export_region = ?3, export_prefix = ?4, export_cred = ?5 WHERE key_id = ?1").bind(k[1], body.bucket, body.region || "us-east-1", body.prefix || `rco/${k[1]}`, body.cred).run();
    return J({ key_id: k[1], export: { bucket: body.bucket, region: body.region || "us-east-1", prefix: body.prefix || `rco/${k[1]}`, cred: body.cred, armed: !!(env[body.cred + "_KEY_ID"] && env[body.cred + "_SECRET"]) } });
  }
  if (path === "/admin/statements" && request.method === "POST") {   // monthly run (the rco-chain agent) or one key on demand
    if (!/^\d{4}-\d{2}$/.test(body.month || "")) return J({ error: "month YYYY-MM required" }, 400);
    const { results } = await env.DB.prepare(`SELECT * FROM keys WHERE revoked_at IS NULL AND parent IS NULL ${body.key_id ? "AND key_id = ?1" : ""}`).bind(...(body.key_id ? [body.key_id] : [])).all();
    const out = []; for (const kk of results) out.push(await makeStatement(env, kk, monthRange(body.month)));
    return J({ month: body.month, statements: out });
  }
  if (path === "/admin/export" && request.method === "POST") { const day = /^\d{4}-\d{2}-\d{2}$/.test(body.day || "") ? body.day : new Date(Date.now() - 864e5).toISOString().slice(0, 10); return J(await exportKeys(env, day)); }
  return J({ error: "not_found" }, 404);
}

// ---- per-key export: JSONL of the day's rows + signed manifest into the customer's bucket with the customer's credential ----------------------
async function hmac(key, msg) { const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))); }
const hx = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function s3put(idv, secret, bucket, region, key, body, ct) {
  const host = `${bucket}.s3.${region}.amazonaws.com`, amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""), d = amz.slice(0, 8);
  const bytes = enc.encode(body), ph = hx(await crypto.subtle.digest("SHA-256", bytes));
  const H = { host, "content-type": ct, "x-amz-content-sha256": ph, "x-amz-date": amz }; const names = Object.keys(H).sort();
  const canonReq = ["PUT", "/" + key.split("/").map(encodeURIComponent).join("/"), "", names.map((n) => `${n}:${H[n]}`).join("\n") + "\n", names.join(";"), ph].join("\n");
  const scope = `${d}/${region}/s3/aws4_request`, sts = ["AWS4-HMAC-SHA256", amz, scope, await sha256hex(canonReq)].join("\n");
  let k = await hmac("AWS4" + String(secret).trim(), d); for (const p of [region, "s3", "aws4_request"]) k = await hmac(k, p);
  const r = await fetch(`https://${host}/${key}`, { method: "PUT", headers: { ...H, Authorization: `AWS4-HMAC-SHA256 Credential=${String(idv).trim()}/${scope}, SignedHeaders=${names.join(";")}, Signature=${hx(await hmac(k, sts))}` }, body: bytes });
  return { status: r.status, error: r.ok ? null : (await r.text()).slice(0, 200) };
}
export async function exportKeys(env, day) {
  const { results: keys } = await env.DB.prepare("SELECT * FROM keys WHERE revoked_at IS NULL AND parent IS NULL AND export_bucket IS NOT NULL").all();
  const out = [];
  for (const k of keys) {
    const { results: rows } = await env.DB.prepare("SELECT * FROM receipts WHERE caller = ?1 AND substr(cleared_at,1,10) = ?2 ORDER BY seq").bind(k.caller, day).all();
    const jsonl = rows.map((r) => JSON.stringify(PUBLIC(r))).join("\n") + (rows.length ? "\n" : "");
    const man = { type: "rco-export-manifest", v: 1, issuer: "Allooloo Technologies Corp.", key_id: k.key_id, day, first_seq: rows.length ? rows[0].seq : null, last_seq: rows.length ? rows[rows.length - 1].seq : null,
      day_tip: rows.length ? rows[rows.length - 1].hash : null, file_sha256: "sha256:" + (await sha256hex(jsonl)), kid: env.KID };
    const mh = "sha256:" + (await sha256hex(canon(man))); const manifest = { ...man, hash: mh, sig: await sign(env, mh) };
    const idv = env[k.export_cred + "_KEY_ID"], sec = env[k.export_cred + "_SECRET"];
    let status = 0, error = null;
    if (idv && sec) {
      const a = await s3put(idv, sec, k.export_bucket, k.export_region, `${k.export_prefix}/${day}/receipts.jsonl`, jsonl, "application/x-ndjson");
      const b = await s3put(idv, sec, k.export_bucket, k.export_region, `${k.export_prefix}/${day}/manifest.json`, JSON.stringify(manifest, null, 1), "application/json");
      status = a.status === 200 && b.status === 200 ? 200 : a.status !== 200 ? a.status : b.status; error = a.error || b.error;
    } else error = `credential not placed (${k.export_cred}_KEY_ID / ${k.export_cred}_SECRET)`;
    await env.DB.prepare("INSERT OR REPLACE INTO key_exports (key_id, day, status, error, manifest_hash, at) VALUES (?1,?2,?3,?4,?5,?6)").bind(k.key_id, day, status, error, mh, now()).run();
    out.push({ key_id: k.key_id, day, status, error, manifest_hash: mh });
  }
  return { day, exports: out };
}
