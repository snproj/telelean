"""Generate a synthetic telelean workspace: F facts, R rules, R derivations, G goals (+ DEFINITIONs)."""
import os, sys, random
out, F, R, G = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
codeless_every = 10   # every 10th assumption/goal is code-less
random.seed(1)
os.makedirs(os.path.join(out, "Big"), exist_ok=True)
def blk(i, kind, name, extra=""):
    return f"/-\n@@ telelean v1\nid: {i}\nkind: {kind}\nnatural_name: \"{name}\"\n{extra}-/\n"
parts = {}
parts["Defs"] = "".join(blk(f"p-{j}", "DEFINITION", f"proposition P{j}") + f"opaque P{j} : Prop\n\n" for j in range(F)) + \
                "".join(blk(f"q-{i}", "DEFINITION", f"proposition Q{i}") + f"opaque Q{i} : Prop\n\n" for i in range(R))
parts["Facts"] = "".join(blk(f"fact-{j}", "ASSUMPTION", f"P{j} holds", f"rationale: \"observed {j}\"\n") + f"axiom f{j} : P{j}\n\n" for j in range(F))
rules = []
for i in range(R):
    x, y = random.randrange(F), random.randrange(F)
    rules.append((x, y))
parts["Rules"] = "".join(blk(f"rule-{i}", "ASSUMPTION", f"P{x} and P{y} give Q{i}", "rationale: \"domain knowledge\"\n") + f"axiom r{i} : P{x} → P{y} → Q{i}\n\n" for i, (x, y) in enumerate(rules))
parts["Derivs"] = "".join(blk(f"deriv-{i}", "DERIVATION", f"Q{i} follows", f"premises: rule-{i}, fact-{x}, fact-{y}\n") + f"theorem d{i} : Q{i} := by\n  exact r{i} f{x} f{y}\n\n" for i, (x, y) in enumerate(rules))
gl = []
for k in range(G):
    i = random.randrange(R)
    if k % codeless_every == 0:
        gl.append(blk(f"goal-{k}", "GOAL", f"open question {k}", f"premises: deriv-{i}\n") + "\n")
    else:
        gl.append(blk(f"goal-{k}", "GOAL", f"Q{i} and P0 {k}", f"premises: deriv-{i}, fact-0\n") + f"theorem g{k} : Q{i} ∧ P0 := by\n  sorry\n\n")
parts["Goals"] = "".join(gl)
order = ["Defs", "Facts", "Rules", "Derivs", "Goals"]
prev = None
for name in order:
    hdr = f"import Big.{prev}\n\n" if prev else ""
    open(os.path.join(out, "Big", name + ".lean"), "w").write(hdr + parts[name])
    prev = name
open(os.path.join(out, "Big.lean"), "w").write("".join(f"import Big.{n}\n" for n in order))
open(os.path.join(out, "Single.lean"), "w").write("".join(parts[n] for n in order))
open(os.path.join(out, "lean-toolchain"), "w").write("leanprover/lean4:v4.35.0\n")
open(os.path.join(out, "lakefile.toml"), "w").write('name = "big"\ndefaultTargets = ["Big"]\n\n[[lean_lib]]\nname = "Big"\n')
total = F + R + F + R + R + G
lines = sum(p.count("\n") for p in parts.values())
print(f"nodes={total} lines={lines}")
