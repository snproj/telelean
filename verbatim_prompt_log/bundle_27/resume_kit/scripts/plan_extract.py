#!/usr/bin/env python3
"""Write a per-sub-slice extract of docs/slice2-plan.md, so each agent reads only what its sub-slice needs (AP-38).
Usage: plan_extract.py <id> <out.md>
Includes: §0; §1's table and the id's §1.1 entry; the §2/§3/§5 sections for the id's kind; the id's §6.1 entry;
§7 in full; every §8 bullet that mentions the id. The header lists what was left out (read the full plan for it)."""
import re, sys
PLAN = '/home/zhengyew/telelean/docs/slice2-plan.md'
sid, out = sys.argv[1], sys.argv[2]
text = open(PLAN).read()
lines = text.split('\n')

def sections(level):
    """[(title, start, end)] for headings of exactly this level ('## ' or '### ')."""
    idx = [(i, l) for i, l in enumerate(lines) if l.startswith(level) and not l.startswith(level + '#')]
    res = []
    for k, (i, l) in enumerate(idx):
        end = len(lines)
        for j in range(i + 1, len(lines)):
            if lines[j].startswith('## ') or (level == '### ' and lines[j].startswith('### ')):
                end = j; break
        res.append((l, i, end))
    return res

top = sections('## ')
sub = sections('### ')
def top_named(prefix):
    return next(((t, a, b) for t, a, b in top if t.startswith('## ' + prefix)), None)
def sub_named(prefix):
    return next(((t, a, b) for t, a, b in sub if t.startswith('### ' + prefix)), None)
def block(t):
    return '\n'.join(lines[t[1]:t[2]]) if t else ''

def entry(section, sid):
    """The paragraph block starting with **<sid>: or **<sid>** inside a section, up to the next **<id> entry."""
    t = section
    if not t: return ''
    body = lines[t[1]:t[2]]
    start = None
    pat = re.compile(r'^\*\*' + re.escape(sid) + r'(\*\*|:| )')
    nxt = re.compile(r'^\*\*\d[a-z0-9]*(\*\*|:| )')
    for k, l in enumerate(body):
        if start is None and pat.match(l): start = k; continue
        if start is not None and nxt.match(l): return '\n'.join(body[start:k])
    return '\n'.join(body[start:]) if start is not None else ''

kind = {'2e': 'runner', '2f': 'runner', '2g': 'webview', '2h': 'webview', '2i': 'cleanup', '2j1': 'core-ui', '2j2': 'core-ui', '2k1': 'core-ui', '2k2': 'runner'}.get(sid, 'runner')
parts, left = [], []
parts.append(block(top_named('0.')))
s1 = top_named('1.')
s11 = sub_named('1.1')
# §1 without §1.1, then the id's §1.1 entry only
parts.append('\n'.join(lines[s1[1]:s11[1]]) if s1 and s11 else block(s1))
parts.append('### 1.1 Scope of ' + sid + ' (extract)\n\n' + entry(s11, sid))
left.append('§1.1 entries of other sub-slices')
# §2: contracts by kind
want2 = {'runner': ['2.2', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9'], 'webview': ['2.3', '2.4', '2.9'], 'cleanup': [], 'core-ui': ['2.2', '2.3', '2.4', '2.6', '2.8', '2.9']}[kind]
for t, a, b in sub:
    if t.startswith('### 2.'):
        num = t[4:].split(' ')[0]
        if num in want2: parts.append('\n'.join(lines[a:b]))
        else: left.append(t[4:].strip())
# §3 for the runner, §5 for the webview
if kind in ('runner', 'core-ui'): parts.append(block(top_named('3.')))
else: left.append('§3 (the session engine)')
if kind in ('webview', 'core-ui'): parts.append(block(top_named('5.')))
else: left.append('§5 (the review UI)')
if kind == 'core-ui':
    for t, a, b in sub:
        if t.startswith('### 4.'):
            num = t[4:].split(' ')[0]
            if num in ('4.5', '4.6', '4.7', '4.11'): parts.append('\n'.join(lines[a:b]))
            else: left.append(t[4:].strip())
else:
    left.append('§4 (core items and checks; built in 2a1-2c2: read the code)')
# §6.1 entry
parts.append('## 6.1 Tests for ' + sid + ' (extract)\n\n' + entry(sub_named('6.1'), sid))
c62 = sub_named('6.2')
if c62: parts.append('\n'.join(lines[c62[1]:c62[2]]))
left.append('§6.1 entries of other sub-slices')
parts.append(block(top_named('7.')))
# §8: top-level bullets mentioning the id
s8 = top_named('8.')
mention = re.compile(r'(?<![0-9a-z])' + re.escape(sid) + r'(?![0-9a-z])')
bul, cur = [], []
for l in lines[s8[1] + 1:s8[2]]:
    if l.startswith('- '):
        if cur: bul.append(cur)
        cur = [l]
    elif cur: cur.append(l)
if cur: bul.append(cur)
keep = ['\n'.join(b) for b in bul if mention.search('\n'.join(b))]
parts.append('## 8. Change log (extract: the ' + str(len(keep)) + ' of ' + str(len(bul)) + ' entries that mention ' + sid + ')\n\n' + '\n'.join(keep))
left.append('§8 entries that do not mention ' + sid)
head = ('# Plan extract for sub-slice ' + sid + ' (from docs/slice2-plan.md, AP-38)\n\n'
        'This file holds only the parts of /home/zhengyew/telelean/docs/slice2-plan.md that ' + sid + ' needs. '
        'Read the full plan only for a section cited here but not included. Left out: ' + '; '.join(left) + '.\n')
open(out, 'w').write(head + '\n\n' + '\n\n'.join(p for p in parts if p.strip()) + '\n')
print(out, len(open(out).read().split('\n')), 'lines', '| §8 kept', len(keep), 'of', len(bul))
