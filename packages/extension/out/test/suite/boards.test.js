"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/import-meta-url.mjs
var import_node_url = require("node:url");
var teleleanImportMetaUrl = (0, import_node_url.pathToFileURL)(__filename).href;

// test/suite/boards.test.ts
var assert2 = __toESM(require("node:assert/strict"));
var import_node_fs2 = require("node:fs");
var import_promises2 = require("node:fs/promises");
var path3 = __toESM(require("node:path"));
var vscode2 = __toESM(require("vscode"));

// ../core/src/graph.ts
var PRESUPPOSITION_PREFIX = "presup:";
function edgeId(type, source, target) {
  return `${type}:${source}->${target}`;
}
function declaredEdges(nodes) {
  const edges = [];
  for (const node of nodes) {
    for (const premise of node.premises) {
      edges.push({
        id: edgeId("premise", premise, node.id),
        type: "premise",
        source: premise,
        target: node.id,
        origin: "declared"
      });
    }
  }
  return edges;
}
function verifiedEdges(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [];
  for (const node of nodes) {
    if (node.status.proof.kind !== "proved") continue;
    for (const dep of node.status.proof.footprint) {
      if (dep.startsWith(PRESUPPOSITION_PREFIX) || !ids.has(dep)) continue;
      edges.push({
        id: edgeId("verified", dep, node.id),
        type: "verified",
        source: dep,
        target: node.id,
        origin: "lean",
        where: "proof"
      });
    }
  }
  return edges;
}
function deriveEdges(nodes) {
  return [...declaredEdges(nodes), ...verifiedEdges(nodes)];
}
function buildGraph(args) {
  return {
    version: args.version,
    subject: args.subject,
    nodes: args.nodes,
    edges: deriveEdges(args.nodes),
    vocabulary: args.vocabulary ?? [],
    diagnostics: args.diagnostics ?? [],
    semantic: args.semantic ?? { state: "unavailable" }
  };
}

// ../core/src/paths.ts
var TELELEAN_DIR = ".telelean";
var DEFAULT_LIBRARY = "Model";
var SUBJECT_NAME_PATTERN = /^[A-Z][A-Za-z0-9_]{0,63}$/;
function isSubjectName(name) {
  return SUBJECT_NAME_PATTERN.test(name);
}
function defaultProjectConfig() {
  return { format: "telelean-config", version: 1, library: DEFAULT_LIBRARY };
}
function serializeProjectConfig(config) {
  return `${JSON.stringify({ format: config.format, version: config.version, library: config.library }, null, 2)}
`;
}
function libraryRootFile(library = DEFAULT_LIBRARY) {
  return `${library}.lean`;
}
function subjectRootFile(subject, library = DEFAULT_LIBRARY) {
  return `${library}/${subject}.lean`;
}
function subjectModulePath(subject, module2, library = DEFAULT_LIBRARY) {
  return `${library}/${subject}/${module2}.lean`;
}
function subjectSidecarDir(subject) {
  return `${TELELEAN_DIR}/subjects/${subject}`;
}
function layoutPath(subject) {
  return `${subjectSidecarDir(subject)}/layout.json`;
}
function moduleOfPath(path4) {
  if (!path4.endsWith(".lean") || path4.startsWith("/") || path4.split("/").some((s) => s === "" || s === "." || s === "..")) return void 0;
  return path4.slice(0, -".lean".length).split("/").join(".");
}
function pathOfModule(module2) {
  return `${module2.split(".").join("/")}.lean`;
}
function subjectOfPath(path4, library = DEFAULT_LIBRARY) {
  const parts = path4.split("/");
  if (parts[0] !== library || parts.length < 2) return void 0;
  if (parts.length === 2) {
    const file = parts[1] ?? "";
    return file.endsWith(".lean") ? file.slice(0, -".lean".length) || void 0 : void 0;
  }
  return parts[1] || void 0;
}

// ../core/src/project/text.ts
var LineMap = class {
  constructor(text) {
    this.text = text;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  text;
  starts = [0];
  get lineCount() {
    return this.starts.length;
  }
  positionAt(offset) {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if ((this.starts[mid] ?? 0) <= clamped) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, character: clamped - (this.starts[lo] ?? 0) };
  }
  offsetAt(position) {
    if (position.line < 0) return 0;
    if (position.line >= this.starts.length) return this.text.length;
    const start = this.starts[position.line] ?? 0;
    const next = position.line + 1 < this.starts.length ? (this.starts[position.line + 1] ?? this.text.length) - 1 : this.text.length;
    const lineEnd = next > start && this.text.charCodeAt(next - 1) === 13 ? next - 1 : next;
    return Math.min(start + Math.max(0, position.character), lineEnd);
  }
  rangeOf(start, end) {
    return { start: this.positionAt(start), end: this.positionAt(end) };
  }
};
function comparePositions(a, b) {
  return a.line - b.line || a.character - b.character;
}
function rangeContains(outer, inner) {
  return comparePositions(outer.start, inner) <= 0 && comparePositions(inner, outer.end) <= 0;
}
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}
function blankComments(text) {
  const out = text.split("");
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "-" && next === "-") {
      let j = i;
      while (j < text.length && text[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (c === "/" && next === "-") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "/" && text[j + 1] === "-") {
          depth++;
          j += 2;
        } else if (text[j] === "-" && text[j + 1] === "/") {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      blank(i, Math.min(j + 1, text.length));
      i = j + 1;
    } else i++;
  }
  return out.join("");
}
var OPENERS = "([{\u27E8\u2983";
var CLOSERS = ")]}\u27E9\u2984";
function splitTopLevelArrows(type) {
  const text = normalizeWhitespace(type);
  if (/^(∀|∃|∃!|fun\b|λ|Π|Σ)/.test(text)) return [text];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === "\u2192" || c === "-" && text[i + 1] === ">")) {
      parts.push(text.slice(start, i).trim());
      start = i + (c === "\u2192" ? 1 : 2);
      if (c !== "\u2192") i++;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
function topLevelColon(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? "";
    if (OPENERS.includes(c)) depth++;
    else if (CLOSERS.includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === ":" && text[i + 1] !== "=" && text[i - 1] !== ":") return i;
  }
  return -1;
}
function parseBinders(text) {
  const binders = [];
  let i = 0;
  const src = text.trim();
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i] ?? "")) i++;
    if (i >= src.length) break;
    const open = src[i] ?? "";
    const close = open === "(" ? ")" : open === "{" ? "}" : open === "[" ? "]" : open === "\u2983" ? "\u2984" : "";
    if (!close) return void 0;
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      const c = src[j] ?? "";
      if (OPENERS.includes(c)) depth++;
      else if (CLOSERS.includes(c)) {
        depth--;
        if (depth === 0) break;
      }
    }
    if (j >= src.length) return void 0;
    const inner = src.slice(i + 1, j);
    const colon = topLevelColon(inner);
    if (colon < 0) binders.push({ explicit: open === "(", names: [], type: inner.trim() });
    else {
      const names = inner.slice(0, colon).trim().split(/\s+/).filter(Boolean);
      binders.push({ explicit: open === "(", names, type: inner.slice(colon + 1).trim() });
    }
    i = j + 1;
  }
  return binders;
}
var IDENT = /(?:«[^»]*»|[\p{L}_][\p{L}\p{N}_'!?₀-₉ₐ-ₜ]*)(?:\.(?:«[^»]*»|[\p{L}_][\p{L}\p{N}_'!?₀-₉ₐ-ₜ]*))*/gu;
function identifierTokens(text) {
  const out = [];
  for (const match2 of text.matchAll(IDENT)) {
    const start = match2.index ?? 0;
    const before = start > 0 ? text[start - 1] ?? "" : "";
    if (before && /[\p{L}\p{N}_'.]/u.test(before)) continue;
    out.push({ text: match2[0], start });
  }
  return out;
}
function namespaceTable(text) {
  const clean = blankComments(text);
  const stack = [];
  const changes = [];
  let lineStart = 0;
  for (const line of clean.split("\n")) {
    const start = lineStart;
    lineStart += line.length + 1;
    const ns = /^namespace\s+(\S+)/.exec(line);
    if (ns) stack.push({ kind: "namespace", parts: (ns[1] ?? "").split(".").filter(Boolean) });
    else if (/^section(\s|$)/.test(line)) stack.push({ kind: "section", parts: [] });
    else if (/^end(\s|$)/.test(line)) stack.pop();
    else continue;
    changes.push({ offset: start, namespaces: stack.flatMap((entry) => entry.parts) });
  }
  return (offset) => {
    let lo = 0;
    let hi = changes.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if ((changes[mid]?.offset ?? Infinity) < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? [] : [...changes[lo - 1]?.namespaces ?? []];
  };
}
function resolutionCandidates(name, namespace) {
  if (name.startsWith("_root_.")) return [name.slice("_root_.".length)];
  const out = [];
  for (let i = namespace.length; i > 0; i--) out.push(`${namespace.slice(0, i).join(".")}.${name}`);
  out.push(name);
  return out;
}

// ../core/src/run.ts
var DEFAULT_RUN_CAPS = {
  maxTurns: 80,
  maxChecks: 25,
  maxAgentMs: 20 * 6e4,
  leanJobMs: 12e4,
  maxGateAttempts: 3
};

// ../core/src/facts.ts
var STANDARD_AXIOM_NAMES = ["propext", "Classical.choice", "Quot.sound"];
var SORRY_AXIOM = "sorryAx";
var HOLDS_SUFFIX = ".holds";
function holdsName(statement) {
  return `${statement}${HOLDS_SUFFIX}`;
}

// ../core/src/actions.ts
var ActionError = class extends Error {
  constructor(code, message2, dependents = []) {
    super(message2);
    this.code = code;
    this.dependents = dependents;
    this.name = "ActionError";
  }
  code;
  dependents;
};

// ../core/src/layout.ts
function emptyLayout() {
  return { format: "telelean-layout", version: 1, columns: { AXIOM: [], PROPOSITION: [] } };
}
function serializeLayout(layout) {
  const out = {
    format: "telelean-layout",
    version: 1,
    columns: { AXIOM: layout.columns.AXIOM, PROPOSITION: layout.columns.PROPOSITION }
  };
  const ids = Object.keys(layout.positions ?? {}).sort();
  if (ids.length > 0) {
    const positions = {};
    for (const id of ids) {
      const position = layout.positions?.[id];
      if (position) positions[id] = { x: position.x, y: position.y };
    }
    out["positions"] = positions;
  }
  if (layout.collapsed) out["collapsed"] = layout.collapsed;
  return `${JSON.stringify(out, null, 2)}
`;
}

// ../core/src/markup/types.ts
var FIELD_ORDER = [
  "id",
  "type",
  "natural_name",
  "rationale",
  "stance",
  "source",
  "premises",
  "follows_from",
  "asserted",
  "lean",
  "supersedes",
  "refines",
  "tags",
  "origin",
  "session",
  "worded_by"
];

// ../core/src/markup/decls.ts
var DECL_KEYWORDS = /* @__PURE__ */ new Set([
  "axiom",
  "theorem",
  "lemma",
  "def",
  "abbrev",
  "opaque",
  "instance",
  "example",
  "inductive",
  "coinductive",
  "structure",
  "class",
  "mutual"
]);
var MODIFIERS = /* @__PURE__ */ new Set([
  "private",
  "public",
  "protected",
  "noncomputable",
  "unsafe",
  "partial",
  "nonrec",
  "scoped",
  "local",
  "meta"
]);
var COMMAND_WORDS = /* @__PURE__ */ new Set([
  ...DECL_KEYWORDS,
  ...MODIFIERS,
  "end",
  "namespace",
  "section",
  "open",
  "export",
  "variable",
  "universe",
  "set_option",
  "attribute",
  "notation",
  "infix",
  "infixl",
  "infixr",
  "prefix",
  "postfix",
  "macro",
  "macro_rules",
  "syntax",
  "elab",
  "elab_rules",
  "deriving",
  "initialize",
  "builtin_initialize",
  "import",
  "declare_syntax_cat",
  "add_decl_doc",
  "include",
  "omit",
  "module",
  "prelude"
]);

// ../core/src/markup/values.ts
var KNOWN_KEYS = new Set(FIELD_ORDER);
function noRationaleMessage(stance) {
  return stance === "rule" ? "This rule has no `rationale:` yet (no source yet: where does it come from?)." : "This axiom has no `rationale:` yet (no reason yet: why do you hold it?).";
}

// ../core/src/project/edges.ts
function isProvedOrConditional(node) {
  return node.status.proof.kind === "proved" || node.status.proof.kind === "conditional";
}
function onOf(node) {
  return node.status.proof.kind === "conditional" ? node.status.proof.on : [];
}
function footprintOf(node) {
  const proof = node.status.proof;
  return proof.kind === "proved" ? proof.footprint : proof.kind === "conditional" ? proof.footprint ?? [] : [];
}
function walkFrom(node, start, first, next, declFacts, owners, isFresh, strict) {
  const statement = node.lean.statement;
  if (first === void 0) return void 0;
  const ids = [];
  const reached = /* @__PURE__ */ new Map();
  const count = (id, name) => {
    if (!ids.includes(id)) ids.push(id);
    reached.set(id, [...reached.get(id) ?? [], name]);
  };
  let outdated = start.file !== void 0 && !isFresh(start.file);
  const visited = /* @__PURE__ */ new Set([start.name]);
  const queue = [...first];
  while (queue.length > 0) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const user = owners.holdsOwner.get(name);
    if (user !== void 0) {
      if (user !== node.id) count(user, name);
      continue;
    }
    const owner = owners.ownerOfDecl.get(name);
    if (owner !== void 0 && owner !== node.id) {
      if (name !== owners.statementOf.get(owner)) count(owner, name);
      const facts2 = declFacts.get(name);
      if (facts2 === void 0 || !isFresh(facts2.file)) outdated = true;
      continue;
    }
    if (owner === node.id && name === statement) continue;
    const facts = declFacts.get(name);
    if (!facts) {
      if (strict) outdated = true;
      continue;
    }
    const more = next(facts);
    if (more === void 0) return void 0;
    if (!isFresh(facts.file)) outdated = true;
    for (const n of more) if (!visited.has(n)) queue.push(n);
  }
  return { ids, outdated, reached };
}
function directWalk(node, input, holdsOwner, statementOf) {
  const statement = node.lean.statement;
  const start = statement ? input.declFacts.get(holdsName(statement)) : void 0;
  if (!start) return { ids: [], from: "source", outdated: false, reached: /* @__PURE__ */ new Map() };
  const owners = { ownerOfDecl: input.ownerOfDecl, holdsOwner, statementOf: statementOf ?? statementsOf(holdsOwner) };
  const fresh = input.freshFiles;
  const isFresh = (file) => fresh === void 0 || fresh.has(file);
  const values = (f) => f.valueConsts;
  const fromValues = walkFrom(node, start, values(start), values, input.declFacts, owners, isFresh, true);
  if (fromValues) return { ...fromValues, from: "proof" };
  const refs = (f) => f.refs.map((r) => r.name);
  const fromRefs = walkFrom(node, start, refs(start), refs, input.declFacts, owners, isFresh, false);
  return { ...fromRefs, from: "source" };
}
function explainedBy(uses, reached, declFacts, holdsOwner, byId) {
  const explained = new Set(uses);
  for (const u of uses) {
    let known = false;
    for (const decl of reached?.get(u) ?? []) {
      const axioms = declFacts.get(decl)?.axioms;
      if (axioms === void 0) continue;
      known = true;
      for (const axiom of axioms) {
        const owner = holdsOwner.get(axiom);
        if (owner !== void 0) explained.add(owner);
      }
    }
    const used = byId.get(u);
    if (!known && used && isProvedOrConditional(used)) for (const x of footprintOf(used)) explained.add(x);
  }
  return explained;
}
function ownersOf(nodes, ownerOfDecl) {
  const statementOwner = /* @__PURE__ */ new Map();
  const holdsOwner = /* @__PURE__ */ new Map();
  const statementOf = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const statement = node.lean.statement;
    if (!statement || ownerOfDecl.get(statement) !== node.id) continue;
    statementOwner.set(statement, node.id);
    statementOf.set(node.id, statement);
    holdsOwner.set(holdsName(statement), node.id);
  }
  return { holdsOwner, statementOf, statementOwner };
}
function statementsOf(holdsOwner) {
  const out = /* @__PURE__ */ new Map();
  for (const [holds, id] of holdsOwner) out.set(id, holds.slice(0, -".holds".length));
  return out;
}
function computeEdges(input) {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const { holdsOwner, statementOf, statementOwner } = ownersOf(input.nodes, input.ownerOfDecl);
  const direct = /* @__PURE__ */ new Map();
  const walks = /* @__PURE__ */ new Map();
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const walk = directWalk(node, input, holdsOwner, statementOf);
    walks.set(node.id, walk);
    direct.set(node.id, walk.ids);
  }
  const unseen = /* @__PURE__ */ new Map();
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const walk = walks.get(node.id);
    if (walk?.outdated) continue;
    const uses = direct.get(node.id) ?? [];
    const explained = explainedBy(uses, walk?.reached, input.declFacts, holdsOwner, byId);
    const missing = footprintOf(node).filter((x) => byId.has(x) && x !== node.id && !explained.has(x));
    if (missing.length > 0) unseen.set(node.id, missing);
  }
  const premiseEdges = [];
  const verifiedEdges2 = [];
  const refEdges = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (list, edge) => {
    if (seen.has(edge.id)) return;
    seen.add(edge.id);
    list.push(edge);
  };
  for (const node of input.nodes) {
    for (const premise of node.premises) {
      if (premise === node.id || !byId.has(premise)) continue;
      push(premiseEdges, { id: edgeId("premise", premise, node.id), type: "premise", source: premise, target: node.id, origin: "declared" });
    }
    const uses = direct.get(node.id) ?? [];
    for (const source of uses) {
      push(verifiedEdges2, { id: edgeId("verified", source, node.id), type: "verified", source, target: node.id, origin: "lean", where: "proof" });
    }
    for (const source of onOf(node)) {
      if (!byId.has(source) || source === node.id) continue;
      push(verifiedEdges2, { id: edgeId("verified", source, node.id), type: "verified", source, target: node.id, origin: "lean", where: "proof", conditional: true });
    }
    const statement = node.lean.statement;
    const facts = statement ? input.declFacts.get(statement) : void 0;
    if (facts && statement && statementOwner.get(statement) === node.id) {
      for (const ref2 of facts.refs) {
        const source = statementOwner.get(ref2.name);
        if (source === void 0 || source === node.id) continue;
        push(refEdges, { id: edgeId("lean-ref", source, node.id), type: "lean-ref", source, target: node.id, origin: "lean", where: "statement" });
      }
    }
  }
  const closureMemo = /* @__PURE__ */ new Map();
  const closure = (id, stack = /* @__PURE__ */ new Set()) => {
    const memo = closureMemo.get(id);
    if (memo) return memo;
    const out = /* @__PURE__ */ new Set();
    if (stack.has(id)) return out;
    stack.add(id);
    const node = byId.get(id);
    for (const u of [...direct.get(id) ?? [], ...node ? onOf(node) : []]) {
      if (!byId.has(u)) continue;
      out.add(u);
      for (const w of closure(u, stack)) out.add(w);
    }
    stack.delete(id);
    closureMemo.set(id, out);
    return out;
  };
  const diagnostics = [];
  const at = (node) => node.loc ? { file: node.loc.file, range: node.loc.range } : {};
  for (const node of input.nodes) {
    if (!isProvedOrConditional(node)) continue;
    const premises = node.premises.filter((p) => byId.has(p) && p !== node.id);
    const used = closure(node.id);
    for (const edge of premiseEdges) {
      if (edge.target !== node.id || used.has(edge.source)) continue;
      edge.mismatch = "declared-unused";
      diagnostics.push({ code: "TL109", severity: "hint", message: `Declared premise "${edge.source}" is not used by the proof.`, nodeId: node.id, ...at(node) });
    }
    for (const edge of verifiedEdges2) {
      if (edge.target !== node.id || premises.includes(edge.source)) continue;
      edge.mismatch = "used-undeclared";
      diagnostics.push({
        code: "TL107",
        severity: "warning",
        message: `The proof uses "${edge.source}", but no arrow is drawn from it.`,
        nodeId: node.id,
        ...at(node)
      });
    }
  }
  return { edges: [...premiseEdges, ...verifiedEdges2, ...refEdges], direct, walks, unseen, diagnostics };
}

