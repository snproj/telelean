"""Unit tests for the telelean v1 reference prototype. Run: python3 -I test_telelean_ref.py"""
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import telelean_ref as T


def blocks_of(text):
    diags = []
    fm = T.FileModel("X.lean", text)
    bl = [b for c in fm.comments if c.kind != "line" for b in [T.parse_block("X.lean", text, c, diags)] if b]
    ids = {id(b.comment) for b in bl}
    for b in bl:
        b.binding = fm.bind(b, ids)
    return bl, diags


def graph_of(files: dict, facts=None):
    d = tempfile.mkdtemp()
    for name, txt in files.items():
        p = os.path.join(d, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", newline="") as f:
            f.write(txt)
    return T.build_graph(d, facts)


def B(i, kind="ASSUMPTION", extra=""):
    return f'/-\n@@ telelean v1\nid: {i}\nkind: {kind}\nnatural_name: "n {i}"\nrationale: r\n{extra}-/\n'


class Lexing(unittest.TestCase):
    def test_comment_markers_inside_strings_chars_raw_and_guillemets_are_ignored(self):
        src = ('def s := "/- not a comment"\ndef c := \'"\'\ndef r := r#"-/ and /-"#\n'
               'def «weird/-name» := 1\ndef h\' := 2\n' + B("a") + "axiom a : True\n")
        bl, diags = blocks_of(src)
        self.assertEqual([b.fields["id"] for b in bl], ["a"])
        self.assertEqual(bl[0].binding["decls"][0]["name"], "a")

    def test_nested_comment_and_line_comment(self):
        src = "/- outer /- inner -/ still -/\n-- /- line comment\n" + B("b") + "axiom b : True\n"
        bl, _ = blocks_of(src)
        self.assertEqual(bl[0].binding["mode"], "adjacent")

    def test_unterminated_block_reported(self):
        bl, diags = blocks_of('/-\n@@ telelean v1\nid: u\nkind: GOAL\nnatural_name: "x /- y"\n-/\n')
        self.assertIn("TL010", [d.code for d in diags])

    def test_crlf(self):
        src = B("c").replace("\n", "\r\n") + "axiom c : True\r\n"
        bl, diags = blocks_of(src)
        self.assertEqual(bl[0].fields["kind"], "ASSUMPTION")
        self.assertEqual(bl[0].binding["decls"][0]["name"], "c")

    def test_block_in_docstring_is_flagged_not_parsed(self):
        bl, diags = blocks_of('/--\n@@ telelean v1\nid: d\n-/\ndef d := 1\n')
        self.assertEqual(bl, [])
        self.assertIn("TL009", [x.code for x in diags])


class Values(unittest.TestCase):
    def test_json_string_escapes_for_comment_delimiters(self):
        bl, diags = blocks_of('/-\n@@ telelean v1\nid: e\nkind: GOAL\nnatural_name: "A -\\/ B and C \\u002f- D"\n-/\n')
        self.assertEqual(bl[0].fields["natural_name"], "A -/ B and C /- D")

    def test_raw_text_value_with_colons_hashes_and_norway(self):
        bl, _ = blocks_of('/-\n@@ telelean v1\nid: f\nkind: ASSUMPTION\nnatural_name: Cynder: the #1 dragon\n'
                          'rationale: NO\n-/\n')
        self.assertEqual(bl[0].fields["natural_name"], "Cynder: the #1 dragon")
        self.assertEqual(bl[0].fields["rationale"], "NO")

    def test_lists_brackets_and_repetition(self):
        bl, _ = blocks_of('/-\n@@ telelean v1\nid: g\nkind: GOAL\nnatural_name: x\npremises: [a, b]\n'
                          'tags: t1, t2\ntags: t3\n-/\n')
        self.assertEqual(bl[0].fields["premises"], ["a", "b"])
        self.assertEqual(bl[0].fields["tags"], ["t1", "t2", "t3"])

    def test_description_body_dedent_and_markdown_escapes_preserved(self):
        bl, _ = blocks_of('/-\n@@ telelean v1\nid: h\nkind: GOAL\nnatural_name: x\n---\n  Para one\n'
                          '  uses -\\/ escape\n-/\n')
        self.assertEqual(bl[0].description, "Para one\nuses -\\/ escape")

    def test_alias_lowercase_unknown_extension_missing_version(self):
        bl, diags = blocks_of('/-\n@@ telelean\nid: i\ntype: goal\nnatural_name: x\nfoo: 1\nmytool.prio: 3\n-/\n')
        codes = sorted(d.code for d in diags)
        self.assertEqual(bl[0].fields["kind"], "GOAL")
        self.assertEqual(bl[0].extensions["mytool.prio"], ["3"])
        for c in ("TL002", "TL016", "TL018", "TL019"):
            self.assertIn(c, codes)

    def test_newer_version_is_warning_not_failure(self):
        bl, diags = blocks_of('/-\n@@ telelean v2\nid: j\nkind: GOAL\nnatural_name: x\nnewfield: y\n-/\n')
        self.assertEqual(bl[0].version, 2)
        self.assertIn("TL008", [d.code for d in diags])

    def test_missing_required_and_bad_values(self):
        bl, diags = blocks_of('/-\n@@ telelean v1\nid: Bad_ID\nkind: AXIOM\n-/\n')
        codes = [d.code for d in diags]
        self.assertGreaterEqual(codes.count("TL004"), 2)
        self.assertIn("TL003", codes)


class Binding(unittest.TestCase):
    def test_blank_line_makes_codeless_with_hint(self):
        g = graph_of({"A.lean": B("k") + "\naxiom k : True\n"})
        n = g["nodes"][0]
        self.assertEqual(n["lean"]["binding"], "none")
        self.assertIn("TL013", [d["code"] for d in g["diagnostics"]])

    def test_next_block_stops_binding(self):
        bl, _ = blocks_of(B("l1") + B("l2") + "axiom l2 : True\n")
        self.assertEqual(bl[0].binding["mode"], "none")
        self.assertEqual(bl[1].binding["decls"][0]["name"], "l2")

    def test_docstring_attributes_modifiers_and_intervening_comment(self):
        src = (B("m") + "-- a note\n/-- doc -/\n@[simp, reducible]\nprivate noncomputable def m : Nat := 1\n")
        bl, _ = blocks_of(src)
        self.assertEqual(bl[0].binding["decls"][0]["name"], "m")
        self.assertEqual(bl[0].binding["decls"][0]["keyword"], "def")

    def test_namespaces_qualify_names(self):
        src = "namespace Spyro.Lore\nsection\n" + B("n") + "theorem cyn : True := trivial\nend\nend Spyro.Lore\n"
        bl, _ = blocks_of(src)
        self.assertEqual(bl[0].binding["decls"][0]["name"], "Spyro.Lore.cyn")

    def test_structure_class_inductive_instance_example(self):
        src = (B("o1", "DEFINITION") + "structure Character where\n  name : String\n\n" +
               B("o2", "DEFINITION") + "class inductive Foo\n\n" +
               B("o3", "DEFINITION") + "instance (priority := low) instFoo : Inhabited Nat := ⟨0⟩\n\n" +
               B("o4", "DEFINITION") + "instance : Inhabited Nat := ⟨0⟩\n\n" +
               B("o5", "GOAL") + "example : True := trivial\n")
        bl, _ = blocks_of(src)
        got = [(b.binding["adjacent"] or {}).get("keyword") for b in bl]
        names = [(b.binding["adjacent"] or {}).get("name") for b in bl]
        self.assertEqual(got, ["structure", "class inductive", "instance", "instance", "example"])
        self.assertEqual(names, ["Character", "Foo", "instFoo", None, None])

    def test_explicit_lean_field_overrides_adjacency(self):
        bl, _ = blocks_of(B("p", "DEFINITION", "lean: Character, Character.isPG\n") + "\n-- later\n")
        self.assertEqual(bl[0].binding["mode"], "explicit")
        self.assertEqual([d["name"] for d in bl[0].binding["decls"]], ["Character", "Character.isPG"])


class Graph(unittest.TestCase):
    def test_duplicates_dangling_cycles_and_bound_twice(self):
        g = graph_of({
            "A.lean": B("q") + "axiom q : True\n\n" + B("q") + "\n",
            "B.lean": B("r", "DERIVATION", "premises: s, missing\n") + "\n" + B("s", "DERIVATION", "premises: r\n") + "\n",
            "C.lean": B("t", "DEFINITION", "lean: q\n") + "\n",
        })
        codes = [d["code"] for d in g["diagnostics"]]
        for c in ("TL006", "TL007", "TL015", "TL017"):
            self.assertIn(c, codes)

    def test_semantic_purity_and_hidden_axioms(self):
        files = {"M.lean": B("a1") + "axiom a1 : P\n\n" +
                 B("d1", "DERIVATION", "premises: a1\n") + "theorem d1 : Q := sorry\n\n" +
                 B("d2", "DERIVATION", "premises: a1\n") + "theorem d2 : R := h a1\n"}
        facts = {"schema": "telelean.lean-facts/v0", "lean_version": "4.35.0", "files": ["M.lean"], "decls": [
            {"name": "a1", "leanKind": "axiom", "isProp": True, "usesSorry": False, "axioms": ["a1"], "refs": [], "typeRefs": [], "module": "M", "file": "M.lean"},
            {"name": "d1", "leanKind": "theorem", "isProp": True, "usesSorry": True, "axioms": ["sorryAx"], "refs": [], "typeRefs": [], "module": "M", "file": "M.lean"},
            {"name": "d2", "leanKind": "theorem", "isProp": True, "usesSorry": False, "axioms": ["a1", "hidden"], "refs": ["a1"], "typeRefs": [], "module": "M", "file": "M.lean"},
            {"name": "hidden", "leanKind": "axiom", "isProp": True, "usesSorry": False, "axioms": ["hidden"], "refs": [], "typeRefs": [], "module": "M", "file": "M.lean"}]}
        g = graph_of(files, facts)
        codes = [d["code"] for d in g["diagnostics"]]
        for c in ("TL102", "TL103", "TL104"):
            self.assertIn(c, codes)
        st = {n["id"]: n["status"] for n in g["nodes"]}
        self.assertEqual(st["d1"]["check"], "sorry")
        self.assertEqual(st["d2"]["purity"], "impure")


if __name__ == "__main__":
    unittest.main(verbosity=1)
