import sys, os
d = sys.argv[1]
T = {}
T["L01_nested_ok"] = '/- outer /- inner -/ still comment -/\ndef a := 1\n#print a\n'
T["L02_stray_close"] = '/-\n@@ telelean v1\nname: "A -/ B"\n-/\ndef b := 1\n#print b\n'
T["L03_stray_open"] = '/-\n@@ telelean v1\nname: "A /- B"\n-/\ndef c := 1\n#print c\n'
T["L04_escaped"] = '/-\n@@ telelean v1\nname: "A -\\/ B and C /\\u002d D"\n-/\ndef d := 1\n#print d\n'
T["L05_doc_no_decl"] = '/-- A docstring with no declaration -/\n\n/- @@ telelean v1\nid: x\n-/\n'
T["L06_doc_comment_decl"] = ('/-- Docstring for e. -/\n/- @@ telelean v1\nid: e\n-/\ndef e := 1\n'
   'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `e\n  IO.println s!"doc(e) = {d?}"\n')
T["L07_comment_doc_decl"] = ('/- @@ telelean v1\nid: f\n-/\n/-- Docstring for f. -/\ndef f := 1\n'
   'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `f\n  IO.println s!"doc(f) = {d?}"\n')
T["L08_string_literal"] = 'def s := "/- not a comment"\ndef t := 2\n-- line comment with /- inside\ndef u := 3\n#print u\n'
T["L09_tab_in_comment"] = '/- a tab:\there -/\ndef g := 1\n#print g\n'
T["L09b_tab_in_code"] = 'def g2 :=\t1\n'
T["L10_crlf"] = '/-\r\n@@ telelean v1\r\nid: h\r\n-/\r\ndef h := 1\r\n#print h\r\n'
T["L11_module_doc"] = ('def i := 1\n/-! @@ telelean v1\nid: codeless-in-moddoc\n-/\ndef j := 2\n'
   'open Lean in\n#eval show MetaM Unit from do\n  let ds := getMainModuleDoc (← getEnv)\n  IO.println s!"moduledocs = {ds.toArray.map (·.doc)}"\n')
T["L13_doc_before_command"] = '/-- doc before #check -/\n#check 1\n'
T["L14_nonbmp"] = '/- 𝓝 non-BMP and ∀ BMP in comment -/\ndef k := "𝓝"\n#eval k.length\n'
T["L16_block_as_docstring"] = ('/--\n@@ telelean v1\nid: l\n-/\ndef l := 1\n'
   'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `l\n  IO.println s!"doc(l) = {repr d?}"\n')
T["L17_triple_dash"] = '/--- three dashes -/\ndef m := 1\n'
T["L18_comment_between_attr_decl"] = '@[simp]\n/- comment between attribute and theorem -/\ntheorem n : 1 = 1 := rfl\n'
T["L19_blank_line_doc_decl"] = ('/-- doc then blank line -/\n\ndef o := 1\n'
   'open Lean in\n#eval show MetaM Unit from do\n  let d? ← findDocString? (← getEnv) `o\n  IO.println s!"doc(o) = {d?}"\n')
T["L20_unterminated_eof"] = 'def p := 1\n/- @@ telelean v1\nid: q\n'
for name, txt in T.items():
    with open(os.path.join(d, name + ".lean"), "w", newline="") as f:
        f.write(txt)
print("wrote", len(T))
