"""Resolve every write-ish target (redirections, tee, cp/mv/install/ln/rsync dest, mkdir/touch/rm/rmdir/chmod args,
tar -C/-f, sed -i files, unzip -d, git -C) with per-agent variable memory and cd tracking."""
import json, re, os, collections, shlex, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import strip_heredocs, split_simple, tokens, program_of, redirections
from resolve import subst, classify, ASG, HOME, REPO, SCRT
calls=[json.loads(l) for l in open('calls.jsonl')]
agent_vars=collections.defaultdict(dict)
rows=[]
def upd_vars(vm, text):
    for m in ASG.finditer(text):
        name=m.group(1); val=m.group(3) if m.group(3) is not None else (m.group(4) if m.group(4) is not None else m.group(5))
        if val is None: continue
        vm[name]=subst(val, vm)
WRITE_PROGS={'cp','mv','install','ln','rsync','mkdir','touch','rm','rmdir','chmod','chown','tee','tar','unzip','sed','truncate','shred','unlink','patch','git','mktemp','dd','find','xargs','ar','zip','gzip','gunzip','split','rename','perl','curl','wget','npm','npx','pip','pip3'}
for ci,d in enumerate(calls):
    if d['tool'] not in ('Bash','Monitor'): continue
    cmd=(d['input'] or {}).get('command') or ''
    key=d['agent']
    vm=dict(agent_vars[key]); vm.setdefault('HOME', HOME)
    stripped, docs = strip_heredocs(cmd)
    # heredoc bodies may define vars (env.sh)
    for op,delim,body in docs: upd_vars(vm, body)
    upd_vars(vm, stripped)
    cwd = REPO if d['run']!='main' else REPO
    for sc in split_simple(stripped, []):
        toks=tokens(sc)
        prog,args,wr,asg=program_of(toks)
        for a in asg:
            if '=' in a and not a.startswith('UNSET:'):
                n,v=a.split('=',1); vm[n]=subst(v.strip('"\''), vm)
        if prog is None: continue
        p=os.path.basename(prog)
        def R(x):
            x=subst(x, vm)
            if x and not x.startswith('/') and not x.startswith('$') and not x.startswith('~'):
                x=os.path.normpath(os.path.join(cwd, x))
            return x
        if p=='cd' and args:
            nc=R(args[0]);
            if not nc.startswith('$'): cwd=nc
            continue
        if p=='pushd' and args:
            nc=R(args[0]); cwd=nc if not nc.startswith('$') else cwd; continue
        for op,tgt in redirections(sc):
            rt=R(tgt); rows.append(('redir'+op, classify(rt), d['ts'], d['run'], d['agent'], rt, sc[:250]))
        targets=[]
        nonopt=[a for a in args if not a.startswith('-')]
        if p in ('cp','mv','install','ln','rsync') and nonopt: targets=[nonopt[-1]]
        elif p in ('mkdir','touch','rm','rmdir','chmod','chown','truncate','shred','unlink'): targets=[a for a in nonopt if not (p in('chmod','chown') and a==nonopt[0])]
        elif p=='tee': targets=nonopt
        elif p=='sed' and any(a.startswith('-i') or a=='--in-place' for a in args): targets=nonopt[1:]
        elif p=='tar':
            for i,a in enumerate(args):
                if a in ('-C','--directory') and i+1<len(args): targets.append(args[i+1])
                if a in ('-f','--file') and i+1<len(args) and ('c' in ''.join(x for x in args if x.startswith('-') and not x.startswith('--'))): targets.append(args[i+1])
            if any(('x' in a or 'c' in a) and not a.startswith('--') for a in args[:1]) and not targets: targets=['(tar in cwd)']
        elif p=='unzip':
            targets=[args[i+1] for i,a in enumerate(args) if a=='-d' and i+1<len(args)] or ['(unzip in cwd)']
        elif p=='find' and ('-delete' in args or '-exec' in args or '-execdir' in args):
            targets=[nonopt[0] if nonopt else '.']
        elif p=='git':
            sub=[a for a in args if not a.startswith('-')]
            gC=[args[i+1] for i,a in enumerate(args) if a=='-C' and i+1<len(args)]
            targets=[('git '+(sub[0] if sub else '')+' @ '+R(gC[0] if gC else cwd))]
            rows.append(('git', classify(R(gC[0]) if gC else cwd), d['ts'], d['run'], d['agent'], targets[0], sc[:250])); targets=[]
        elif p=='patch': targets=nonopt or ['(patch in cwd)']
        for t in targets:
            rt=R(t) if not t.startswith('(') else t+' '+cwd
            rows.append((p, classify(rt) if not t.startswith('(') else classify(cwd), d['ts'], d['run'], d['agent'], rt, sc[:250]))
    agent_vars[key].update({k:v for k,v in vm.items()})
with open('targets.tsv','w') as f:
    for r in rows: f.write('\t'.join(x.replace('\t',' ').replace('\n',' ') for x in r)+'\n')
c=collections.Counter((r[0] if not r[0].startswith('redir') else 'redir', r[1]) for r in rows)
for k,v in sorted(c.items()): print(k,v)
