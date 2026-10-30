// kit.js — the machine kit of rco-records.ai (RCO-MOVE, 2026-10-29), generated so the words are typed once. Link relations only. No statistics on any
// path (§2: all RCO statistics are private at all times). Operator: Allooloo Technologies Corp.
export const ORIGIN = "https://rco-records.ai", DOOR = "https://mcp.rco-records.ai/mcp", OPERATOR = "Allooloo Technologies Corp.", OPERATOR_URL = "https://allooloo.ai";
export const CONTACT = "developers@allooloo.ai";
export const LINE = "RCO — the record of what the agent relied on.", AGENT_LINE = "every read, receipted.";
export const DEFINITION = "RCO — the Record of Cleared Orders — is the record of what an AI agent relied on. Every answer the Allooloo record gives a regulated agent is receipted: one signed receipt per cleared read, chained to the one before, verifiable by anyone against a published key. Receipt v1: {v, id, seq, writer, caller, subject, subject_type, market, rule_version, cleared_at, answer_hash, prev_hash, hash, sig, kid}. Tools: write_receipt (bearer token per writer), verify_receipt (public).";

// The keyring: Allooloo's signing key, and the two historical keys the v0 receipts name (verification only; neither signs anything here).
export const JWKS = {
  keys: [
    { kty: "OKP", crv: "Ed25519", x: "2M_N1DBUB4-suzGB_6yrnHe6LE-7y6KVPqAEN8jXyvE", kid: "rco-allooloo-2026-10", use: "sig", alg: "EdDSA" },
    { kty: "OKP", crv: "Ed25519", x: "82m8hAkBSciy22tOI-o0k2w-aaD8l51gwz9DTv5Yg30", kid: "rco-office-2026-10", use: "sig", alg: "EdDSA", status: "historical — signed v0 receipts 2026-10-29; not a signing key on this door" },
    { kty: "EC", crv: "P-256", x: "a_XFfybTdOVjxBfc3umzMbGQkj5X6QS1AWCo0BvGf5s", y: "AOtaFX_7gGwdWJFwInw_q3M_S4ia8nNxyhhqxhglhak", kid: "gsc-rco-2026-08", use: "sig", alg: "ES256", status: "historical — names the ledger-era v0 receipts (sig null); not a signing key on this door" },
  ],
};

export const LINK = [
  `<${ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`,
  `<${ORIGIN}/.well-known/agent-card.json>; rel="agent-card"; type="application/json"`,
  `<${ORIGIN}/.well-known/jwks.json>; rel="jwks"; type="application/json"`,
  `<${ORIGIN}/.well-known/mcp.json>; rel="mcp-server"; type="application/json"`,
  `<${ORIGIN}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
].join(", ");

export const SKILLS = [
  { id: "write_receipt", name: "write_receipt", description: "Write one chained, signed v1 receipt for a cleared read (bearer token per writer); returns the receipt.", tags: ["receipt", "write", "authenticated"] },
  { id: "verify_receipt", name: "verify_receipt", description: "Return one receipt by id (rco:… or a v0 dec_…) with the verification result and the key that checks it. Public.", tags: ["receipt", "verify", "public"] },
];

export const agentCard = (version, skills = SKILLS) => ({
  protocolVersion: "0.3.0", kind: "agent-card", name: "RCO Records — Record of Cleared Orders",
  description: DEFINITION, url: DOOR, version, documentationUrl: `${ORIGIN}/llms.txt`, iconUrl: `${ORIGIN}/icon-512.png`,
  provider: { organization: OPERATOR, url: OPERATOR_URL }, contact: `mailto:${CONTACT}`,
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  securitySchemes: { none: { type: "noAuth", description: "verify_receipt needs no authentication" }, writer: { type: "httpAuth", scheme: "bearer", description: "write_receipt: one bearer token per writer, issued by Allooloo" } },
  defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
  skills: skills.map((s) => ({ ...s, inputModes: ["application/json"], outputModes: ["application/json"] })),
  supportedInterfaces: [{ url: DOOR, protocolBinding: "MCP", protocolVersion: "2025-06-18", transport: "streamable-http" }],
  keyring: `${ORIGIN}/.well-known/jwks.json`, kid: "rco-allooloo-2026-10",
});

export const mcpCard = (version, tools) => ({
  serverInfo: { name: "rco-records", title: "RCO Records — Record of Cleared Orders", version }, transport: { type: "streamable-http", endpoint: DOOR }, capabilities: { tools: {} },
  tools: tools.map((t) => ({ name: t.name, description: t.description, annotations: t.annotations })),
  authentication: { verify_receipt: "none", write_receipt: "Authorization: Bearer <writer token>" },
  operator: OPERATOR, surface: ORIGIN, agent_card: `${ORIGIN}/.well-known/agent-card.json`, keyring: `${ORIGIN}/.well-known/jwks.json`, verify: `${ORIGIN}/receipts/{id}`, spec: `${ORIGIN}/#spec`,
});

