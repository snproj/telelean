#!/usr/bin/env python3
"""Wait until any (run-id, label-regex) pair has a finished agent whose label matches. Polls every 30 s.
Usage: waitlabel.py <run-id> <regex> [<run-id> <regex> ...]   Prints the matches and exits 0."""
import json, re, sys, time, os
W='/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/subagents/workflows'
argv=[a for a in sys.argv[1:] if a!='--started']
STARTED='--started' in sys.argv
pairs=[(argv[i], re.compile(argv[i+1])) for i in range(0,len(argv),2)]
def scan(run):
    labels={}; done=[]
    try:
        for l in open(os.path.join(W,run,'journal.jsonl')):
            try: r=json.loads(l)
            except Exception: continue
            if r.get('type')=='started': labels[r.get('key')]=r.get('label')
            elif r.get('type')=='result': done.append(labels.get(r.get('key'),'?'))
    except FileNotFoundError: pass
    return done, labels
while True:
    hits=[]
    for run,rx in pairs:
        done,labels=scan(run)
        pool=list(labels.values()) if STARTED else done
        m=[d for d in pool if d and rx.search(d)]
        if m: hits.append(f"{run}: {'started' if STARTED else 'done'} {m}")
    if hits:
        print(time.strftime('%H:%M'), '; '.join(hits))
        for run,_ in pairs:
            done,labels=scan(run); running=[v for k,v in labels.items() if v not in done]
            print(f"  {run}: {len(done)} done, running {running}")
        sys.exit(0)
    time.sleep(30)
