import sys, collections, time, os

S = os.path.dirname(os.path.abspath(__file__))
HOME = '/home/zhengyew/'
W1 = (1793499360, 1793591100)
W2 = (1794327540, 1794338100)
START = W1[0]

def win(t):
    if t is None or t < 0:
        return 'nobirth'
    if t < START:
        return 'before'
    if W1[0] <= t < W1[1]:
        return 'W1'
    if W2[0] <= t < W2[1]:
        return 'W2'
    if t < W2[0]:
        return 'between'
    return 'after'

DEEP2 = {'.cache', '.config', 'snap', '.claude', '.vscode', '.var', '.mozilla', '.local', '.npm', '.copilot', '.elan', '.vscode-server', '.pki', 'telelean'}
DEEP3 = {'.local/share', '.local/state', '.config/Code', '.claude/projects', '.config/google-chrome', 'snap/code', '.cache/claude-cli-nodejs', 'telelean/packages', '.vscode/extensions', '.local/opt', '.cache/vscode-cpptools'}

def key(p, depth_override=None):
    rel = p[len(HOME):] if p.startswith(HOME) else p
    parts = rel.split('/')
    if depth_override:
        return '/'.join(parts[:depth_override])
    k = parts[0]
    if k in DEEP2 and len(parts) > 1:
        k2 = '/'.join(parts[:2])
        if k2 in DEEP3 and len(parts) > 2:
            return '/'.join(parts[:3])
        return k2
    return k

recs = []
for rec in open(os.path.join(S, 'stat_all.nul'), 'rb').read().split(b'\0'):
    if not rec:
        continue
    w, z, y, s, f, n = rec.split(b'\t', 5)
    recs.append((int(w), int(z), int(y), int(s), f.decode(), n.decode('utf-8', 'surrogateescape')))

mode = sys.argv[1] if len(sys.argv) > 1 else 'summary'
if mode == 'summary':
    agg = collections.defaultdict(lambda: collections.Counter())
    sizes = collections.defaultdict(lambda: collections.Counter())
    tmin = {}
    tmax = {}
    for w, z, y, s, f, n in recs:
        k = key(n)
        cw = win(z)
        bw = win(w)
        agg[k]['c_' + cw] += 1
        agg[k]['b_' + bw] += 1
        if f.startswith('regular'):
            sizes[k]['b_' + bw] += s
            sizes[k]['all'] += s
        for ww in (cw,):
            kk = (k, ww)
            tmin[kk] = min(tmin.get(kk, z), z)
            tmax[kk] = max(tmax.get(kk, z), z)
    def fmt(t):
        return time.strftime('%m-%dT%H:%M', time.gmtime(t))
    rows = sorted(agg.items(), key=lambda kv: -(kv[1]['c_W1'] + kv[1]['c_W2']))
    for k, c in rows:
        line = f"{k}\tcW1={c['c_W1']} cW2={c['c_W2']} cBetween={c['c_between']} cAfter={c['c_after']} | bW1={c['b_W1']} bW2={c['b_W2']} bBetween={c['b_between']} bAfter={c['b_after']} bBefore={c['b_before']} | szAll={sizes[k]['all']} szBornW1={sizes[k]['b_W1']} szBornW2={sizes[k]['b_W2']}"
        spans = []
        for ww in ('W1', 'W2'):
            if (k, ww) in tmin:
                spans.append(f"{ww}:{fmt(tmin[(k, ww)])}..{fmt(tmax[(k, ww)])}")
        print(line + ' | ' + ' '.join(spans))
elif mode == 'list':
    # list entries under a prefix with times
    prefix = sys.argv[2]
    wsel = sys.argv[3] if len(sys.argv) > 3 else None
    for w, z, y, s, f, n in sorted(recs, key=lambda r: r[1]):
        if not n.startswith(prefix):
            continue
        if wsel and win(z) != wsel and win(w) != wsel:
            continue
        b = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(w)) if w > 0 else '-'
        c = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(z))
        print(f"b={b}Z c={c}Z sz={s} {f[:4]} {n}")
elif mode == 'subagg':
    prefix = sys.argv[2]
    depth = int(sys.argv[3])
    agg = collections.defaultdict(lambda: collections.Counter())
    for w, z, y, s, f, n in recs:
        if not n.startswith(prefix):
            continue
        k = key(n, depth)
        agg[k]['c_' + win(z)] += 1
        agg[k]['b_' + win(w)] += 1
        if f.startswith('regular'):
            agg[k]['sz'] += s
            agg[k]['szb_' + win(w)] += s
        agg[k]['zmin'] = min(agg[k].get('zmin', z), z) if agg[k].get('zmin') else z
        agg[k]['zmax'] = max(agg[k].get('zmax', 0), z)
    for k, c in sorted(agg.items()):
        zmin = time.strftime('%m-%dT%H:%M', time.gmtime(c['zmin']))
        zmax = time.strftime('%m-%dT%H:%M', time.gmtime(c['zmax']))
        print(f"{k}\tcW1={c['c_W1']} cW2={c['c_W2']} cBtw={c['c_between']} cAft={c['c_after']} bW1={c['b_W1']} bW2={c['b_W2']} bBtw={c['b_between']} bAft={c['b_after']} bBef={c['b_before']} sz={c['sz']} szbW1={c['szb_W1']} szbW2={c['szb_W2']} ctime[{zmin}..{zmax}]")
