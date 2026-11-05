import sys
# usage: ctx.py <file> <needle> [max_hits] [window]
path, needle = sys.argv[1], sys.argv[2]
max_hits = int(sys.argv[3]) if len(sys.argv) > 3 else 5
w = int(sys.argv[4]) if len(sys.argv) > 4 else 220
data = open(path, encoding='utf-8', errors='replace').read()
idx = 0; n = 0
while n < max_hits:
    i = data.find(needle, idx)
    if i < 0: break
    s = max(0, i - w); e = min(len(data), i + len(needle) + w)
    print(f"--- hit {n+1} @ {i} ---")
    print(data[s:e].replace('\n', '\\n'))
    idx = i + len(needle); n += 1
print(f"[total hits shown: {n}]")