// ../core/src/project/factsIndex.ts
function keywordKind(keyword) {
  switch (keyword) {
    case "axiom":
      return "axiom";
    case "theorem":
    case "lemma":
      return "theorem";
    case "def":
    case "abbrev":
      return "def";
    case "opaque":
      return "opaque";
    case "instance":
      return "instance";
    case "structure":
      return "structure";
    case "inductive":
    case "coinductive":
      return "inductive";
    case "class":
    case "class inductive":
    case "class abbrev":
      return "class";
    default:
      return "other";
  }
}
function kindsAgree(keyword, kind) {
  if (kind === void 0) return true;
  const expected = keywordKind(keyword);
  if (expected === kind) return true;
  if (keyword === "instance") return kind === "theorem" || kind === "def";
  if (keyword === "class abbrev") return kind === "def";
  if (keyword === "class" || keyword === "class inductive") return kind === "structure" || kind === "inductive";
  return false;
}
var FactsIndex = class {
  constructor(files, fileHashes, facts) {
    this.facts = facts;
    const modulesByFile = /* @__PURE__ */ new Map();
    for (const module2 of facts?.modules ?? []) if (!modulesByFile.has(module2.file)) modulesByFile.set(module2.file, module2);
    for (const file of files) {
      const module2 = facts ? modulesByFile.get(file.path) : void 0;
      if (!module2) {
        this.files.set(file.path, { state: "unchecked", hashDiffers: false });
        continue;
      }
      const hashDiffers = fileHashes[file.path] !== module2.sourceSha256;
      let state;
      if (module2.state === "fresh") state = hashDiffers ? "stale" : "fresh";
      else if (module2.state === "stale") state = "stale";
      else state = "unchecked";
      this.files.set(file.path, { state, module: module2, hashDiffers });
    }
    const factsByFile = /* @__PURE__ */ new Map();
    for (const decl of facts?.decls ?? []) {
      const list = factsByFile.get(decl.file) ?? [];
      list.push(decl);
      factsByFile.set(decl.file, list);
    }
    for (const file of files) {
      const state = this.files.get(file.path)?.state ?? "unchecked";
      const list = factsByFile.get(file.path) ?? [];
      if (state === "unchecked" || list.length === 0) continue;
      const byName = /* @__PURE__ */ new Map();
      for (const decl of list) if (!byName.has(decl.name)) byName.set(decl.name, decl);
      const matched = /* @__PURE__ */ new Set();
      file.decls.forEach((decl, index) => {
        let found;
        if (decl.fullName) found = byName.get(decl.fullName);
        else if (state === "fresh" && decl.keyword === "instance") {
          found = list.find((f) => !matched.has(f) && f.range.start.line === decl.range.start.line && (f.kind === void 0 || kindsAgree("instance", f.kind)));
        }
        if (!found) return;
        if (state === "stale" && !kindsAgree(decl.keyword, found.kind)) return;
        matched.add(found);
        this.bySyntactic.set(`${file.path}#${index}`, found);
        if (!this.usable.has(found.name)) this.usable.set(found.name, found);
      });
      if (state === "fresh") {
        const rest = [];
        for (const decl of list) {
          if (matched.has(decl)) continue;
          if (!this.usable.has(decl.name)) this.usable.set(decl.name, decl);
          rest.push(decl);
        }
        if (rest.length > 0) this.unmatched.set(file.path, rest);
      }
    }
  }
  facts;
  /** Per model file. */
  files = /* @__PURE__ */ new Map();
  /** Usable facts by fully-qualified name (fresh files fully, stale files by name). */
  usable = /* @__PURE__ */ new Map();
  /** Usable facts by `file` + syntactic declaration index (also covers anonymous instances matched by start line). */
  bySyntactic = /* @__PURE__ */ new Map();
  /** Facts decls of fresh files that no syntactic declaration matched (e.g. constructors), per file. */
  unmatched = /* @__PURE__ */ new Map();
  stateOf(path4) {
    return this.files.get(path4)?.state ?? "unchecked";
  }
  isFresh(path4) {
    return this.stateOf(path4) === "fresh";
  }
  /** Usable facts for a syntactic declaration of a file. */
  factsFor(file, decl) {
    const index = file.decls.indexOf(decl);
    return index < 0 ? void 0 : this.bySyntactic.get(`${file.path}#${index}`);
  }
  /** Files whose facts can be trusted fully (fresh). */
  freshFiles() {
    const out = /* @__PURE__ */ new Set();
    for (const [path4, info] of this.files) if (info.state === "fresh") out.add(path4);
    return out;
  }
};

