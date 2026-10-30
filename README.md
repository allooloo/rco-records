# RCO Records — Record of Cleared Orders

**RCO — the record of what the agent relied on.** Every read, receipted.

Every answer the Allooloo record gives a regulated agent is receipted: one signed receipt per cleared read, chained to the one before, verifiable by anyone against a published key. The receipt is the agent's alibi.

- Page, spec, verify: https://rco-records.ai/
- Door (MCP, streamable HTTP): https://mcp.rco-records.ai/mcp — `write_receipt` (bearer token per writer), `verify_receipt` (public)
- Keyring: https://rco-records.ai/.well-known/jwks.json
- Verify URL: `https://rco-records.ai/receipts/{id}`

Operator: Allooloo Technologies Corp. — https://allooloo.ai

## What is in this repository

| Path | What |
|---|---|
| `SPEC.md` | Receipt v1 — the frozen spec — and the v0 history format |
| `sdk/typescript/verify.ts` | reference `verify()`, `verifyChain()`, `carry()` — WebCrypto only |
| `sdk/python/rco_verify.py` | reference `verify()`, `verify_chain()` — needs `cryptography` |
| `sdk/go/verify.go` | reference `Verify()` — standard library only |
| `worker/`, `public/`, `wrangler.toml`, `schema.sql`, `rails/` | the door as it runs (Cloudflare Worker + D1) |

The spec and the reference `verify()` ship under MIT (`LICENSE`). Nothing else is licensed: the chain, the keys, the door and the Register are operated by Allooloo, not licensed.

## Verify a receipt

```bash
node sdk/typescript/cli.ts rco:4xvpzgxxmno5bfxxmv5h
```

```bash
python sdk/python/rco_verify.py rco:4xvpzgxxmno5bfxxmv5h
```

`verify(receipt, jwks)` is a pure function: recompute `hash` (and `id` for v1), check `sig` against `kid`. A receipt verifies forever without asking Allooloo anything.
