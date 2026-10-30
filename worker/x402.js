// x402.js — rco-door 2.3.0 (CEO order 2026-10-30): the /api 402 door on rco-records.ai, as on every other Allooloo surface. Lifted from the estate
// module (CM-KG\ESTATE\worker\x402.js: offer, Open USD second entry, CDP JWT, facilitator) — the payment path is the estate's, not a rewrite. One copy
// per Worker folder. Prices are read from this surface's /facts.json (x402.api, x402.statement); never typed here. Two paid routes, nothing else:
//   GET /api                       — the payer's own slice of the record (receipts whose caller is its wallet), this paid call receipted first
//   GET /api/statement?month=YYYY-MM — a signed statement of the payer's slice
// The payer's wallet handle is the caller: caller = sha256("x402:" + lowercase address). MCP stays open: no 402 on any MCP read; verify_receipt is free.
import { sha256hex, PUBLIC } from "./chain.js";
import { writeReceipt } from "./mcp.js";
import { makeStatement } from "./register.js";
import { ORIGIN } from "./kit.js";

const NET = { caip2: "eip155:8453", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin", facilitator: "https://api.cdp.coinbase.com/platform/v2/x402", fallback: "https://facilitator.payai.network", explorer: "https://basescan.org/tx/" };
const OUSD = { asset: "0xB2000000000000000000002fEb517dFeC7415344", name: "OpenUSD", version: "1" };
const EIP2612_GAS_SPONSORING = { eip2612GasSponsoring: { info: { description: "The facilitator accepts EIP-2612 gasless Permit to Permit2 canonical contract.", version: "1" }, schema: { type: "object" } } };
const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const unb64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));
const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}" : JSON.stringify(v === undefined ? null : v);
const H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE, X-RCO-Receipt-Id" };

// prices from /facts.json (dollars, plain "$" in prose; atomic units for the 6-decimal stablecoins)
async function prices(env, origin) {
  const r = await env.ASSETS.fetch(new Request(origin + "/facts.json"));
  const f = r.status === 200 ? await r.json() : {};
  const x = f.x402 || {};
  const atomic = (d) => (d == null || isNaN(Number(d)) ? null : String(Math.round(Number(d) * 1e6)));
  return { api: atomic(x.api), statement: atomic(x.statement), api_usd: x.api ?? null, statement_usd: x.statement ?? null };
}

const ROUTES = { "/api": { key: "api", what: "your own slice of the Record of Cleared Orders: the receipts whose caller is your wallet (this paid call receipted first)" },
  "/api/statement": { key: "statement", what: "a signed statement of your wallet's slice for a month (?month=YYYY-MM, default this month)" } };

function accepts(env, url, amount) {
  const usdc = { scheme: "exact", network: NET.caip2, amount, maxAmountRequired: amount, asset: NET.usdc, payTo: env.X402_PAYTO, maxTimeoutSeconds: 300, resource: url.origin + url.pathname,
    description: `RCO Records — ${ROUTES[url.pathname].what}. Allooloo Technologies Corp.`, mimeType: "application/json", extra: { name: NET.name, version: "2" } };
  return [usdc, { ...usdc, asset: OUSD.asset, payTo: env.X402_PAYTO_OUSD || env.X402_PAYTO, extra: { assetTransferMethod: "permit2", name: OUSD.name, version: OUSD.version } }];
}
function offer(env, url, amount, usd, error) {
  const acc = accepts(env, url, amount);
  const body = { x402Version: 2, error: error || `Payment required: $${usd} in USDC or Open USD on Base`, accepts: acc, resource: { url: acc[0].resource, description: acc[0].description, mimeType: "application/json" },
    extensions: EIP2612_GAS_SPONSORING, free: { verify: `${ORIGIN}/receipts/{id}`, mcp: "https://mcp.rco-records.ai/mcp (no 402 on any MCP tool)" }, pricing: `${ORIGIN}/facts.json` };
  return new Response(JSON.stringify(body, null, 1), { status: 402, headers: { ...H, "PAYMENT-REQUIRED": b64(body) } });
}

