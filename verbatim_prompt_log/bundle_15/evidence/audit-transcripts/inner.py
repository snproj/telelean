import json, sys, glob, collections, os
for d in sorted(glob.glob('/home/zhengyew/.claude/projects/*turn13-live-*') + glob.glob('/home/zhengyew/.claude/projects/-home-zhengyew--config-Code-User-globalStorage-telelean-*')):
    for f in glob.glob(d + '/*.jsonl'):
        req = set(); msgs = set(); tools = collections.Counter(); models = collections.Counter(); types = collections.Counter()
        ts = []; usage = collections.Counter(); cost = None; webish = []
        by_msg = {}
        for line in open(f):
            try: e = json.loads(line)
            except: continue
            types[e.get('type')] += 1
            if e.get('timestamp'): ts.append(e['timestamp'])
            if e.get('type') == 'assistant':
                m = e.get('message') or {}
                if e.get('requestId'): req.add(e['requestId'])
                mid = m.get('id')
                if mid: msgs.add(mid)
                models[m.get('model')] += 1
                u = m.get('usage') or {}
                if mid: by_msg[mid] = u
                for it in m.get('content') or []:
                    if isinstance(it, dict) and it.get('type') == 'tool_use':
                        tools[it.get('name')] += 1
                        if it.get('name') in ('WebFetch', 'WebSearch', 'Bash', 'Task', 'Agent'): webish.append((it.get('name'), json.dumps(it.get('input'))[:200]))
            if e.get('type') == 'result' or 'total_cost_usd' in e:
                cost = e.get('total_cost_usd')
        for u in by_msg.values():
            for k in ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'):
                usage[k] += (u.get(k) or 0)
        name = os.path.basename(d)
        short = [x for x in ('live-normative','live-literal','live-demo-1','live-demo-2','rmwb7zmyeba3937','rmwb8seauc02d67') if x in name][0]
        print(f'== {short}  file={os.path.basename(f)} size={os.path.getsize(f)}')
        print(f'   span {min(ts) if ts else None} .. {max(ts) if ts else None}; requestIds={len(req)} msgIds={len(msgs)} models={dict(models)}')
        print(f'   tools={dict(tools)}; usage(sum over msgIds)={dict(usage)}; types={dict(types)}')
        if webish: print('   NON-FILE TOOLS:', webish)
