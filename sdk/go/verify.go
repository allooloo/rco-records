// Package rco is the reference verify() for RCO receipts (MIT). A pure function over (receipt, jwks): recompute hash (and id for v1), check sig
// against kid. Standard library only. A receipt verifies forever without asking Allooloo anything.
package rco

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

var V0Fields = []string{"actor_class", "cleared_at", "decision_id", "gtin", "market", "prev_hash", "rule_version", "writer"}
var V1Fields = []string{"answer_hash", "caller", "cleared_at", "kid", "market", "prev_hash", "rule_version", "seq", "subject", "subject_type", "v", "writer"}

const Genesis = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

type JWK struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Kid string `json:"kid"`
}

type JWKS struct {
	Keys []JWK `json:"keys"`
}

// Receipt is the receipt as served. Decode it with json.Decoder.UseNumber so seq keeps its integer form.
type Receipt map[string]any

func (r Receipt) str(k string) string { s, _ := r[k].(string); return s }

func (r Receipt) isV1() bool {
	switch v := r["v"].(type) {
	case json.Number:
		return v.String() == "1"
	case float64:
		return v == 1
	}
	return false
}

// Canonical is the canonical JSON the hash covers: the version's fields, keys sorted, no whitespace, UTF-8, nulls kept.
func Canonical(r Receipt) []byte {
	fields := V0Fields
	if r.isV1() {
		fields = V1Fields
	}
	keys := append([]string(nil), fields...)
	sort.Strings(keys)
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, _ := json.Marshal(k)
		b.Write(kb)
		b.WriteByte(':')
		v, ok := r[k]
		if !ok {
			v = nil
		}
		var vb bytes.Buffer
		enc := json.NewEncoder(&vb)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(v)
		b.Write(bytes.TrimRight(vb.Bytes(), "\n"))
	}
	b.WriteByte('}')
	return b.Bytes()
}

func HashOf(r Receipt) string {
	s := sha256.Sum256(Canonical(r))
	return "sha256:" + hex.EncodeToString(s[:])
}

func IDOf(hash string) string {
	d, _ := hex.DecodeString(strings.TrimPrefix(hash, "sha256:"))
	return "rco:" + strings.ToLower(base32.StdEncoding.EncodeToString(d[:13]))[:20]
}

// SigOK returns nil when the receipt carries no signature (ledger-era v0).
func SigOK(r Receipt, jwks JWKS) *bool {
	sig := r.str("sig")
	if sig == "" {
		return nil
	}
	f := false
	for _, k := range jwks.Keys {
		if k.Kid == r.str("kid") && k.Crv == "Ed25519" {
			pub, e1 := base64.RawURLEncoding.DecodeString(k.X)
			s, e2 := base64.RawURLEncoding.DecodeString(sig)
			if e1 != nil || e2 != nil || len(pub) != ed25519.PublicKeySize {
				return &f
			}
			ok := ed25519.Verify(ed25519.PublicKey(pub), []byte(r.str("hash")), s)
			return &ok
		}
	}
	return &f
}

type Result struct {
	Version    int    `json:"version"`
	Valid      bool   `json:"valid"`
	HashOK     bool   `json:"hash_ok"`
	IDOK       *bool  `json:"id_ok"`
	SigOK      *bool  `json:"sig_ok"`
	Recomputed string `json:"recomputed"`
}

func Verify(r Receipt, jwks JWKS) Result {
	res := Result{Recomputed: HashOf(r)}
	res.HashOK = res.Recomputed == r.str("hash")
	if r.isV1() {
		res.Version = 1
		ok := IDOf(r.str("hash")) == r.str("id")
		res.IDOK = &ok
	}
	res.SigOK = SigOK(r, jwks)
	res.Valid = res.HashOK && (res.IDOK == nil || *res.IDOK) && (res.SigOK == nil || *res.SigOK)
	return res
}