// Coinbase CDP per-request JWT (Secret API key: Ed25519 base64 64-byte secret, or legacy ES256 PEM). Never logged.
const b64uBuf = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (str) => b64uBuf(new TextEncoder().encode(str));
const pemDer = (pem) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
async function cdpJwt(env, method, host, path) {
  const id = env.CDP_API_KEY_ID, secret = env.CDP_API_KEY_SECRET; if (!id || !secret) return null;
  const now = Math.floor(Date.now() / 1000); const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const claims = { sub: id, iss: "cdp", aud: ["cdp_service"], nbf: now, exp: now + 120, uris: [`${method} ${host}${path}`] };
  let alg, key, sigAlg;
  if (secret.includes("BEGIN")) { alg = "ES256"; key = await crypto.subtle.importKey("pkcs8", pemDer(secret), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]); sigAlg = { name: "ECDSA", hash: "SHA-256" }; }
  else { alg = "EdDSA"; const raw = Uint8Array.from(atob(secret.trim()), (c) => c.charCodeAt(0)); const pkcs8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20, ...raw.slice(0, 32)]); key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]); sigAlg = { name: "Ed25519" }; }
  const h = b64uStr(JSON.stringify({ alg, kid: id, typ: "JWT", nonce })); const p = b64uStr(JSON.stringify(claims));
  return `${h}.${p}.${b64uBuf(await crypto.subtle.sign(sigAlg, key, new TextEncoder().encode(`${h}.${p}`)))}`;
}
export const facilitatorUrl = (env) => env.X402_FACILITATOR || (env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET ? NET.facilitator : NET.fallback);
async function facilitator(env, path, body) {
  const u = new URL(facilitatorUrl(env) + path); const h = { "content-type": "application/json", accept: "application/json" };
  if (u.hostname.endsWith("coinbase.com")) { const jwt = await cdpJwt(env, "POST", u.hostname, u.pathname); if (jwt) h.Authorization = "Bearer " + jwt; }
  const r = await fetch(u.toString(), { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  let j = null; try { j = await r.json(); } catch (e) { j = { error: "facilitator answered " + r.status }; }
  return { status: r.status, body: j };
}

export async function handleApi(request, env, url) {
  const route = ROUTES[url.pathname];
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...H, "access-control-allow-headers": "PAYMENT-SIGNATURE, X-PAYMENT, Content-Type", "access-control-allow-methods": "GET, OPTIONS" } });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "GET only" }), { status: 405, headers: { ...H, allow: "GET, OPTIONS" } });
  const P = await prices(env, url.origin);
  const amount = P[route.key], usd = P[route.key + "_usd"];
  if (!amount) return new Response(JSON.stringify({ error: "not_priced", note: `no x402.${route.key} price in ${ORIGIN}/facts.json` }), { status: 503, headers: H });
  if (!env.X402_PAYTO) return new Response(JSON.stringify({ error: "receiver_not_configured" }), { status: 503, headers: H });
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (route.key === "statement" && !/^\d{4}-\d{2}$/.test(month)) return new Response(JSON.stringify({ error: "month must be YYYY-MM" }), { status: 400, headers: H });
  const sig = request.headers.get("PAYMENT-SIGNATURE") || request.headers.get("X-PAYMENT");
  if (!sig) return offer(env, url, amount, usd);
  let payload; try { payload = unb64(sig); } catch (e) { return offer(env, url, amount, usd, "PAYMENT-SIGNATURE is not base64 JSON"); }
  const offered = accepts(env, url, amount);
  const chosen = String((payload.accepted && payload.accepted.asset) || "").toLowerCase();
  const req = offered.find((a) => a.asset.toLowerCase() === chosen) || offered[0];
  const v = await facilitator(env, "/verify", { x402Version: payload.x402Version || 2, paymentPayload: payload, paymentRequirements: req });
  if (!(v.body && v.body.isValid)) return offer(env, url, amount, usd, "payment not valid: " + ((v.body && (v.body.invalidReason || v.body.error)) || v.status));
  const s = await facilitator(env, "/settle", { x402Version: payload.x402Version || 2, paymentPayload: payload, paymentRequirements: req });
  const tx = s.body && (s.body.transaction || s.body.txHash || null);
  const settled = !!(s.body && (s.body.success || tx));
  const payer = String((s.body && s.body.payer) || (payload.payload && payload.payload.authorization && payload.payload.authorization.from) || (payload.payload && payload.payload.permit2Authorization && payload.payload.permit2Authorization.from) || "").toLowerCase();
  const pr = { x402Version: 2, success: settled, transaction: tx, network: req.network, amount: req.amount, asset: req.asset, payer, explorer: tx ? NET.explorer + tx : null, errorReason: settled ? null : (s.body && (s.body.errorReason || s.body.error)) || null };
  if (!settled) return new Response(JSON.stringify({ x402Version: 2, error: "settlement failed: " + (pr.errorReason || "unknown") }), { status: 402, headers: { ...H, "PAYMENT-RESPONSE": b64(pr) } });
  const caller = "sha256:" + (await sha256hex("x402:" + payer));
  let data;
  if (route.key === "statement") data = { statement: await makeStatement(env, { key_id: "x402:" + payer, caller }, { from: `${month}-01`, to: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 1)).toISOString().slice(0, 10) }) };
  else data = { wallet: payer, caller, note: "your own slice: receipts whose caller is sha256(\"x402:\" + your wallet), newest last, up to 100" };
  // the paid call is itself a cleared read: receipted before the slice is read, so the payer owns a slice from its first call
  const rw = await writeReceipt(env, "allooloo", { subject: url.hostname + url.pathname, subject_type: route.key === "statement" ? "rco-statement" : "rco-slice", market: null,
    rule_version: `rco-door ${env.VERSION} · x402 ${route.key} $${usd} · ${req.asset === OUSD.asset ? "OUSD" : "USDC"} on Base · tx ${tx}`, cleared_at: new Date().toISOString(), answer_hash: "sha256:" + (await sha256hex(canon(data))) }, caller);
  const receipt = rw.structuredContent && rw.structuredContent.receipt;
  if (route.key === "api") { const { results } = await env.DB.prepare("SELECT * FROM receipts WHERE caller = ?1 ORDER BY seq DESC LIMIT 100").bind(caller).all(); data.receipts = results.reverse().map(PUBLIC); }
  return new Response(JSON.stringify({ data, receipt: receipt ? { id: receipt.id, verify: `${ORIGIN}/receipts/${receipt.id}` } : { status: "not written", error: rw.structuredContent }, payment: pr }, null, 1),
    { status: 200, headers: { ...H, "PAYMENT-RESPONSE": b64(pr), "X-PAYMENT-RESPONSE": b64(pr), ...(receipt ? { "X-RCO-Receipt-Id": receipt.id } : {}) } });
}
export const API_PATHS = Object.keys(ROUTES);
