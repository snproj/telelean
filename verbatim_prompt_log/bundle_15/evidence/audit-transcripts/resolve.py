import json, re, os, collections
REPO='/home/zhengyew/telelean'; SCRT='/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
HOME='/home/zhengyew'
calls=[json.loads(l) for l in open('calls.jsonl')]
ASG=re.compile(r'(?:^|[\s;&|(])(?:export\s+|local\s+|declare\s+(?:-\w+\s+)?)?([A-Za-z_][A-Za-z0-9_]*)=("([^"]*)"|\'([^\']*)\'|([^\s;&|)]*))')
def varmap(cmd):
    vm={'HOME':HOME}
    for m in ASG.finditer(cmd):
        name=m.group(1); val=m.group(3) if m.group(3) is not None else (m.group(4) if m.group(4) is not None else m.group(5))
        if name not in vm or vm[name] in ('',):
            vm[name]=val
    # iterate resolution
    for _ in range(4):
        for k,v in list(vm.items()):
            vm[k]=subst(v, vm, depth=0)
    return vm
def subst(s, vm, depth=0):
    def rep(m):
        n=m.group(1) or m.group(2)
        return vm.get(n, m.group(0))
    s=re.sub(r'\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)', rep, s)
    if s.startswith('~/'): s=HOME+s[1:]
    if s=='~': s=HOME
    return s
def classify(p, cwd_hint=None):
    if p in ('/dev/null','/dev/stdout','/dev/stderr','/dev/tty') or p.startswith('/dev/fd/') or p.startswith('/proc/self/fd'): return 'devnull'
    if p.startswith(SCRT): return 'scratch'
    if p.startswith(REPO+'/') or p==REPO: return 'repo'
    if p.startswith('/tmp/'): return 'tmp-other'
    if p.startswith('/dev/shm'): return 'devshm'
    if p.startswith(HOME+'/'): return 'HOME-other'
    if p.startswith('/'): return 'system'
    if '$' in p: return 'unresolved'
    return 'relative'
if __name__=='__main__':
    out=collections.Counter(); rows=[]
    for line in open('redirs.txt'):
        ci,ts,run,agent,op,tgt,sc=line.rstrip('\n').split('\t',6)
        cmd=(calls[int(ci)]['input'] or {}).get('command') or ''
        vm=varmap(cmd)
        r=subst(tgt, vm)
        c=classify(r)
        out[c]+=1
        rows.append((c,ts,run,agent,op,r,tgt,sc))
    print(out)
    with open('redirs_resolved.txt','w') as f:
        for r in rows: f.write('\t'.join(r)+'\n')
