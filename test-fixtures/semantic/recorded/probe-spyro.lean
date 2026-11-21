import Lean.CoreM
import Lean.Util.FoldConsts
#eval show IO Unit from do
  let mods : Array Lean.Import := (("Model.Spyro.Vocabulary Model.Spyro.Main Model").splitOn " ").toArray.map (fun s => { module := (s.splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous })
  let env ← Lean.importModules mods {} (loadExts := false) (level := .private)
  let names : Array Lean.Name := (("Spyro.Character Spyro.Game Spyro.Character.exists Spyro.instNonemptyCharacter Spyro.Game.exists Spyro.instNonemptyGame Spyro.HasDarkPast Spyro.IsPG Spyro.GoodAddition Spyro.cynder Spyro.newSpyro Spyro.cynder_dark_past Spyro.cynder_dark_past.holds Spyro.new_spyro_pg Spyro.new_spyro_pg.holds Spyro.cynder_not_good Spyro.nonexistent").splitOn " ").toArray.map (fun s => (s.splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous)
  let lib : Lean.Name := (("Model").splitOn ".").foldl Lean.Name.mkStr Lean.Name.anonymous
  let probed : Lean.NameSet := names.foldl (fun s n => s.insert n) {}
  let valueOf (ci : Lean.ConstantInfo) : Array Lean.Name :=
    match ci with
    | .defnInfo v => v.value.getUsedConstants
    | .thmInfo v => v.value.getUsedConstants
    | .opaqueInfo v => v.value.getUsedConstants
    | _ => #[]
  let typeOf (ci : Lean.ConstantInfo) : Array Lean.Name :=
    match ci with
    | .inductInfo v => v.ctors.foldl (fun acc c => match env.find? c with
      | some cc => acc ++ cc.type.getUsedConstants
      | none => acc) ci.type.getUsedConstants
    | _ => ci.type.getUsedConstants
  let inLibrary (c : Lean.Name) : Bool :=
    match env.getModuleIdxFor? c with
    | some i => match env.header.moduleNames[i.toNat]? with
      | some m => lib.isPrefixOf m
      | none => false
    | none => false
  let walk (start : Array Lean.Name) (next : Lean.ConstantInfo → Array Lean.Name) : String := Id.run do
    let mut stack : List Lean.Name := start.toList
    let mut seen : Lean.NameSet := {}
    let mut acc : Array String := #[]
    while true do
      match stack with
      | [] => break
      | c :: rest =>
        stack := rest
        if seen.contains c then continue
        seen := seen.insert c
        if probed.contains c then acc := acc.push c.toString.quote
        else if inLibrary c then
          match env.find? c with
          | some cj => stack := (next cj).toList ++ stack
          | none => pure ()
    return "[" ++ ",".intercalate acc.toList ++ "]"
  let mut values : Array String := #[]
  let mut types : Array String := #[]
  for n in names do
    match env.find? n with
    | none =>
      values := values.push "null"
      types := types.push "null"
    | some ci =>
      values := values.push (walk (valueOf ci) valueOf)
      types := types.push (walk (typeOf ci) (fun cj => typeOf cj ++ valueOf cj))
  IO.println ("{\"telelean-value-consts\":[" ++ ",".intercalate values.toList ++ "],\"telelean-type-consts\":[" ++ ",".intercalate types.toList ++ "]}")
