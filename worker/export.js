// export.js — rco-door nightly copy of the full receipts table to s3://rco-receipts-copy (AWS 159822161213). SigV4 PutObject. RCO-MOVE: Allooloo.
// Worker does it. Puts run only when EXPORT_KEY_ID and EXPORT_SECRET are placed as Worker secrets (the CEO's hand: bucket + a put-only credential);
// until then the run computes the object, records the row count and sha256 in export_log with status 0, and puts nothing.
import { sha256hex } from "./chain.js";
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(key, msg) { const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))); }
async function put(env, key, body) {
  const bucket = env.EXPORT_BUCKET, region = env.EXPORT_REGION, host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date(), amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), d = amz.slice(0, 8);
  const bytes = enc.encode(body), ph = hex(await crypto.subtle.digest("SHA-256", bytes));
  const ck = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))));
  const H = { host, "content-type": "application/json", "x-amz-checksum-sha256": ck, "x-amz-content-sha256": ph, "x-amz-date": amz, "x-amz-sdk-checksum-algorithm": "SHA256" };
  const names = Object.keys(H).sort();
  const canon = ["PUT", "/" + key.split("/").map(encodeURIComponent).join("/"), "", names.map((n) => `${n}:${H[n]}`).join("\n") + "\n", names.join(";"), ph].join("\n");
  const scope = `${d}/${region}/s3/aws4_request`, sts = ["AWS4-HMAC-SHA256", amz, scope, await sha256hex(canon)].join("\n");
  let k = await hmac("AWS4" + String(env.EXPORT_SECRET).trim(), d); for (const p of [region, "s3", "aws4_request"]) k = await hmac(k, p);
  const auth = `AWS4-HMAC-SHA256 Credential=${String(env.EXPORT_KEY_ID).trim()}/${scope}, SignedHeaders=${names.join(";")}, Signature=${hex(await hmac(k, sts))}`;
  const r = await fetch(`https://${host}/${key}`, { method: "PUT", headers: { ...H, Authorization: auth }, body: bytes });
  return { key, status: r.status, sha256: ph, error: r.ok ? null : (await r.text()).slice(0, 300) };
}
export async function runExport(env, day) {
  const at = new Date().toISOString();
  if (!env.DB) return { day, status: 0, error: "store not bound", at };
  const rows = []; let last = 0;
  for (;;) { const { results } = await env.DB.prepare("SELECT * FROM receipts WHERE seq > ?1 ORDER BY seq LIMIT 5000").bind(last).all(); if (!results.length) break; rows.push(...results); last = results[results.length - 1].seq; }
  const body = JSON.stringify({ door: "https://mcp.rco-records.ai/mcp", day, count: rows.length, tip: rows.length ? rows[rows.length - 1].hash : null, exported_at: at, receipts: rows });
  const sha = await sha256hex(body);
  let status = 0, error = null;
  if (env.EXPORT_KEY_ID && env.EXPORT_SECRET) {
    const a = await put(env, `receipts/${day}/receipts.json`, body);
    const b = await put(env, `receipts/${day}/manifest.json`, JSON.stringify({ day, count: rows.length, sha256: sha, tip: rows.length ? rows[rows.length - 1].hash : null, exported_at: at }));
    status = a.status === 200 && b.status === 200 ? 200 : (a.status || b.status); error = a.error || b.error;
  } else error = "export credential not placed (EXPORT_KEY_ID / EXPORT_SECRET) — the CEO's hand";
  await env.DB.prepare("INSERT OR REPLACE INTO export_log (day, rows, sha256, status, error, at) VALUES (?1,?2,?3,?4,?5,?6)").bind(day, rows.length, sha, status, error, at).run();
  return { day, rows: rows.length, sha256: sha, status, error, at };
}
export async function exportStatus(env) {
  if (!env.DB) return { registered: true, cron: "30 5 * * * UTC", bucket: env.EXPORT_BUCKET, armed: !!(env.EXPORT_KEY_ID && env.EXPORT_SECRET), last: null, note: "store not bound" };
  // no count on any surface (§2): the public status names the day, the status code and the time only
  const last = await env.DB.prepare("SELECT day, status, at FROM export_log ORDER BY at DESC LIMIT 1").first();
  return { registered: true, cron: "30 5 * * * UTC", bucket: env.EXPORT_BUCKET, region: env.EXPORT_REGION, armed: !!(env.EXPORT_KEY_ID && env.EXPORT_SECRET), last: last || null };
}
