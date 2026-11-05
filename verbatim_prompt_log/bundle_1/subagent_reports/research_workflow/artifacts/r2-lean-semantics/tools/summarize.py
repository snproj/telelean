import json, sys
d = json.load(open(sys.argv[1]))
print("timing", d.get("timingMs"))
STD = ("propext", "Classical.choice", "Quot.sound")
def key(x):
    return (x["module"], (x["range"] or {}).get("line", 0))
for x in sorted(d["decls"], key=key):
    std = [a for a in x["axioms"] if a in STD]
    line = (x["range"] or {}).get("line", "?")
    mod = x["module"].split(".")[-1]
    print(f'{mod:12} L{line!s:>3} {x["kind"]:11} {x["name"]:26} cls={x["axiomClass"]!s:31} '
          f'stmt={x["isStatementDef"]!s:5} prop={x["typeIsProp"]!s:5} sorry={x["usesSorry"]!s:5} '
          f'userAx={x["userAxioms"]} std={std} deps={x["directDeps"]}')
