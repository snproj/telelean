import yaml, tomllib, json
cases = {
 "norway":        "country: NO\n",
 "yes_no_on_off": "answer: yes\nlight: off\n",
 "version_float": "version: 1.10\n",
 "sexagesimal":   "duration: 1:20\n",
 "octal":         "mode: 0755\n",
 "colon_in_text": "natural_name: Cynder: the dark dragon\n",
 "hash_in_text":  "natural_name: PG games #1 rule\n",
 "leading_at":    "natural_name: @cynder is dark\n",
 "null_word":     "rationale: null\n",
 "tilde":         "rationale: ~\n",
 "quoted_ok":     'natural_name: "Cynder would not be a good addition to the new Spyro game"\ntype: GOAL\n',
 "bracket_text":  "natural_name: [draft] Cynder is dark\n",
 "dash_start":    "natural_name: - not a list?\n",
 "date":          "created: 2026-11-01\n",
}
for k, src in cases.items():
    try:
        v = yaml.safe_load(src)
        print(f"{k:14} -> {v!r}")
    except Exception as e:
        print(f"{k:14} -> ERROR {type(e).__name__}: {str(e).splitlines()[0]}")
print("--- TOML equivalents (strings must be quoted):")
for src in ['natural_name = "Cynder: the dark dragon"\ncountry = "NO"\n', 'natural_name = Cynder\n']:
    try: print(repr(tomllib.loads(src)))
    except Exception as e: print("ERROR", type(e).__name__, e)
