import sys, re
# usage: ctx.py FILE PATTERN [before] [after] [maxhits]
path, pat = sys.argv[1], sys.argv[2]
b = int(sys.argv[3]) if len(sys.argv) > 3 else 200
a = int(sys.argv[4]) if len(sys.argv) > 4 else 200
m = int(sys.argv[5]) if len(sys.argv) > 5 else 10
s = open(path, encoding='utf-8', errors='replace').read()
n = 0
for mt in re.finditer(pat, s):
    st, en = mt.start(), mt.end()
    print(f'--- hit @{st}')
    print(s[max(0, st-b):en+a])
    n += 1
    if n >= m: break
print(f'=== {n} hits shown (total {len(re.findall(pat, s))})')
