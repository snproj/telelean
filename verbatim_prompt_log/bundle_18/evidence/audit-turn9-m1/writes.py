#!/usr/bin/env python3
"""Heuristically find Bash/heredoc write targets (redirections, cp/mv/rsync/ln/mkdir/touch/tee/sed -i,
python open(...,'w'), write_text, shutil, os.makedirs) and resolve them against a leading `cd`.
Prints targets outside the session scratchpad grouped by area.
"""
import json
import os
import re
import sys
import collections

SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad'
REPO = '/home/zhengyew/telelean'
HOME = '/home/zhengyew'

HEREDOC_RX = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n(.*?)\n\s*\2\s*(?=\n|$)", re.S)


def expand(p, env, cwd):
    p = p.strip().strip('"\'')
    p = p.replace('~/', HOME + '/').replace('$HOME', HOME).replace('${HOME}', HOME)
    for _ in range(3):
        p = re.sub(r"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?", lambda m: env.get(m.group(1), '$' + m.group(1)), p)
    if not p.startswith('/') and not p.startswith('$'):
        p = os.path.normpath(os.path.join(cwd or '?CWD', p))
    return p


def area(p):
    if p.startswith(SCR) or p.startswith('/tmp/claude-1002/-home-zhengyew-telelean/03a29d54'):
        return 'scratch'
    if p.startswith(REPO + '/') or p == REPO:
        rel = p[len(REPO) + 1:]
        parts = rel.split('/')
        return 'repo:' + ('/'.join(parts[:2]) if parts[0] == 'packages' else parts[0])
    if p.startswith('/dev/null') or p.startswith('/dev/stdout') or p.startswith('/dev/stderr') or p.startswith('/dev/fd') or p.startswith('&'):
        return None
    if p.startswith('$') or p.startswith('?CWD'):
        return 'unresolved'
    return 'OTHER'


def analyze(cmd, cwd0):
    env = {'HOME': HOME}
    cwd = cwd0
    targets = []
    stripped = HEREDOC_RX.sub(lambda m: '<<HD\n', cmd)
    bodies = [(m.group(0).split('\n', 1)[0], m.group(3)) for m in HEREDOC_RX.finditer(cmd)]
    # simple sequential scan of statements
    stmts = re.split(r"\n|&&|\|\||;|\|", stripped)
    for st in stmts:
        st = st.strip()
        if not st:
            continue
        m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(\"[^\"]*\"|'[^']*'|[^\s;]+)(\s|$)", st)
        while m:
            val = m.group(2).strip('"\'')
            if not val.startswith('$('):
                env[m.group(1)] = expand(val, env, cwd) if ('/' in val or val.startswith('~')) else val
            st = st[m.end():].strip()
            m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(\"[^\"]*\"|'[^']*'|[^\s;]+)(\s|$)", st)
        mc = re.match(r"^\(?\s*cd\s+(\S+)", st)
        if mc:
            cwd = expand(mc.group(1), env, cwd)
            continue
        for mr in re.finditer(r"(?<![<0-9&])(>>?|>\|)\s*([^\s;&|<>()]+)", st):
            t = mr.group(2)
            if t.startswith('&') or t.startswith('/dev/'):
                continue
            targets.append(('redirect', expand(t, env, cwd)))
        mm = re.match(r"^(?:sudo\s+)?(cp|mv|rsync|ln|install)\b(.*)$", st)
        if mm:
            args = [a for a in mm.group(2).split() if not a.startswith('-')]
            if args:
                targets.append((mm.group(1), expand(args[-1], env, cwd)))
        mm = re.match(r"^(mkdir|touch|rm|rmdir|unlink|chmod|truncate)\b(.*)$", st)
        if mm:
            for a in mm.group(2).split():
                if not a.startswith('-'):
                    targets.append((mm.group(1), expand(a, env, cwd)))
        mm = re.match(r"^tee\b(.*)$", st)
        if mm:
            for a in mm.group(1).split():
                if not a.startswith('-'):
                    targets.append(('tee', expand(a, env, cwd)))
        mm = re.match(r"^sed\s+(-[a-zA-Z]*i[a-zA-Z]*|--in-place)\b(.*)$", st)
        if mm:
            parts = mm.group(2).split()
            if parts:
                targets.append(('sed-i', expand(parts[-1], env, cwd)))
    for opener, body in bodies:
        if re.search(r"python|node", opener) and not re.search(r"cat\s*>|tee\s", opener):
            for mo in re.finditer(r"open\(\s*([^,\)]+)\s*,\s*['\"]([wa])", body):
                targets.append(('py-open-' + mo.group(2), mo.group(1)[:120]))
            for mo in re.finditer(r"(\w+)\.(write_text|write_bytes|mkdir|unlink|rmdir|rename|replace|touch)\(", body):
                targets.append(('py-' + mo.group(2), mo.group(1)))
            for mo in re.finditer(r"(shutil\.\w+|os\.(remove|unlink|rename|replace|makedirs|mkdir|rmdir|symlink|link))\(([^\)]{0,120})", body):
                targets.append(('py-' + mo.group(1), mo.group(3)))
            for mo in re.finditer(r"(writeFileSync|appendFileSync|mkdirSync|rmSync|renameSync|copyFileSync|cpSync|unlinkSync)\(([^\)]{0,120})", body):
                targets.append(('js-' + mo.group(1), mo.group(2)))
        mt = re.search(r"(cat|tee)\s*(>>?|-a)?\s*([^\s<]+)\s*<<", opener)
        if mt and mt.group(1) == 'cat' and mt.group(2):
            targets.append(('heredoc-file', expand(mt.group(3), env, cwd)))
        elif mt and mt.group(1) == 'tee':
            targets.append(('heredoc-tee', expand(mt.group(3), env, cwd)))
    return targets


def main():
    out = collections.defaultdict(list)
    for fn in sys.argv[1:]:
        for line in open(fn):
            d = json.loads(line)
            if d['name'] != 'Bash':
                continue
            cmd = d['input'].get('command', '')
            who = d['src'].split('/')[1] if '/' in d['src'] else d['src']
            for kind, t in analyze(cmd, None):
                a = area(t) if t.startswith('/') or t.startswith('$') or t.startswith('?') else 'pyexpr'
                if a is None or a == 'scratch':
                    continue
                out[a].append((d['ts'], who, kind, t[:160]))
    for a in sorted(out):
        rows = out[a]
        print(f'== {a}: {len(rows)}')
        seen = set()
        for r in rows:
            k = (r[1], r[2], r[3])
            if k in seen:
                continue
            seen.add(k)
            print('   ', r[0], r[1], r[2], r[3])


main()
