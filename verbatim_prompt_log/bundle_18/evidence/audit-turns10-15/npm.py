import json, re, sys
calls = json.load(open(sys.argv[1]))
def strip(cmd):
    lines = cmd.split("\n"); out = []; i = 0
    while i < len(lines):
        ln = lines[i]; out.append(ln)
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", ln)
        if m:
            d = m.group(1); j = i + 1
            while j < len(lines) and lines[j].strip() != d: j += 1
            i = j + 1; continue
        i += 1
    return "\n".join(out)
rows = []
for c in calls:
    if c["name"] != "Bash": continue
    cmd = strip(c["input"].get("command", ""))
    # count npm/npx invocations (exclude grep patterns / echo strings roughly)
    invs = re.findall(r"(?<![\w/.-])(npx|npm)\s+([\w:-]+(?:\s+[\w@:./-]+){0,3})", cmd)
    if not invs: continue
    # exclude lines where npm appears only inside grep/sed patterns: crude check
    logsdir = "npm_config_logs_dir" in cmd
    logsmax = re.search(r"npm_config_logs_max\s*=\s*0", cmd) is not None
    rows.append((c["src"], c["ts"], c["line"], logsdir, logsmax, [" ".join(x)[:60] for x in invs][:6], c["input"].get("run_in_background")))
from collections import Counter
cnt = Counter((r[0], r[3]) for r in rows)
for r in rows:
    print(r[0], r[1][:19], "L%d" % r[2], "logsdir=%s" % r[3], "logsmax0=%s" % r[4], r[5], "[bg]" if r[6] else "")
print()
for k, v in sorted(cnt.items()): print(k, v)
