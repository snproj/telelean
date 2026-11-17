import json, sys, collections
p = sys.argv[1]
types = collections.Counter()
first = {}
keys = collections.defaultdict(set)
with open(p) as f:
    for i, line in enumerate(f):
        try:
            d = json.loads(line)
        except Exception as e:
            types['BADJSON'] += 1
            continue
        t = d.get('type')
        types[t] += 1
        keys[t].update(d.keys())
        if t not in first:
            first[t] = (i, d.get('timestamp'))
for t, c in types.most_common():
    print(t, c, first.get(t), sorted(keys[t])[:40])