// ../core/src/project/vocabulary.ts
var VOCAB_KIND_ORDER = ["sort", "predicate", "function", "constant", "presupposition", "definition", "lemma", "unmarked-axiom", "other"];
function resolveName(name, namespace, known) {
  for (const candidate of resolutionCandidates(name, namespace)) if (known(candidate)) return candidate;
  return void 0;
}
function signatureText(file, decl) {
  const start = decl.nameSpan?.end ?? decl.keywordSpan.end;
  const end = decl.valueStart ?? decl.span.end;
  if (end <= start) return void 0;
  const text = blankComments(file.text.slice(start, end));
  const colon = topLevelColon(text);
  if (colon < 0) return { binders: text.trim(), type: "" };
  return { binders: text.slice(0, colon).trim(), type: text.slice(colon + 1).trim() };
}
function qualifyText(text, namespace, known) {
  const tokens = identifierTokens(text);
  let out = "";
  let last = 0;
  for (const token of tokens) {
    const resolved = resolveName(token.text, namespace, known);
    out += text.slice(last, token.start) + (resolved ?? token.text);
    last = token.start + token.text.length;
  }
  return normalizeWhitespace(out + text.slice(last));
}
function shapeOf(file, decl, facts, name, known) {
  const keyword = decl?.keyword;
  const docstring = facts?.docstring ?? decl?.docstring;
  if (facts && facts.type !== void 0) {
    const type2 = normalizeWhitespace(facts.type);
    return {
      name,
      kind: keyword === "instance" ? "instance" : facts.kind ?? (keyword ? keywordKind(keyword) : "other"),
      ...keyword ? { keyword } : {},
      type: type2,
      parts: splitTopLevelArrows(type2),
      implicitBinders: /^∀\s*[{[⦃]/.test(type2),
      ...facts.typeSort !== void 0 ? { typeSort: normalizeWhitespace(facts.typeSort) } : {},
      mentions: facts.refs.map((r) => r.name),
      ...docstring !== void 0 ? { docstring } : {}
    };
  }
  const kind = keyword === "instance" ? "instance" : facts?.kind ?? (keyword ? keywordKind(keyword) : "other");
  const namespace = decl?.namespace ?? [];
  const signature = decl ? signatureText(file, decl) : void 0;
  let parts = [];
  let implicitBinders = false;
  let type;
  if (signature) {
    const binders = signature.binders ? parseBinders(signature.binders) : [];
    const typeParts = signature.type ? splitTopLevelArrows(qualifyText(signature.type, namespace, known)) : [];
    if (binders === void 0) {
      implicitBinders = true;
      parts = typeParts;
    } else {
      for (const binder of binders) {
        if (!binder.explicit) implicitBinders = true;
        const binderType = qualifyText(binder.type, namespace, known);
        for (let i = 0; i < Math.max(1, binder.names.length); i++) parts.push(binderType);
      }
      parts.push(...typeParts);
    }
    if (parts.length > 0) type = parts.join(" \u2192 ");
  }
  const mentions = [];
  if (decl) {
    const body = blankComments(file.text.slice(decl.nameSpan?.end ?? decl.keywordSpan.end, decl.span.end));
    for (const token of identifierTokens(body)) {
      const resolved = resolveName(token.text, namespace, known);
      if (resolved && resolved !== name) mentions.push(resolved);
    }
  }
  return {
    name,
    kind,
    ...keyword ? { keyword } : {},
    ...type !== void 0 ? { type } : {},
    parts,
    implicitBinders,
    mentions,
    ...docstring !== void 0 ? { docstring } : {}
  };
}
var LOGICAL = /(^|[\s(])(∀|∃|¬|∧|∨|↔|=|≠|True|False)($|[\s)])/;
function inferTypeSort(shape, sorts, propHeads) {
  const type = shape.type;
  if (type === void 0) return void 0;
  if (type === "Type") return "Type 1";
  if (/^(Type|Sort)\b/.test(type)) return void 0;
  const last = shape.parts[shape.parts.length - 1] ?? "";
  if (last === "Prop") return "Type";
  if (shape.parts.every((p) => sorts.has(p))) return "Type";
  if (/^Nonempty\b/.test(type)) return "Prop";
  if (LOGICAL.test(type)) return "Prop";
  const head = /^[^\s()]+/.exec(last)?.[0];
  if (head && propHeads.has(head)) return "Prop";
  return void 0;
}
function anonymousInstanceName(file, decl) {
  const signature = signatureText(file, decl);
  const words = identifierTokens(signature?.type ?? "").map((t) => {
    const last = t.text.split(".").pop() ?? t.text;
    return last.charAt(0).toUpperCase() + last.slice(1);
  });
  const short = `inst${words.join("")}`;
  return decl.namespace.length > 0 ? `${decl.namespace.join(".")}.${short}` : short;
}
function classify(candidate, sorts, propHeads) {
  const shape = candidate.shape;
  const sortNames = new Set(sorts.keys());
  const type = shape.type;
  const last = shape.parts[shape.parts.length - 1] ?? "";
  const args = shape.parts.slice(0, -1);
  const declaredWith = shape.kind === "axiom" ? "axiom" : "opaque";
  const nonSort = args.filter((a) => !sortNames.has(a));
  const symbolShape = () => {
    if (last === "Prop") {
      const flags = [];
      let problem;
      if (nonSort.length > 0 || shape.implicitBinders) {
        flags.push("shape-violation");
        problem = `${shape.name} is a predicate over ${nonSort.length > 0 ? nonSort.join(", ") : "implicit arguments"}, which ${nonSort.length === 1 ? "is not a sort" : "are not sorts"}: predicates take sorts (\`axiom T : Type\`) as arguments.`;
      }
      return { kind: "predicate", arity: args.length, flags, ...problem ? { problem } : {} };
    }
    if (shape.parts.length > 0 && !shape.implicitBinders && shape.parts.every((p) => sortNames.has(p))) {
      const kind = shape.parts.length === 1 ? "constant" : "function";
      if (declaredWith === "axiom") {
        return {
          kind,
          ...kind === "function" ? { arity: args.length } : {},
          flags: ["shape-violation"],
          problem: `${shape.name} is declared with \`axiom\`, which asserts that such a ${kind === "constant" ? "thing" : "function"} exists without showing it: declare it \`noncomputable opaque\` so its existence presupposition shows.`
        };
      }
      return { kind, ...kind === "function" ? { arity: args.length } : {}, flags: [] };
    }
    return void 0;
  };
  switch (shape.kind) {
    case "axiom": {
      if (type === "Type") return { kind: "sort", flags: [] };
      const nonempty = type ? /^Nonempty\s+(\S+)$/.exec(type) : null;
      if (nonempty && sortNames.has(nonempty[1] ?? "")) return { kind: "presupposition", presupposes: nonempty[1] ?? "", flags: [] };
      if (shape.typeSort === "Prop") return { kind: "unmarked-axiom", flags: ["unmarked-assumption"] };
      const symbol = symbolShape();
      if (symbol) return symbol;
      if (shape.typeSort === void 0 && inferTypeSort(shape, sortNames, propHeads) === "Prop") return { kind: "unmarked-axiom", flags: ["unmarked-assumption"] };
      return {
        kind: "other",
        flags: ["shape-violation"],
        problem: `${shape.name} is an axiom of type ${type ?? "(unknown)"}: vocabulary axioms are sorts (\`axiom T : Type\`) or predicates ending in \`Prop\`.`
      };
    }
    case "opaque": {
      const symbol = symbolShape();
      if (symbol) return symbol;
      return {
        kind: "other",
        flags: ["shape-violation"],
        problem: `${shape.name} has type ${type ?? "(unknown)"}: constants and functions range over the subject's sorts (\`axiom T : Type\`).`
      };
    }
    case "theorem":
      return { kind: "lemma", flags: [] };
    case "instance": {
      const nonempty = type ? /^Nonempty\s+(\S+)$/.exec(type) : null;
      const sort = nonempty?.[1];
      const presupposition = sort !== void 0 ? sorts.get(sort) : void 0;
      if (presupposition !== void 0 && shape.mentions.includes(presupposition)) return { kind: "hidden", flags: [] };
      return { kind: "definition", flags: [] };
    }
    case "def":
    case "structure":
    case "inductive":
    case "class":
      return { kind: "definition", flags: [] };
    default:
      return { kind: "other", flags: [] };
  }
}
function buildVocabulary(candidates, subjects) {
  const sorts = /* @__PURE__ */ new Map();
  for (const c of candidates) if (c.shape.kind === "axiom" && c.shape.type === "Type") sorts.set(c.shape.name, void 0);
  for (const c of candidates) {
    if (c.shape.kind !== "axiom") continue;
    const m = c.shape.type ? /^Nonempty\s+(\S+)$/.exec(c.shape.type) : null;
    const sort = m?.[1];
    if (sort !== void 0 && sorts.has(sort) && sorts.get(sort) === void 0) sorts.set(sort, c.shape.name);
  }
  const propHeads = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    const last = c.shape.parts[c.shape.parts.length - 1];
    if (last === "Prop") propHeads.add(c.shape.name);
  }
  const itemOfName = /* @__PURE__ */ new Map();
  const kindOf = /* @__PURE__ */ new Map();
  const hidden = /* @__PURE__ */ new Set();
  const declaredWithAxiom = /* @__PURE__ */ new Set();
  const diagnostics = [];
  const bySubject = /* @__PURE__ */ new Map();
  for (const c of candidates) {
    const result = classify(c, sorts, propHeads);
    if (result.kind === "hidden") {
      hidden.add(c.shape.name);
      continue;
    }
    const kind = result.kind;
    const flags = [...result.flags];
    if (c.stale) flags.push("stale");
    const lines = new LineMap(c.file.text);
    const range = c.decl ? c.decl.range : c.facts?.range;
    const code = c.decl ? c.file.text.slice(c.decl.span.start, c.decl.span.end) : c.facts ? c.file.text.slice(lines.offsetAt(c.facts.range.start), lines.offsetAt(c.facts.range.end)) : void 0;
    const prefix = `${c.subject}.`;
    const gloss = c.shape.docstring?.trim();
    const item = {
      name: c.shape.name,
      shortName: c.shape.name.startsWith(prefix) && c.shape.name.length > prefix.length ? c.shape.name.slice(prefix.length) : c.shape.name,
      subject: c.subject,
      kind,
      ...c.shape.type !== void 0 ? { type: c.shape.type } : {},
      ...result.arity !== void 0 ? { arity: result.arity } : {},
      ...gloss ? { gloss, glossBy: "user" } : {},
      ...result.presupposes !== void 0 ? { presupposes: result.presupposes } : {},
      ...kind === "sort" && sorts.get(c.shape.name) !== void 0 ? { presupposition: sorts.get(c.shape.name) } : {},
      ...range ? { loc: { file: c.file.path, range } } : {},
      ...code !== void 0 ? { code } : {},
      usedBy: [],
      flags
    };
    itemOfName.set(item.name, item.name);
    kindOf.set(item.name, kind);
    if (c.shape.kind === "axiom") declaredWithAxiom.add(item.name);
    const list = bySubject.get(c.subject) ?? [];
    list.push(item);
    bySubject.set(c.subject, list);
    if (kind === "unmarked-axiom") {
      diagnostics.push({
        code: "TL104",
        severity: "warning",
        message: `${item.name} is a Prop-valued axiom without a card: a hidden assumption. Give it a block (an Axiom) or remove it.`,
        file: c.file.path,
        ...range ? { range } : {},
        vocab: item.name
      });
    }
    if (result.problem) {
      diagnostics.push({ code: "TL111", severity: "warning", message: result.problem, file: c.file.path, ...range ? { range } : {}, vocab: item.name });
    }
  }
  const items = [];
  for (const subject of subjects) {
    const list = bySubject.get(subject) ?? [];
    const ranked = list.map((item, index) => ({ item, index }));
    ranked.sort((a, b) => VOCAB_KIND_ORDER.indexOf(a.item.kind) - VOCAB_KIND_ORDER.indexOf(b.item.kind) || a.index - b.index);
    items.push(...ranked.map((r) => r.item));
  }
  return { items, itemOfName, kindOf, hidden, declaredWithAxiom, diagnostics };
}

// ../core/src/project/lakefile.ts
var TOML_SETTING = /\bautoImplicit\s*=\s*(true|false)\b/;
var LEAN_SETTING = /\bautoImplicit\s*(?:,|:=)\s*(true|false)\b/;
function lineRange(line, character, length) {
  return { start: { line, character }, end: { line, character: character + length } };
}
function autoImplicitDiagnostic(lakefile) {
  const lean = lakefile.path.endsWith(".lean");
  const pattern = lean ? LEAN_SETTING : TOML_SETTING;
  let off = false;
  let on;
  lakefile.text.split(/\r?\n/).forEach((raw, line) => {
    const cut = lean ? raw.indexOf("--") : raw.indexOf("#");
    const text = cut >= 0 ? raw.slice(0, cut) : raw;
    const match2 = pattern.exec(text);
    if (!match2) return;
    if (match2[1] === "false") off = true;
    else on ??= lineRange(line, match2.index, match2[0].length);
  });
  if (off && on === void 0) return void 0;
  const fix = lean ? "`leanOptions := #[\u27E8`autoImplicit, false\u27E9]`" : "`autoImplicit = false` under `[leanOptions]`";
  return {
    code: "TL110",
    severity: "warning",
    message: `autoImplicit is on in ${lakefile.path}${on ? "" : " (Lean's default)"}: an unknown name in a statement silently becomes a variable, so a typo changes what a card says instead of failing. Set ${fix}.`,
    file: lakefile.path,
    range: on ?? lineRange(0, 0, 0)
  };
}

// ../core/src/project/build.ts
var FLAG_ORDER = [
  "no-rationale",
  "missing-holds",
  "provable-assumption",
  "uses-sorry",
  "holds-mismatch",
  "rests-on-pending",
  "uses-unseen",
  "established",
  "self-evident",
  "existence-commitment",
  "definitional-choice",
  "unselected-used",
  "broken",
  "depends-on-removed",
  "signoff-stale",
  "stale",
  "not-checked"
];
var SEVERITY_OF_LEAN = { error: "error", warning: "warning", information: "info" };
var AXIOM_PREMISES_MESSAGE = "This axiom declares premises (`premises:`), written before v4, when axioms could have arrows: the board does not draw them. Make it a proposition (pending), or drop these arrows.";
var internals = /* @__PURE__ */ new WeakMap();
function byPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
function sortFlags(flags) {
  return [...new Set(flags)].sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b));
}
function compareDiagnostics(a, b) {
  const fa = a.file ?? "\uFFFF";
  const fb = b.file ?? "\uFFFF";
  if (fa !== fb) return fa < fb ? -1 : 1;
  const la = a.range?.start.line ?? -1;
  const lb = b.range?.start.line ?? -1;
  if (la !== lb) return la - lb;
  const ca = a.range?.start.character ?? -1;
  const cb = b.range?.start.character ?? -1;
  if (ca !== cb) return ca - cb;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}
