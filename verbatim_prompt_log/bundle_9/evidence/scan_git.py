"""Scan every transcript of this session for git repositories that were read: remote (clone/fetch/web) and local (git commands)."""
import json, os, re, collections
S = "/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef"
def transcripts():
    yield "main", S + ".jsonl"
    for wf in sorted(os.listdir(S + "/subagents/workflows")):
        d = f"{S}/subagents/workflows/{wf}"; lab = {}
        try:
            for l in open(f"{d}/journal.jsonl"):
                e = json.loads(l)
                if e["type"] == "started": lab[e["agentId"]] = e["label"]
        except FileNotFoundError: pass
        for f in sorted(os.listdir(d)):
            if f.startswith("agent-") and f.endswith(".jsonl"):
                yield f"{wf}:{lab.get(f[6:-6], f[6:-6])}", f"{d}/{f}"
URLRX = re.compile(r"https?://[^\s'\"<>)]*(github\.com|githubusercontent\.com|gitlab\.|bitbucket\.org|codeberg\.org|sr\.ht|git\.[a-z]+\.[a-z]+|googlesource\.com|lean-lang\.org/[^\s]*\.git)[^\s'\"<>)]*", re.I)
GITCMD = re.compile(r"(?:^|[;&|(\s])git\s+(?:-C\s+(\S+)\s+)?(?:-c\s+\S+\s+)*([a-z-]+)", re.M)
remote = collections.defaultdict(set); local = collections.defaultdict(set); lakenet = []
for who, path in transcripts():
    for line in open(path):
        try: e = json.loads(line)
        except Exception: continue
        m = e.get("message")
        if not isinstance(m, dict) or m.get("role") != "assistant" or not isinstance(m.get("content"), list): continue
        for c in m["content"]:
            if not (isinstance(c, dict) and c.get("type") == "tool_use"): continue
            inp = c.get("input") or {}
            if c.get("name") in ("WebFetch",):
                u = inp.get("url", "")
                if URLRX.search(u): remote[re.sub(r"(https?://[^/]+/[^/]+/[^/#?]+).*", r"\1", u)].add(f"{who} WebFetch")
            if c.get("name") != "Bash": continue
            cmd = inp.get("command", "")
            for u in URLRX.finditer(cmd):
                url = u.group(0)
                remote[re.sub(r"(https?://[^/]+/[^/]+/[^/#?]+).*", r"\1", url)].add(f"{who} {'git clone' if 'clone' in cmd else 'curl/other'}")
            for g in GITCMD.finditer(cmd):
                sub = g.group(2); where = g.group(1) or ""
                if sub in ("clone", "fetch", "pull", "ls-remote", "submodule"): local[f"NETWORK git {sub}"].add(f"{who}: {' '.join(cmd.split())[:220]}")
                else:
                    cd = re.findall(r"cd\s+(\S+)", cmd)
                    loc = where or (cd[-1] if cd else "(cwd)")
                    key = "scratch/test" if ("scratchpad" in loc or "/tmp/" in loc or "$" in loc or loc in ("(cwd)",)) else loc
                    local[key].add(f"{who}: git {sub}")
            if re.search(r"\blake\b[^|;&\n]*\b(new|init|update|exe\s+cache)\b|\blake\s+\+", cmd):
                lakenet.append(f"{who}: {' '.join(cmd.split())[:200]}")
print("=== REMOTE repositories referenced (WebFetch / curl / clone) ===")
for k in sorted(remote): print(f"{k}\n    " + "; ".join(sorted(remote[k]))[:400])
print("\n=== git commands by location (non-scratch locations listed explicitly) ===")
for k in sorted(local):
    v = sorted(local[k]); print(f"{k}: {len(v)} uses" + ("" if k == "scratch/test" else "\n    " + "\n    ".join(v[:8])))
print("\n=== lake commands that can fetch git dependencies ===")
for x in lakenet[:20]: print("   ", x)
