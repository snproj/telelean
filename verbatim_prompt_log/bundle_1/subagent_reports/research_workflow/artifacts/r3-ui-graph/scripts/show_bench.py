import json, sys
for line in open(sys.argv[1]):
    d = json.loads(line); print(d['ua'][:90], '| label:', d['flags'])
    print('%-5s %-6s %-15s %-2s %-3s %6s %7s %8s | %-15s | %-13s | %-22s %4s %-7s %s' % ('N','E','mode','cv','hit','domN','dom+lay','initPath','js mean/p95','layout mean','raf mean/p95/max','slow','hitMs','sub(mean ms)'))
    for r in d['results']:
        if 'error' in r: print(r); continue
        j=r['jsPerFrame']; l=r['layoutPerFrame']; f=r['rafInterval']
        sub = ' '.join('%s=%.2f' % (k, v['mean']) for k, v in (r.get('sub') or {}).items())
        print('%-5s %-6s %-15s %-2s %-3s %6s %7s %8s | %6.2f %7.2f | %6.2f        | %6.1f %6.1f %6.1f %4s %-7s %s' % (r['N'],r['E'],r['mode'],int(r['cv']),int(r['withHit']),r['domNodes'],r['tDomBuildLayoutMs'],r['tInitialPathsMs'],j['mean'],j['p95'],l['mean'],f['mean'],f['p95'],f['max'],r['slowFrames20ms'],r['hitTestMsPerCall'],sub))
