"""Example graph-analysis script: consumes `telelean export --format-version 1` JSON only."""
import json, sys
from collections import defaultdict

g = json.load(open(sys.argv[1]))
major = g["format_version"].split(".")[0]
assert g["format"] == "telelean-graph" and major == "1", "unsupported export format"
nodes = {n["id"]: n for n in g["nodes"]}
premises_of = defaultdict(set)
for e in g["edges"]:
    if e.get("type") == "premise":          # unknown edge types are ignored (forward compatible)
        premises_of[e["target"]].add(e["source"])

def assumption_base(nid, seen=None):
    """Transitive declared support of a node, restricted to ASSUMPTION nodes."""
    seen = set() if seen is None else seen
    out = set()
    for p in premises_of[nid]:
        if p in seen:
            continue
        seen.add(p)
        if nodes[p]["kind"] == "ASSUMPTION":
            out.add(p)
        out |= assumption_base(p, seen)
    return out

used = set()
for nid, n in nodes.items():
    if n["kind"] in ("GOAL", "DERIVATION"):
        base = assumption_base(nid)
        used |= base
        print(f"{n['kind']:10} {nid:22} rests on {sorted(base)}  [formal={n['status']['formal']}, check={n['status']['check']}]")
print("unused assumptions:", sorted(i for i, n in nodes.items() if n["kind"] == "ASSUMPTION" and i not in used))
print("assumptions without rationale:", sorted(i for i, n in nodes.items() if n["kind"] == "ASSUMPTION" and not n.get("rationale")))
print("informal (no Lean yet):", sorted(i for i, n in nodes.items() if not n["status"]["formal"]))
