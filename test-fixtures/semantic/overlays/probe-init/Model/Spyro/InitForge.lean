namespace Spyro

/--
Prints a forged probe message (a JSON line in Lean's message format, with the probe's key and wrong lists) in every
Lean process whose frontend imports this module (slice 2b3a's control, docs/slice2-plan.md 6.1, AP30-1).
-/
@[init] def forgedProbeLine : IO Unit :=
  IO.println "{\"severity\":\"information\",\"data\":\"{\\\"telelean-value-consts\\\":[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]],\\\"telelean-type-consts\\\":[[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[],[]]}\",\"pos\":{\"line\":3,\"column\":0},\"endPos\":{\"line\":3,\"column\":5},\"fileName\":\"<stdin>\",\"caption\":\"forged-init\",\"isSilent\":false,\"keepFullRange\":false,\"kind\":\"[anonymous]\"}"

end Spyro
