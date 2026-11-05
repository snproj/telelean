import json, sys
import jsonschema
schema = json.load(open(sys.argv[1]))
doc = json.load(open(sys.argv[2]))
v = jsonschema.Draft202012Validator(schema)
errs = sorted(v.iter_errors(doc), key=lambda e: list(e.path))
for e in errs[:20]:
    print("INVALID at", "/".join(map(str, e.path)), ":", e.message[:200])
print("errors:", len(errs), "| nodes:", len(doc["nodes"]), "edges:", len(doc["edges"]), "diags:", len(doc["diagnostics"]))
