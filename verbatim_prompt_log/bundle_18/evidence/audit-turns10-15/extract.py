import json, sys, os
# usage: extract.py OUT.json label path [since] [until] ...
out = sys.argv[1]
specs = sys.argv[2:]
allcalls = []
def text_of(content):
    if isinstance(content, str): return content
    if isinstance(content, list):
        parts = []
        for x in content:
            if isinstance(x, dict):
                if x.get("type") == "text": parts.append(x.get("text",""))
                elif x.get("type") == "tool_reference": parts.append("[tool_reference %s]" % x.get("tool_name"))
                else: parts.append("[%s]" % x.get("type"))
            else: parts.append(str(x))
        return "\n".join(parts)
    return str(content)
i = 0
while i < len(specs):
    label, path, since, until = specs[i], specs[i+1], specs[i+2], specs[i+3]
    i += 4
    calls = {}
    order = []
    with open(path) as f:
        for ln, line in enumerate(f):
            try: d = json.loads(line)
            except Exception: continue
            ts = d.get("timestamp", "")
            if since and ts and ts < since: continue
            if until and ts and ts >= until: continue
            msg = d.get("message") or {}
            c = msg.get("content")
            if d.get("type") == "assistant" and isinstance(c, list):
                for x in c:
                    if isinstance(x, dict) and x.get("type") == "tool_use":
                        rec = {"src": label, "line": ln, "ts": ts, "id": x.get("id"), "name": x.get("name"), "input": x.get("input"), "result": None, "is_error": None, "agentId": d.get("agentId"), "sidechain": d.get("isSidechain")}
                        calls[x.get("id")] = rec; order.append(x.get("id"))
            elif d.get("type") == "user" and isinstance(c, list):
                for x in c:
                    if isinstance(x, dict) and x.get("type") == "tool_result":
                        tid = x.get("tool_use_id")
                        if tid in calls:
                            calls[tid]["result"] = text_of(x.get("content"))[:6000]
                            calls[tid]["is_error"] = x.get("is_error")
                            calls[tid]["result_ts"] = ts
                            tur = d.get("toolUseResult")
                            if isinstance(tur, dict):
                                calls[tid]["tur_keys"] = list(tur.keys())[:20]
    for tid in order: allcalls.append(calls[tid])
json.dump(allcalls, open(out, "w"), indent=1)
from collections import Counter
cnt = Counter((c["src"], c["name"]) for c in allcalls)
for k, v in sorted(cnt.items()): print(k, v)
print("TOTAL", len(allcalls))
