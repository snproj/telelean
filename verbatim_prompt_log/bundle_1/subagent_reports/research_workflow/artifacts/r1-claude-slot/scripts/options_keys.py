import sys, re
# Prints top-level property names of the Options type (4-space indented keys), with the first doc line above each key.
path = sys.argv[1]
start = sys.argv[2] if len(sys.argv) > 2 else r'^export declare type Options = \{'
lines = open(path, encoding='utf-8').read().split('\n')
s = next(i for i, l in enumerate(lines) if re.search(start, l))
depth = 0
doc = []
for i in range(s, len(lines)):
    l = lines[i]
    if i > s and depth == 1:
        m = re.match(r'^    (readonly )?([A-Za-z_][A-Za-z0-9_]*)\??:\s*(.*)$', l)
        if m:
            name = m.group(2)
            typ = m.group(3)[:150]
            print(f"{name} :: {typ}")
            print(f"    {' | '.join(doc)[:260] if doc else ''}")
        if l.strip().startswith('/**') or l.strip().startswith('*') or l.strip().startswith('//'):
            pass
    if depth == 1 and (l.strip().startswith('*') or l.strip().startswith('/**')):
        t = l.strip().lstrip('/*').strip().rstrip('*/').strip()
        if t and not t.startswith('@'):
            doc.append(t)
    elif depth == 1 and not l.strip().startswith('*'):
        if not (re.match(r'^    (readonly )?([A-Za-z_][A-Za-z0-9_]*)\??:', l)):
            pass
    if depth == 1 and re.match(r'^    (readonly )?([A-Za-z_][A-Za-z0-9_]*)\??:', l):
        doc = []
    depth += l.count('{') - l.count('}')
    if depth <= 0 and i > s:
        break
