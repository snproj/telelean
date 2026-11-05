import re,sys
spec=open(sys.argv[1]).read()
doc=open(sys.argv[2]).read()
rows=[l for l in doc.splitlines() if re.match(r'^\| S\d+ \|',l)]
print(len(rows),"rows")
pos=0
for r in rows:
    cells=[c.strip() for c in r.strip('|').split('|')]
    sid,sect,text=cells[0],cells[1],cells[2]
    if '<code>' in text: 
        print(sid,"code block (skipped)"); continue
    j=spec.find(text,pos)
    if j<0: print(sid,"NOT VERBATIM:",text[:80])
    else: pos=j+len(text)
print("done")
