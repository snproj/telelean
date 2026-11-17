import json, re, sys, collections
calls = json.load(open(sys.argv[1]))
REPO = "/home/zhengyew/telelean"
SCR = "/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef"
path_rx = re.compile(r"(?:(?<=[\s'\"=:(>])|^)((?:~|\$HOME|/)[A-Za-z0-9_.@%+,/:~${}*-]*)")
write_ops = re.compile(r"(>>?|\btee\b|\bcp\b|\bmv\b|\bmkdir\b|\btouch\b|\bln\b|\brm\b|\brmdir\b|\bchmod\b|sed\s+-i|open\([^)]*['\"][wax]|write_text|writeFileSync|shutil\.|os\.(remove|rename|replace|makedirs|unlink)|\binstall\b|\bunzip\b|\btar\b|\brsync\b|\bdd\b|truncate)")
res = collections.defaultdict(list)
for c in calls:
    if c["name"] != "Bash": continue
    cmd = c["input"].get("command", "")
    if not write_ops.search(cmd): continue
    paths = set()
    for m in path_rx.finditer(cmd):
        p = m.group(1)
        if p.startswith("/") and len(p) < 3: continue
        if p.startswith(REPO) or p.startswith(SCR) or p.startswith("$S") : continue
        if re.match(r"^/(dev/null|dev/stdin|dev/stdout|dev/stderr|proc/|usr/bin/|bin/|usr/lib|snap/code|etc/|sys/)", p): continue
        if p in ("/", "/tmp", "/dev"): continue
        paths.add(p)
    if paths:
        res[c["src"]].append((c["ts"][:19], c["line"], sorted(paths)[:12]))
for src, rows in res.items():
    print("=====", src, len(rows))
    for r in rows: print(" ", r[0], "L%d" % r[1], r[2])
