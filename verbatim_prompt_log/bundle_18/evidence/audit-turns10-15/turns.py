import json, sys
path = sys.argv[1]
since = sys.argv[2] if len(sys.argv) > 2 else ""
with open(path) as f:
    for i, line in enumerate(f):
        try:
            d = json.loads(line)
        except Exception as e:
            print("BADLINE", i, e); continue
        ts = d.get("timestamp", "")
        if ts < since: continue
        t = d.get("type")
        if t == "user":
            msg = d.get("message", {})
            c = msg.get("content")
            if isinstance(c, str):
                print(i, ts, "USER-TEXT", repr(c[:300]))
            elif isinstance(c, list):
                kinds = [x.get("type") for x in c if isinstance(x, dict)]
                if "tool_result" not in kinds:
                    txt = " | ".join((x.get("text") or "")[:300] for x in c if isinstance(x, dict) and x.get("type") == "text")
                    print(i, ts, "USER-LIST", kinds, repr(txt[:400]))
        elif t not in ("assistant",):
            if t in ("system", "summary", "attachment"):
                sub = d.get("subtype") or ""
                print(i, ts, "OTHER", t, sub, repr(str(d.get("content", ""))[:150]))
