import sys, time, os
sys.path.insert(0, sys.argv[1])
import telelean_ref as T
text = open(sys.argv[2], encoding="utf-8").read()
def code_stream(fm):
    return [fm.text[a:b] for a, b in fm.toks]
t = time.perf_counter(); fm = T.FileModel("S.lean", text); t1 = time.perf_counter()
diags = []
bl = [b for c in fm.comments if c.kind != "line" for b in [T.parse_block("S.lean", text, c, diags)] if b]
ids = {id(b.comment) for b in bl}
for b in bl: b.binding = fm.bind(b, ids)
t2 = time.perf_counter()
print(f"file {len(text)/1024:.0f} KiB, {text.count(chr(10))} lines: lex+index {1000*(t1-t):.1f} ms, blocks+binding ({len(bl)} blocks) {1000*(t2-t1):.1f} ms")
# markup-only edit: change a natural_name and add a line inside a block
edited = text.replace('natural_name: "P0 holds"', 'natural_name: "P0 holds (edited)"\ntags: x', 1)
t3 = time.perf_counter(); fm2 = T.FileModel("S.lean", edited); same = code_stream(fm) == code_stream(fm2); t4 = time.perf_counter()
print(f"markup-only edit detection: code token streams identical={same} ({1000*(t4-t3):.1f} ms incl. re-lex)")
edited2 = text.replace("axiom f0 : P0", "axiom f0 : P1", 1)
fm3 = T.FileModel("S.lean", edited2)
print(f"code edit detection: identical={code_stream(fm) == code_stream(fm3)}")
