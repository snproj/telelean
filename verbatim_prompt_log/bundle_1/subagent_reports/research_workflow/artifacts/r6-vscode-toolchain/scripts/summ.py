import json, sys, os, glob
d0 = sys.argv[1]
fields = sys.argv[2:] if len(sys.argv) > 2 else []
for f in sorted(glob.glob(os.path.join(d0, '*.json'))):
    try:
        d = json.load(open(f))
    except Exception as e:
        print(os.path.basename(f), 'ERR', e); continue
    name = d.get('name')
    tags = d.get('dist-tags', {})
    latest = tags.get('latest')
    t = d.get('time', {})
    v = d.get('versions', {}).get(latest, {})
    dep = d.get('deprecated') or v.get('deprecated')
    out = {
        'name': name, 'latest': latest, 'published': t.get(latest),
        'modified': t.get('modified'),
        'engines': v.get('engines'),
        'deprecated': dep,
        'tags': {k: tags[k] for k in tags if k != 'latest'},
    }
    if fields:
        for fl in fields:
            out[fl] = v.get(fl)
    print(json.dumps(out))
