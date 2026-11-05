import sys, re
# usage: dts_block.py <file.d.ts> <start-regex> [max_lines]
# Prints the block starting at the first line matching start-regex, until braces balance (for type literals / interfaces).
path, start_re = sys.argv[1], sys.argv[2]
max_lines = int(sys.argv[3]) if len(sys.argv) > 3 else 100000
lines = open(path, encoding='utf-8').read().split('\n')
idx = next(i for i, l in enumerate(lines) if re.search(start_re, l))
depth = 0
out = []
for i in range(idx, len(lines)):
    l = lines[i]
    out.append(f"{i+1}: {l}")
    depth += l.count('{') - l.count('}')
    if depth <= 0 and i > idx:
        break
    if len(out) >= max_lines:
        break
print('\n'.join(out))
