import json, sys
d = json.load(open(sys.argv[1]))
for x in d["decls"]:
    print(f'{x["name"]:24} kind={x["kind"]:8} axiomClass={str(x["axiomClass"]):28} unsafe={x["isUnsafe"]} '
          f'partial={x["isPartial"]} implementedBy={x["implementedBy"]} extern={x["extern"]} nonStd={x["nonStandardAxioms"]}')