function dedupeDiagnostics(list) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const d of list) {
    const key = JSON.stringify([d.code, d.file ?? null, d.range?.start ?? null, d.nodeId ?? null, d.vocab ?? null, d.message]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}
function isPropStatement(draft) {
  const facts = draft.statementFacts;
  if (facts && facts.type !== void 0) {
    const kindOk = facts.kind === void 0 ? ["abbrev", "def"].includes(draft.statementDecl?.decl.keyword ?? "def") : facts.kind === "def";
    return kindOk && normalizeWhitespace(facts.type) === "Prop";
  }
  const located = draft.statementDecl;
  if (!located) return facts !== void 0 && (facts.kind === void 0 || facts.kind === "def");
  if (located.decl.keyword !== "abbrev" && located.decl.keyword !== "def") return false;
  const signature = signatureText(located.file, located.decl);
  return signature !== void 0 && signature.binders === "" && normalizeWhitespace(signature.type) === "Prop";
}
function holdsKind(draft) {
  if (!draft.holdsExists) return void 0;
  const kind = draft.holdsFacts?.kind;
  if (kind === "axiom") return "axiom";
  if (kind === "theorem") return "theorem";
  if (kind !== void 0) return "other";
  const keyword = draft.holdsDecl?.decl.keyword;
  if (keyword === "axiom") return "axiom";
  if (keyword === "theorem" || keyword === "lemma") return "theorem";
  return keyword === void 0 ? void 0 : "other";
}
function firstStartingAt(list, offset) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if ((list[mid]?.span.start ?? Infinity) < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function startsBetween(list, from, to) {
  const first = list[firstStartingAt(list, from)];
  return first !== void 0 && first.span.start < to;
}
function codePieces(draft) {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement) return [];
  const stmtPiece = { file: statement.file, start: statement.decl.span.start, end: statement.decl.span.end, decls: [draft.statement] };
  if (!holds || !draft.holds) return [stmtPiece];
  const holdsPiece = { file: holds.file, start: holds.decl.span.start, end: holds.decl.span.end, decls: [draft.holds] };
  if (holds.file.path === statement.file.path && holds.decl.span.start >= statement.decl.span.end) {
    const from = statement.decl.span.end;
    const to = holds.decl.span.start;
    const quiet = !startsBetween(holds.file.decls, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(holds.file.text.slice(from, to)).trim() === "";
    if (quiet) return [{ file: statement.file, start: statement.decl.span.start, end: holds.decl.span.end, decls: [draft.statement, draft.holds] }];
  }
  return [stmtPiece, holdsPiece];
}
function buildProject(input) {
  const library = input.library;
  const files = [...input.files].sort(byPath);
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const factsIndex = new FactsIndex(files, input.fileHashes, input.facts);
  const diagnostics = [];
  const lineMaps = /* @__PURE__ */ new Map();
  const lines = (file) => {
    let map = lineMaps.get(file.path);
    if (!map) {
      map = new LineMap(file.text);
      lineMaps.set(file.path, map);
    }
    return map;
  };
  const subjectOfFile = /* @__PURE__ */ new Map();
  for (const file of files) {
    const subject = subjectOfPath(file.path, library);
    if (subject !== void 0 && isSubjectName(subject)) subjectOfFile.set(file.path, subject);
  }
  const subjectNames = [...new Set(subjectOfFile.values())].sort();
  const syntactic = /* @__PURE__ */ new Map();
  for (const file of files) for (const decl of file.decls) if (decl.fullName && !syntactic.has(decl.fullName)) syntactic.set(decl.fullName, { file, decl });
  const known = (name) => syntactic.has(name) || factsIndex.usable.has(name);
  const writtenIds = /* @__PURE__ */ new Set();
  for (const file of files) for (const block2 of file.blocks) if (block2.idWritten && block2.id) writtenIds.add(block2.id);
  const assigned = /* @__PURE__ */ new Map();
  const blockIds = /* @__PURE__ */ new Map();
  const drafts = [];
  for (const file of files) {
    for (const block2 of file.blocks) {
      if (!block2.id || block2.fields.type === void 0 || block2.fields.naturalName === void 0) continue;
      let id = block2.id;
      if (block2.idWritten) {
        const first = assigned.get(id);
        if (first) {
          diagnostics.push({
            code: "TL006",
            severity: "error",
            message: `Duplicate id "${id}": the block in ${first.file} (line ${first.range.start.line + 1}) keeps it. Give this block another id.`,
            file: file.path,
            range: block2.range
          });
          continue;
        }
      } else if (assigned.has(id) || writtenIds.has(id)) {
        let n = 2;
        while (assigned.has(`${block2.id}-${n}`) || writtenIds.has(`${block2.id}-${n}`)) n++;
        id = `${block2.id}-${n}`;
      }
      assigned.set(id, { file: file.path, range: block2.range });
      blockIds.set(block2, id);
      const subject = subjectOfFile.get(file.path);
      if (subject === void 0) {
        diagnostics.push({
          code: "TL120",
          severity: "warning",
          message: `This block is outside any subject: move it into ${library}/<Subject>/ (a subject is a module subtree with its own namespace).`,
          file: file.path,
          range: block2.range
        });
        continue;
      }
      drafts.push({
        id,
        file,
        block: block2,
        subject,
        type: block2.fields.type,
        statementFound: false,
        notProp: false,
        holdsExists: false,
        extraPinned: [],
        leanError: false,
        diagnostics: [],
        flags: /* @__PURE__ */ new Set(),
        proof: { kind: "none" },
        formal: "informal",
        lean: { binding: block2.binding.mode }
      });
    }
  }
  const namespaceTables = /* @__PURE__ */ new Map();
  const namespaceOf = (file, block2) => {
    if (block2.namespace) return block2.namespace;
    let table = namespaceTables.get(file.path);
    if (!table) namespaceTables.set(file.path, table = namespaceTable(file.text));
    return table(block2.span.start);
  };
  for (const draft of drafts) {
    const binding = draft.block.binding;
    if (binding.mode === "none") continue;
    let statement = binding.statement;
    if (binding.mode === "adjacent") {
      const decl = binding.adjacentDecl !== void 0 ? draft.file.decls[binding.adjacentDecl] : void 0;
      if (decl) {
        statement = decl.fullName;
        if (statement) draft.statementDecl = { file: draft.file, decl };
      }
    } else {
      const namespace = namespaceOf(draft.file, draft.block);
      const resolve = (name) => known(name) ? name : resolveName(name, namespace, known) ?? name;
      if (statement) statement = resolve(statement);
      draft.extraPinned = (binding.pinned ?? []).slice(1).map(resolve);
      if (statement) {
        const located = syntactic.get(statement);
        if (located) draft.statementDecl = located;
      }
    }
    if (!statement) {
      draft.notProp = binding.mode === "adjacent";
      continue;
    }
    draft.statement = statement;
    draft.statementFound = known(statement);
    draft.holds = holdsName(statement);
    const holdsDecl = syntactic.get(draft.holds);
    if (holdsDecl) draft.holdsDecl = holdsDecl;
    const statementFacts = factsIndex.usable.get(statement);
    if (statementFacts) draft.statementFacts = statementFacts;
    const holdsFacts = factsIndex.usable.get(draft.holds);
    if (holdsFacts) draft.holdsFacts = holdsFacts;
    draft.holdsExists = Boolean(holdsDecl || holdsFacts);
  }
  const ownerOfDecl = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    if (!draft.statement || !draft.statementFound) continue;
    const owner = ownerOfDecl.get(draft.statement);
    if (owner !== void 0 && owner !== draft.id) {
      draft.diagnostics.push({
        code: "TL017",
        severity: "error",
        message: `${draft.statement} is already bound to "${owner}": a declaration can belong to one card only.`,
        file: draft.file.path,
        range: draft.block.range,
        nodeId: draft.id
      });
      continue;
    }
    ownerOfDecl.set(draft.statement, draft.id);
    if (draft.holds && draft.holdsExists && !ownerOfDecl.has(draft.holds)) ownerOfDecl.set(draft.holds, draft.id);
    for (const name of draft.extraPinned) if (known(name) && !ownerOfDecl.has(name)) ownerOfDecl.set(name, draft.id);
  }
  const candidates = [];
  const folded = /* @__PURE__ */ new Map();
  for (const file of files) {
    const subject = subjectOfFile.get(file.path);
    if (subject === void 0) continue;
    const state = factsIndex.stateOf(file.path);
    const names = /* @__PURE__ */ new Set();
    for (const decl of file.decls) {
      if (decl.keyword === "example" || decl.keyword === "mutual") continue;
      const facts = factsIndex.factsFor(file, decl);
      const name = decl.fullName ?? facts?.name ?? (decl.keyword === "instance" ? anonymousInstanceName(file, decl) : void 0);
      if (!name || names.has(name) || ownerOfDecl.has(name)) continue;
      names.add(name);
      if (facts?.parent) {
        folded.set(name, facts.parent);
        continue;
      }
      candidates.push({ shape: shapeOf(file, decl, facts, name, known), subject, file, decl, ...facts ? { facts } : {}, stale: state === "stale" });
    }
    for (const facts of factsIndex.unmatched.get(file.path) ?? []) {
      if (names.has(facts.name) || ownerOfDecl.has(facts.name)) continue;
      const parent = facts.parent ?? [...names].find((n) => facts.name.startsWith(`${n}.`));
      names.add(facts.name);
      if (parent !== void 0) {
        folded.set(facts.name, parent);
        continue;
      }
      candidates.push({ shape: shapeOf(file, void 0, facts, facts.name, known), subject, file, facts, stale: false });
    }
  }
  const vocab2 = buildVocabulary(candidates, subjectNames);
  for (let pass = 0; pass < 3; pass++) {
    for (const [name, parent] of folded) {
      const item = vocab2.itemOfName.get(parent);
      if (item !== void 0 && !vocab2.itemOfName.has(name)) vocab2.itemOfName.set(name, item);
    }
  }
  const isPresupposition = (name) => vocab2.kindOf.get(name) === "presupposition" && vocab2.itemOfName.get(name) === name;
  const trustworthy = (path4) => {
    const info = factsIndex.files.get(path4);
    return info !== void 0 && info.module !== void 0 && !info.hashDiffers;
  };
  const containing = (path4, range) => {
    if (!range || !trustworthy(path4)) return {};
    for (const draft of drafts) {
      for (const located of [draft.statementDecl, draft.holdsDecl]) {
        if (located && located.file.path === path4 && rangeContains(located.decl.range, range.start)) return { nodeId: draft.id };
      }
    }
    for (const item of vocab2.items) if (item.loc && item.loc.file === path4 && rangeContains(item.loc.range, range.start)) return { vocab: item.name };
    return {};
  };
  for (const message2 of input.facts?.build.messages ?? []) {
    const severity = SEVERITY_OF_LEAN[message2.severity] ?? "info";
    const where2 = message2.file ? containing(message2.file, message2.range) : {};
    diagnostics.push({
      code: "LEAN",
      severity,
      message: message2.text,
      ...message2.file ? { file: message2.file } : {},
      ...message2.range ? { range: message2.range } : {},
      ...where2
    });
    if (severity === "error" && where2.nodeId !== void 0) {
      const draft = drafts.find((d) => d.id === where2.nodeId);
      if (draft) draft.leanError = true;
    }
  }
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const ownerStatement = (id) => byId.get(id)?.statement;
  for (const draft of drafts) {
    const block2 = draft.block;
    const binding = block2.binding.mode;
    const at = { file: draft.file.path, range: block2.range, nodeId: draft.id };
    if (draft.type === "AXIOM" && block2.fields.rationale === void 0) {
      draft.flags.add("no-rationale");
      draft.diagnostics.push({ code: "TL011", severity: "info", message: noRationaleMessage(block2.fields.stance), ...at });
    }
    if (binding === "none") continue;
    if (!draft.statement) {
      draft.formal = "ill-formed";
      draft.diagnostics.push({ code: "TL113", severity: "error", message: "This card is bound to a declaration without a name: bind it to `abbrev n : Prop := \u2026` (with `axiom n.holds : n`).", ...at });
    } else if (!draft.statementFound) {
      draft.formal = "ill-formed";
      draft.diagnostics.push({ code: "TL101", severity: "error", message: `Lean declaration ${draft.statement} not found.`, ...at });
    } else if (!isPropStatement(draft)) {
      draft.formal = "ill-formed";
      draft.notProp = true;
      const short2 = draft.statement.split(".").pop() ?? draft.statement;
      draft.diagnostics.push({
        code: "TL113",
        severity: "error",
        message: `${draft.statement} is not a Prop abbrev/def: write \`abbrev ${short2} : Prop := \u2026\` and \`axiom ${short2}.holds : ${short2}\`.`,
        ...at
      });
    } else draft.formal = draft.leanError ? "ill-formed" : "formalized";
    const statement = draft.statement;
    const lean = { binding, ...statement ? { statement } : {} };
    const hk = draft.statementFound && !draft.notProp ? holdsKind(draft) : void 0;
    if (statement && draft.statementFound && draft.holdsExists && draft.holds) lean.justification = draft.holds;
    if (hk) lean.justificationKind = hk;
    const pieces = draft.statementFound ? codePieces(draft) : [];
    if (pieces.length > 0) {
      lean.code = pieces.map((p) => p.file.text.slice(p.start, p.end)).join("\n\n");
      const first = pieces[0];
      const last = pieces[pieces.length - 1];
      const end = last.file.path === first.file.path ? last.end : first.end;
      const loc = { file: first.file.path, range: lines(first.file).rangeOf(first.start, end) };
      lean.codeLoc = loc;
    }
    if (statement && draft.statementFacts) {
      const uses = [];
      const visited = /* @__PURE__ */ new Set([statement]);
      const queue = [statement];
      while (queue.length > 0) {
        const name = queue.shift();
        const facts = factsIndex.usable.get(name);
        if (!facts) continue;
        for (const ref2 of facts.refs) {
          const item = vocab2.itemOfName.get(ref2.name);
          if (item !== void 0 && !uses.includes(item)) uses.push(item);
          const owner = ownerOfDecl.get(ref2.name);
          const throughNode = owner !== void 0 && ownerStatement(owner) === ref2.name;
          const throughDefinition = item === ref2.name && vocab2.kindOf.get(item) === "definition";
          if ((throughNode || throughDefinition) && !visited.has(ref2.name)) {
            visited.add(ref2.name);
            queue.push(ref2.name);
          }
        }
      }
      lean.uses = uses;
      if (draft.statementFacts.axioms) lean.presupposes = draft.statementFacts.axioms.filter(isPresupposition);
    }
    if (draft.holdsFacts?.axioms) lean.axioms = [...draft.holdsFacts.axioms];
    if (pieces.length > 0 && pieces.every((p) => factsIndex.isFresh(p.file.path))) {
      const refs = [];
      let lineOffset = 0;
      for (const piece of pieces) {
        const map = lines(piece.file);
        const start = map.positionAt(piece.start);
        const end = map.positionAt(piece.end);
        for (const declName of piece.decls) {
          const facts = factsIndex.usable.get(declName);
          for (const ref2 of facts?.refs ?? []) {
            const owner = ownerOfDecl.get(ref2.name);
            const ownerStmt = owner !== void 0 ? ownerStatement(owner) : void 0;
            const nodeRef = ownerStmt !== void 0 && (ref2.name === ownerStmt || ref2.name === holdsName(ownerStmt));
            if (!nodeRef && !vocab2.itemOfName.has(ref2.name)) continue;
            if (ref2.range.start.line < start.line || ref2.range.end.line > end.line) continue;
            const shift = (p) => ({
              line: p.line - start.line + lineOffset,
              character: p.line === start.line ? p.character - start.character : p.character
            });
            refs.push({ name: ref2.name, range: { start: shift(ref2.range.start), end: shift(ref2.range.end) }, ...nodeRef && owner !== void 0 ? { nodeId: owner } : {} });
          }
        }
        lineOffset += end.line - start.line + 2;
      }
      lean.refs = refs;
    }
    draft.lean = lean;
    const declFiles = [draft.statementDecl?.file.path ?? draft.statementFacts?.file, draft.holdsDecl?.file.path ?? draft.holdsFacts?.file].filter(
      (p) => p !== void 0
    );
    if (declFiles.some((p) => factsIndex.files.get(p)?.hashDiffers || factsIndex.stateOf(p) === "stale")) draft.flags.add("stale");
    if (draft.statementFound && (draft.statementFacts === void 0 || draft.holdsExists && draft.holdsFacts === void 0)) draft.flags.add("not-checked");
    if (!draft.statementFound || draft.notProp || !statement) continue;
    const short = statement.split(".").pop() ?? statement;
    if (!draft.holdsExists) {
      if (draft.type === "AXIOM") {
        draft.flags.add("missing-holds");
        draft.diagnostics.push({
          code: "TL117",
          severity: "warning",
          message: `This axiom has no \`axiom ${short}.holds : ${short}\`, so proofs cannot use it.`,
          ...at
        });
      }
      continue;
    }
    const holdsFacts = draft.holdsFacts;
    if (hk === "axiom") {
      draft.proof = draft.type === "AXIOM" ? { kind: "assumed" } : { kind: "pending" };
      if (holdsFacts?.type !== void 0 && normalizeWhitespace(holdsFacts.type) !== statement) {
        draft.flags.add("holds-mismatch");
        draft.diagnostics.push({ code: "TL114", severity: "error", message: `${draft.holds} does not state ${statement} (its type is ${normalizeWhitespace(holdsFacts.type)}).`, ...at });
      }
      continue;
    }
    if (!holdsFacts || holdsFacts.type === void 0 || holdsFacts.axioms === void 0) {
      draft.flags.add("not-checked");
      continue;
    }
    if (holdsFacts.usesSorry || holdsFacts.axioms.includes(SORRY_AXIOM)) {
      draft.flags.add("uses-sorry");
      draft.diagnostics.push({ code: "TL115", severity: "warning", message: "The proof uses `sorry`.", ...at });
      continue;
    }
    const type = normalizeWhitespace(holdsFacts.type);
    let on;
    if (type === statement) on = [];
    else {
      const parts = splitTopLevelArrows(type);
      if (parts.length > 1 && parts[parts.length - 1] === statement) {
        const hyps = [];
        for (const part of parts.slice(0, -1)) {
          const owner = ownerOfDecl.get(part);
          if (owner === void 0 || ownerStatement(owner) !== part) {
            hyps.length = 0;
            break;
          }
          if (!hyps.includes(owner)) hyps.push(owner);
        }
        if (hyps.length > 0) on = hyps;
      }
    }
    if (on === void 0) {
      draft.flags.add("holds-mismatch");
      draft.diagnostics.push({ code: "TL114", severity: "error", message: `${draft.holds} does not state ${statement} (its type is ${type}).`, ...at });
      continue;
    }
    const nodesIn = [];
    const presups = [];
    const others = [];
    for (const axiom of holdsFacts.axioms) {
      if (STANDARD_AXIOM_NAMES.includes(axiom)) continue;
      const owner = ownerOfDecl.get(axiom);
      const ownerStmt = owner !== void 0 ? ownerStatement(owner) : void 0;
      if (owner !== void 0 && ownerStmt !== void 0 && axiom === holdsName(ownerStmt)) {
        if (!nodesIn.includes(owner)) nodesIn.push(owner);
        continue;
      }
      if (isPresupposition(axiom)) {
        presups.push(`${PRESUPPOSITION_PREFIX}${axiom}`);
        continue;
      }
      const item = vocab2.itemOfName.get(axiom);
      const kind = item !== void 0 ? vocab2.kindOf.get(item) : void 0;
      const harmless = kind === "sort" || kind === "predicate" || (kind === "function" || kind === "constant") && !vocab2.declaredWithAxiom.has(item ?? "");
      if (harmless) continue;
      others.push(`axiom:${axiom}`);
      draft.diagnostics.push({
        code: "TL103",
        severity: "warning",
        message: `The proof uses ${axiom}, which is neither an assumption (a card's \`.holds\`) nor vocabulary.`,
        ...at,
        ...item !== void 0 ? { vocab: item } : {}
      });
    }
    const footprint = [...nodesIn, ...presups, ...others];
    draft.proof = on.length > 0 ? { kind: "conditional", on, footprint } : { kind: "proved", footprint };
    if (draft.type === "AXIOM") {
      draft.flags.add("provable-assumption");
      draft.diagnostics.push({ code: "TL106", severity: "info", message: "This axiom has a proof.", ...at });
    }
  }
  for (const draft of drafts) {
    const proof = draft.proof;
    if (proof.kind !== "proved" && proof.kind !== "conditional") continue;
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    const footprint = proof.kind === "proved" ? proof.footprint : proof.footprint ?? [];
    const footprintNodes = footprint.map((x) => byId.get(x)).filter((d) => d !== void 0);
    const pending = footprintNodes.filter((d) => d.proof.kind === "pending");
    if (pending.length > 0) {
      draft.flags.add("rests-on-pending");
      draft.diagnostics.push({ code: "TL102", severity: "warning", message: `The proof rests on pending: ${pending.map((d) => d.id).join(", ")}.`, ...at });
    }
    if (proof.kind === "proved" && footprintNodes.length === 0 && !footprint.some((x) => x.startsWith("axiom:"))) draft.flags.add("self-evident");
    const onNodes = proof.kind === "conditional" ? proof.on.map((x) => byId.get(x)).filter((d) => d !== void 0) : [];
    const covered = /* @__PURE__ */ new Set([...draft.lean.presupposes ?? [], ...[...footprintNodes, ...onNodes].flatMap((d) => d.lean.presupposes ?? [])]);
    const uncovered = footprint.filter((x) => x.startsWith(PRESUPPOSITION_PREFIX) && !covered.has(x.slice(PRESUPPOSITION_PREFIX.length)));
    if (uncovered.length > 0) {
      draft.flags.add("existence-commitment");
      const names = uncovered.map((x) => x.slice(PRESUPPOSITION_PREFIX.length));
      draft.diagnostics.push({
        code: "TL108",
        severity: "info",
        message: `The proof needs ${names.join(", ")} (existence assumption${names.length === 1 ? "" : "s"}) that no statement it uses mentions.`,
        ...at
      });
    }
    if (proof.kind === "conditional") {
      draft.diagnostics.push({ code: "TL102", severity: "warning", message: `The proof is conditional on unproved cards: ${proof.on.join(", ")}.`, ...at });
    }
  }
  for (const draft of drafts) {
    if ((draft.lean.uses ?? []).some((name) => vocab2.kindOf.get(name) === "definition")) draft.flags.add("definitional-choice");
  }
  for (const draft of drafts) {
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    if (draft.type === "AXIOM" && (draft.block.fields.premises ?? []).length > 0) {
      draft.diagnostics.push({ code: "TL122", severity: "info", message: AXIOM_PREMISES_MESSAGE, ...at });
    }
    for (const premise of draft.block.fields.premises ?? []) {
      const target = byId.get(premise);
      if (!target) draft.diagnostics.push({ code: "TL007", severity: "warning", message: `Premise "${premise}" does not exist.`, ...at });
      else if (target.subject !== draft.subject) {
        draft.diagnostics.push({
          code: "TL121",
          severity: "warning",
          message: `Premise "${premise}" belongs to subject ${target.subject}: premises stay within one subject.`,
          ...at
        });
      }
    }
  }
  const inCycle = /* @__PURE__ */ new Set();
  {
    const state = /* @__PURE__ */ new Map();
    const stack = [];
    const arrowsInto = (id) => {
      const draft = byId.get(id);
      return draft === void 0 || draft.type === "AXIOM" ? [] : draft.block.fields.premises ?? [];
    };
    const visit = (id) => {
      state.set(id, "visiting");
      stack.push(id);
      for (const premise of arrowsInto(id)) {
        if (!byId.has(premise)) continue;
        const mark = state.get(premise);
        if (mark === "visiting") for (const x of stack.slice(stack.indexOf(premise))) inCycle.add(x);
        else if (mark === void 0) visit(premise);
      }
      stack.pop();
      state.set(id, "done");
    };
    for (const draft of drafts) if (!state.has(draft.id)) visit(draft.id);
  }
  for (const draft of drafts) {
    if (!inCycle.has(draft.id)) continue;
    draft.diagnostics.push({
      code: "TL015",
      severity: "warning",
      message: "This card is part of a premise cycle: a card cannot (indirectly) support itself.",
      file: draft.file.path,
      range: draft.block.range,
      nodeId: draft.id
    });
  }
  const nodes = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    const block2 = draft.block;
    const fields = block2.fields;
    const ext = {};
    for (const key of Object.keys(block2.extensions).sort()) ext[key] = (block2.extensions[key] ?? []).join("\n");
    const wordedBy = fields.wordedBy ?? "user";
    const node = {
      id: draft.id,
      type: draft.type,
      role: "node",
      subject: draft.subject,
      naturalName: fields.naturalName ?? "",
      ...fields.rationale !== void 0 ? { rationale: fields.rationale } : {},
      ...block2.body !== void 0 ? { body: block2.body } : {},
      ...fields.asserted !== void 0 ? { asserted: fields.asserted } : {},
      ...fields.stance !== void 0 ? { stance: fields.stance } : {},
      ...fields.source !== void 0 ? { source: fields.source } : {},
      premises: [...fields.premises ?? []],
      // AR-5: the parser drops the mark when premises are declared (TL023); a hand-built block is held to the same rule.
      ...fields.followsFrom === "nothing" && (fields.premises ?? []).length === 0 ? { fromNothing: true } : {},
      ...fields.supersedes !== void 0 ? { supersedes: fields.supersedes } : {},
      ...fields.refines !== void 0 ? { refines: fields.refines } : {},
      provenance: {
        wordedBy,
        endorsed: wordedBy === "user",
        origin: fields.origin ?? "user",
        ...fields.session !== void 0 ? { session: fields.session } : {}
      },
      ext,
      loc: { file: draft.file.path, range: block2.range, markupVersion: block2.version },
      lean: draft.lean,
      status: {
        formal: draft.formal,
        proof: draft.proof,
        certificates: { consistency: "none", nonVacuity: "none" },
        flags: sortFlags(draft.flags)
      }
    };
    nodes.set(draft.id, {
      node,
      file: draft.file.path,
      block: block2,
      ...draft.statementDecl ? { statementDecl: { file: draft.statementDecl.file.path, decl: draft.statementDecl.decl } } : {},
      ...draft.holdsDecl ? { holdsDecl: { file: draft.holdsDecl.file.path, decl: draft.holdsDecl.decl } } : {}
    });
  }
  const freshFiles = factsIndex.freshFiles();
  const edges = computeEdges({ nodes: [...nodes.values()].map((n) => n.node), ownerOfDecl, declFacts: factsIndex.usable, freshFiles });
  for (const draft of drafts) {
    const walk = edges.walks.get(draft.id);
    const entry = nodes.get(draft.id);
    if (!walk || !entry) continue;
    if (walk.outdated) draft.flags.add("stale");
    const unseen = edges.unseen.get(draft.id) ?? [];
    if (unseen.length > 0) {
      draft.flags.add("uses-unseen");
      draft.diagnostics.push({
        code: "TL123",
        severity: "warning",
        message: `The proof uses ${unseen.map((id) => `"${id}"`).join(", ")} in a way the arrows do not show: no card it uses directly rests on ${unseen.length === 1 ? "it" : "them"}.`,
        file: draft.file.path,
        range: draft.block.range,
        nodeId: draft.id
      });
    }
    entry.node.status.direct = { ids: [...walk.ids], from: walk.from, ...unseen.length > 0 ? { unseen: [...unseen] } : {} };
  }
  markEstablished(drafts, byId, edges.direct);
  for (const draft of drafts) {
    const entry = nodes.get(draft.id);
    if (entry) entry.node.status.flags = sortFlags(draft.flags);
  }
  const itemsByName = new Map(vocab2.items.map((item) => [item.name, item]));
  for (const { node } of nodes.values()) {
    for (const name of [...node.lean.uses ?? [], ...node.lean.presupposes ?? []]) {
      const item = itemsByName.get(name);
      if (item && !item.usedBy.includes(node.id)) item.usedBy.push(node.id);
    }
    for (const name of node.lean.uses ?? []) {
      const item = itemsByName.get(name);
      if (item && item.kind === "definition" && !item.flags.includes("definitional-choice")) item.flags.push("definitional-choice");
    }
  }
  const blockAt = (file, offset) => {
    const block2 = file.blocks[firstStartingAt(file.blocks, offset + 1) - 1];
    return block2 !== void 0 && offset >= block2.span.start && offset < block2.span.end ? block2 : void 0;
  };
  for (const file of files) {
    for (const d of file.diagnostics) {
      const block2 = blockAt(file, d.span.start);
      const resolved = block2 ? blockIds.get(block2) : void 0;
      const nodeId = resolved !== void 0 && nodes.has(resolved) ? resolved : d.nodeId !== void 0 && nodes.has(d.nodeId) ? d.nodeId : void 0;
      diagnostics.push({ code: d.code, severity: d.severity, message: d.message, file: file.path, range: d.range, ...nodeId !== void 0 ? { nodeId } : {} });
    }
  }
  const rootPath = libraryRootFile(library);
  const root = fileMap.get(rootPath);
  if (root) {
    const reached = /* @__PURE__ */ new Set([rootPath]);
    const queue = [root];
    while (queue.length > 0) {
      const file = queue.shift();
      for (const module2 of file.imports) {
        const path4 = pathOfModule(module2);
        const target = fileMap.get(path4);
        if (target && !reached.has(path4)) {
          reached.add(path4);
          queue.push(target);
        }
      }
    }
    for (const file of files) {
      if (reached.has(file.path) || moduleOfPath(file.path) === void 0) continue;
      diagnostics.push({
        code: "TL118",
        severity: "warning",
        message: `This file is not imported by ${rootPath}, so Lean never checks it.`,
        file: file.path,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      });
    }
  }
  if (input.lakefile) {
    const tl110 = autoImplicitDiagnostic(input.lakefile);
    if (tl110) diagnostics.push(tl110);
  }
  const markupTl011 = /* @__PURE__ */ new Set();
  for (const file of files) {
    for (const d of file.diagnostics) {
      if (d.code !== "TL011") continue;
      const block2 = blockAt(file, d.span.start);
      if (block2) markupTl011.add(block2);
    }
  }
  for (const draft of drafts) {
    for (const d of draft.diagnostics) if (!(d.code === "TL011" && markupTl011.has(draft.block))) diagnostics.push(d);
  }
  diagnostics.push(...vocab2.diagnostics, ...edges.diagnostics);
  const subjects = subjectNames.map((name) => ({
    name,
    nodeCount: drafts.filter((d) => d.subject === name).length,
    files: files.filter((f) => subjectOfFile.get(f.path) === name).map((f) => f.path)
  }));
  const model = {
    library,
    subjects,
    nodes,
    files: fileMap,
    ...input.facts ? { facts: input.facts } : {},
    freshFiles: factsIndex.freshFiles(),
    vocabulary: vocab2.items,
    diagnostics: dedupeDiagnostics(diagnostics).sort(compareDiagnostics),
    declFacts: factsIndex.usable,
    ownerOfDecl
  };
  internals.set(model, { edges });
  return model;
}
function markEstablished(drafts, byId, direct) {
  const unsure = (d) => d.flags.has("stale") || d.flags.has("not-checked") || d.flags.has("holds-mismatch") || d.flags.has("uses-unseen");
  for (const draft of drafts) {
    const proof = draft.proof;
    if (draft.type !== "PROPOSITION" || proof.kind !== "proved" || draft.flags.has("uses-sorry") || unsure(draft)) continue;
    if (proof.footprint.some((x) => x.startsWith("axiom:"))) continue;
    const rests = proof.footprint.filter((x) => !x.startsWith(PRESUPPOSITION_PREFIX)).map((x) => byId.get(x));
    if (rests.some((d) => d === void 0 || d.type !== "AXIOM" || d.proof.kind !== "assumed" || unsure(d))) continue;
    const seen = /* @__PURE__ */ new Set([draft.id]);
    const queue = [...direct.get(draft.id) ?? []];
    let reachedUnsure = false;
    while (queue.length > 0 && !reachedUnsure) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const used = byId.get(id);
      if (used === void 0 || unsure(used)) reachedUnsure = true;
      else queue.push(...direct.get(id) ?? []);
    }
    if (!reachedUnsure) draft.flags.add("established");
  }
}

