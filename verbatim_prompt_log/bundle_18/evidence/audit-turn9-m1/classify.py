#!/usr/bin/env python3
"""Classify Bash commands (and Write/Edit paths) extracted by extract.py.

Usage: python3 -I classify.py IN.jsonl [IN2.jsonl ...] > report
Writes flagged.jsonl next to this script with one record per (call, category, match).
"""
import json
import os
import re
import sys
import collections

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/zhengyew/telelean'
SCRATCH = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad'

HEREDOC_RX = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n(.*?)\n\s*\2\s*(?=\n|$)", re.S)


def split_heredocs(cmd):
    """Return (command with heredoc bodies replaced, list of (opener_line, body))."""
    bodies = []

    def repl(m):
        # opener line = text from start of line containing << to the <<
        start = cmd.rfind('\n', 0, m.start()) + 1
        opener = cmd[start:m.start()] + m.group(0).split('\n', 1)[0]
        bodies.append((opener.strip(), m.group(3)))
        return '<<HEREDOC_' + m.group(2) + '\n'

    stripped = HEREDOC_RX.sub(repl, cmd)
    return stripped, bodies


CODE_OPENER = re.compile(r"\b(python3?|node|bash|sh|zsh|lean|lake|perl|ruby|deno|bun|tsx|npx)\b")

PATTERNS = {
    # installs / downloads
    'install': r"\b(npm\s+(i|install|ci|add|update|upgrade|uninstall|rm|remove|link|dedupe|prune|rebuild)\b|pnpm\s|yarn\s|pip3?\s+install|python3?\s+-m\s+pip|apt(-get)?\s+(install|remove|purge)|dpkg\s+-i|snap\s+(install|remove|refresh)|flatpak\s|playwright\s+install|code\s+[^\n|;&]*--(un)?install-extension|vsce\s|corepack|elan\s+(toolchain|self|default|override)|lake\s+(update|new|init|exe\s+cache|upload)|cargo\s+install|go\s+install|brew\s)",
    'npx': r"\bnpx\b|\bnpm\s+exec\b",
    'download': r"\b(curl|wget|aria2c|git\s+clone|git\s+fetch|git\s+pull|git\s+ls-remote|git\s+submodule|downloadAndUnzipVSCode|download)\b",
    'network': r"(https?://|\bssh\b|\bscp\b|\brsync\b|\bnc\s|\bnetcat\b|\btelnet\b|\bftp\b|git\s+push|\bgh\s|npm\s+(view|info|show|search|audit|outdated|publish|login|whoami|ping)\b|api\.anthropic|ANTHROPIC_|socket\.connect|urllib|requests\.|http\.request|https\.request|fetch\()",
    'claude_cli': r"(^|[\s;&|(/'\"=])claude(\s|$|['\"])|--live\b|_LIVE\b|claude-cli|@anthropic-ai/claude|walkthrough-claude|smoke\.mjs",
    'delete': r"(\brm\s|\brmdir\b|\bunlink\b|-delete\b|shutil\.rmtree|os\.remove|os\.unlink|rmSync|fs\.rm\b|fs\.rmdir|unlinkSync|\btruncate\b|git\s+clean|logs_max|logs-max|find\s[^\n]*-exec\s+rm)",
    'process': r"(systemd-run|systemctl|\bnohup\b|\bsetsid\b|\bdisown\b|\bkill\b|\bpkill\b|\bkillall\b|\bXvfb\b|xvfb-run|\bcrontab\b|\bat\s+now|daemon|&\s*$|&\s*\n|\s&\s)",
    'git': r"\bgit\s+(-C\s+\S+\s+)?[a-z]",
    'lean': r"\b(lake|lean|elan)\b",
    'vscode': r"(\bcode\s+-|\bcode\s+--|\.vscode-test|vscode-test|--user-data-dir|--extensions-dir|\.config/Code|\.vscode/extensions|extensionDevelopmentPath|test-electron|@vscode/test-cli)",
    'chrome': r"(google-chrome|chromium|\bchrome\b|playwright|puppeteer)",
    'sudo': r"\bsudo\b|\bpkexec\b|\bsu\s",
    'env_home': r"(\bHOME=|XDG_[A-Z_]+=|npm_config_[a-z_]+=|NPM_CONFIG_[A-Z_]+=)",
}
PATTERNS = {k: re.compile(v, re.M) for k, v in PATTERNS.items()}

