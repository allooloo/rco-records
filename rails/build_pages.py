r"""build_pages.py — RCO-MOVE (Allooloo build memo v1.0): writes public/*.html for rco-records.ai. Operator Allooloo Technologies Corp.; no office
name, no GSC name; no statistics (§2). The Worker fills {{version}} and {{as_of}}. Run: python -I rails\build_pages.py (from DOOR)."""
import os, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
ORIGIN, DOOR = 'https://rco-records.ai', 'https://mcp.rco-records.ai/mcp'
REPO = 'https://github.com/allooloo/rco-records'
OP, OP_URL, CONTACT = 'Allooloo Technologies Corp.', 'https://allooloo.ai', 'developers@allooloo.ai'
AUD = True   # RCO-03 (2026-10-30): the auditors page is live
NAV = [('/#what', 'What RCO is'), ('/#spec', 'Receipt v1'), ('/#verify', 'Verify')] + ([('/auditors', 'Auditors')] if AUD else [])
FOOT = [(DOOR, 'Door'), ('/.well-known/agent-card.json', 'Agent Card'), ('/.well-known/jwks.json', 'Keyring'), ('/llms.txt', 'llms.txt'), (REPO, 'Spec + verify (MIT)'),
        *([('/auditors', 'Auditors')] if AUD else []), ('/status', 'Status'), ('/terms', 'Terms of Use'), ('/privacy', 'Privacy'), ('/security', 'Report a Security Issue'), ('/no-cookies', 'No cookies')]
MOON = '<svg class="gi i-moon" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg>'
SUN = '<svg class="gi i-sun" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>'

def shell(path, title, desc, body, hero=None):
    canon = ORIGIN + (path if path != '/' else '/')
    nav = ''.join(f'<a href="{h}">{t}</a>' for h, t in NAV)
    foot = '\n    <span class="footer-sep">·</span>\n    '.join(f'<a href="{h}">{t}</a>' for h, t in FOOT)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}" />
<meta property="og:title" content="{html.escape(title)}" />
<meta property="og:description" content="{html.escape(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="{canon}" />
<meta property="og:image" content="{ORIGIN}/icon-512.png" />
<meta name="theme-color" content="#14213D" />
<link rel="canonical" href="{canon}" />
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
<link rel="alternate" type="application/json" href="/.well-known/agent-card.json" title="Agent Card" />
<link rel="stylesheet" href="/styles.css" />
<script src="/chrome.js" defer></script>
</head>
<body>

<header class="gh"><div class="gh-in"><a href="/" class="gh-brand" aria-label="RCO Records — home"><img src="/favicon.svg" alt="" class="brand-signet" width="28" height="28" /><span class="brand-mark">RCO Records</span></a><a class="gh-entity" href="{OP_URL}/" rel="noopener">{OP}</a><nav class="gh-nav" aria-label="Primary">{nav}</nav><div class="gh-act"><button class="gh-theme" id="gh-theme" type="button" aria-label="Light or dark" aria-pressed="false">{MOON}{SUN}</button><a class="g-btn g-btn-p gh-pill" href="{DOOR}">Door →</a></div></div></header>
{hero or ''}
<main id="main">
{body}
</main>

<footer class="footer">
  <div class="footer-bottom">
    <span class="entity-line entity-line-footer">© 2026 <a href="{OP_URL}/" rel="noopener">{OP}</a></span>
    <span class="footer-sep">·</span>
    <span>Surface {{{{version}}}} · as of {{{{as_of}}}}</span>
    <span class="footer-sep">·</span>
    {foot}
  </div>
</footer>

</body>
</html>
'''

def sec(sid, eyebrow, h2, inner, dark=False):
    return f'''<section id="{sid}" class="section{' section-dark' if dark else ''}">
  <div class="sec-inner">
    <div class="sec-eyebrow">{eyebrow}</div>
    <h2 class="sec-h2">{h2}</h2>
{inner}
  </div>
