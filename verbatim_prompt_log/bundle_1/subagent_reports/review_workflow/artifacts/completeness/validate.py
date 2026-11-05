import json, re, sys
spec = open(sys.argv[1]).read()
d = json.load(open(sys.argv[2]))
S = d["sentences"]; R = d["requirements"]; I = d["implied_constraints"]; T = d["tensions"]
errs = []
# 1. ids sequential
for k, s in enumerate(S, 1):
    if s["id"] != f"S{k}": errs.append(f"sentence id order: {s['id']} at {k}")
sid = {s["id"] for s in S}
rid = {r["id"]: r for r in R}; iid = {c["id"]: c for c in I}
if len(rid) != len(R): errs.append("dup requirement ids")
if len(iid) != len(I): errs.append("dup IC ids")
# 2. verbatim + in-order coverage
pos = 0; gaps = []
for s in S:
    t = s["text"]
    j = spec.find(t, pos)
    if j < 0:
        errs.append(f"{s['id']} not found verbatim after pos {pos}: {t[:60]!r}"); continue
    gaps.append(spec[pos:j]); pos = j + len(t)
gaps.append(spec[pos:])
left = [g.strip() for g in gaps if g.strip()]
print("Uncovered non-whitespace fragments:", left)
# 3. maps_to validity and non-empty
valid = set(rid) | set(iid) | {"CONTEXT"}
for s in S:
    if not s["maps_to"]: errs.append(f"{s['id']} unmapped")
    for m in s["maps_to"]:
        if m not in valid: errs.append(f"{s['id']} maps to unknown {m}")
    if "CONTEXT" in s["maps_to"] and not s.get("note"): errs.append(f"{s['id']} CONTEXT without note")
# 4. requirement sources valid + bidirectional
for r in R:
    for x in r["source_sentences"]:
        if x not in sid: errs.append(f"{r['id']} cites unknown {x}")
        elif r["id"] not in next(s for s in S if s["id"]==x)["maps_to"]:
            errs.append(f"{r['id']} cites {x} but {x} does not map to {r['id']}")
for s in S:
    for m in s["maps_to"]:
        if m in rid and s["id"] not in rid[m]["source_sentences"]:
            errs.append(f"{s['id']} maps to {m} but {m} does not cite {s['id']}")
        if m in iid and s["id"] not in iid[m]["derived_from"]:
            errs.append(f"{s['id']} maps to {m} but {m}.derived_from lacks {s['id']}")
# 5. IC derived_from valid + bidirectional for sentences
allids = sid | set(rid) | set(iid)
for c in I:
    for x in c["derived_from"]:
        if x not in allids: errs.append(f"{c['id']} derived_from unknown {x}")
        if x in sid and c["id"] not in next(s for s in S if s["id"]==x)["maps_to"]:
            errs.append(f"{c['id']} derived_from {x} but {x} does not map to {c['id']}")
# 6. ids mentioned inside prose exist
prose = json.dumps(d)
for ref in sorted(set(re.findall(r'\b(?:SEM|DATA|UI|LLM|LEAN|PROC|NFR|IC)-\d+\b', prose))):
    if ref not in rid and ref not in iid: errs.append(f"prose references unknown id {ref}")
for ref in sorted(set(re.findall(r'\bS\d+\b', prose)), key=lambda x:int(x[1:])):
    if ref not in sid: errs.append(f"prose references unknown sentence {ref}")
nt = len(T)
for ref in sorted(set(re.findall(r'\bT(\d+)\b', prose)), key=int):
    if not (1 <= int(ref) <= nt): errs.append(f"prose references unknown tension T{ref}")
for t in T:
    for x in t["sentences"]:
        if x not in sid: errs.append(f"tension cites unknown {x}")
# 7. requirements not cited by any sentence / ICs not reached
unref = [r for r in rid if not any(r in s["maps_to"] for s in S)]
print("Requirements with no sentence mapping:", unref)
print("ICs with no sentence mapping:", [c for c in iid if not any(c in s["maps_to"] for s in S)])
from collections import Counter
print("counts: sentences", len(S), "| requirements", len(R), Counter(r["group"] for r in R), "| ICs", len(I), Counter(c["significance"] for c in I), "| tensions", nt)
print("strengths:", Counter(r["strength"] for r in R))
print("ERRORS:" if errs else "NO ERRORS", *errs, sep="\n  ")
