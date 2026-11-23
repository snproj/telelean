#!/usr/bin/env python3
"""Build response<N>_interim.md: every assistant text block of the main session from <start> (UTC ISO) on, in order,
with timestamps, marking where human mid-turn messages (queued_command, origin human) arrived and where the context
was compacted. Usage: build_interim.py <N> <startISO> <out.md> [--exclude-last]"""
import json, sys
N, start, out = sys.argv[1], sys.argv[2], sys.argv[3]
excl_last = '--exclude-last' in sys.argv
T='/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b.jsonl'
events=[]
seen=set()
for l in open(T):
    try: r=json.loads(l)
    except Exception: continue
    ts=r.get('timestamp') or ''
    if ts < start: continue
    t=r.get('type')
    if t=='assistant' and not r.get('isSidechain'):
        msg=r.get('message',{})
        mid=msg.get('id')
        for k,c in enumerate(msg.get('content') or []):
            if isinstance(c,dict) and c.get('type')=='text' and c.get('text','').strip():
                key=(mid,k,c['text'][:80])
                if key in seen: continue
                seen.add(key)
                events.append(('text',ts,c['text'].strip()))
    elif t=='attachment':
        a=r.get('attachment') or {}
        if isinstance(a,dict) and a.get('type')=='queued_command' and (a.get('origin') or {}).get('kind')=='human':
            events.append(('human',ts,None))
    elif t=='user' and r.get('isCompactSummary'):
        events.append(('compact',ts,None))
    elif t=='user' and not r.get('isMeta') and not r.get('isSidechain'):
        c=r.get('message',{}).get('content')
        texts_=[x.get('text','') for x in c if isinstance(x,dict) and x.get('type')=='text'] if isinstance(c,list) else ([c] if isinstance(c,str) else [])
        joined=' '.join(texts_).strip()
        # a genuine typed user message (not a tool result, not a system reminder or task notification)
        if joined and not joined.startswith('<') and 'tool_result' not in json.dumps(c)[:200]:
            events.append(('human',ts,None))
texts=[e for e in events if e[0]=='text']
if excl_last and texts:
    last=texts[-1]; events.remove(last)
lines=[f"# Interim replies during turn {N}, verbatim, in order\n",
 f"Built programmatically from the session transcript (`c398a83b-d60f-46a4-ad9a-8d926e6fdd1b.jsonl`) at the end of the turn: every text block I wrote during turn {N}, in order, with its UTC timestamp. Many are short replies to automated notifications (the RAM watchdog, workflow completions); they are kept for completeness. The places where the user's mid-turn messages arrived, and where the conversation context was compacted, are marked; the messages themselves are verbatim in `prompt{N}_midturn.md`. The final reply is in `response{N}.md`.\n"]
n=0; h=0
for kind,ts,txt in events:
    if kind=='text':
        n+=1; lines.append(f"## Interim {n} ({ts})\n\n{txt}\n")
    elif kind=='human':
        h+=1; lines.append(f"---\n*[Mid-turn message {h} from the user arrived here ({ts}); verbatim in `prompt{N}_midturn.md`.]*\n\n---\n")
    else:
        lines.append(f"---\n*[The conversation context was compacted here ({ts}); work continued from a summary.]*\n\n---\n")
open(out,'w').write('\n'.join(lines))
print(f"{n} interims, {h} human messages marked, {sum(1 for e in events if e[0]=='compact')} compactions -> {out}")
