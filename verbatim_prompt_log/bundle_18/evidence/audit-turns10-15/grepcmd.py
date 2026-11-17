import json, re, sys
# usage: grepcmd.py calls.json SRC|all REGEX [maxlen] [--body] [--res N]
calls = json.load(open(sys.argv[1]))
src = sys.argv[2]
pat = re.compile(sys.argv[3])
maxlen = int(sys.argv[4]) if len(sys.argv) > 4 else 1200
body = "--body" in sys.argv
resn = 300
if "--res" in sys.argv: resn = int(sys.argv[sys.argv.index("--res") + 1])
def strip_heredocs(cmd):
    lines = cmd.split("\n"); out = []; i = 0
    while i < len(lines):
        ln = lines[i]; out.append(ln)
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", ln)
        if m:
            delim = m.group(1); j = i + 1; n = 0
            while j < len(lines) and lines[j].strip() != delim: j += 1; n += 1
            out.append("<<HEREDOC %s %d lines>>" % (delim, n)); i = j + 1; continue
        i += 1
    return "\n".join(out)
n = 0
for c in calls:
    if src != "all" and c["src"] != src: continue
    if c["name"] != "Bash": continue
    cmd = c["input"].get("command", "")
    s = cmd if body else strip_heredocs(cmd)
    if not pat.search(s): continue
    n += 1
    print("=== [%s L%d %s]%s" % (c["src"], c["line"], c["ts"], " [bg]" if c["input"].get("run_in_background") else ""))
    print(s[:maxlen])
    r = c.get("result") or ""
    print("  => err=%s %s" % (c.get("is_error"), r[:resn].replace("\n", "\n     ")))
print("MATCHES", n)
