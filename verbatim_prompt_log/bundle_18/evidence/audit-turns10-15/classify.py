import json, re, sys, os
calls = json.load(open(sys.argv[1]))
outdir = sys.argv[2]
REPO = "/home/zhengyew/telelean"
SCR = "/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef"

def strip_heredocs(cmd):
    """Return (stripped command, list of (delim, target-ish line, body))."""
    lines = cmd.split("\n")
    out = []; bodies = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", ln)
        out.append(ln)
        if m:
            delim = m.group(1)
            j = i + 1
            body = []
            while j < len(lines) and lines[j].strip() != delim:
                body.append(lines[j]); j += 1
            bodies.append((delim, ln, "\n".join(body)))
            out.append("<<HEREDOC %s %d lines>>" % (delim, len(body)))
            i = j + 1
            continue
        i += 1
    return "\n".join(out), bodies

PATS = {
 "install/download": r"\bnpm\s+(i|install|ci|add|update|exec)\b|\bnpx\b|\bpip3?\s+install|\bpipx\b|\bcurl\b|\bwget\b|git\s+clone|\bapt(-get)?\b|\bsnap\s+(install|refresh)|--install-extension|playwright\s+install|downloadAndUnzip|\belan\b|lake\s+(update|exe\s+cache)|\byarn\b|\bpnpm\b|\bcorepack\b",
 "network": r"\bcurl\b|\bwget\b|\bssh\b|\bscp\b|\brsync\b|\bnc\b|\bgh\b|git\s+(push|fetch|pull|clone|remote\s+add|ls-remote)|https?://|\bnpm\s+(view|info|publish|search|ping|login|adduser|whoami)|\bnpx\b",
 "delete": r"\brm\b|\brmdir\b|-delete\b|\bunlink\b|git\s+clean|rmtree|rmSync|unlinkSync|\btruncate\b|shred|\bfind\b.*-exec\s+rm",
 "git": r"\bgit\b",
 "process/service": r"systemd-run|systemctl|\bnohup\b|\bsetsid\b|\bdisown\b|\bkill\b|\bpkill\b|\bkillall\b|xvfb-run|\bXvfb\b|\bcrontab\b|\bat\s+now|loginctl|\bdaemon",
 "claude-cli": r"native-binary/claude|\bclaude\s+-|\bclaude\b\s+--|TELELEAN_(WALKTHROUGH|SMOKE|DEMO)_LIVE|--live\b",
 "vscode/chrome": r"/snap/bin/code|/snap/code|\bcode\s+--|\.vscode-test|electron|google-chrome|chromium|--user-data-dir|--extensions-dir|playwright",
 "home-paths": r"(~|\$HOME|/home/zhengyew)/(\.[A-Za-z]|snap|telelean_scripts)|/home/zhengyew/(?!telelean\b)[A-Za-z]",
 "sys-paths": r"/dev/shm|/var/crash|/var/tmp|/etc/|/usr/local|/opt/",
 "env-overrides": r"\bHOME=|XDG_[A-Z_]+=|npm_config_[a-z_]+=|GIT_CONFIG|CLAUDE_CONFIG_DIR|LEAN_PATH=|ELAN_HOME",
 "sudo": r"\bsudo\b|\bpkexec\b|\bsu\s",
 "chmod/ln/mv/cp": r"\bchmod\b|\bchown\b|\bln\s|\bmv\s|\bcp\s|\binstall\s+-",
 "writes(redir/tee)": r"(?<![<>&0-9])>{1,2}\s*[^&\s|]|\btee\b|\btouch\b|\bmkdir\b|\bdd\b",
 "lean": r"\blake\b|\blean\b|leanprover",
 "script-writes": r"open\([^)]*['\"][wa]b?['\"]|writeFileSync|writeFile\(|shutil\.(copy|move)|os\.(remove|unlink|rename|makedirs)|fs\.(write|rm|unlink|rename|mkdir|copy)",
}
rx = {k: re.compile(v) for k, v in PATS.items()}
os.makedirs(outdir, exist_ok=True)
summary = {}
per_src = {}
for c in calls:
    src = c["src"]
    per_src.setdefault(src, [])
    if c["name"] == "Bash":
        cmd = c["input"].get("command", "")
        stripped, bodies = strip_heredocs(cmd)
        flags = [k for k, r in rx.items() if r.search(stripped)]
        # heredoc bodies that are written to files or executed
        hflags = []
        for delim, head, body in bodies:
            for k, r in rx.items():
                if r.search(body) and k not in flags: hflags.append("H:" + k)
        per_src[src].append((c, stripped, bodies, flags, sorted(set(hflags))))
    else:
        per_src[src].append((c, None, None, [], []))
for src, items in per_src.items():
    with open(os.path.join(outdir, src + ".txt"), "w") as f:
        for n, (c, stripped, bodies, flags, hflags) in enumerate(items, 1):
            inp = c["input"]
            if c["name"] == "Bash":
                f.write("#%d L%d %s BASH flags=%s hflags=%s bg=%s sandboxOff=%s\n" % (n, c["line"], c["ts"], flags, hflags, inp.get("run_in_background"), inp.get("dangerouslyDisableSandbox")))
                f.write(stripped + "\n")
                for delim, head, body in bodies:
                    f.write("  --- heredoc %s (head: %s)\n" % (delim, head.strip()[:200]))
                    f.write("\n".join("  | " + x for x in body.split("\n")[:400]) + "\n")
                r = (c.get("result") or "")
                f.write("  => err=%s %s\n\n" % (c.get("is_error"), r[:1500].replace("\n", "\n     ")))
            elif c["name"] in ("Write", "Edit", "NotebookEdit", "MultiEdit"):
                f.write("#%d L%d %s %s %s\n  => err=%s %s\n\n" % (n, c["line"], c["ts"], c["name"], inp.get("file_path") or inp.get("notebook_path"), c.get("is_error"), (c.get("result") or "")[:200].replace("\n", " ")))
            elif c["name"] in ("Read", "Glob", "Grep"):
                f.write("#%d L%d %s %s %s\n\n" % (n, c["line"], c["ts"], c["name"], json.dumps(inp)[:300]))
            else:
                f.write("#%d L%d %s %s %s\n  => err=%s %s\n\n" % (n, c["line"], c["ts"], c["name"], json.dumps(inp)[:3000], c.get("is_error"), (c.get("result") or "")[:1500].replace("\n", "\n     ")))
    from collections import Counter
    cnt = Counter()
    for (c, s, b, flags, hflags) in items:
        for fl in flags + hflags: cnt[fl] += 1
    print(src, len(items), dict(cnt))