// ../core/src/project/index.ts
function buildProjectModel(input) {
  return buildProject(input);
}

// ../core/src/edit/scaffold.ts
function subjectScaffold(subject, library) {
  if (!isSubjectName(subject)) throw new ActionError("invalid", `"${subject}" is not a subject name: use a capitalised Lean identifier (letters, digits, "_").`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(library)) throw new ActionError("invalid", `"${library}" is not a library name.`);
  const module2 = (name) => `${library}.${subject}.${name}`;
  return [
    {
      path: subjectRootFile(subject, library),
      text: `import ${module2("Vocabulary")}
import ${module2("Inbox")}
import ${module2("Main")}
`
    },
    {
      path: subjectModulePath(subject, "Vocabulary", library),
      text: `-- Vocabulary of ${subject}: types, predicates and constants (the board lists them in its Vocabulary group).
namespace ${subject}

end ${subject}
`
    },
    {
      path: subjectModulePath(subject, "Inbox", library),
      text: `import ${module2("Vocabulary")}

-- New cards typed on the telelean board are added here.
namespace ${subject}

end ${subject}
`
    },
    {
      path: subjectModulePath(subject, "Main", library),
      text: `import ${module2("Vocabulary")}
import ${module2("Inbox")}

-- Formalised cards: a statement \`abbrev n : Prop := \u2026\` and its \`n.holds\`.
namespace ${subject}

end ${subject}
`
    }
  ];
}

