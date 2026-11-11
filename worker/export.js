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
// ALLOOLOO-FIX 2026-11-03: streamed. The snapshot (tip, count) is fixed first; rows are read 5,000 at a time up to that tip and serialised straight
// into S3 multipart parts (~8 MB each, each with its own sha256 checksum); the body's sha256 by crypto.DigestStream. Same object bytes and layout as before.
const PART = 8 * 1024 * 1024;
// ALLOOLOO-OPS-05 2026-11-04: the Nov 4 05:30 run died at 40,000 rows on "D1 DB is overloaded" (5,000-row pages read back to back). Each page now waits
// a short beat after the last, and a page refused as overloaded (or busy / reset) is read again after a growing wait, up to six times.
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(env, last, tipSeq) {
  for (let i = 0; ; i++) {
    try { return (await env.DB.prepare("SELECT * FROM receipts WHERE seq > ?1 AND seq <= ?2 ORDER BY seq LIMIT 5000").bind(last, tipSeq).all()).results; }
    catch (e) { if (i >= 6 || !/overloaded|too many|busy|reset|timed? ?out/i.test(String(e && e.message || e))) throw e; await nap(2000 * 2 ** i); }
  }
}
const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
async function s3(env, method, key, query, headers, bytes) {
  const bucket = env.EXPORT_BUCKET, region = env.EXPORT_REGION, host = `${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date(), amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), d = amz.slice(0, 8);
  const body = bytes || new Uint8Array(0), ph = hex(await crypto.subtle.digest("SHA-256", body));
  const H = { host, "x-amz-content-sha256": ph, "x-amz-date": amz, ...headers };
  const names = Object.keys(H).sort();
  const qs = Object.keys(query).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join("&");
  const path = "/" + key.split("/").map(encodeURIComponent).join("/");
  const canon = [method, path, qs, names.map((n) => `${n}:${H[n]}`).join("\n") + "\n", names.join(";"), ph].join("\n");
  const scope = `${d}/${region}/s3/aws4_request`, sts = ["AWS4-HMAC-SHA256", amz, scope, await sha256hex(canon)].join("\n");
  let k = await hmac("AWS4" + String(env.EXPORT_SECRET).trim(), d); for (const p of [region, "s3", "aws4_request"]) k = await hmac(k, p);
  const auth = `AWS4-HMAC-SHA256 Credential=${String(env.EXPORT_KEY_ID).trim()}/${scope}, SignedHeaders=${names.join(";")}, Signature=${hex(await hmac(k, sts))}`;
  return fetch(`https://${host}${path}${qs ? "?" + qs : ""}`, { method, headers: { ...H, Authorization: auth }, body: method === "GET" || method === "DELETE" ? undefined : body });
}
export async function runExport(env, day) {
  const at = new Date().toISOString();
  if (!env.DB) return { day, status: 0, error: "store not bound", at };
  const t = await env.DB.prepare("SELECT seq, hash FROM receipts ORDER BY seq DESC LIMIT 1").first();
  const tipSeq = t ? t.seq : 0, tip = t ? t.hash : null;
  const count = (await env.DB.prepare("SELECT count(*) AS n FROM receipts WHERE seq <= ?1").bind(tipSeq).first()).n;
  const armed = !!(env.EXPORT_KEY_ID && env.EXPORT_SECRET), key = `receipts/${day}/receipts.json`;
  const ds = new crypto.DigestStream("SHA-256"), dw = ds.getWriter();
  let status = 0, error = null, version_id = null, uploadId = null, rows = 0;
  const parts = []; let buf = [], bufLen = 0;
  const flush = async (last) => {
    if (!bufLen || (!last && bufLen < PART)) return;
    const u8 = new Uint8Array(bufLen); let o = 0; for (const c of buf) { u8.set(c, o); o += c.length; } buf = []; bufLen = 0;
    if (!armed) return;
    const n = parts.length + 1, ck = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", u8)));
    const r = await s3(env, "PUT", key, { partNumber: String(n), uploadId }, { "x-amz-checksum-sha256": ck }, u8);
    const x = await r.text(); if (!r.ok) throw new Error(`part ${n}: ${r.status} ${x.slice(0, 200)}`);
    parts.push({ n, etag: r.headers.get("etag"), ck });
  };
  const write = async (s) => { const c = enc.encode(s); await dw.write(c); buf.push(c); bufLen += c.length; await flush(false); };
  try {
    if (armed) {
      const r = await s3(env, "POST", key, { uploads: "" }, { "content-type": "application/json", "x-amz-checksum-algorithm": "SHA256" });
      const x = await r.text(); if (!r.ok) throw new Error(`create: ${r.status} ${x.slice(0, 200)}`);
      uploadId = (/<UploadId>([^<]+)<\/UploadId>/.exec(x) || [])[1]; if (!uploadId) throw new Error("create: no UploadId");
    }
    await write(JSON.stringify({ door: "https://mcp.rco-records.ai/mcp", day, count, tip, exported_at: at }).slice(0, -1) + ',"receipts":[');
    let last = 0;
    for (;;) {
      if (last) await nap(400);
      const results = await page(env, last, tipSeq);   // ALLOOLOO-OPS-05
      if (!results.length) break;
      await write((rows ? "," : "") + results.map((r) => JSON.stringify(r)).join(","));
      rows += results.length; last = results[results.length - 1].seq;
    }
    await write("]}"); await flush(true); await dw.close();
    if (armed) {
      const xml = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag}</ETag><ChecksumSHA256>${p.ck}</ChecksumSHA256></Part>`).join("")}</CompleteMultipartUpload>`;
      const r = await s3(env, "POST", key, { uploadId }, { "content-type": "application/xml" }, enc.encode(xml));
      const x = await r.text(); if (!r.ok || /<Error>/.test(x)) throw new Error(`complete: ${r.status} ${x.slice(0, 200)}`);
      version_id = r.headers.get("x-amz-version-id");
    }
  } catch (e) {
    error = String(e && e.message || e).slice(0, 300); status = 0;
    if (uploadId) { try { await s3(env, "DELETE", key, { uploadId }, {}); } catch {} }
  }
  const sha = error ? null : hex(await ds.digest);
  if (!error && rows !== count) error = `rows ${rows} != count ${count}`;
  if (!error) {
    if (armed) {
      const b = await put(env, `receipts/${day}/manifest.json`, JSON.stringify({ day, count, sha256: sha, tip, exported_at: at }));
      status = b.status === 200 ? 200 : b.status; error = b.error;
    } else error = "export credential not placed (EXPORT_KEY_ID / EXPORT_SECRET) — the CEO's hand";
  }
  await env.DB.prepare("INSERT OR REPLACE INTO export_log (day, rows, sha256, status, error, at, version_id) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(day, rows, sha, status, error, at, version_id).run();
  return { day, rows, sha256: sha, status, error, at, version_id, parts: parts.length };
}
export async function exportStatus(env) {
  if (!env.DB) return { registered: true, cron: "30 5 * * * UTC", bucket: env.EXPORT_BUCKET, armed: !!(env.EXPORT_KEY_ID && env.EXPORT_SECRET), last: null, note: "store not bound" };
  // no count on any surface (§2): the public status names the day, the status code and the time only
  const last = await env.DB.prepare("SELECT day, status, at, version_id FROM export_log ORDER BY at DESC LIMIT 1").first();   // ALLOOLOO-FIX: the version id beside
  return { registered: true, cron: "30 5 * * * UTC", bucket: env.EXPORT_BUCKET, region: env.EXPORT_REGION, armed: !!(env.EXPORT_KEY_ID && env.EXPORT_SECRET), last: last || null };
}
