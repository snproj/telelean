import json, glob, os, collections
S='/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
CUT='2026-11-01T02:16:34'
labels={}
for j in glob.glob(S+'/subagents/workflows/*/journal.jsonl'):
    run=os.path.basename(os.path.dirname(j))
    for line in open(j):
        try: d=json.loads(line)
        except: continue
        if d.get('type')=='started': labels[(run,d.get('agentId'))]=d.get('label')
files=[('main','main',S+'.jsonl')]
for f in sorted(glob.glob(S+'/subagents/**/agent-*.jsonl', recursive=True)):
    run=os.path.basename(os.path.dirname(f)); aid=os.path.basename(f)[6:-6]
    lab=labels.get((run,aid)) or json.load(open(f[:-6]+'.meta.json')).get('description','?')
    files.append((run,lab,f))
def turn(ts):
    if ts<'2026-11-10T16:00': return '9'
    if ts<'2026-11-10T16:38:16': return '10-12'
    if ts<'2026-11-13T12:36': return '13-14'
    return '15'
tot=collections.defaultdict(lambda: collections.Counter())
per=[]
for run,lab,f in files:
    msgs={}; reqs=set(); apireq=0; models=collections.Counter()
    for line in open(f):
        try: e=json.loads(line)
        except: continue
        ts=e.get('timestamp') or ''
        if e.get('type')=='api-request' and ts>=CUT: apireq+=1
        if e.get('type')!='assistant' or ts<CUT: continue
        m=e.get('message') or {}
        mid=m.get('id'); rid=e.get('requestId')
        if rid: reqs.add(rid)
        if mid and m.get('usage'):
            msgs[mid]=(m.get('usage'), ts, m.get('model'))
    c=collections.Counter()
    for mid,(u,ts,model) in msgs.items():
        models[model]+=1
        for k in ('input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'):
            c[k]+=u.get(k) or 0
        c['msgs']+=1
        t=turn(ts)
        for k in ('input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'):
            tot[t][k]+=u.get(k) or 0
        tot[t]['msgs']+=1
    if not msgs and not apireq: continue
    per.append((run,lab,len(reqs),apireq,dict(c),dict(models)))
    tot['ALL']['requests']+=len(reqs); tot['ALL']['api-request-records']+=apireq
for p in per: print(p[0][:15], p[1][:28], 'reqIds=',p[2], 'apiRecs=',p[3], 'out=',p[4].get('output_tokens'), 'cr=',p[4].get('cache_read_input_tokens'), 'cc=',p[4].get('cache_creation_input_tokens'), 'in=',p[4].get('input_tokens'), p[5])
print()
for t,c in tot.items(): print(t, dict(c))
