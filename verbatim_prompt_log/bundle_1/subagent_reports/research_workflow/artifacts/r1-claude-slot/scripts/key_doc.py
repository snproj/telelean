import sys, re
# usage: key_doc.py <d.ts> <TypeStartRegex> <key1> [key2 ...]  -> prints full JSDoc + declaration line for each key inside the type literal (depth 1)
path, type_re = sys.argv[1], sys.argv[2]
keys = sys.argv[3:]
lines = open(path, encoding='utf-8').read().split('\n')
s = next(i for i, l in enumerate(lines) if re.search(type_re, l))
depth = 0
i = s
end = None
for j in range(s, len(lines)):
    depth += lines[j].count('{') - lines[j].count('}')
    if depth <= 0 and j > s:
        end = j
        break
for k in keys:
    pat = re.compile(r'^    (readonly )?' + re.escape(k) + r'\??:')
    for j in range(s + 1, end):
        if pat.match(lines[j]):
            # collect preceding JSDoc
            doc = []
            m = j - 1
            if lines[m].strip().endswith('*/'):
                while m >= s and not lines[m].strip().startswith('/**'):
                    doc.insert(0, lines[m].rstrip())
                    m -= 1
                doc.insert(0, lines[m].rstrip())
            print(f"===== {k} (line {j+1}) =====")
            print('\n'.join(doc))
            # declaration (may span lines until a line ending with ';' at depth 1)
            decl = [lines[j]]
            d2 = lines[j].count('{') - lines[j].count('}')
            q = j + 1
            while d2 > 0 and q < end:
                decl.append(lines[q]); d2 += lines[q].count('{') - lines[q].count('}'); q += 1
            print('\n'.join(decl)[:1400])
            print()
            break
    else:
        print(f"===== {k}: NOT FOUND in type =====")
