import json, sys
d = json.load(sys.stdin)
print("== axioms declared (class) ==")
for a in sorted(d["axiomsDeclared"], key=lambda a: (a["range"] or {}).get("line", 0)):
    print(f'  L{(a["range"] or {}).get("line","?"):>3} {a["class"]:<12} {a["name"]} : {a["type"]}' + ("  [PRIVATE]" if a["isPrivate"] else "") + ("  [UNSAFE]" if a["isUnsafe"] else ""))
print("== proofs (typeIsProp & not axiom) ==")
prop_axioms = {a["name"] for a in d["axiomsDeclared"] if a["class"] == "prop"}
for x in sorted(d["decls"], key=lambda x: (x["range"] or {}).get("line", 0)):
    if x["kind"] == "axiom": continue
    flags = []
    if x["usesSorry"]: flags.append("SORRY")
    if x["foreignAxioms"]: flags.append("FOREIGN:" + ",".join(x["foreignAxioms"]))
    if x["isUnsafe"]: flags.append("UNSAFE")
    if x["isPartial"]: flags.append("PARTIAL")
    if x["implementedBy"]: flags.append("IMPLEMENTED_BY:" + x["implementedBy"])
    if x["extern"]: flags.append("EXTERN")
    if x["internal"]: flags.append("internal")
    assumptions = [a.split(".")[-1] for a in x["modelAxiomsUsed"] if a in prop_axioms]
    print(f'  L{(x["range"] or {}).get("line","?"):>3} {x["kind"]:<8} prop={str(x["typeIsProp"]):<5} {x["name"]}  assumptions={assumptions} {" ".join(flags)}')
