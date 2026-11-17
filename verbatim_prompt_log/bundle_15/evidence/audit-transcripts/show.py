import json, sys, collections, re
progs = set(sys.argv[1].split(','))
pat = re.compile(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else None
maxlen = int(sys.argv[3]) if len(sys.argv) > 3 else 300
seen = collections.OrderedDict()
for line in open('simple_cmds.jsonl'):
    d = json.loads(line)
    if d['prog'] not in progs: continue
    if pat and not pat.search(d['sc']): continue
    key = re.sub(r'\s+', ' ', d['sc'])
    if key not in seen: seen[key] = []
    seen[key].append((d['ts'][:16], d['run'][:6], d['agent'][:28]))
for k, v in seen.items():
    ag = sorted(set(x[2] for x in v))
    print(f"[{len(v)}x {v[0][0]}..{v[-1][0]} {v[0][1]} {','.join(ag)[:120]}] {k[:maxlen]}")
print('distinct', len(seen))
