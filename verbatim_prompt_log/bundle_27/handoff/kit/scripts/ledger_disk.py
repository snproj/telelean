"""Ledger step 1: inode-change-time scan since the session start, grouped by folder (2-3 levels)."""
import os, sys, collections, time
start = time.mktime(time.strptime('2026-11-21 15:16:31', '%Y-%m-%d %H:%M:%S')) - time.timezone  # UTC -> epoch
roots = ['/home/zhengyew', '/tmp', '/var/tmp', '/dev/shm', '/var/crash', '/run/user/1002']
skip_prefix = ('/proc', '/sys')
agg = collections.defaultdict(lambda: [0, 0]); errors = 0
def key(p):
    parts = p.split('/')
    if p.startswith('/home/zhengyew/telelean/'): depth = 5 if '/packages/' in p or '/verbatim_prompt_log/' in p else 4
    elif p.startswith('/tmp/claude-1002/'): depth = 5
    elif p.startswith('/home/zhengyew/.'): depth = 5
    else: depth = 4
    return '/'.join(parts[:depth])
for root in roots:
    dev = None
    try: dev = os.lstat(root).st_dev
    except OSError: continue
    for dp, dns, fns in os.walk(root, onerror=lambda e: None):
        try:
            if os.lstat(dp).st_dev != dev: dns[:] = []; continue
        except OSError: continue
        for n in fns + dns:
            p = os.path.join(dp, n)
            try: st = os.lstat(p)
            except OSError: errors += 1; continue
            if st.st_ctime >= start:
                a = agg[key(p)]; a[0] += 1; a[1] += st.st_size if not os.path.isdir(p) else 0
rows = sorted(agg.items(), key=lambda kv: -kv[1][1])
print('groups', len(rows), 'errors', errors)
for k, (n, s) in rows: print(f'{s/1e6:10.1f} MB {n:8d} {k}')