</section>
'''
P = lambda s: f'    <div class="sec-prose"><p>{s}</p></div>'
UL = lambda items: '    <ul class="line-list">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'
def TABLE(head, rows):
    th = ''.join(f'<th>{h}</th>' for h in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'    <div class="table-wrap"><table class="rec-table"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'

SPEC = [('<code>v</code>', '1'),
        ('<code>id</code>', '<code>rco:</code> + 20-char base32 of the first 100 bits of <code>hash</code>. Derived, never assigned.'),
        ('<code>seq</code>', 'Monotonic integer across the whole chain.'),
        ('<code>writer</code>', 'The gate that wrote it (<code>allooloo</code>).'),
        ('<code>caller</code>', 'Who asked: a customer key id, or an x402 wallet handle. Stored as sha256 of the value. Empty when unknown.'),
        ('<code>subject</code>', 'What was read: the identifier (ISIN, LEI, …).'),
        ('<code>subject_type</code>', '<code>isin</code> | <code>lei</code> | <code>gtin</code> | … — open list. Replaces the v0 <code>gtin</code> field.'),
        ('<code>market</code>', 'ISO country or exchange code of the read.'),
        ('<code>rule_version</code>', 'Version of the rule set the gate cleared under.'),
        ('<code>cleared_at</code>', 'RFC 3339 UTC, seconds.'),
        ('<code>answer_hash</code>', 'sha256 of the canonical answer bytes the agent received.'),
        ('<code>prev_hash</code>', 'hash of the previous receipt (seq − 1).'),
        ('<code>hash</code>', 'sha256 over the canonical receipt without <code>hash</code>, <code>sig</code> (and <code>id</code>, which is derived from it).'),
        ('<code>sig</code>', 'Ed25519 over <code>hash</code>, by <code>kid</code>.'),
        ('<code>kid</code>', 'Key id, resolvable at <a href="/.well-known/jwks.json">/.well-known/jwks.json</a>.')]

def index():
    hero = f'''<header class="hero">
  <div class="hero-inner">
    <div class="hero-eyebrow">ALLOOLOO  ·  RECORD OF CLEARED ORDERS  ·  AS OF {{{{as_of}}}}</div>
    <h1 class="hero-h1">RCO — the record of what the agent relied on.</h1>
    <p class="hero-p">Every read, receipted. Every answer the Allooloo record gives a regulated agent is receipted: one signed receipt per cleared read, chained to the one before, verifiable by anyone against a published key. The receipt is the agent's alibi.</p>
  </div>
