import json, sys
calls = json.load(open(sys.argv[1]))
src = sys.argv[2]
maxin = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
maxres = int(sys.argv[4]) if len(sys.argv) > 4 else 600
names = sys.argv[5].split(",") if len(sys.argv) > 5 and sys.argv[5] else None
n = 0
for c in calls:
    if c["src"] != src: continue
    if names and c["name"] not in names: continue
    n += 1
    inp = c["input"]
    if c["name"] == "Bash":
        s = "CMD: " + inp.get("command", "") + ("\n  [bg]" if inp.get("run_in_background") else "") + ("\n  [DISABLE_SANDBOX]" if inp.get("dangerouslyDisableSandbox") else "") + "\n  DESC: " + str(inp.get("description"))
    elif c["name"] in ("Write",):
        s = "WRITE %s (%d chars)" % (inp.get("file_path"), len(inp.get("content", "")))
    elif c["name"] in ("Edit",):
        s = "EDIT %s old=%r new=%r" % (inp.get("file_path"), inp.get("old_string", "")[:120], inp.get("new_string", "")[:120])
    elif c["name"] == "Read":
        s = "READ %s" % inp.get("file_path")
    else:
        s = json.dumps(inp)[:maxin]
    print("#%d [%s L%d %s] %s" % (n, c["src"], c["line"], c["ts"], c["name"]))
    print(s[:maxin])
    r = c.get("result") or ""
    print("  -> err=%s RESULT: %s" % (c.get("is_error"), r[:maxres].replace("\n", "\n     ")))
    print()