# absolute paths outside repo and scratch
PATH_RX = re.compile(r"(?<![\w.$])((?:~|\$HOME|/home/zhengyew|/tmp|/var|/etc|/dev/shm|/usr|/opt|/root|/run|/proc/sys|/sys)(?:/[^\s'\"`;|&<>()\]\[{},]*)?)")


def outside_paths(text):
    out = set()
    for m in PATH_RX.finditer(text):
        p = m.group(1)
        if p.startswith('/home/zhengyew/telelean') and not p.startswith('/home/zhengyew/telelean_') and not p.startswith('/home/zhengyew/telelean-'):
            continue
        if p.startswith(SCRATCH):
            continue
        if p.startswith('/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/'):
            continue  # session dir (tasks output etc.)
        out.add(p)
    return out


def main():
    stats = collections.Counter()
    flagged = open(os.path.join(HERE, 'flagged.jsonl'), 'w')
    paths_all = collections.Counter()
    write_paths = collections.defaultdict(list)
    for fn in sys.argv[1:]:
        for line in open(fn):
            d = json.loads(line)
            name = d['name']
            inp = d['input'] or {}
            if name in ('Write', 'Edit', 'NotebookEdit', 'MultiEdit'):
                p = inp.get('file_path') or inp.get('notebook_path')
                write_paths[p].append((d['src'], d['ts'], name, d.get('is_error')))
                continue
            if name not in ('Bash', 'Monitor'):
                continue
            cmd = inp.get('command', '')
            stripped, bodies = split_heredocs(cmd)
            cats = {}
            for k, rx in PATTERNS.items():
                ms = [m.group(0) for m in rx.finditer(stripped)]
                if ms:
                    cats[k] = ms[:5]
            code_hits = {}
            for opener, body in bodies:
                if CODE_OPENER.search(opener) and not re.search(r"cat\s*>|tee\s", opener):
                    for k, rx in PATTERNS.items():
                        ms = [m.group(0) for m in rx.finditer(body)]
                        if ms:
                            code_hits['heredoc:' + k] = ms[:5]
            outs = outside_paths(stripped)
            for opener, body in bodies:
                if CODE_OPENER.search(opener) and not re.search(r"cat\s*>|tee\s", opener):
                    outs |= {('heredoc:' + p) for p in outside_paths(body)}
            if inp.get('run_in_background'):
                cats['bg'] = ['run_in_background']
            for p in outs:
                paths_all[p.split('heredoc:')[-1]] += 1
            rec = {
                'src': d['src'], 'ts': d['ts'], 'id': d['id'], 'name': name,
                'desc': inp.get('description', ''), 'cats': cats, 'code_hits': code_hits,
                'outside_paths': sorted(outs), 'cmd': cmd, 'result': (d.get('result') or '')[:3000],
                'is_error': d.get('is_error'),
            }
            for k in list(cats) + list(code_hits):
                stats[k] += 1
            if cats or code_hits or outs:
                flagged.write(json.dumps(rec) + '\n')
    flagged.close()
    print('category counts:', dict(stats))
    print('\nWRITE/EDIT paths outside repo and scratch:')
    for p, uses in sorted(write_paths.items()):
        if p and (p.startswith(REPO + '/') or p.startswith(SCRATCH)):
            continue
        print('  ', p, uses[:3], len(uses))
    print('\nWRITE/EDIT count by top-level area:')
    area = collections.Counter()
    for p, uses in write_paths.items():
        if not p:
            continue
        if p.startswith(SCRATCH):
            area['scratch'] += len(uses)
        elif p.startswith(REPO + '/'):
            rel = p[len(REPO) + 1:].split('/')
            key = '/'.join(rel[:2]) if rel[0] in ('packages', 'verbatim_prompt_log') else rel[0]
            area['repo:' + key] += len(uses)
        else:
            area['OTHER:' + p] += len(uses)
    for k, v in sorted(area.items()):
        print('  ', v, k)
    json.dump({p: u for p, u in write_paths.items()}, open(os.path.join(HERE, 'write_paths.json'), 'w'))
    print('\nOutside paths mentioned in Bash (count):')
    for p, c in paths_all.most_common():
        print('  ', c, p)


main()
