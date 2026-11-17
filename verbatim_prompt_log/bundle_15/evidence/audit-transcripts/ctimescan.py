import os, sys, collections, datetime
H='/home/zhengyew'
def ts(s): return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
W={'t9':(ts('2026-11-01T02:16:34Z'),ts('2026-11-02T03:45:00Z')),
   't10-12':(ts('2026-11-10T16:18:00Z'),ts('2026-11-10T16:38:00Z')),
   't13-14':(ts('2026-11-10T16:38:00Z'),ts('2026-11-10T19:15:00Z'))}
skip={H+'/telelean', H+'/.cache/mathlib', H+'/snap/vivaldi', H+'/snap/discord', H+'/snap/telegram-desktop', H+'/.claude/projects/-home-zhengyew-telelean', H+'/.local/share/Steam', H+'/.steam'}
cnt=collections.Counter(); ex={}
for root, dirs, files in os.walk(H):
    if root in skip: dirs[:]=[]; continue
    dirs[:]=[d for d in dirs if os.path.join(root,d) not in skip and not os.path.islink(os.path.join(root,d))]
    for n in files+dirs:
        p=os.path.join(root,n)
        try: st=os.lstat(p)
        except Exception: continue
        for w,(a,b) in W.items():
            if a<=st.st_ctime<b:
                rel=p[len(H)+1:].split('/')
                k=(w,'/'.join(rel[:3]))
                cnt[k]+=1; ex.setdefault(k,p)
for (w,k),v in sorted(cnt.items()): print(w, v, k)
