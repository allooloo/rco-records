r"""rco_keys.py — RCO-03: the Register's admin command lines (Allooloo build memo v1.0 §6). The admin token is read in-process from
C:\ALLOOLOO\AGENT KEYS\rco-admin.txt; an issued key value is written to C:\ALLOOLOO\AGENT KEYS\rco-customer-<key id>.txt and never printed.

  python -I rails\rco_keys.py issue "<firm name>" [--demo]      issue a customer key (or the sales demo key)
  python -I rails\rco_keys.py list                                list keys (ids, names, kinds, export, revoked) — no values
  python -I rails\rco_keys.py revoke <key id>                     revoke a key (and with it any auditor sub-key on it)
  python -I rails\rco_keys.py export <key id> <bucket> <CRED> [region] [prefix]   point a key's nightly export at the firm's bucket;
                                                                  the credential is two Worker secrets <CRED>_KEY_ID / <CRED>_SECRET
  python -I rails\rco_keys.py statements <YYYY-MM> [key id]       generate signed statements (all keys, or one)
"""
import json, os, sys, urllib.request

DOOR = 'https://mcp.rco-records.ai'
KEYS = r'C:\ALLOOLOO\AGENT KEYS'


def call(method, path, body=None):
    tok = open(os.path.join(KEYS, 'rco-admin.txt'), encoding='utf-8-sig').read().strip()
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(DOOR + path, data=data, method=method, headers={'authorization': 'Bearer ' + tok, 'content-type': 'application/json', 'user-agent': 'Allooloo rco-admin'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def main(a):
    if not a:
        raise SystemExit(__doc__)
    if a[0] == 'issue':
        st, r = call('POST', '/admin/keys', {'name': a[1], 'kind': 'demo' if '--demo' in a else 'customer'})
        if st != 201:
            raise SystemExit(f'issue refused: {st} {r}')
        path = os.path.join(KEYS, f"rco-customer-{r['key_id']}.txt")
        open(path, 'w', encoding='utf-8').write(r.pop('key'))
        print(json.dumps({**r, 'key_written_to': path}, indent=1))
    elif a[0] == 'list':
        print(json.dumps(call('GET', '/admin/keys')[1], indent=1))
    elif a[0] == 'revoke':
        print(json.dumps(call('POST', f'/admin/keys/{a[1]}/revoke', {})[1]))
    elif a[0] == 'export':
        body = {'bucket': a[2], 'cred': a[3]}
        if len(a) > 4: body['region'] = a[4]
        if len(a) > 5: body['prefix'] = a[5]
        print(json.dumps(call('POST', f'/admin/keys/{a[1]}/export', body)[1], indent=1))
    elif a[0] == 'statements':
        body = {'month': a[1], **({'key_id': a[2]} if len(a) > 2 else {})}
        print(json.dumps(call('POST', '/admin/statements', body)[1], indent=1))
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])