// ../core/src/samples/spyro.ts
var SPYRO_SUBJECT = "Spyro";
var MAIN_FILE = "Model/Spyro/Main.lean";
var VOCAB_FILE = "Model/Spyro/Vocabulary.lean";
var ASSERTED = "2026-11-01";
var SPYRO_LEAN = {
  cynderDarkPast: [
    "/-- Cynder is a character who has a dark past -/",
    "abbrev cynder_dark_past : Prop := HasDarkPast cynder",
    "axiom cynder_dark_past.holds : cynder_dark_past"
  ].join("\n"),
  newSpyroPg: [
    "/-- The new Spyro game is PG -/",
    "abbrev new_spyro_pg : Prop := IsPG newSpyro",
    "axiom new_spyro_pg.holds : new_spyro_pg"
  ].join("\n"),
  cynderNotGood: [
    "/-- Cynder would not be a good addition to the new Spyro game -/",
    "abbrev cynder_not_good : Prop := \xAC GoodAddition cynder newSpyro"
  ].join("\n"),
  /**
   * What a run adds under the normative reading (03 section 3.3; test-fixtures/spyro/Check/Normative.lean), as it
   * reads in test-fixtures/runner-lean/overlays/proved (docstring included, like every card's code).
   */
  pgNoDarkPastNormative: [
    "/-- PG games cannot have characters with dark pasts (normative reading) -/",
    "abbrev pg_no_dark_past : Prop := \u2200 (g : Game) (c : Character), IsPG g \u2192 HasDarkPast c \u2192 \xAC GoodAddition c g",
    "axiom pg_no_dark_past.holds : pg_no_dark_past"
  ].join("\n"),
  cynderNotGoodProof: [
    "theorem cynder_not_good.holds : cynder_not_good :=",
    "  pg_no_dark_past.holds newSpyro cynder new_spyro_pg.holds cynder_dark_past.holds"
  ].join("\n")
};
var SPYRO_SEMANTIC = {
  state: "fresh",
  toolchain: "leanprover/lean4:v4.35.0",
  checkedAt: "2026-11-01T02:00:00.000Z",
  durationMs: 1200,
  errorCount: 0
};
function block(startLine, endLine) {
  return { file: MAIN_FILE, range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 2 } }, markupVersion: 1 };
}
function span(file, startLine, endLine, endCharacter) {
  return { file, range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: endCharacter } } };
}
function ref(name, line, from, to, nodeId) {
  return { name, range: { start: { line, character: from }, end: { line, character: to } }, ...nodeId ? { nodeId } : {} };
}
var NO_CERTS = { consistency: "none", nonVacuity: "none" };
var USER = { wordedBy: "user", endorsed: true, origin: "user" };
function spyroNodes() {
  return [
    {
      id: "pg-no-dark-past",
      type: "AXIOM",
      role: "node",
      subject: SPYRO_SUBJECT,
      naturalName: "PG games cannot have characters with dark pasts",
      stance: "rule",
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(4, 11),
      lean: { binding: "none" },
      status: { formal: "informal", proof: { kind: "none" }, certificates: { ...NO_CERTS }, flags: ["no-rationale"] }
    },
    {
      id: "cynder-dark-past",
      type: "AXIOM",
      role: "node",
      subject: SPYRO_SUBJECT,
      naturalName: "Cynder is a character who has a dark past",
      rationale: "familiar with gaming lore",
      source: "common",
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(13, 22),
      lean: {
        binding: "pinned",
        statement: "Spyro.cynder_dark_past",
        justification: "Spyro.cynder_dark_past.holds",
        justificationKind: "axiom",
        code: SPYRO_LEAN.cynderDarkPast,
        codeLoc: span(MAIN_FILE, 23, 25, 47),
        uses: ["Spyro.HasDarkPast", "Spyro.cynder"],
        refs: [
          ref("Spyro.HasDarkPast", 1, 34, 45),
          ref("Spyro.cynder", 1, 46, 52),
          ref("Spyro.cynder_dark_past", 2, 31, 47, "cynder-dark-past")
        ],
        presupposes: ["Spyro.Character.exists"],
        axioms: ["Classical.choice", "Spyro.Character", "Spyro.HasDarkPast", "Spyro.Character.exists", "Spyro.cynder_dark_past.holds"]
      },
      status: { formal: "formalized", proof: { kind: "assumed" }, certificates: { ...NO_CERTS }, flags: [] }
    },
    {
      id: "new-spyro-pg",
      type: "AXIOM",
      role: "node",
      subject: SPYRO_SUBJECT,
      naturalName: "The new Spyro game is PG",
      rationale: "known from gaming news",
      source: "reported",
      asserted: ASSERTED,
      premises: [],
      provenance: { ...USER },
      ext: {},
      loc: block(27, 36),
      lean: {
        binding: "pinned",
        statement: "Spyro.new_spyro_pg",
        justification: "Spyro.new_spyro_pg.holds",
        justificationKind: "axiom",
        code: SPYRO_LEAN.newSpyroPg,
        codeLoc: span(MAIN_FILE, 37, 39, 39),
        uses: ["Spyro.IsPG", "Spyro.newSpyro"],
        refs: [ref("Spyro.IsPG", 1, 30, 34), ref("Spyro.newSpyro", 1, 35, 43), ref("Spyro.new_spyro_pg", 2, 27, 39, "new-spyro-pg")],
        presupposes: ["Spyro.Game.exists"],
        axioms: ["Classical.choice", "Spyro.Game", "Spyro.IsPG", "Spyro.Game.exists", "Spyro.new_spyro_pg.holds"]
      },
      status: { formal: "formalized", proof: { kind: "assumed" }, certificates: { ...NO_CERTS }, flags: [] }
    },
    {
      id: "cynder-not-good",
      type: "PROPOSITION",
      role: "node",
      subject: SPYRO_SUBJECT,
      naturalName: "Cynder would not be a good addition to the new Spyro game",
      asserted: ASSERTED,
      premises: ["cynder-dark-past", "new-spyro-pg", "pg-no-dark-past"],
      provenance: { ...USER },
      ext: {},
      loc: block(41, 49),
      lean: {
        binding: "pinned",
        statement: "Spyro.cynder_not_good",
        code: SPYRO_LEAN.cynderNotGood,
        codeLoc: span(MAIN_FILE, 50, 51, 63),
        uses: ["Spyro.GoodAddition", "Spyro.cynder", "Spyro.newSpyro"],
        refs: [ref("Spyro.GoodAddition", 1, 35, 47), ref("Spyro.cynder", 1, 48, 54), ref("Spyro.newSpyro", 1, 55, 63)],
        presupposes: ["Spyro.Character.exists", "Spyro.Game.exists"]
      },
      status: { formal: "formalized", proof: { kind: "none" }, certificates: { ...NO_CERTS }, flags: [] }
    }
  ];
}
function vocab(name, kind, type, gloss, loc, code, usedBy, extra = {}) {
  return { name, shortName: name.slice(`${SPYRO_SUBJECT}.`.length), subject: SPYRO_SUBJECT, kind, type, gloss, glossBy: "user", loc, code, usedBy, flags: [], ...extra };
}
function spyroVocabulary() {
  return [
    vocab("Spyro.Character", "sort", "Type", "characters", span(VOCAB_FILE, 2, 3, 22), "/-- characters -/\naxiom Character : Type", [], {
      presupposition: "Spyro.Character.exists"
    }),
    vocab("Spyro.Game", "sort", "Type", "games", span(VOCAB_FILE, 4, 5, 17), "/-- games -/\naxiom Game : Type", [], { presupposition: "Spyro.Game.exists" }),
    vocab("Spyro.HasDarkPast", "predicate", "Spyro.Character \u2192 Prop", "has a dark past", span(VOCAB_FILE, 12, 13, 36), "/-- has a dark past -/\naxiom HasDarkPast : Character \u2192 Prop", ["cynder-dark-past"], { arity: 1 }),
    vocab("Spyro.IsPG", "predicate", "Spyro.Game \u2192 Prop", "is rated PG", span(VOCAB_FILE, 14, 15, 24), "/-- is rated PG -/\naxiom IsPG : Game \u2192 Prop", ["new-spyro-pg"], { arity: 1 }),
    vocab(
      "Spyro.GoodAddition",
      "predicate",
      "Spyro.Character \u2192 Spyro.Game \u2192 Prop",
      "would be a good addition to",
      span(VOCAB_FILE, 16, 17, 44),
      "/-- would be a good addition to -/\naxiom GoodAddition : Character \u2192 Game \u2192 Prop",
      ["cynder-not-good"],
      { arity: 2 }
    ),
    vocab("Spyro.cynder", "constant", "Spyro.Character", "Cynder", span(VOCAB_FILE, 18, 19, 39), "/-- Cynder -/\nnoncomputable opaque cynder : Character", ["cynder-dark-past", "cynder-not-good"]),
    vocab("Spyro.newSpyro", "constant", "Spyro.Game", "the new Spyro game", span(VOCAB_FILE, 20, 21, 36), "/-- the new Spyro game -/\nnoncomputable opaque newSpyro : Game", ["new-spyro-pg", "cynder-not-good"]),
    vocab(
      "Spyro.Character.exists",
      "presupposition",
      "Nonempty Spyro.Character",
      "there is at least one character",
      span(VOCAB_FILE, 6, 7, 43),
      "/-- there is at least one character -/\naxiom Character.exists : Nonempty Character",
      ["cynder-dark-past", "cynder-not-good"],
      { presupposes: "Spyro.Character" }
    ),
    vocab(
      "Spyro.Game.exists",
      "presupposition",
      "Nonempty Spyro.Game",
      "there is at least one game",
      span(VOCAB_FILE, 9, 10, 33),
      "/-- there is at least one game -/\naxiom Game.exists : Nonempty Game",
      ["new-spyro-pg", "cynder-not-good"],
      { presupposes: "Spyro.Game" }
    )
  ];
}
function spyroGraph(version = 1) {
  return buildGraph({ subject: SPYRO_SUBJECT, version, nodes: spyroNodes(), vocabulary: spyroVocabulary(), semantic: { ...SPYRO_SEMANTIC } });
}

// ../core/src/gate/g0.ts
var WORD_CODES = new Map([
  ...[
    "initialize",
    "builtin_initialize",
    "run_cmd",
    "run_elab",
    "run_meta",
    "run_tac",
    "macro",
    "macro_rules",
    "syntax",
    "notation",
    "infix",
    "infixl",
    "infixr",
    "prefix",
    "postfix",
    "elab",
    "elab_rules",
    "declare_syntax_cat",
    "declare_simp_like_tactic"
  ].map((w) => [w, "metaprogramming"]),
  ...["native_decide", "bv_decide", "implemented_by", "extern", "csimp", "native"].map((w) => [w, "native-code"]),
  ...["unsafe", "partial"].map((w) => [w, "unsafe"]),
  ["set_option", "set-option"],
  ...["sorry", "admit"].map((w) => [w, "sorry"])
]);

// ../core/src/gate/adoption.ts
var KEYWORDS = /* @__PURE__ */ new Set([
  ...DECL_KEYWORDS,
  ...MODIFIERS,
  "fun",
  "let",
  "have",
  "show",
  "from",
  "suffices",
  "by",
  "do",
  "then",
  "else",
  "if",
  "match",
  "with",
  "at",
  "in",
  "where",
  "forall",
  "calc",
  "nomatch",
  "nofun",
  "return",
  "for",
  "unless",
  "mut",
  "try",
  "catch",
  "finally",
  "break",
  "continue",
  "this",
  "Type",
  "Sort",
  "Prop",
  "sorry",
  "admit",
  "deriving",
  "termination_by",
  "decreasing_by",
  "using",
  "obtain",
  "rfl"
]);

