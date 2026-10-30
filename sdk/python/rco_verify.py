"""rco_verify — the reference verify() for RCO receipts (MIT). A pure function: recompute hash (and id for v1), check sig against kid.
Needs `cryptography` for Ed25519. A receipt verifies forever without asking Allooloo anything.

    from rco_verify import verify
    result = verify(receipt, jwks)   # {"valid": bool, "hash_ok": bool, "id_ok": bool|None, "sig_ok": bool|None, ...}
"""
import base64, hashlib, json

V0_FIELDS = ["actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"]
V1_FIELDS = ["answer_hash", "caller", "cleared_at", "kid", "market", "prev_hash", "rule_version", "seq", "subject", "subject_type", "v", "writer"]
GENESIS = "sha256:" + "0" * 64


def canonical(receipt: dict) -> bytes:
    fields = V1_FIELDS if receipt.get("v") == 1 else V0_FIELDS
    return json.dumps({k: receipt.get(k) for k in fields}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def hash_of(receipt: dict) -> str:
    return "sha256:" + hashlib.sha256(canonical(receipt)).hexdigest()


def id_of(hash_: str) -> str:
    digest = bytes.fromhex(hash_.split(":", 1)[1])
    return "rco:" + base64.b32encode(digest[:13]).decode("ascii").lower()[:20]


def _b64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sig_ok(receipt: dict, jwks: dict):
    """True / False, or None when the receipt carries no signature (ledger-era v0)."""
    if not receipt.get("sig"):
        return None
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == receipt.get("kid")), None)
    if not key or key.get("crv") != "Ed25519":
        return False
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.exceptions import InvalidSignature
    try:
        Ed25519PublicKey.from_public_bytes(_b64u(key["x"])).verify(_b64u(receipt["sig"]), receipt["hash"].encode("utf-8"))
        return True
    except (InvalidSignature, ValueError):
        return False


def verify(receipt: dict, jwks: dict) -> dict:
    recomputed = hash_of(receipt)
    out = {"version": 1 if receipt.get("v") == 1 else 0, "hash_ok": recomputed == receipt.get("hash"), "recomputed": recomputed,
           "id_ok": (id_of(receipt["hash"]) == receipt.get("id")) if receipt.get("v") == 1 else None, "sig_ok": sig_ok(receipt, jwks)}
    out["valid"] = out["hash_ok"] and out["id_ok"] is not False and out["sig_ok"] is not False
    return out


def verify_chain(receipts, jwks, prev=None):
    """Walk receipts in seq order: each verifies and each prev_hash is the previous hash. Returns (ok, first_break_or_None, tip_hash)."""
    for r in receipts:
        v = verify(r, jwks)
        if not v["valid"]:
            return False, {"at": r.get("id") or r.get("decision_id"), "why": v}, prev
        if prev is not None and r.get("prev_hash") != prev:
            return False, {"at": r.get("id") or r.get("decision_id"), "why": "prev_hash does not match the previous hash"}, prev
        prev = r["hash"]
    return True, None, prev


if __name__ == "__main__":
    import sys, urllib.request
    rid = sys.argv[1]
    base = sys.argv[2] if len(sys.argv) > 2 else "https://rco-records.ai"
    get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"user-agent": "rco-verify/1.0 (python)"})))
    body = get(f"{base}/receipts/{rid}")
    print(json.dumps(verify(body["receipt"], get(f"{base}/.well-known/jwks.json")), indent=1))