export const apiCatalog = () => ({ linkset: [{ anchor: DOOR, "service-desc": [{ href: `${ORIGIN}/.well-known/mcp.json`, type: "application/json" }], "service-doc": [{ href: `${ORIGIN}/llms.txt`, type: "text/plain" }], status: [{ href: `${ORIGIN}/health.json` }], "service-meta": [{ href: `${ORIGIN}/.well-known/agent-card.json`, type: "application/json" }] }] });

export const llms = (version, extra = "") => `# RCO Records — Record of Cleared Orders

> ${LINE} Agent line: ${AGENT_LINE}

${DEFINITION}

Operator: ${OPERATOR} · ${OPERATOR_URL} · Surface: ${ORIGIN} · Door: ${DOOR} · Surface version ${version}

## Receipt v1 (frozen)
Canonical JSON: keys sorted, UTF-8, no whitespace. One receipt per cleared read; idempotent on (writer, subject, subject_type, market, rule_version, cleared_at, answer_hash).
- v — 1
- id — "rco:" + 20-char base32 (RFC 4648, lowercase) of the first 100 bits of hash. Derived, never assigned.
- seq — monotonic integer across the whole chain.
- writer — the gate that wrote it.
- caller — who asked: "sha256:" + hex sha256 of a customer key id or an x402 wallet handle. Empty when unknown.
- subject · subject_type — what was read (isin · lei · gtin · ticker · cmr · … — open list).
- market — ISO country or exchange code of the read.
- rule_version — the rule set the gate cleared under.
- cleared_at — RFC 3339 UTC, seconds.
- answer_hash — "sha256:" + hex sha256 of the canonical answer bytes the agent received.
- prev_hash · hash — hash = "sha256:" + hex sha256 over the canonical receipt without hash, sig and id; prev_hash = the previous receipt's hash.
- sig · kid — Ed25519 over the UTF-8 bytes of the hash string (base64url), key kid on ${ORIGIN}/.well-known/jwks.json.
Fields are only ever added, never renamed or removed. Unknown fields are ignored by readers.

## History (v0)
Receipts written before 2026-10-29 keep their bytes and field names: {decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}; hash over the canonical JSON of {actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}. Ledger-era rows carry kid gsc-rco-2026-08 and sig null.

## verify(receipt, jwks)
A pure function: recompute hash (and id for v1), check sig against kid. Reference implementations in TypeScript, Python and Go under MIT: https://github.com/allooloo/rco-records

## Tools (MCP, streamable HTTP, stateless)
- write_receipt — Authorization: Bearer <writer token>; returns the receipt.
- verify_receipt — public; argument id (rco:… or dec_…); returns the receipt and the verification result.
${extra}
## Verify URL
${ORIGIN}/receipts/{id} — the same answer as verify_receipt, over GET.

## Machine kit
${ORIGIN}/.well-known/agent-card.json · /.well-known/mcp.json · /.well-known/jwks.json · /.well-known/api-catalog · /.well-known/security.txt · /health.json · /robots.txt · /sitemap.xml

## Errors
Typed, in the tool result: not_authorised · invalid_receipt · invalid_id · not_found · store_unavailable · store_error · chain_contention.
`;

export const robots = () => `# rco-records.ai — Record of Cleared Orders · Operator: ${OPERATOR}
# Open to all agents. Machine register: ${ORIGIN}/llms.txt

User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
Content-Signal: search=yes, ai-input=yes, ai-train=yes

# LLM discovery:  ${ORIGIN}/llms.txt
# Agent Card:     ${ORIGIN}/.well-known/agent-card.json
# MCP:            ${ORIGIN}/.well-known/mcp.json → ${DOOR}
# Keyring:        ${ORIGIN}/.well-known/jwks.json
`;

export const securityTxt = () => `Contact: mailto:${CONTACT}
Expires: 2027-10-29T00:00:00.000Z
Canonical: ${ORIGIN}/.well-known/security.txt
Preferred-Languages: en
Policy: ${ORIGIN}/security
`;

export const PAGE_PATHS = ["/", "/status", "/terms", "/privacy", "/security", "/no-cookies"];
export const sitemap = (paths = PAGE_PATHS) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...paths, "/llms.txt"].map((p) => `  <url><loc>${ORIGIN}${p}</loc></url>`).join("\n")}
</urlset>
`;
