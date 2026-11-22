#!/usr/bin/env python3
"""Table of workflows launched from <startISO> on: run id, task id, name/summary, status, agents, tool uses, subagent tokens, duration.
Usage: wf_usage.py <startISO>"""
import json, re, sys
T='/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b.jsonl'
start=sys.argv[1]
launch={}   # task id -> (run id, summary, ts)
usage={}    # task id -> dict
def texts(r):
    out=[]
    m=r.get('message',{}).get('content')
    if isinstance(m,list):
        for c in m:
            if isinstance(c,dict):
                if c.get('type')=='tool_result':
                    cc=c.get('content')
                    if isinstance(cc,str): out.append(cc)
                    elif isinstance(cc,list): out+= [x.get('text','') for x in cc if isinstance(x,dict)]
                elif c.get('type')=='text': out.append(c.get('text',''))
    elif isinstance(m,str): out.append(m)
    a=r.get('attachment')
    if isinstance(a,dict):
        p=a.get('prompt')
        if isinstance(p,str): out.append(p)
        elif isinstance(p,list): out+=[x.get('text','') for x in p if isinstance(x,dict)]
    if isinstance(r.get('content'),str): out.append(r['content'])
    return out
for l in open(T):
    try: r=json.loads(l)
    except Exception: continue
    ts=r.get('timestamp') or ''
    if ts<start: continue
    for t in texts(r):
        m=re.search(r'Workflow launched in background\. Task ID: (\w+)\nSummary: (.*?)\n.*?Run ID: (wf_[\w-]+)', t, re.S)
        if m and m.group(1) not in launch: launch[m.group(1)]=(m.group(3), m.group(2).strip(), ts)
        for n in re.finditer(r'<task-id>(\w+)</task-id>.*?<status>(\w+)</status>.*?<usage>(.*?)</usage>', t, re.S):
            tid=n.group(1); u=n.group(3)
            d={k:int(v) for k,v in re.findall(r'<(\w+)>(\d+)</\1>', u)}
            d['status']=n.group(2)
            usage[tid]=d
tot={'agent_count':0,'tool_uses':0,'subagent_tokens':0}
print('| Run | Task | Workflow | Status | Agents | Tool uses | Subagent tokens | Wall clock |')
print('|---|---|---|---|---|---|---|---|')
for tid,(run,summ,ts) in sorted(launch.items(), key=lambda x:x[1][2]):
    u=usage.get(tid,{})
    for k in tot: tot[k]+=u.get(k,0)
    dur=u.get('duration_ms'); dur=f"≈ {dur/60000:.0f} min" if dur else '—'
    tok=u.get('subagent_tokens'); tok=f"≈ {tok/1e6:.2f} M" if tok else '—'
    print(f"| `{run}` | {tid} | {summ[:90]} | {u.get('status','running?')} | {u.get('agent_count','—')} | {u.get('tool_uses','—')} | {tok} | {dur} |")
print(f"| **Total** | | | | **{tot['agent_count']}** | **{tot['tool_uses']}** | **≈ {tot['subagent_tokens']/1e6:.2f} M** | |")
