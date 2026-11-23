"""Broad transcript scan (ledger method step 2): every tool call in this session's transcripts (main + all subagents)
that could download, install, publish or write outside the repo/scratch. Prints counts and unique hits."""
import json, glob, re, sys, collections
root = '/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b'
files = [root + '.jsonl'] + glob.glob(root + '/subagents/**/*.jsonl', recursive=True)
net = re.compile(r"""(?x)\b(curl|wget|aria2c|git\s+(clone|fetch|pull|push|remote|submodule)|npm\s+(i|install|ci|add|update|exec|publish|pack|link)\b|npx\b|pnpm|yarn|pip3?\s+install|python3?\s+-m\s+pip|uv\s+(pip|add|sync)|cargo\s+(install|add|fetch)|lake\s+(update|new|init|exe\s+cache|\+)|elan\b|apt(-get)?\b|dpkg\b|snap\s+(install|refresh|remove)|flatpak|docker|podman|urllib|requests\.|http\.client|https?\.get|fetch\(|playwright\s+install|--install-extension|code\s+--|gh\s+|ssh\b|scp\b|rsync\b|\bnc\b|sudo\b|systemctl\s+--user\s+(enable|start|link)|crontab|chmod\s+[0-7]*[0-7]\s+~|ln\s+-s[^|;]*\s~)""")
outside = re.compile(r"""(?x)(>\s*|tee\s+|cp\s[^|;]*\s|mv\s[^|;]*\s|mkdir\s+(-p\s+)?|touch\s+|rm\s+(-[rf]+\s+)?)(~|\$HOME|/home/zhengyew/(?!telelean\b)|/etc|/usr|/opt|/var(?!/crash)|/snap)""")
hits = collections.OrderedDict(); webtools = collections.Counter(); ncalls = 0
for f in files:
    for line in open(f, errors='replace'):
        try: r = json.loads(line)
        except Exception: continue
        m = r.get('message') if isinstance(r, dict) else None
        if not isinstance(m, dict) or m.get('role') != 'assistant' or not isinstance(m.get('content'), list): continue
        for c in m['content']:
            if not isinstance(c, dict) or c.get('type') != 'tool_use': continue
            ncalls += 1
            name = c.get('name', ''); inp = c.get('input', {})
            if name in ('WebFetch', 'WebSearch') or name.startswith('mcp__'):
                webtools[name] += 1; continue
            cmd = inp.get('command') if name == 'Bash' else None
            if not cmd or 'ledger_scan' in cmd: continue
            for rx, tag in ((net, 'net'), (outside, 'outside')):
                for mm in rx.finditer(cmd):
                    key = (tag, mm.group(0).strip()[:40], cmd[:300])
                    if key not in hits: hits[key] = (f.rsplit('/', 1)[-1][:40], cmd.replace('\n', ' ')[:220])
print('transcripts', len(files), 'tool calls', ncalls, 'web/mcp tools', dict(webtools))
by = collections.Counter(k[1] for k in hits)
for (tag, pat, _), (src, cmd) in hits.items(): print(f'[{tag}] {pat!r} :: {src} :: {cmd}')