// test/suite/fakeWorkspace.ts
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var path = __toESM(require("node:path"));
var errorOutcome = (error) => {
  const code = error?.code;
  return {
    ok: false,
    code: typeof code === "string" ? code : "internal",
    error: error instanceof Error ? error.message : String(error)
  };
};
var hex = () => Math.floor(Math.random() * 2 ** 48).toString(16).padStart(12, "0");
var FakeModelWorkspace = class _FakeModelWorkspace {
  constructor(options) {
    this.options = options;
    this.root = options.root;
    _FakeModelWorkspace.instances.push(this);
  }
  options;
  static instances = [];
  root;
  refreshRequests = [];
  invalidations = [];
  refreshNowCalls = 0;
  names = [];
  inbox = /* @__PURE__ */ new Map();
  undoStack = [];
  redoStack = [];
  history = [];
  gitReady = false;
  version = Date.now();
  listeners = /* @__PURE__ */ new Set();
  disposed = false;
  async load() {
    await this.rescan();
  }
  subjects() {
    return this.names.map((name) => ({ name, nodeCount: this.nodesOf(name).length, files: [`Model/${name}/Inbox.lean`] }));
  }
  graph(subject) {
    if (!this.names.includes(subject)) throw new Error(`unknown subject ${subject}`);
    const base = spyroGraph();
    return { ...base, subject, nodes: this.nodesOf(subject), version: ++this.version, semantic: this.semantic() };
  }
  async workspaceState(subject) {
    const undo = [...this.undoStack].reverse().find((e) => e.subject === subject)?.label ?? null;
    const redo = [...this.redoStack].reverse().find((e) => e.subject === subject)?.label ?? null;
    return {
      rootName: path.basename(this.root),
      subjects: this.subjects().map((s) => ({ name: s.name, nodeCount: s.nodeCount })),
      subject,
      undo,
      redo,
      history: await this.historyStatus()
    };
  }
  semantic() {
    return { state: "unavailable", detail: "fake workspace (no Lean)" };
  }
  onDidChange(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
  async invalidate(paths) {
    this.invalidations.push([...paths]);
    await this.rescan();
    this.fire(this.names, false);
  }
  requestRefresh(reason) {
    this.refreshRequests.push(reason);
  }
  async refreshNow() {
    this.refreshNowCalls++;
    this.fire(this.names, true);
    return this.semantic();
  }
  async perform(action) {
    switch (action.kind) {
      case "add-node":
        return this.addNode(action.subject, action.type, action.naturalName);
      case "create-subject":
        return this.createSubject(action.name);
      default:
        return { ok: true, label: `(fake) ${action.kind}`, undoable: false };
    }
  }
  async undo(subject) {
    const index = this.undoStack.map((e) => e.subject).lastIndexOf(subject);
    const entry = index >= 0 ? this.undoStack[index] : void 0;
    if (!entry) return { ok: false, code: "not-found", error: "Nothing to undo." };
    const reverse = entry.changes.map((c) => ({ path: c.path, before: c.after, after: c.before }));
    const outcome = await this.apply(reverse, `Undo: ${entry.label}`, "undo", subject, entry.subject);
    if (outcome.ok) {
      this.undoStack.splice(index, 1);
      this.redoStack.push(entry);
    }
    return outcome;
  }
  async redo(subject) {
    const index = this.redoStack.map((e) => e.subject).lastIndexOf(subject);
    const entry = index >= 0 ? this.redoStack[index] : void 0;
    if (!entry) return { ok: false, code: "not-found", error: "Nothing to redo." };
    const outcome = await this.apply(entry.changes, `Redo: ${entry.label}`, "redo", subject, entry.subject);
    if (outcome.ok) {
      this.redoStack.splice(index, 1);
      this.undoStack.push(entry);
    }
    return outcome;
  }
  async historyStatus() {
    return this.gitReady ? { state: "ready" } : { state: "no-repo" };
  }
  async listHistory(subject, limit = 50) {
    if (!this.gitReady) throw Object.assign(new Error("no repository"), { code: "no-history" });
    const entries = this.history.filter((e) => e.subject === subject).reverse().map(({ id, time, action, label: label3, subject: s }) => ({ id, time, action, label: label3, subject: s, nodes: [] }));
    const bytes = entries.length * 100;
    return { subject, entries: entries.slice(0, limit), storage: { subjectBytes: bytes, totalBytes: bytes, perSubject: { [subject]: bytes } }, more: entries.length > limit };
  }
  async historyDiff(subject, entryId, compare) {
    const entry = this.history.find((e) => e.id === entryId && e.subject === subject);
    if (!entry) throw Object.assign(new Error(`no history entry ${entryId}`), { code: "not-found" });
    return { entry: { id: entry.id, time: entry.time, action: entry.action, label: entry.label, subject, nodes: [] }, compare, files: entry.changes };
  }
  /** Reverts the files the later entries of this subject touched to their state right after `entryId`. */
  async revert(subject, entryId) {
    const index = this.history.findIndex((e) => e.id === entryId && e.subject === subject);
    if (index < 0) return { ok: false, code: "not-found", error: `no history entry ${entryId}` };
    const target = /* @__PURE__ */ new Map();
    for (const later of this.history.slice(index + 1).filter((e) => e.subject === subject)) {
      for (const change of later.changes) if (!target.has(change.path)) target.set(change.path, change.before);
    }
    const changes = [];
    for (const [file, after] of target) changes.push({ path: file, before: await this.options.text.read(file), after });
    const label3 = `Revert to: ${this.history[index]?.label ?? entryId}`;
    return this.apply(changes, label3, "revert", subject, subject, true);
  }
  async prune(subject, keepLast) {
    const mine = this.history.filter((e) => e.subject === subject);
    for (const entry of mine.slice(0, Math.max(0, mine.length - keepLast))) this.history.splice(this.history.indexOf(entry), 1);
    return this.listHistory(subject);
  }
  async initGit() {
    this.gitReady = true;
    for (const name of this.names) this.history.push({ id: hex(), time: (/* @__PURE__ */ new Date()).toISOString(), action: "initial", label: "Initial state", subject: name, changes: [] });
    this.fire([], false);
    return { state: "ready" };
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
  get isDisposed() {
    return this.disposed;
  }
  // M2 members (optional in the type until integration makes them required). The fake has no Claude runs
  // (FAKE_RUNNER refuses to create a RunManager for it), so Accept never reaches applyChanges here.
  async applyChanges(set) {
    return { ok: false, code: "not-yet", error: `the fake model workspace cannot apply "${set.label}"` };
  }
  async readText(file) {
    return this.options.text.read(file);
  }
  modelFiles() {
    return ["Model.lean", ...this.names.flatMap((name) => [`Model/${name}.lean`, `Model/${name}/Inbox.lean`])];
  }
  library() {
    return "Model";
  }
  projectModel() {
    return buildProjectModel({ files: [], fileHashes: {}, library: "Model" });
  }
  async reloadAttempts(subject) {
    void subject;
  }
  // ---------------------------------------------------------------------------------------------
  nodesOf(subject) {
    const base = subject === "Spyro" ? spyroGraph().nodes : [];
    return [...base, ...this.inbox.get(subject) ?? []];
  }
  async addNode(subject, type, naturalName) {
    if (!this.names.includes(subject)) return { ok: false, code: "not-found", error: `no subject ${subject}` };
    const file = `Model/${subject}/Inbox.lean`;
    const before = await this.options.text.read(file);
    const scaffold = subjectScaffold(subject, "Model").find((f) => f.path === file)?.text ?? `namespace ${subject}

end ${subject}
`;
    const current = before ?? scaffold;
    const taken = new Set(this.nodesOf(subject).map((n) => n.id));
    const slug = naturalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "node";
    let id = slug;
    for (let i = 2; taken.has(id); i++) id = `${slug}-${i}`;
    const block2 = `/-
@@ telelean v1
id: ${id}
type: ${type}
natural_name: ${naturalName}
-/

`;
    const end = current.lastIndexOf(`end ${subject}`);
    const after = end >= 0 ? `${current.slice(0, end)}${block2}${current.slice(end)}` : `${current}
${block2}`;
    const label3 = `Add ${type.toLowerCase()}: ${naturalName}`;
    const outcome = await this.apply([{ path: file, before, after }], label3, "add-node", subject, subject, true);
    return outcome.ok ? { ...outcome, nodeId: id } : outcome;
  }
  async createSubject(name) {
    if (this.names.includes(name)) return { ok: false, code: "invalid", error: `subject ${name} exists` };
    const changes = subjectScaffold(name, "Model").map((f) => ({ path: f.path, before: null, after: f.text }));
    changes.push({ path: layoutPath(name), before: null, after: serializeLayout(emptyLayout()) });
    const root = await this.options.text.read("Model.lean");
    changes.push({ path: "Model.lean", before: root, after: `${root ?? ""}import Model.${name}
` });
    return this.apply(changes, `New subject: ${name}`, "create-subject", name, name, true);
  }
  /** Writes through the extension's EditApplier, records undo/history, rescans and notifies. */
  async apply(changes, label3, action, historySubject, undoSubject, push = false) {
    try {
      await this.options.applier.apply(changes, label3);
    } catch (error) {
      return errorOutcome(error);
    }
    const entry = { id: hex(), time: (/* @__PURE__ */ new Date()).toISOString(), action, label: label3, subject: undoSubject, changes };
    if (push) {
      this.undoStack.push(entry);
      this.redoStack.length = 0;
    }
    if (this.gitReady) this.history.push({ ...entry, subject: historySubject });
    const namesBefore = this.names.join(",");
    await this.rescan();
    this.fire([historySubject, undoSubject], false, namesBefore !== this.names.join(","));
    return { ok: true, label: label3, undoable: true };
  }
  async rescan() {
    const library = path.join(this.root, "Model");
    const dirs = (0, import_node_fs.existsSync)(library) ? await (0, import_promises.readdir)(library, { withFileTypes: true }) : [];
    const names = [];
    for (const d of dirs) {
      const name = d.isDirectory() ? d.name : d.name.endsWith(".lean") ? d.name.slice(0, -5) : "";
      if (!SUBJECT_NAME_PATTERN.test(name) || names.includes(name)) continue;
      const hasLean = d.isDirectory() ? (await (0, import_promises.readdir)(path.join(library, d.name)).catch(() => [])).some((f) => f.endsWith(".lean")) : true;
      if (hasLean) names.push(name);
    }
    this.names = names.sort();
    const inbox = /* @__PURE__ */ new Map();
    for (const name of this.names) {
      const text = await this.options.text.read(`Model/${name}/Inbox.lean`) ?? "";
      const nodes = [];
      for (const block2 of text.matchAll(/@@ telelean v1\nid: (.+)\ntype: (AXIOM|PROPOSITION|ASSUMPTION|DERIVATION|GOAL)\nnatural_name: (.+)\n/g)) {
        nodes.push({
          id: block2[1] ?? "x",
          type: block2[2] === "AXIOM" || block2[2] === "ASSUMPTION" ? "AXIOM" : "PROPOSITION",
          role: "node",
          subject: name,
          naturalName: block2[3] ?? "",
          premises: [],
          provenance: { wordedBy: "user", endorsed: true, origin: "user" },
          ext: {},
          lean: { binding: "none" },
          status: { formal: "informal", proof: { kind: "none" }, certificates: { consistency: "none", nonVacuity: "none" }, flags: [] }
        });
      }
      inbox.set(name, nodes);
    }
    this.inbox = inbox;
  }
  fire(subjects, semantic, subjectsListChanged = false) {
    for (const listener of this.listeners) listener({ subjects: [...new Set(subjects)], semantic, subjectsListChanged });
  }
};
var EXCLUDED = /* @__PURE__ */ new Set(["node_modules", ".lake", ".git", "verbatim_prompt_log", "test-fixtures"]);
async function fakeFindModelRoots(folder, options = {}) {
  const roots = [];
  async function walk(dir, depth) {
    if ((0, import_node_fs.existsSync)(path.join(dir, ".telelean", "config.json"))) roots.push(dir);
    if (depth >= (options.maxDepth ?? 4)) return;
    for (const entry of await (0, import_promises.readdir)(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && !EXCLUDED.has(entry.name) && entry.name !== ".telelean") await walk(path.join(dir, entry.name), depth + 1);
    }
  }
  await walk(folder, 0);
  return roots.sort();
}
async function fakeInspectFolder(root) {
  if ((0, import_node_fs.existsSync)(path.join(root, ".telelean", "config.json"))) return { kind: "model", config: defaultProjectConfig() };
  const visible = (await (0, import_promises.readdir)(root)).filter((name) => !name.startsWith("."));
  return visible.length === 0 ? { kind: "empty" } : { kind: "unsupported", reason: "(fake) the folder is not empty" };
}
function fakePlanInitialize(options) {
  if (options.inspection.kind !== "empty") throw new TypeError("(fake) only empty folders");
  const created = (file, text) => ({ path: file, before: null, after: text });
  return [
    created("lakefile.toml", 'name = "Model"\ndefaultTargets = ["Model"]\n\n[leanOptions]\nautoImplicit = false\nrelaxedAutoImplicit = false\n\n[[lean_lib]]\nname = "Model"\n'),
    created("lean-toolchain", "leanprover/lean4:v4.35.0\n"),
    created("lake-manifest.json", '{"version": "1.1.0",\n "packagesDir": ".lake/packages",\n "packages": [],\n "name": "Model",\n "lakeDir": ".lake"}\n'),
    created(".gitignore", "/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n"),
    created("Model.lean", `import Model.${options.subject}
`),
    ...subjectScaffold(options.subject, "Model").map((f) => created(f.path, f.text)),
    created(".telelean/config.json", serializeProjectConfig(defaultProjectConfig())),
    created(layoutPath(options.subject), serializeLayout(emptyLayout()))
  ];
}
var FAKE_RUNNER = {
  createModelWorkspace: (options) => new FakeModelWorkspace(options),
  findModelRoots: fakeFindModelRoots,
  inspectFolder: fakeInspectFolder,
  planInitialize: fakePlanInitialize,
  createRunManager: () => {
    throw new Error("the fake model workspace of the M1 smoke suites has no Claude runs");
  }
};

// test/suite/helpers.ts
var assert = __toESM(require("node:assert/strict"));
var path2 = __toESM(require("node:path"));
var vscode = __toESM(require("vscode"));
var EXTENSION_ID = "telelean.telelean";
async function getApi() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  return extension.activate();
}
function workspacePaths() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(folder, "the smoke test needs the scratch workspace folder");
  return {
    ws: folder,
    mental: path2.join(folder, "mental_model"),
    second: path2.join(folder, "second_model"),
    plain: path2.join(folder, "plain_folder"),
    empty: path2.join(folder, "empty_folder")
  };
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function nextEvent(subscribe, predicate, timeoutMs, label3) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`timed out after ${timeoutMs} ms waiting for ${label3}`));
    }, timeoutMs);
    const subscription = subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(event);
    });
  });
}
function nextBoardMessage(api, root, predicate, timeoutMs, label3) {
  return nextEvent(
    (listener) => api.onDidReceiveBoardEvent(listener),
    (event) => event.root === root && predicate(event.message),
    timeoutMs,
    `the board of ${root ?? "the sample"} to post ${label3}`
  ).then((event) => event.message);
}
function nextPost(api, predicate, timeoutMs, label3) {
  return nextEvent((listener) => api.onDidPostToBoard(listener), predicate, timeoutMs, `the host to post ${label3}`);
}
function recordPosts(api) {
  const posts = [];
  const subscription = api.onDidPostToBoard((event) => posts.push(event));
  return { posts, dispose: () => subscription.dispose() };
}
function postsOf(posts, type, root) {
  return posts.filter((p) => (root === void 0 || p.root === root) && p.message.type === type).map((p) => p.message);
}
async function waitFor(condition, timeoutMs, label3, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label3}`);
    await sleep(intervalMs);
  }
}
var isRendered = (m) => m.type === "diagnostic" && m.payload.code === "rendered";
function message(type, payload = {}) {
  return { v: 1, type, payload };
}
async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
async function closeTextEditors() {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => !(tab.input instanceof vscode.TabInputWebview));
  if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
}

// test/suite/boards.test.ts
var read = (file) => (0, import_node_fs2.existsSync)(file) ? (0, import_node_fs2.readFileSync)(file, "utf8") : null;
suite("model boards (fake model workspace, real VS Code adapters)", () => {
  let api;
  let restoreRunner;
  let recorder;
  const paths = () => workspacePaths();
  const fakeFor = (root) => {
    const ws = api.workspaceFor(root);
    assert2.ok(ws instanceof FakeModelWorkspace, `no fake workspace for ${root}`);
    return ws;
  };
  async function request(root, type, payload) {
    const requestId = String(payload.requestId);
    const result = nextPost(api, (e) => e.root === root && e.message.type === "actionResult" && e.message.payload.requestId === requestId, 3e4, `actionResult ${requestId}`);
    await api.simulateBoardMessage(root, message(type, payload));
    const event = await result;
    assert2.ok(event.message.type === "actionResult");
    return event.message.payload.outcome;
  }
  suiteSetup(async () => {
    api = await getApi();
    assert2.ok(api.testing, "the test API exists in Test mode");
    await api.testing.reset();
    restoreRunner = api.testing.useRunner(FAKE_RUNNER);
    recorder = recordPosts(api);
  });
  suiteTeardown(async () => {
    recorder?.dispose();
    await api.testing?.reset();
    restoreRunner?.();
    await closeAllEditors();
  });
  test("one BoardPanel per model root; reopening reveals it; the webview renders the root board", async function() {
    this.timeout(9e4);
    const { mental, second } = paths();
    const rendered = nextBoardMessage(api, mental, isRendered, 6e4, 'the "rendered" diagnostic');
    const first = await vscode2.commands.executeCommand("telelean.openBoard", { root: mental });
    assert2.deepEqual(first, { root: mental, asked: false });
    const board = api.boardFor(mental);
    assert2.ok(board);
    assert2.equal(board.panel.title, "telelean: mental_model");
    assert2.equal(board.panel.viewType, "telelean.board");
    assert2.equal(board.subject, "Spyro");
    const done = await rendered;
    assert2.ok(done.type === "diagnostic");
    console.log(`      webview reported: ${done.payload.message}`);
    assert2.equal(done.payload.data?.cards, 4, done.payload.message);
    await vscode2.commands.executeCommand("telelean.openBoard", { root: mental });
    assert2.equal(api.boardFor(mental)?.panel, board.panel, "a second panel was created for the same root");
    await vscode2.commands.executeCommand("telelean.openBoard", { root: second });
    assert2.equal(api.boards().filter((b) => !b.sample).length, 2);
    assert2.notEqual(api.boardFor(second)?.panel, board.panel);
    assert2.ok(postsOf(recorder.posts, "workspace", mental).some((m) => m.payload.state.subject === "Spyro"));
    assert2.ok(fakeFor(mental).refreshRequests.includes("open"), "opening the board requests a Lean refresh");
  });
  test("createSubject switches the board; the serializer restores root and subject; undo makes it vanish and the board switches back", async function() {
    this.timeout(9e4);
    const { mental } = paths();
    const outcome = await request(mental, "createSubject", { name: "Bayonetta", requestId: "cs1" });
    assert2.equal(outcome.ok, true, JSON.stringify(outcome));
    assert2.equal(api.boardFor(mental)?.subject, "Bayonetta");
    for (const file of ["Model/Bayonetta.lean", "Model/Bayonetta/Vocabulary.lean", "Model/Bayonetta/Inbox.lean", "Model/Bayonetta/Main.lean", ".telelean/subjects/Bayonetta/layout.json"]) {
      assert2.ok((0, import_node_fs2.existsSync)(path3.join(mental, file)), `${file} was not created`);
    }
    assert2.match(read(path3.join(mental, "Model.lean")) ?? "", /import Model\.Bayonetta\n$/);
    await waitFor(() => api.boardRecords().some((r) => r.root === mental && r.subject === "Bayonetta"), 5e3, "the board record to follow the subject");
    const workspace3 = api.workspaceFor(mental);
    api.boardFor(mental)?.panel.dispose();
    await waitFor(() => api.boardFor(mental) === void 0, 5e3, "the board to close");
    assert2.equal(api.workspaceFor(mental), workspace3, "closing the board must keep the workspace (undo survives)");
    const restored = vscode2.window.createWebviewPanel("telelean.board", "telelean: mental_model", vscode2.ViewColumn.Active, { enableScripts: true });
    await api.restoreBoard(restored, void 0);
    assert2.equal(api.boardFor(mental)?.panel, restored);
    await waitFor(() => api.boardFor(mental)?.subject === "Bayonetta", 1e4, "the restored board to show subject Bayonetta");
    const notice2 = nextPost(api, (e) => e.root === mental && e.message.type === "notice" && /no longer exists/.test(e.message.payload.text), 3e4, "the vanished-subject notice");
    const undone = await request(mental, "undo", { requestId: "u-cs1" });
    assert2.equal(undone.ok, true, JSON.stringify(undone));
    const event = await notice2;
    assert2.ok(event.message.type === "notice");
    assert2.equal(event.message.payload.text, 'Subject "Bayonetta" no longer exists; showing "Spyro".');
    assert2.equal(api.boardFor(mental)?.subject, "Spyro");
    assert2.equal((0, import_node_fs2.existsSync)(path3.join(mental, "Model/Bayonetta/Main.lean")), false);
    assert2.doesNotMatch(read(path3.join(mental, "Model.lean")) ?? "", /Bayonetta/);
  });
  test("a state saved by the webview ({ root, subject }) also restores a board", async function() {
    this.timeout(3e4);
    const { second } = paths();
    api.boardFor(second)?.panel.dispose();
    await waitFor(() => api.boardFor(second) === void 0, 5e3, "the board to close");
    const panel = vscode2.window.createWebviewPanel("telelean.board", "some old title", vscode2.ViewColumn.Active, { enableScripts: true });
    await api.restoreBoard(panel, { root: second, subject: "Spyro" });
    assert2.equal(api.boardFor(second)?.panel, panel);
    assert2.equal(panel.title, "telelean: second_model");
    await waitFor(() => api.boardFor(second)?.subject === "Spyro", 1e4, "the restored board to show subject Spyro");
  });
  test("addNode writes a block to Model/Spyro/Inbox.lean through the EditApplier (WorkspaceEdit + save); undo removes it", async function() {
    this.timeout(6e4);
    const { mental } = paths();
    const inbox = path3.join(mental, "Model", "Spyro", "Inbox.lean");
    const before = read(inbox);
    const graph = nextPost(api, (e) => e.root === mental && e.message.type === "graph" && e.message.payload.graph.nodes.length === 5, 3e4, "a graph with 5 cards");
    const outcome = await request(mental, "addNode", { clientId: "tmp-1", type: "AXIOM", naturalName: "Cynder can fly", requestId: "add1" });
    assert2.deepEqual(outcome, { ok: true, label: "Add axiom: Cynder can fly", undoable: true, nodeId: "cynder-can-fly" });
    assert2.match(read(inbox) ?? "", /natural_name: Cynder can fly\n/);
    await graph;
    await waitFor(
      () => postsOf(recorder.posts, "notice", mental).some((n) => n.payload.text === "Add axiom: Cynder can fly" && n.payload.undoable),
      1e4,
      'the undoable "Add axiom" notice'
    );
    const doc = vscode2.workspace.textDocuments.find((d) => d.uri.fsPath === inbox);
    assert2.ok(!doc?.isDirty, "the edited file must be saved");
    const undone = await request(mental, "undo", { requestId: "u-add1" });
    assert2.equal(undone.ok, true, JSON.stringify(undone));
    assert2.equal(read(inbox), before);
  });
  test("unsaved typing in an open editor is what the TextSource reads; the applied edit keeps it and saves", async function() {
    this.timeout(6e4);
    const { mental } = paths();
    const inbox = path3.join(mental, "Model", "Spyro", "Inbox.lean");
    assert2.equal((await request(mental, "addNode", { clientId: "tmp-2", type: "PROPOSITION", naturalName: "Spyro is purple", requestId: "add2" })).ok, true);
    const editor = await vscode2.window.showTextDocument(vscode2.Uri.file(inbox), { preview: false });
    assert2.ok(await editor.edit((b) => b.insert(new vscode2.Position(0, 0), "-- my unsaved note\n")));
    assert2.equal(editor.document.isDirty, true);
    assert2.equal((await request(mental, "addNode", { clientId: "tmp-3", type: "PROPOSITION", naturalName: "Sparx follows Spyro", requestId: "add3" })).ok, true);
    const disk = read(inbox) ?? "";
    assert2.match(disk, /^-- my unsaved note\n/);
    assert2.match(disk, /natural_name: Sparx follows Spyro/);
    assert2.match(disk, /natural_name: Spyro is purple/);
    assert2.equal(editor.document.isDirty, false);
    assert2.equal(editor.document.getText(), disk);
    const fake = fakeFor(mental);
    await assert2.rejects(fake.options.applier.apply([{ path: "Model/Spyro/Inbox.lean", before: "stale\n", after: "x\n" }], "stale edit"), (error) => {
      assert2.equal(error.code, "conflict");
      return true;
    });
    await assert2.rejects(fake.options.applier.apply([{ path: "Model/Spyro/Inbox.lean", before: null, after: "x\n" }], "create over"), /changed since/);
    assert2.equal(read(inbox), disk);
    assert2.equal((await request(mental, "undo", { requestId: "u-add3" })).ok, true);
    assert2.match(editor.document.getText(), /^-- my unsaved note\n/);
    assert2.ok(await editor.edit((b) => b.delete(new vscode2.Range(0, 0, 1, 0))));
    assert2.ok(await editor.document.save());
    assert2.equal((await request(mental, "undo", { requestId: "u-add2" })).ok, true);
    assert2.doesNotMatch(read(inbox) ?? "", /Sparx|purple/);
    await closeTextEditors();
  });
  test('copyText puts the code on the clipboard and says "Copied"', async function() {
    this.timeout(3e4);
    const { mental } = paths();
    const text = "abbrev cynder_dark_past : Prop := HasDarkPast cynder\naxiom cynder_dark_past.holds : cynder_dark_past";
    const copied = nextPost(api, (e) => e.root === mental && e.message.type === "notice" && e.message.payload.text === "Copied", 1e4, 'the "Copied" notice');
    await api.simulateBoardMessage(mental, message("copyText", { text }));
    await copied;
    assert2.equal(await vscode2.env.clipboard.readText(), text);
  });
  test("openInEditor opens Model/Spyro/Main.lean at the range; a link out of the model root is refused", async function() {
    this.timeout(3e4);
    const { mental, second } = paths();
    const main = path3.join(mental, "Model", "Spyro", "Main.lean");
    const line = (read(main) ?? "").split("\n").findIndex((l) => l.startsWith("namespace Spyro"));
    assert2.ok(line > 0, "Main.lean has a namespace line");
    await api.simulateBoardMessage(mental, message("openInEditor", { file: "Model/Spyro/Main.lean", range: { start: { line, character: 0 }, end: { line, character: 9 } } }));
    await waitFor(() => vscode2.window.activeTextEditor?.document.uri.fsPath === main, 1e4, "Main.lean in the active editor");
    const editor = vscode2.window.activeTextEditor;
    assert2.equal(editor?.document.getText(editor.selection), "namespace");
    assert2.equal(editor?.selection.start.line, line);
    const refused = nextPost(api, (e) => e.root === second && e.message.type === "notice" && /Not opened/.test(e.message.payload.text), 1e4, "the refusal notice");
    await api.simulateBoardMessage(second, message("openInEditor", { file: "escape.lean" }));
    const event = await refused;
    assert2.ok(event.message.type === "notice");
    assert2.match(event.message.payload.text, /links outside the model root/);
    assert2.notEqual(vscode2.window.activeTextEditor?.document.uri.fsPath, path3.join(paths().plain, "Plain.lean"));
    await closeTextEditors();
  });
  test("initGit asks first; historyList, historyPreview (diff editor) and historyRevert (undoable) work", async function() {
    this.timeout(6e4);
    const { mental } = paths();
    assert2.ok(api.testing);
    api.testing.answerPrompts({ initGit: false });
    const declined = await request(mental, "initGit", { requestId: "g0" });
    assert2.deepEqual(declined, { ok: true, label: "Not initialized: history stays off.", undoable: false });
    api.testing.answerPrompts({ initGit: true });
    const state = nextPost(api, (e) => e.root === mental && e.message.type === "workspace" && e.message.payload.state.history.state === "ready", 1e4, "history: ready");
    assert2.equal((await request(mental, "initGit", { requestId: "g1" })).ok, true);
    await state;
    api.testing.answerPrompts({ initGit: void 0 });
    const inbox = path3.join(mental, "Model", "Spyro", "Inbox.lean");
    const beforeAdd = read(inbox);
    assert2.equal((await request(mental, "addNode", { clientId: "tmp-4", type: "AXIOM", naturalName: "Cynder is a dragon", requestId: "add4" })).ok, true);
    const listed = nextPost(api, (e) => e.root === mental && e.message.type === "history", 1e4, "the history listing");
    await api.simulateBoardMessage(mental, message("historyList", { subject: "Spyro", limit: 20 }));
    const event = await listed;
    assert2.ok(event.message.type === "history");
    const listing = event.message.payload.listing;
    assert2.deepEqual(listing.entries.map((e) => e.label), ["Add axiom: Cynder is a dragon", "Initial state"]);
    const [added, initial] = listing.entries;
    assert2.ok(added && initial);
    const boardPanel = api.boardFor(mental)?.panel;
    boardPanel?.reveal();
    await waitFor(() => boardPanel?.visible === true, 1e4, "the board in front");
    const boardColumn = boardPanel?.viewColumn;
    await api.simulateBoardMessage(mental, message("historyPreview", { subject: "Spyro", entryId: added.id, compare: "parent" }));
    await waitFor(
      () => vscode2.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith("History: Add axiom: Cynder is a dragon (")),
      15e3,
      "the history diff editor"
    );
    const previewGroup = vscode2.window.tabGroups.all.find((g) => g.tabs.some((t) => t.label.startsWith("History: Add axiom")));
    assert2.ok(previewGroup && boardColumn !== void 0 && previewGroup.viewColumn !== boardColumn, `preview in column ${previewGroup?.viewColumn}, board in ${boardColumn}`);
    assert2.equal(api.boardFor(mental)?.panel.visible, true, "the board must stay visible");
    const reverted = await request(mental, "historyRevert", { subject: "Spyro", entryId: initial.id, requestId: "rv1" });
    assert2.equal(reverted.ok, true, JSON.stringify(reverted));
    assert2.equal(reverted.ok && reverted.undoable, true);
    assert2.equal(read(inbox), beforeAdd);
    const undoRevert = await request(mental, "undo", { requestId: "u-rv1" });
    assert2.equal(undoRevert.ok, true);
    assert2.match(read(inbox) ?? "", /Cynder is a dragon/);
    assert2.equal((await request(mental, "undo", { requestId: "u-add4" })).ok, true);
    assert2.equal(read(inbox), beforeAdd);
    await closeTextEditors();
  });
  test("typing only re-parses (batched); a save re-parses and requests a refresh; files changed on disk are re-read", async function() {
    this.timeout(6e4);
    const { mental } = paths();
    const fake = fakeFor(mental);
    const main = path3.join(mental, "Model", "Spyro", "Main.lean");
    const editor = await vscode2.window.showTextDocument(vscode2.Uri.file(main), { preview: false });
    fake.invalidations.length = 0;
    fake.refreshRequests.length = 0;
    for (const ch of ["-", "-", " ", "x"]) {
      await editor.edit((b) => b.insert(new vscode2.Position(0, 0), ch));
      await sleep(30);
    }
    await waitFor(() => fake.invalidations.some((p) => p.includes("Model/Spyro/Main.lean")), 5e3, "the batched invalidate");
    assert2.equal(fake.invalidations.filter((p) => p.includes("Model/Spyro/Main.lean")).length, 1, `typing must be batched: ${JSON.stringify(fake.invalidations)}`);
    assert2.deepEqual(fake.refreshRequests, [], "typing must not build");
    await editor.document.save();
    await waitFor(() => fake.refreshRequests.includes("save"), 5e3, 'requestRefresh("save")');
    await editor.edit((b) => b.delete(new vscode2.Range(0, 0, 0, 4)));
    await editor.document.save();
    await closeTextEditors();
    await sleep(800);
    const requested = fake.refreshRequests;
    assert2.ok(!requested.includes("files"), `a save in the editor must not count as an outside change too: ${JSON.stringify(requested)}`);
    fake.invalidations.length = 0;
    const extra = path3.join(mental, "Model", "Spyro", "Extra.lean");
    await (0, import_promises2.writeFile)(extra, "-- written by another tool\n");
    await (0, import_promises2.writeFile)(path3.join(mental, ".telelean", "graph.json"), "{}\n");
    await waitFor(() => fake.invalidations.some((p) => p.includes("Model/Spyro/Extra.lean")), 1e4, "the file watcher to report Extra.lean");
    await waitFor(() => fake.refreshRequests.includes("files"), 1e4, 'requestRefresh("files") for a Lean file written by another program');
    await sleep(800);
    assert2.equal(fake.invalidations.flat().includes(".telelean/graph.json"), false, "graph.json must be ignored");
    await (0, import_promises2.rm)(extra);
    await (0, import_promises2.rm)(path3.join(mental, ".telelean", "graph.json"));
  });
  test("the Refresh message runs refreshNow and republishes", async function() {
    this.timeout(3e4);
    const { mental } = paths();
    const fake = fakeFor(mental);
    const calls = fake.refreshNowCalls;
    await api.simulateBoardMessage(mental, message("refresh"));
    assert2.equal(fake.refreshNowCalls, calls + 1);
  });
  test("Initialize Model Here on an empty folder validates the subject, writes the scaffold, offers git and opens the board (AT5.3)", async function() {
    this.timeout(6e4);
    const { empty } = paths();
    const invalid = await vscode2.commands.executeCommand("telelean.initializeModel", { folder: empty, subject: "not a name", gitInit: true });
    assert2.equal(invalid?.status, "failed");
    assert2.equal((0, import_node_fs2.existsSync)(path3.join(empty, ".telelean")), false, "nothing may be written for an invalid name");
    const result = await vscode2.commands.executeCommand("telelean.initializeModel", { folder: empty, subject: "Notes", gitInit: true });
    assert2.ok(result?.status === "initialized", JSON.stringify(result));
    assert2.equal(result.git, "initialized");
    assert2.equal(result.opened, true);
    for (const file of ["lakefile.toml", "lean-toolchain", "lake-manifest.json", ".gitignore", "Model.lean", "Model/Notes.lean", "Model/Notes/Inbox.lean", ".telelean/config.json", ".telelean/subjects/Notes/layout.json"]) {
      assert2.ok((0, import_node_fs2.existsSync)(path3.join(empty, file)), `${file} missing`);
    }
    assert2.equal(read(path3.join(empty, "Model.lean")), "import Model.Notes\n");
    assert2.equal(api.boardFor(empty)?.subject, "Notes");
    assert2.equal((await fakeFor(empty).historyStatus()).state, "ready");
    const again = await vscode2.commands.executeCommand("telelean.initializeModel", { folder: empty, openBoard: false });
    assert2.equal(again?.status, "already-model");
    await closeTextEditors();
  });
  test("a model that cannot be loaded says why on its board; Open Board again retries", async function() {
    this.timeout(3e4);
    assert2.ok(api.testing);
    const broken = path3.join(paths().ws, "broken_model");
    await (0, import_promises2.mkdir)(path3.join(broken, ".telelean"), { recursive: true });
    await (0, import_promises2.writeFile)(path3.join(broken, ".telelean", "config.json"), '{"format":"telelean-config","version":1,"library":"Model"}\n');
    const restoreThrowing = api.testing.useRunner({
      createModelWorkspace: () => {
        throw new Error("the model folder is unreadable (simulated)");
      }
    });
    try {
      const failure = nextPost(api, (e) => e.root === broken && e.message.type === "notice" && e.message.payload.level === "error", 15e3, "the error notice");
      await vscode2.commands.executeCommand("telelean.openBoard", { root: broken });
      const event = await failure;
      assert2.ok(event.message.type === "notice");
      assert2.match(event.message.payload.text, /could not load the model in "broken_model": the model folder is unreadable \(simulated\)/);
      assert2.equal(api.boardFor(broken)?.subject, void 0);
    } finally {
      restoreThrowing();
    }
    const firstPanel = api.boardFor(broken)?.panel;
    await vscode2.commands.executeCommand("telelean.openBoard", { root: broken });
    const retried = api.boardFor(broken);
    assert2.ok(retried && retried.panel !== firstPanel, "the failed board is created again");
    assert2.equal(retried.subject, "", 'a model without subjects shows no subject (the board offers "New subject")');
    retried.panel.dispose();
    await (0, import_promises2.rm)(broken, { recursive: true, force: true });
  });
});
//# sourceMappingURL=boards.test.js.map
