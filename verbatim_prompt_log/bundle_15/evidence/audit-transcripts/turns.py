import json, sys
p = sys.argv[1]
with open(p) as f:
    for i, line in enumerate(f):
        try: d = json.loads(line)
        except: continue
        if d.get('type') == 'user':
            m = d.get('message', {})
            c = m.get('content')
            istr = False
            if isinstance(c, list):
                if any(isinstance(x, dict) and x.get('type') == 'tool_result' for x in c):
                    continue
                txt = ' '.join(x.get('text', '') for x in c if isinstance(x, dict) and x.get('type') == 'text')
            else:
                txt = str(c)
            if d.get('isMeta'): tag='META'
            else: tag=''
            print(i, d.get('timestamp'), tag, d.get('origin'), d.get('promptSource'), d.get('turnOrigin'), d.get('isCompactSummary'), repr(txt[:160]))
        elif d.get('type') == 'system':
            print(i, d.get('timestamp'), 'SYSTEM', d.get('subtype'), str(d.get('content'))[:100])
        elif d.get('type') == 'queue-operation' and d.get('operation') not in ('dequeue',):
            pass