</header>'''
    body = sec('what', '§1 WHAT RCO IS', 'One receipt per cleared read', '\n'.join([
        P('RCO — the Record of Cleared Orders — is the record of what an AI agent relied on. When an Allooloo gate clears a read, it writes one receipt to this chain: what was read, in which market, under which rule version, when, and the hash of the answer the agent received. The receipt is signed by Allooloo and chained to the one before it.'),
        UL([f'Door: <a href="{DOOR}">{DOOR}</a> — Model Context Protocol (MCP), streamable HTTP, stateless, JSON-RPC 2.0, typed errors.',
            '<code>write_receipt</code> — called by the clearing gate; one bearer token per writer; returns the receipt.',
            '<code>verify_receipt</code> — public; by id; returns the receipt and the verification result.',
            f'Operator: {OP}. One writer: Allooloo\'s gates.'])]), dark=True) + \
        sec('spec', '§2 RECEIPT V1 — THE FROZEN SPEC', 'Canonical JSON, keys sorted, UTF-8, no whitespace', '\n'.join([
            P('One receipt per cleared read; writes are idempotent on (<code>writer</code>, <code>subject</code>, <code>subject_type</code>, <code>market</code>, <code>rule_version</code>, <code>cleared_at</code>, <code>answer_hash</code>). Target size under 600 bytes. Fields are only ever added, never renamed or removed; unknown fields are ignored by readers.'),
            TABLE(['Field', 'Meaning'], SPEC)])) + \
        sec('verify', '§3 VERIFY', 'verify(receipt, jwks) is a pure function', '\n'.join([
            P(f'Recompute <code>id</code> and <code>hash</code>, check <code>sig</code> against <code>kid</code>. A receipt verifies forever without asking Allooloo anything. Reference implementations in TypeScript, Python and Go, and the spec, under the MIT licence: <a href="{REPO}">{REPO.replace("https://", "")}</a>.'),
            UL([f'<code>{ORIGIN}/receipts/{{id}}</code> — the same answer as <code>verify_receipt</code>, over GET, for any client.',
                'Keyring: <a href="/.well-known/jwks.json">/.well-known/jwks.json</a> — <code>rco-allooloo-2026-10</code> (signing), and the two historical keys the v0 receipts name.',
                *(['Auditors: <a href="/auditors">how to verify, where the chain tip is, what a statement looks like</a>.'] if AUD else [])])]), dark=True) + \
        sec('history', '§4 HISTORY (V0)', 'The receipts before 2026-10-29 keep their bytes', '\n'.join([
            P('Receipts written before 2026-10-29 are version 0: <code>{decision_id, gtin, market, actor_class, rule_version, cleared_at, writer, prev_hash, hash, sig, kid}</code>, hash over the canonical JSON of <code>{actor_class, cleared_at, decision_id, gtin, market, prev_hash, rule_version, writer}</code>. Their bytes and field names are kept forever — the chain hashes over them. Version 1 starts at the first receipt written under Allooloo\'s key, chained to the last v0 hash: one chain.')]))
    return shell('/', 'RCO Records — the record of what the agent relied on', 'RCO — the Record of Cleared Orders. Every read, receipted: one signed receipt per cleared read, chained, verifiable by anyone against a published key. Operated by Allooloo Technologies Corp.', body, hero)

def plain(path, title, eyebrow, items, desc):
    body = sec('page', eyebrow, title, '\n'.join(items), dark=True)
    return shell(path, f'{title} — RCO Records', desc, body)

def auditors():
    body = sec('page', 'AUDITORS', 'Verifying an RCO record', '\n'.join([
        P('There is no auditor door. An auditor needs four things, none of which asks Allooloo for anything: the MIT <code>verify()</code>, the published key, the daily chain tip (RCO Anchor), and the firm\'s own export and statement.'),
        UL([f'<strong>verify()</strong> — TypeScript, Python and Go reference implementations under MIT: <a href="{REPO}">{REPO.replace("https://", "")}</a>. Recompute <code>hash</code> and <code>id</code>, check <code>sig</code> against <code>kid</code>. A pure function.',
            '<strong>The key</strong> — <a href="/.well-known/jwks.json">/.well-known/jwks.json</a>. Signing kid <code>rco-allooloo-2026-10</code>; the historical kids stay so every earlier receipt still verifies.',
            '<strong>The chain tip</strong> — RCO Anchor: after each nightly chain check passes, the day\'s tip (seq, id, hash, time, signature) is written as an anchor file and its sha256 is timestamped on the public OpenTimestamps calendars, outside Allooloo\'s infrastructure. The anchor file and its timestamp proofs are given to a firm or its auditor on request. Walk the firm\'s receipts forward from a verified receipt to an anchored tip: every <code>prev_hash</code> is the hash before it.',
            '<strong>The firm\'s export</strong> — each night, the day\'s receipts for the firm\'s customer key land in the firm\'s own bucket as JSON Lines, with a manifest signed by Allooloo: key id, day, first seq, last seq, day tip, the sha256 of the file. The firm holds it; Allooloo cannot change it after the fact.',
            '<strong>The statement</strong> — monthly, and on demand: the period, the count, first and last seq, a digest over the slice\'s receipt hashes in seq order, the chain tip at issue, signed by Allooloo. Recompute the digest from the export and check the signature with <code>verify()</code>\'s key.',
            '<strong>Read access</strong> — a firm can issue its auditor a read-only sub-key on its own slice (<code>issue_auditor_key</code>); the sub-key can list the slice and pull statements, nothing else.']),
        P('What a statement looks like:'),
        '    <div class="sec-prose"><pre><code>{ "type": "rco-statement", "v": 1, "issuer": "Allooloo Technologies Corp.", "key_id": "k…", "caller": "sha256:…",\n  "period": { "from": "2026-10-01", "to": "2026-11-01" },\n  "receipts": { "count": …, "first_seq": …, "last_seq": …, "first_id": "rco:…", "last_id": "rco:…", "slice_digest": "sha256:…" },\n  "chain_tip_at_issue": { "seq": …, "hash": "sha256:…" }, "issued_at": "…", "kid": "rco-allooloo-2026-10",\n  "id": "rcs:…", "hash": "sha256:…", "sig": "…" }</code></pre></div>',
        P('The statement\'s <code>hash</code> is sha256 over its canonical JSON without <code>id</code>, <code>hash</code> and <code>sig</code>; <code>sig</code> is Ed25519 over the hash string — the same rule as a receipt.')]), dark=True)
    return shell('/auditors', 'Auditors — RCO Records', 'How an auditor verifies RCO receipts: the MIT verify(), the published key, the daily chain tip, and the firm\'s own export and statement. A page, not a door.', body)

PAGES = {
    'auditors.html': auditors,
    'index.html': index,
    'status.html': lambda: plain('/status', 'Status', 'STATUS', [
        P('The door and its kit. Surface version {{version}} · as of {{as_of}}. Live reads: <a href="/health.json">/health.json</a> (the surface, the store binding, the export job) and <a href="https://mcp.rco-records.ai/health.json">mcp.rco-records.ai/health.json</a> (the door).'),
        UL([f'Door: <a href="{DOOR}">{DOOR}</a> — GET answers the server line; POST takes JSON-RPC 2.0 (initialize, tools/list, tools/call).',
            'Keyring: <a href="/.well-known/jwks.json">/.well-known/jwks.json</a>.',
            'Old names: rco-a2a.ai and mcp.rco-a2a.ai answer with permanent 301s to these hosts; MCP POST on mcp.rco-a2a.ai/mcp is answered as an alias.',
            'No statistics are published on any RCO surface.', 'If a read is red, it is red.'])], 'Status of the RCO Records door and kit.'),
    'terms.html': lambda: plain('/terms', 'Terms of Use', 'TERMS', [
        P(f'rco-records.ai and its door are operated by {OP}. The receipt specification (v1) and the reference verify() are licensed under MIT at <a href="{REPO}">{REPO.replace("https://", "")}</a>. Nothing else is licensed: the chain, keys, door and Register are operated, not licensed.'),
        UL(['verify_receipt and the verify URL are public and free.', 'write_receipt is for Allooloo\'s gates only, by bearer token.', 'A receipt states what a gate cleared and when; it is not advice, a recommendation, or a statement about the content of the answer beyond its hash.',
            f'Questions: <a href="mailto:{CONTACT}">{CONTACT}</a>.'])], 'Terms of use for RCO Records.'),
    'privacy.html': lambda: plain('/privacy', 'Privacy', 'PRIVACY', [
        P('No cookies, no trackers, no third-party scripts. The door stores receipts; a receipt holds no personal data: <code>caller</code> is the sha256 of a customer key id or an x402 wallet handle, or empty.'),
        UL(['Requests are served by Cloudflare; standard request logs are kept by the platform for operation and security.', f'Questions: <a href="mailto:{CONTACT}">{CONTACT}</a>.'])], 'Privacy for RCO Records.'),
    'security.html': lambda: plain('/security', 'Report a Security Issue', 'SECURITY', [
        P(f'Report a vulnerability to <a href="mailto:{CONTACT}">{CONTACT}</a>. Machine-readable: <a href="/.well-known/security.txt">/.well-known/security.txt</a>.'),
        UL(['The receipts table is append-only at the engine: UPDATE and DELETE are refused by triggers.', 'Writer tokens are held by the door only as sha256; signing keys sit as Worker secrets.'])], 'Report a security issue to Allooloo.'),
    'no-cookies.html': lambda: plain('/no-cookies', 'No cookies', 'NO COOKIES', [P('This site sets no cookies and uses no local storage beyond the light/dark switch held in the page for the visit.')], 'RCO Records sets no cookies.'),
}

if __name__ == '__main__':
    for name, fn in PAGES.items():
        open(os.path.join(PUB, name), 'w', encoding='utf-8', newline='\n').write(fn())
    open(os.path.join(PUB, 'site.webmanifest'), 'w', encoding='utf-8').write('{ "name": "RCO Records — Record of Cleared Orders", "short_name": "RCO", "icons": [ { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }, { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" } ], "start_url": "/", "display": "browser", "background_color": "#FFFFFF", "theme_color": "#14213D" }\n')
    print('pages:', ', '.join(PAGES))
