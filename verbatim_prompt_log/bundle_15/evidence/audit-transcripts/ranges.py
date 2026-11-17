import json, sys, os, glob
S='/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
files = sorted(glob.glob(S+'/subagents/**/*.jsonl', recursive=True))
labels = {}
for j in glob.glob(S+'/subagents/workflows/*/journal.jsonl'):
    run = os.path.basename(os.path.dirname(j))
    for line in open(j):
        try: d = json.loads(line)
        except: continue
        if d.get('type') == 'started' or d.get('event') == 'started' or 'started' in str(d.get('type','')):
            aid = d.get('agentId') or d.get('agent_id') or d.get('id')
            labels[(run, aid)] = d.get('label')
for f in files:
    if f.endswith('journal.jsonl'): continue
    ts = []
    n_tool = 0
    for line in open(f):
        try: d = json.loads(line)
        except: continue
        t = d.get('timestamp')
        if t: ts.append(t)
    run = os.path.basename(os.path.dirname(f))
    aid = os.path.basename(f)[len('agent-'):-len('.jsonl')]
    meta = f[:-len('.jsonl')]+'.meta.json'
    desc = ''
    if os.path.exists(meta):
        try: desc = json.load(open(meta)).get('description','')
        except: pass
    print(run, aid, min(ts) if ts else None, max(ts) if ts else None, labels.get((run,aid)) or labels.get((run,'a'+aid)) , '|', desc[:60])
