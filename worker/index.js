// rco-door — RCO-MOVE (Allooloo build memo v1.0, 2026-10-29). The Record of Cleared Orders under Allooloo Technologies Corp.: one Worker on
// mcp.rco-records.ai (the door) and rco-records.ai (the page, the spec, verify, jwks). D1 store rco-receipts, Allooloo key rco-allooloo-2026-10.
// rco-a2a.ai and mcp.rco-a2a.ai are permanent 301s to the new hosts and never lapse; MCP POST on the old door host is answered as an alias (not a
// redirect) for six months from 2026-10-29, then review (§2). No statistics on any path (§2). Link relations only — no custom headers.
import { handleMcp, verifyReceipt } from "./mcp.js";
import { JWKS, LINK, ORIGIN, DOOR, agentCard, mcpCard, apiCatalog, llms, robots, securityTxt, sitemap, PAGE_PATHS } from "./kit.js";
import { TOOLS } from "./mcp.js";
import { runExport, exportStatus } from "./export.js";
import { REGISTER_TOOLS, registerCall, handleAdmin, exportKeys } from "./register.js";
const EXTRA = { tools: REGISTER_TOOLS, call: registerCall };   // RCO-03: the Register

const NEW_APEX = "rco-records.ai", NEW_DOOR = "mcp.rco-records.ai", OLD_APEX = "rco-a2a.ai", OLD_DOOR = "mcp.rco-a2a.ai";
const PAGES = { "/": "/index.html", "/auditors": "/auditors.html", "/status": "/status.html", "/terms": "/terms.html", "/privacy": "/privacy.html", "/security": "/security.html", "/no-cookies": "/no-cookies.html" };
const KIT = { "/.well-known/agent-card.json": (env) => J(agentCard(env.VERSION)), "/.well-known/mcp.json": (env) => J(mcpCard(env.VERSION, [...TOOLS, ...REGISTER_TOOLS])), "/.well-known/mcp/server-card.json": (env) => J(mcpCard(env.VERSION, [...TOOLS, ...REGISTER_TOOLS])),
  "/.well-known/jwks.json": () => J(JWKS, "public, max-age=3600"), "/.well-known/api-catalog": () => J(apiCatalog(), "public, max-age=3600", "application/linkset+json"),
  "/.well-known/security.txt": () => T(securityTxt()), "/llms.txt": (env) => T(llms(env.VERSION)), "/robots.txt": () => T(robots()), "/sitemap.xml": () => T(sitemap(PAGE_PATHS), "application/xml; charset=utf-8") };
const J = (o, cache = "no-store", ct = "application/json; charset=utf-8") => new Response(JSON.stringify(o, null, 1), { status: 200, headers: { "content-type": ct, "cache-control": cache, "access-control-allow-origin": "*" } });
const T = (s, ct = "text/plain; charset=utf-8") => new Response(s, { status: 200, headers: { "content-type": ct, "cache-control": "public, max-age=300" } });
const notFound = (p) => new Response(JSON.stringify({ error: "not_found", path: p, door: DOOR, page: ORIGIN + "/" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
const wantsMd = (r) => { const a = r.headers.get("accept") || ""; return a.includes("text/markdown") && (a.indexOf("text/markdown") < (a.indexOf("text/html") < 0 ? 1e9 : a.indexOf("text/html"))); };
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function toMarkdown(html) {
  let b = (html.match(/<header class="hero">[\s\S]*?<\/main>/i) || html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  b = b.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, h, t) => `[${strip(t)}](${h.startsWith("/") ? ORIGIN + h : h})`);
  b = b.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, t) => `\n# ${strip(t)}\n`).replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, t) => `\n## ${strip(t)}\n`).replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n### ${strip(t)}\n`);
  b = b.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, t) => `| ${t.replace(/<\/t[dh]>\s*<t[dh][^>]*>/g, " | ").replace(/<[^>]+>/g, "").trim()} |\n`);
  b = b.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, t) => `- ${strip(t)}\n`).replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, t) => `${strip(t)}\n\n`).replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`");
  return strip(b.replace(/\n/g, "\u0000")).replace(/\u0000/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
async function page(env, file, request) {
  const r = await env.ASSETS.fetch(new Request(new URL(request.url).origin + file, { method: "GET", redirect: "manual" }));
  if (r.status !== 200) return notFound(file);
  const html = (await r.text()).replaceAll("{{version}}", env.VERSION).replaceAll("{{as_of}}", env.AS_OF);
  if (wantsMd(request)) return new Response(toMarkdown(html), { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept", "cache-control": "public, max-age=300" } });
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", vary: "Accept", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff" } });
}
const withLink = (res) => { const h = new Headers(res.headers); h.set("link", LINK); return new Response(res.body, { status: res.status, headers: h }); };
const moved = (host, url) => new Response(null, { status: 301, headers: { location: `https://${host}${url.pathname}${url.search}`, "cache-control": "public, max-age=86400" } });

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runExport(env, new Date().toISOString().slice(0, 10))); ctx.waitUntil(exportKeys(env, new Date(Date.now() - 864e5).toISOString().slice(0, 10))); },
  async fetch(request, env) {
    const url = new URL(request.url), host = url.hostname, path = url.pathname.replace(/\/+$/, "") || "/";
    // the old names: permanent 301s; the old MCP door keeps answering POST (and its CORS preflight) as an alias for six months
    if (host === OLD_DOOR) { if (path === "/mcp" && (request.method === "POST" || request.method === "OPTIONS")) return withLink(await handleMcp(request, env, new URL(DOOR), EXTRA)); return moved(NEW_DOOR, url); }
    if (host === OLD_APEX) return moved(NEW_APEX, url);
    if (host === NEW_DOOR) {
      if (path === "/mcp") return withLink(await handleMcp(request, env, url, EXTRA));
      if (path.startsWith("/admin/")) return handleAdmin(request, env, path);
      if (path === "/" || path === "/health.json") return withLink(J({ status: "ok", door: DOOR, page: ORIGIN + "/", tools: [...TOOLS, ...REGISTER_TOOLS].map((t) => t.name), version: env.VERSION, store: env.DB ? "bound" : "not bound", operator: "Allooloo Technologies Corp.", time: new Date().toISOString() }));
      if (KIT[path]) return withLink(KIT[path](env));
      return withLink(notFound(path));
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD, OPTIONS" } });
    if (path === "/mcp") return Response.redirect(DOOR, 308);
    if (KIT[path]) return withLink(KIT[path](env));
    if (path === "/health.json") return withLink(J({ status: "ok", surface: ORIGIN, door: DOOR, version: env.VERSION, store: env.DB ? "bound" : "not bound", export: await exportStatus(env), time: new Date().toISOString() }));
    const m = /^\/receipts\/((?:rco:|rco%3[aA])[a-z2-7]{20}|dec_[0-9a-f]{8,48})$/.exec(path);
    if (m) { const r = await verifyReceipt(env, decodeURIComponent(m[1])); const body = r.structuredContent; return withLink(new Response(JSON.stringify(body, null, 1), { status: r.isError ? (body.code === "not_found" ? 404 : body.code === "store_unavailable" ? 503 : 400) : 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": r.isError ? "no-store" : "public, max-age=31536000, immutable", "access-control-allow-origin": "*" } })); }
    if (PAGES[path]) return withLink(await page(env, PAGES[path], request));
    const a = await env.ASSETS.fetch(request);   // styles, fonts, icons — real 404 otherwise
    return a.status === 200 ? a : withLink(notFound(path));
  },
};

// Standing (2026-10-29): all RCO statistics are private at all times — no count, rate or total on any path of this Worker.
