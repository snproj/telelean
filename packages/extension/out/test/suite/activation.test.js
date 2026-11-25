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

// test/suite/activation.test.ts
var assert2 = __toESM(require("node:assert/strict"));
var import_node_os = require("node:os");
var path3 = __toESM(require("node:path"));
var vscode2 = __toESM(require("vscode"));

// ../core/src/model.ts
var NODE_TYPES = ["AXIOM", "PROPOSITION"];
function isNodeType(value) {
  return value === "AXIOM" || value === "PROPOSITION";
}
var KIND_OF_ALIAS = { ASSUMPTION: "AXIOM", DERIVATION: "PROPOSITION", GOAL: "PROPOSITION" };
function parseNodeType(raw) {
  const upper = raw.toUpperCase();
  if (isNodeType(upper)) return { type: upper };
  if (upper === "ASSUMPTION" || upper === "DERIVATION" || upper === "GOAL") return { type: KIND_OF_ALIAS[upper], alias: upper };
  return void 0;
}
var STANCES = ["believe", "rule", "supposing"];
var EVIDENTIALS = ["observed", "reported", "inferred", "common"];

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

// ../core/src/markup/ids.ts
var ID_PATTERN = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
var MAX_WORDS = 6;
var TRANSLITERATIONS = {
  \u00DF: "ss",
  "\u1E9E": "ss",
  \u00E6: "ae",
  \u00C6: "ae",
  \u0153: "oe",
  \u0152: "oe",
  \u00F8: "o",
  \u00D8: "o",
  \u0111: "d",
  \u0110: "d",
  \u00F0: "d",
  \u00D0: "d",
  \u00FE: "th",
  \u00DE: "th",
  \u0142: "l",
  \u0141: "l",
  \u0131: "i",
  \u0127: "h",
  \u0126: "h",
  \u014B: "ng",
  \u014A: "ng"
};
function slugOf(sentence) {
  const latin = Array.from(sentence, (ch) => TRANSLITERATIONS[ch] ?? ch).join("");
  return latin.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word !== "").slice(0, MAX_WORDS).join("-");
}
function utf8Bytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 55296 && cp <= 56319) {
      const low = text.charCodeAt(i + 1);
      if (low >= 56320 && low <= 57343) {
        cp = 65536 + (cp - 55296 << 10) + (low - 56320);
        i++;
      } else {
        cp = 65533;
      }
    } else if (cp >= 56320 && cp <= 57343) {
      cp = 65533;
    }
    if (cp < 128) bytes.push(cp);
    else if (cp < 2048) bytes.push(192 | cp >> 6, 128 | cp & 63);
    else if (cp < 65536) bytes.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    else bytes.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
  }
  return bytes;
}
function fnv1a32(text) {
  let hash = 2166136261;
  for (const byte of utf8Bytes(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
function fallbackId(sentence) {
  return `n-${fnv1a32(sentence.trim()).toString(16).padStart(8, "0").slice(0, 6)}`;
}
function deriveId(naturalName, taken) {
  const base = slugOf(naturalName) || fallbackId(naturalName);
  if (!taken(base)) return base;
  for (let i = 2; i < 1e6; i++) {
    const candidate = `${base}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`deriveId: every suffix of "${base}" is taken`);
}

// ../core/src/review/hash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
function sha256Hex(text) {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 4294967296);
  const low = bitLength >>> 0;
  bytes.push(high >>> 24 & 255, high >>> 16 & 255, high >>> 8 & 255, high & 255);
  bytes.push(low >>> 24 & 255, low >>> 16 & 255, low >>> 8 & 255, low & 255);
  const h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
  const w = new Array(64).fill(0);
  const at = (list, i) => list[i] ?? 0;
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let t = 0; t < 16; t++) {
      const i = offset + t * 4;
      w[t] = (at(bytes, i) << 24 | at(bytes, i + 1) << 16 | at(bytes, i + 2) << 8 | at(bytes, i + 3)) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const w15 = at(w, t - 15);
      const w2 = at(w, t - 2);
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ w15 >>> 3;
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ w2 >>> 10;
      w[t] = at(w, t - 16) + s0 + at(w, t - 7) + s1 >>> 0;
    }
    let a = at(h, 0);
    let b = at(h, 1);
    let c = at(h, 2);
    let d = at(h, 3);
    let e = at(h, 4);
    let f = at(h, 5);
    let g = at(h, 6);
    let hh = at(h, 7);
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = hh + s1 + ch + at(K, t) + at(w, t) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = s0 + maj >>> 0;
      hh = g;
      g = f;
      f = e;
      e = d + temp1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 >>> 0;
    }
    h[0] = at(h, 0) + a >>> 0;
    h[1] = at(h, 1) + b >>> 0;
    h[2] = at(h, 2) + c >>> 0;
    h[3] = at(h, 3) + d >>> 0;
    h[4] = at(h, 4) + e >>> 0;
    h[5] = at(h, 5) + f >>> 0;
    h[6] = at(h, 6) + g >>> 0;
    h[7] = at(h, 7) + hh >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
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
function endorsementHash(text) {
  return sha256Hex(text.replace(/\s+/g, " ").trim());
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
function cutText(text, max = 60) {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}\u2026`;
}

// ../core/src/run.ts
var DEFAULT_RUN_CAPS = {
  maxTurns: 80,
  maxChecks: 25,
  maxAgentMs: 20 * 6e4,
  leanJobMs: 12e4,
  maxGateAttempts: 3
};

// ../core/src/protocol.ts
var SESSION_MESSAGE_TYPES = [
  "formalize",
  "decideItems",
  "revealResult",
  "sessionUndo",
  "sessionRedo",
  "submitReview",
  "endSession",
  "retryStep",
  "openSessionDiff",
  "moveProposed",
  "noteItem"
];
var RUN_MESSAGE_TYPES = ["answerQuestions", "cancelRun", "resumeRun", "dismissRun", ...SESSION_MESSAGE_TYPES];

// ../core/src/facts.ts
var STANDARD_AXIOM_NAMES = ["propext", "Classical.choice", "Quot.sound"];
var SORRY_AXIOM = "sorryAx";
var HOLDS_SUFFIX = ".holds";
function holdsName(statement) {
  return `${statement}${HOLDS_SUFFIX}`;
}

// ../core/src/actions.ts
var ActionError = class extends Error {
  constructor(code, message, dependents = []) {
    super(message);
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
var SUPPORTED_MARKUP_VERSIONS = [1];
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

// ../core/src/markup/chars.ts
function isLetterLike(cp) {
  return cp >= 945 && cp <= 969 && cp !== 955 || cp >= 913 && cp <= 937 && cp !== 928 && cp !== 931 || cp >= 970 && cp <= 1019 || cp >= 7936 && cp <= 8190 || cp >= 8448 && cp <= 8527 || cp >= 119964 && cp <= 120223 || cp >= 192 && cp <= 255 && cp !== 215 && cp !== 247 || cp >= 256 && cp <= 383;
}
function isSubScriptAlnum(cp) {
  return cp >= 8320 && cp <= 8329 || cp >= 8336 && cp <= 8348 || cp >= 7522 && cp <= 7530 || cp === 11388;
}
function isIdFirst(cp) {
  return cp >= 97 && cp <= 122 || cp >= 65 && cp <= 90 || cp === 95 || isLetterLike(cp);
}
function isIdRest(cp) {
  return isIdFirst(cp) || cp >= 48 && cp <= 57 || cp === 39 || cp === 33 || cp === 63 || isSubScriptAlnum(cp);
}
function isLeanWhitespace(code) {
  return code === 32 || code === 9 || code === 13 || code === 10;
}
function codePointAt(text, index) {
  return index < text.length ? text.codePointAt(index) ?? -1 : -1;
}
function cpWidth(cp) {
  return cp > 65535 ? 2 : 1;
}

// ../core/src/markup/lexer.ts
var CR = 13;
var BANG = 33;
var QUOTE = 34;
var HASH = 35;
var APOS = 39;
var DASH = 45;
var DOT = 46;
var SLASH = 47;
var BACKSLASH = 92;
var UNDERSCORE = 95;
var LOWER_R = 114;
var LBRACE = 123;
var RBRACE = 125;
var GUILLEMET_OPEN = 171;
var GUILLEMET_CLOSE = 187;
var INTERPOLATING = /* @__PURE__ */ new Set(["s!", "m!", "f!"]);
var isDigit = (c) => c >= 48 && c <= 57;
var isHexDigit = (c) => isDigit(c) || c >= 97 && c <= 102 || c >= 65 && c <= 70;
function codePointBefore(text, index) {
  if (index <= 0) return -1;
  const low = text.charCodeAt(index - 1);
  if (low >= 56320 && low <= 57343 && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 55296 && high <= 56319) return text.codePointAt(index - 2) ?? -1;
  }
  return low;
}
function lexLean(text) {
  const comments = [];
  const tokens = [];
  const n = text.length;
  const at = (i2) => i2 >= 0 && i2 < n ? text.charCodeAt(i2) : -1;
  const finishCommentBlock = (scanFrom) => {
    let depth = 1;
    let k = scanFrom;
    while (k < n) {
      const c = text.charCodeAt(k);
      if (c === DASH && at(k + 1) === SLASH) {
        k += 2;
        if (--depth === 0) return k;
      } else if (c === SLASH && at(k + 1) === DASH) {
        k += 2;
        depth++;
      } else {
        k++;
      }
    }
    return -1;
  };
  const skipTokenWhitespace = (from) => {
    let p = from;
    for (; ; ) {
      const c = at(p);
      if (c === 32 || c === 9 || c === CR || c === 10) p++;
      else if (c === DASH && at(p + 1) === DASH) {
        const newline = text.indexOf("\n", p);
        if (newline < 0) return n;
        p = newline;
      } else if (c === SLASH && at(p + 1) === DASH && at(p + 2) !== DASH && at(p + 2) !== BANG) {
        const end = finishCommentBlock(p + 2 < n ? p + 2 + cpWidth(codePointAt(text, p + 2)) : n);
        if (end < 0) return -1;
        p = end;
      } else return p;
    }
  };
  const interpolationAt = (i2) => {
    if (i2 < 2 || at(i2 - 1) !== BANG || !INTERPOLATING.has(text.slice(i2 - 2, i2))) return false;
    const before = codePointBefore(text, i2 - 2);
    return !(before >= 0 && (isIdRest(before) || before === DOT || before === GUILLEMET_CLOSE));
  };
  const scanString = (i2) => {
    const interpolated = interpolationAt(i2);
    let j = i2 + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === BACKSLASH) j += 2;
      else if (c === QUOTE) return j + 1;
      else if (interpolated && c === LBRACE) j = skipInterpolation(j + 1);
      else j++;
    }
    return n;
  };
  const scanChar = (i2) => {
    const c = codePointAt(text, i2 + 1);
    if (c < 0) return -1;
    let k = -1;
    if (c === BACKSLASH) {
      const e = at(i2 + 2);
      if (e === BACKSLASH || e === QUOTE || e === APOS || e === 114 || e === 110 || e === 116) k = i2 + 3;
      else if (e === 120 && isHexDigit(at(i2 + 3)) && isHexDigit(at(i2 + 4))) k = i2 + 5;
      else if (e === 117 && [3, 4, 5, 6].every((d) => isHexDigit(at(i2 + d)))) k = i2 + 7;
    } else {
      k = i2 + 1 + cpWidth(c);
    }
    return k > 0 && at(k) === APOS ? k + 1 : -1;
  };
  const scanRawString = (i2) => {
    let j = i2 + 1;
    while (at(j) === HASH) j++;
    if (at(j) !== QUOTE) return -1;
    const close = `"${"#".repeat(j - i2 - 1)}`;
    const k = text.indexOf(close, j + 1);
    return k < 0 ? n : k + close.length;
  };
  const scanDigits = (from, ok3) => {
    let j = from;
    while (j < n && (ok3(text.charCodeAt(j)) || text.charCodeAt(j) === UNDERSCORE)) j++;
    return j;
  };
  const scanNumber = (i2) => {
    const base = at(i2 + 1) | 32;
    if (at(i2) === 48 && (base === 98 || base === 111 || base === 120)) {
      const ok3 = base === 98 ? (c) => c === 48 || c === 49 : base === 111 ? (c) => c >= 48 && c <= 55 : isHexDigit;
      return scanDigits(i2 + 2, ok3);
    }
    let j = scanDigits(i2, isDigit);
    if (at(i2 - 1) === DOT) return j;
    if (at(j) === DOT && at(j + 1) !== DOT) j = scanDigits(j + 1, isDigit);
    if ((at(j) | 32) === 101) {
      let k = j + 1;
      if (at(k) === 43 || at(k) === DASH) k++;
      if (isDigit(at(k))) j = scanDigits(k, isDigit);
    }
    return j;
  };
  const scanIdent = (i2) => {
    let j = i2;
    for (; ; ) {
      const cp = codePointAt(text, j);
      if (cp === GUILLEMET_OPEN) {
        const k = text.indexOf("\xBB", j + 1);
        if (k < 0) return -1;
        j = k + 1;
      } else if (isIdFirst(cp)) {
        j += cpWidth(cp);
        for (let r = codePointAt(text, j); r >= 0 && isIdRest(r); r = codePointAt(text, j)) j += cpWidth(r);
      } else {
        return j;
      }
      if (at(j) !== DOT) return j;
      const next = codePointAt(text, j + 1);
      if (isIdFirst(next) || next === GUILLEMET_OPEN && text.indexOf("\xBB", j + 2) >= 0) j++;
      else return j;
    }
  };
  const skipInterpolation = (start) => {
    let i2 = start;
    let depth = 0;
    while (i2 < n) {
      const end = scanItem(i2, false);
      if (end > i2) {
        i2 = end;
        continue;
      }
      const c = text.charCodeAt(i2);
      if (c === LBRACE) depth++;
      else if (c === RBRACE && depth-- === 0) return i2 + 1;
      i2 += cpWidth(codePointAt(text, i2));
    }
    return n;
  };
  const scanItem = (i2, record) => {
    const c = text.charCodeAt(i2);
    if (c === DASH && at(i2 + 1) === DASH) {
      const newline = text.indexOf("\n", i2);
      const next = newline < 0 ? n : newline;
      const end2 = newline > i2 + 2 && text.charCodeAt(newline - 1) === CR ? newline - 1 : next;
      if (record) comments.push({ kind: "line", span: { start: i2, end: end2 }, body: { start: i2 + 2, end: end2 }, unterminated: false });
      return next;
    }
    if (c === SLASH && at(i2 + 1) === DASH) {
      const third = at(i2 + 2);
      const kind2 = third === DASH ? "doc" : third === BANG ? "moddoc" : "block";
      let bodyStart;
      let end2;
      if (kind2 === "block") {
        bodyStart = Math.min(i2 + 2, n);
        end2 = finishCommentBlock(i2 + 2 < n ? i2 + 2 + cpWidth(codePointAt(text, i2 + 2)) : n);
      } else {
        const after = skipTokenWhitespace(i2 + 3);
        bodyStart = after < 0 ? Math.min(i2 + 3, n) : after;
        end2 = after < 0 ? -1 : finishCommentBlock(after);
      }
      if (record) {
        comments.push(
          end2 < 0 ? { kind: kind2, span: { start: i2, end: n }, body: { start: bodyStart, end: n }, unterminated: true } : { kind: kind2, span: { start: i2, end: end2 }, body: { start: bodyStart, end: Math.max(bodyStart, end2 - 2) }, unterminated: false }
        );
      }
      return end2 < 0 ? n : end2;
    }
    let kind = "symbol";
    let end = -1;
    if (c === QUOTE) {
      kind = "string";
      end = scanString(i2);
    } else if (c === APOS && at(i2 + 1) !== APOS) {
      kind = "char";
      end = scanChar(i2);
    } else if (isDigit(c)) {
      kind = "number";
      end = scanNumber(i2);
    } else if (c === LOWER_R) {
      kind = "string";
      end = scanRawString(i2);
    }
    if (end < 0) {
      const cp = codePointAt(text, i2);
      if (cp === GUILLEMET_OPEN || isIdFirst(cp)) {
        kind = "ident";
        end = scanIdent(i2);
      }
    }
    if (end <= i2) return i2;
    if (record) tokens.push({ kind, span: { start: i2, end }, text: text.slice(i2, end) });
    return end;
  };
  let i = 0;
  while (i < n) {
    if (isLeanWhitespace(text.charCodeAt(i))) {
      i++;
      continue;
    }
    const end = scanItem(i, true);
    if (end > i) {
      i = end;
      continue;
    }
    const width = cpWidth(codePointAt(text, i));
    tokens.push({ kind: "symbol", span: { start: i, end: i + width }, text: text.slice(i, i + width) });
    i += width;
  }
  return { comments, tokens };
}
function isLeanName(name) {
  if (name.length === 0) return false;
  const { comments, tokens } = lexLean(name);
  const only = tokens[0];
  return comments.length === 0 && tokens.length === 1 && only !== void 0 && only.kind === "ident" && only.span.start === 0 && only.span.end === name.length;
}
function nameComponents(name) {
  const parts = [];
  let current = "";
  let inEscape = false;
  for (const ch of name) {
    if (ch === "\xAB") inEscape = true;
    else if (ch === "\xBB") inEscape = false;
    if (ch === "." && !inEscape) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}
function canonicalNamePart(part) {
  if (part.length < 3 || !part.startsWith("\xAB") || !part.endsWith("\xBB")) return part;
  const inner = part.slice(1, -1);
  const cps = Array.from(inner, (ch) => ch.codePointAt(0) ?? -1);
  const first = cps[0];
  return first !== void 0 && isIdFirst(first) && cps.every(isIdRest) ? inner : part;
}
function canonicalName(name) {
  return nameComponents(name).map(canonicalNamePart).join(".");
}

// ../core/src/markup/text.ts
var CR2 = 13;
function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}
function lineOfOffset(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = lo + hi + 1 >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
function lineContentEnd(text, starts, line) {
  const next = starts[line + 1];
  if (next === void 0) return text.length;
  const newline = next - 1;
  return newline > (starts[line] ?? 0) && text.charCodeAt(newline - 1) === CR2 ? newline - 1 : newline;
}
function lineFullEnd(text, starts, line) {
  return starts[line + 1] ?? text.length;
}
function isHorizontalSpace(text, start, end) {
  for (let i = start; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}
function isBlankLine(text, starts, line) {
  const start = starts[line];
  if (start === void 0) return false;
  return text.slice(start, lineContentEnd(text, starts, line)).trim() === "";
}
function lineIndent(text, starts, line) {
  const start = starts[line] ?? 0;
  let i = start;
  const end = lineContentEnd(text, starts, line);
  while (i < end && (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9)) i++;
  return text.slice(start, i);
}
function detectEol(text) {
  const i = text.indexOf("\n");
  return i > 0 && text.charCodeAt(i - 1) === CR2 ? "\r\n" : "\n";
}
var Lines = class {
  constructor(text) {
    this.text = text;
    this.starts = lineStarts(text);
  }
  text;
  starts;
  lineOf(offset) {
    return lineOfOffset(this.starts, offset);
  }
  start(line) {
    return this.starts[line] ?? this.text.length;
  }
  contentEnd(line) {
    return lineContentEnd(this.text, this.starts, line);
  }
  fullEnd(line) {
    return lineFullEnd(this.text, this.starts, line);
  }
  isBlank(line) {
    return isBlankLine(this.text, this.starts, line);
  }
  indent(line) {
    return lineIndent(this.text, this.starts, line);
  }
  get count() {
    return this.starts.length;
  }
  position(offset) {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const line = this.lineOf(clamped);
    return { line, character: clamped - this.start(line) };
  }
  range(span2) {
    return { start: this.position(span2.start), end: this.position(span2.end) };
  }
  /** True when only spaces/tabs precede `offset` on its line. */
  isLineInitial(offset) {
    return isHorizontalSpace(this.text, this.start(this.lineOf(offset)), offset);
  }
};

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
var OPENERS2 = /* @__PURE__ */ new Set(["(", "[", "{", "\u2983", "\u27E8", "\u27E6"]);
var CLOSERS2 = /* @__PURE__ */ new Set([")", "]", "}", "\u2984", "\u27E9", "\u27E7"]);
function lowerBound(length, before) {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = lo + hi >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function mergeItems(lex) {
  const items = [];
  const { comments, tokens } = lex;
  let c = 0;
  let t = 0;
  while (c < comments.length || t < tokens.length) {
    const comment = comments[c];
    const token = tokens[t];
    if (comment !== void 0 && (token === void 0 || comment.span.start < token.span.start)) {
      items.push({ start: comment.span.start, end: comment.span.end, comment });
      c++;
    } else if (token !== void 0) {
      items.push({ start: token.span.start, end: token.span.end, token, tokenIndex: t });
      t++;
    }
  }
  return items;
}
var isWord = (token, word) => token !== void 0 && token.kind === "ident" && token.text === word;
var isSymbol = (token, symbol) => token !== void 0 && token.kind === "symbol" && token.text === symbol;
var glued = (a, b) => a !== void 0 && b !== void 0 && a.span.end === b.span.start;
function scanDecls(text, lex, lines) {
  const { tokens, comments } = lex;
  const items = mergeItems(lex);
  const commandStart = /* @__PURE__ */ new Set();
  const headers = [];
  const scopes = [];
  let consumedUntil = -1;
  const firstTokenAtOrAfter = (offset) => lowerBound(tokens.length, (i) => (tokens[i]?.span.start ?? Infinity) < offset);
  const isAttributeStart = (t) => isSymbol(tokens[t], "@") && isSymbol(tokens[t + 1], "[") && glued(tokens[t], tokens[t + 1]);
  const skipAttribute = (t) => {
    let depth = 0;
    let k = t + 1;
    for (; k < tokens.length; k++) {
      const tok = tokens[k];
      if (isSymbol(tok, "[")) depth++;
      else if (isSymbol(tok, "]") && --depth === 0) return k + 1;
    }
    return k;
  };
  const parseHeader = (doc, firstToken) => {
    let t = firstToken;
    const first = tokens[t];
    if (first === void 0) return void 0;
    if (doc !== void 0) {
      const from = lowerBound(comments.length, (i) => (comments[i]?.span.start ?? Infinity) <= doc.span.start);
      for (let c = from; c < comments.length && (comments[c]?.span.start ?? Infinity) < first.span.start; c++) {
        if (comments[c]?.kind === "doc") return void 0;
      }
    }
    const attributes = [];
    while (isAttributeStart(t)) {
      const end2 = skipAttribute(t);
      attributes.push({ start: tokens[t]?.span.start ?? 0, end: tokens[end2 - 1]?.span.end ?? text.length });
      t = end2;
    }
    const modifiers = [];
    for (let tok = tokens[t]; tok?.kind === "ident" && MODIFIERS.has(tok.text); tok = tokens[++t]) modifiers.push(tok.text);
    const kw = tokens[t];
    if (kw === void 0 || kw.kind !== "ident" || !DECL_KEYWORDS.has(kw.text)) return void 0;
    let keyword = kw.text;
    let keywordSpan = kw.span;
    t++;
    const second = tokens[t];
    if (keyword === "class" && second !== void 0 && (isWord(second, "inductive") || isWord(second, "abbrev"))) {
      keyword = `class ${second.text}`;
      keywordSpan = { start: kw.span.start, end: second.span.end };
      t++;
    }
    let end = keywordSpan.end;
    if (keyword === "instance" && isSymbol(tokens[t], "(") && isWord(tokens[t + 1], "priority") && isSymbol(tokens[t + 2], ":") && isSymbol(tokens[t + 3], "=")) {
      let depth = 0;
      for (; t < tokens.length; t++) {
        const tok = tokens[t];
        if (isSymbol(tok, "(")) depth++;
        else if (tok !== void 0 && isSymbol(tok, ")") && --depth === 0) {
          end = tok.span.end;
          t++;
          break;
        }
      }
    }
    let name;
    const candidate = tokens[t];
    if (keyword !== "example" && keyword !== "mutual" && candidate?.kind === "ident") {
      name = candidate;
      end = candidate.span.end;
      t++;
    }
    return {
      start: doc?.span.start ?? first.span.start,
      ...doc ? { doc } : {},
      attributes,
      modifiers,
      keyword,
      keywordSpan,
      ...name ? { name } : {},
      end,
      nextToken: t
    };
  };
  const commentLines = [];
  let previousEndLine = -1;
  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    if (item === void 0) continue;
    const line = lines.lineOf(item.start);
    const lineInitial = line !== previousEndLine;
    previousEndLine = lines.lineOf(item.end);
    if (!lineInitial) continue;
    const lineEnd = lines.contentEnd(line);
    let m = k;
    for (; ; ) {
      const here = items[m];
      const next = items[m + 1];
      if (here?.comment === void 0 || here.comment.kind === "doc" || here.end > lineEnd || next === void 0 || next.start >= lineEnd) break;
      m++;
    }
    const code = items[m];
    if (item.start === lines.start(line)) {
      if (item.comment !== void 0) {
        commentLines.push({ line, end: item.end });
      } else if (item.token !== void 0 && item.tokenIndex !== void 0) {
        const tok = item.token;
        const next = tokens[item.tokenIndex + 1];
        const word = tok.kind === "ident" && COMMAND_WORDS.has(tok.text) && (tok.text !== "deriving" || isWord(next, "instance"));
        const hashCommand = isSymbol(tok, "#") && next?.kind === "ident" && glued(tok, next);
        if (word || hashCommand || isAttributeStart(item.tokenIndex)) commandStart.add(line);
      }
    }
    if (code === void 0) continue;
    if (code.start >= consumedUntil && (code.comment?.kind === "doc" || code.tokenIndex !== void 0)) {
      const header = code.comment !== void 0 ? parseHeader(code.comment, firstTokenAtOrAfter(code.end)) : parseHeader(void 0, code.tokenIndex ?? tokens.length);
      if (header !== void 0) {
        headers.push(header);
        commandStart.add(line);
        consumedUntil = header.end;
      }
    }
    if (code.tokenIndex !== void 0) {
      let t = code.tokenIndex;
      for (; ; ) {
        const tok = tokens[t];
        if (isAttributeStart(t)) t = skipAttribute(t);
        else if (tok?.kind === "ident" && MODIFIERS.has(tok.text)) t++;
        else break;
      }
      const word = tokens[t];
      const after = tokens[t + 1];
      if (word !== void 0 && word.span.start < lineEnd) {
        const prefixed = t !== code.tokenIndex;
        const name = after !== void 0 && after.kind === "ident" && after.span.start < lineEnd ? { name: after.text } : {};
        const before = scopes.length;
        if (isWord(word, "namespace") && !prefixed) scopes.push({ kind: "open", scope: "namespace", offset: word.span.start, ...name });
        else if (isWord(word, "section")) scopes.push({ kind: "open", scope: "section", offset: word.span.start, ...name });
        else if (isWord(word, "end") && !prefixed) scopes.push({ kind: "close", offset: word.span.start, ...name });
        else if (isWord(word, "mutual") && !prefixed) scopes.push({ kind: "open", scope: "mutual", offset: word.span.start });
        if (scopes.length > before) commandStart.add(line);
      }
    }
  }
  const stack = [];
  const namespaceAfter = [];
  scopes.forEach((event, index) => {
    if (event.kind === "open") {
      const scope = event.scope ?? "section";
      const components = scope === "mutual" || event.name === void 0 ? [void 0] : nameComponents(event.name);
      for (const component of components) stack.push({ event: index, scope, ...component !== void 0 ? { component } : {} });
    } else {
      const top = stack[stack.length - 1];
      const count = top?.scope === "mutual" || event.name === void 0 ? 1 : nameComponents(event.name).length;
      let opener;
      for (let i = 0; i < count && stack.length > 0; i++) opener = stack.pop()?.event;
      const open = opener !== void 0 ? scopes[opener] : void 0;
      if (opener !== void 0 && open !== void 0) {
        event.match = opener;
        open.match = index;
      }
    }
    namespaceAfter.push(stack.filter((f) => f.scope === "namespace" && f.component !== void 0).map((f) => canonicalName(f.component ?? "")));
  });
  const namespaceAt = (offset) => {
    const count = lowerBound(scopes.length, (i) => (scopes[i]?.offset ?? Infinity) < offset);
    return count === 0 ? [] : [...namespaceAfter[count - 1] ?? []];
  };
  const codeStarts = new Set(commandStart);
  for (const { line, end } of commentLines) {
    const next = tokens[firstTokenAtOrAfter(end)];
    if (next === void 0 || codeStarts.has(lines.lineOf(next.span.start))) commandStart.add(line);
  }
  const commandStartLines = [...commandStart].sort((a, b) => a - b);
  const nextCommandLine = (afterLine) => commandStartLines[lowerBound(commandStartLines.length, (i) => (commandStartLines[i] ?? Infinity) <= afterLine)] ?? lines.count;
  const decls = headers.map((header) => {
    const headerLine = lines.lineOf(header.end);
    const mutualOpen = header.keyword === "mutual" ? scopes.findIndex((e) => e.offset === header.keywordSpan.start) : -1;
    const mutualClose = mutualOpen >= 0 ? scopes[mutualOpen]?.match : void 0;
    let endLine;
    if (mutualClose !== void 0) {
      endLine = lines.lineOf(scopes[mutualClose]?.offset ?? header.end);
    } else {
      endLine = nextCommandLine(headerLine) - 1;
      while (endLine > headerLine && lines.isBlank(endLine)) endLine--;
    }
    const span2 = { start: header.start, end: Math.max(header.end, lines.contentEnd(endLine)) };
    const namespace = namespaceAt(header.start);
    const decl = { keyword: header.keyword, namespace, modifiers: header.modifiers, span: span2, range: lines.range(span2), keywordSpan: header.keywordSpan };
    if (header.name !== void 0) {
      decl.name = header.name.text;
      decl.fullName = resolveName(header.name.text, namespace);
      decl.nameSpan = header.name.span;
    }
    if (header.attributes.length > 0) decl.attributes = header.attributes.map((a) => text.slice(a.start, a.end));
    if (header.doc !== void 0) {
      decl.docstring = text.slice(header.doc.body.start, header.doc.body.end).trim();
      decl.docSpan = header.doc.span;
    }
    const valueStart = findValueStart(tokens, header, span2, lines);
    if (valueStart !== void 0) decl.valueStart = valueStart;
    return decl;
  });
  return { decls, scopes, imports: scanImports(tokens), items, namespaceAt };
}
function resolveName(name, namespace) {
  const written = canonicalName(name);
  if (written.startsWith("_root_.")) return written.slice("_root_.".length);
  return namespace.length > 0 ? `${namespace.join(".")}.${written}` : written;
}
function findValueStart(tokens, header, span2, lines) {
  if (header.keyword === "axiom" || header.keyword === "mutual") return void 0;
  const inductive = header.keyword === "inductive" || header.keyword === "coinductive" || header.keyword === "class inductive";
  let depth = 0;
  for (let t = header.nextToken; t < tokens.length; t++) {
    const tok = tokens[t];
    if (tok === void 0 || tok.span.start >= span2.end) break;
    if (tok.kind === "symbol") {
      if (OPENERS2.has(tok.text)) depth++;
      else if (CLOSERS2.has(tok.text)) depth = Math.max(0, depth - 1);
      else if (depth === 0 && tok.text === ":" && isSymbol(tokens[t + 1], "=") && glued(tok, tokens[t + 1])) return tok.span.start;
      else if (depth === 0 && tok.text === "|" && (inductive || lines.isLineInitial(tok.span.start))) return tok.span.start;
    } else if (depth === 0 && isWord(tok, "where")) {
      return tok.span.start;
    }
  }
  return void 0;
}
function scanImports(tokens) {
  const imports = [];
  let t = 0;
  if (isWord(tokens[t], "module")) t++;
  if (isWord(tokens[t], "prelude")) t++;
  for (; ; ) {
    let u = t;
    if (isWord(tokens[u], "public")) u++;
    if (isWord(tokens[u], "meta")) u++;
    if (!isWord(tokens[u], "import")) break;
    u++;
    if (isWord(tokens[u], "all")) u++;
    const module2 = tokens[u];
    if (module2 === void 0 || module2.kind !== "ident") break;
    imports.push(module2.text);
    t = u + 1;
  }
  return imports;
}

// ../core/src/markup/values.ts
var KNOWN_KEYS = new Set(FIELD_ORDER);
function noRationaleMessage(stance) {
  return stance === "rule" ? "This rule has no `rationale:` yet (no source yet: where does it come from?)." : "This axiom has no `rationale:` yet (no reason yet: why do you hold it?).";
}
var LIST_FIELD_KEYS = /* @__PURE__ */ new Set(["premises", "lean", "tags"]);
function isKnownFieldKey(key) {
  return KNOWN_KEYS.has(key);
}
function parseFieldValue(raw) {
  const v = raw.trim();
  if (!v.startsWith('"')) return { ok: true, value: v };
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed !== "string") return { ok: false, error: "a quoted value must be one JSON string" };
    return { ok: true, value: parsed };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `not a valid JSON string literal (${detail})` };
  }
}
function splitList(raw) {
  let v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  const items = [];
  const errors = [];
  let i = 0;
  while (i <= v.length) {
    while (i < v.length && /\s/u.test(v.charAt(i))) i++;
    if (i >= v.length) break;
    if (v.charAt(i) === '"') {
      let j = i + 1;
      while (j < v.length && v.charAt(j) !== '"') j += v.charAt(j) === "\\" ? 2 : 1;
      const literal = v.slice(i, j + 1);
      const parsed = parseFieldValue(literal);
      if (parsed.ok) items.push(parsed.value);
      else errors.push(`${literal}: ${parsed.error}`);
      let k = j + 1;
      while (k < v.length && /\s/u.test(v.charAt(k))) k++;
      if (k < v.length && v.charAt(k) !== ",") {
        const comma = v.indexOf(",", k);
        errors.push(`unexpected text after ${literal}`);
        k = comma < 0 ? v.length : comma;
      }
      i = k + 1;
    } else {
      const comma = v.indexOf(",", i);
      const end = comma < 0 ? v.length : comma;
      const item = v.slice(i, end).trim();
      if (item !== "") items.push(item);
      i = end + 1;
    }
  }
  return { items, errors };
}

// ../core/src/markup/parser.ts
var MARKER = /^@@[ \t]*telelean(?:[ \t]+v(\d+))?[ \t]*$/;
var FIELD = /^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)[ \t]*:(.*)$/s;
var TAG = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;
var TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:+-]*$/;
var DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
var LIST_KEYS = LIST_FIELD_KEYS;
function normaliseKey(key) {
  return key === "kind" ? "type" : key;
}
function segments(text, start, end) {
  const out = [];
  let p = start;
  for (; ; ) {
    const nl = text.indexOf("\n", p);
    if (nl < 0 || nl >= end) {
      out.push({ start: p, end });
      return out;
    }
    out.push({ start: p, end: nl > p && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl });
    p = nl + 1;
  }
}
var indentWidth = (line) => line.length - line.trimStart().length;
var Diagnostics = class {
  constructor(lines) {
    this.lines = lines;
  }
  lines;
  list = [];
  add(code, severity, message, span2, nodeId) {
    const diagnostic = { code, severity, message, span: span2, range: this.lines.range(span2), ...nodeId !== void 0 ? { nodeId } : {} };
    this.list.push(diagnostic);
    return diagnostic;
  }
};
function readBlock(text, comment, diags, pending) {
  const segs = segments(text, comment.body.start, comment.body.end);
  let s = 0;
  while (s < segs.length && text.slice(segs[s]?.start, segs[s]?.end).trim() === "") s++;
  const markerSeg = segs[s];
  if (markerSeg === void 0) return void 0;
  const markerLine = text.slice(markerSeg.start, markerSeg.end);
  const markerMatch = MARKER.exec(markerLine.trim());
  if (!markerMatch) return void 0;
  const markerStart = markerSeg.start + indentWidth(markerLine);
  const markerSpan = { start: markerStart, end: markerStart + markerLine.trim().length };
  if (comment.kind === "doc" || comment.kind === "moddoc") {
    const opener = comment.kind === "doc" ? "/--" : "/-!";
    diags.add("TL009", "warning", `This telelean block is inside a doc comment (\`${opener}\`), so it is ignored: use a plain \`/- \u2026 -/\` comment.`, markerSpan);
    return void 0;
  }
  const version = markerMatch[1] !== void 0 ? Number.parseInt(markerMatch[1], 10) : 1;
  const block2 = { comment, version, fields: {}, extensions: {}, markerSpan, lines: [] };
  const note = (code, severity, message, span2) => {
    pending.push({ code, severity, message, span: span2 });
  };
  if (comment.unterminated) note("TL010", "error", 'Unterminated comment: this block swallows the rest of the file (Lean reports "unterminated comment"). Close it with `-/`.', { start: comment.span.start, end: Math.min(comment.span.start + 2, text.length) });
  if (!SUPPORTED_MARKUP_VERSIONS.includes(version)) {
    const newer = version > Math.max(...SUPPORTED_MARKUP_VERSIONS);
    note("TL008", "warning", `Markup v${version} is ${newer ? "newer than" : "not a version"} this telelean understands (v${SUPPORTED_MARKUP_VERSIONS.join(", v")}); the block is shown, unknown fields are kept.`, markerSpan);
  }
  const seen = /* @__PURE__ */ new Set();
  for (let i = s + 1; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === void 0) continue;
    const raw = text.slice(seg.start, seg.end);
    const content = raw.trim();
    if (content === "") continue;
    const contentStart = seg.start + indentWidth(raw);
    const lineSpan = { start: seg.start, end: seg.end };
    if (content === "---") {
      const rest = segs.slice(i + 1);
      const restText = rest.map((r) => text.slice(r.start, r.end));
      let first = 0;
      let last = restText.length - 1;
      while (first <= last && (restText[first] ?? "").trim() === "") first++;
      while (last >= first && (restText[last] ?? "").trim() === "") last--;
      const kept = restText.slice(first, last + 1);
      const indent = kept.reduce((least, l) => l.trim() === "" ? least : Math.min(least, indentWidth(l)), Infinity);
      const body = kept.map((l) => l.slice(Math.min(indent, indentWidth(l)))).join("\n");
      if (body !== "") block2.body = body;
      const lastSeg = last >= first ? rest[last] : void 0;
      block2.bodySpan = { start: seg.start, end: lastSeg !== void 0 ? lastSeg.end : seg.end };
      break;
    }
    const match2 = FIELD.exec(content);
    if (!match2 || match2[1] === void 0 || match2[2] === void 0) {
      if (comment.unterminated) break;
      note("TL001", "error", `Malformed line (expected \`key: value\`): ${JSON.stringify(content.length > 60 ? `${content.slice(0, 60)}\u2026` : content)}`, lineSpan);
      continue;
    }
    const writtenKey = match2[1];
    const key = normaliseKey(writtenKey);
    const colon = content.indexOf(":", writtenKey.length);
    const afterColon = content.slice(colon + 1);
    const value = afterColon.trim();
    const valueStart = contentStart + colon + 1 + indentWidth(afterColon);
    const valueSpan = { start: valueStart, end: valueStart + value.length };
    block2.lines.push({ key, writtenKey, span: lineSpan, valueSpan, raw: value });
    if (key.includes(".") || !isKnownFieldKey(key)) {
      if (!key.includes(".")) note("TL002", "warning", `Unknown field \`${key}\` (kept as written; use a dotted key such as \`mytool.${key}\` for tool data).`, lineSpan);
      (block2.extensions[key] ??= []).push(value);
      continue;
    }
    if (seen.has(key) && !LIST_KEYS.has(key)) {
      note("TL005", "error", `Duplicate field \`${key}\` (the first value is used).`, lineSpan);
      continue;
    }
    seen.add(key);
    interpretField(block2, key, value, lineSpan, note);
  }
  if (block2.fields.followsFrom !== void 0 && (block2.fields.premises ?? []).length > 0) {
    const line = block2.lines.find((l) => l.key === "follows_from");
    note(
      "TL023",
      "error",
      "A card cannot both follow from nothing and have arrows: its `premises:` count, and `follows_from: nothing` is ignored. Remove one of the two.",
      line?.span ?? markerSpan
    );
    delete block2.fields.followsFrom;
  }
  return block2;
}
function interpretField(block2, key, raw, span2, note) {
  const fields = block2.fields;
  if (LIST_KEYS.has(key)) {
    const { items, errors } = splitList(raw);
    for (const error of errors) note("TL004", "error", `${key}: ${error}`, span2);
    const valid = key === "premises" ? (x) => ID_PATTERN.test(x) : key === "lean" ? isLeanName : (x) => TAG.test(x);
    const what = key === "premises" ? "node id" : key === "lean" ? "Lean name" : "tag";
    const good = [];
    for (const item of items) {
      if (valid(item)) good.push(item);
      else note("TL004", "error", `${key}: ${JSON.stringify(item)} is not a valid ${what}.`, span2);
    }
    if (key === "premises") fields.premises = [...fields.premises ?? [], ...good];
    else if (key === "lean") fields.lean = [...fields.lean ?? [], ...good];
    else fields.tags = [...fields.tags ?? [], ...good];
    return;
  }
  const parsed = parseFieldValue(raw);
  if (!parsed.ok) {
    note("TL004", "error", `${key}: ${parsed.error}.`, span2);
    return;
  }
  const value = parsed.value;
  const invalid = (expected) => note("TL004", "error", `Invalid ${key} ${JSON.stringify(value)} (expected ${expected}).`, span2);
  switch (key) {
    case "id":
      if (value === "") invalid("a node id");
      else {
        if (!ID_PATTERN.test(value)) invalid('lower-case letters and digits joined by "-", "_" or "."');
        block2.writtenId = value;
      }
      return;
    case "type": {
      const parsed2 = parseNodeType(value);
      if (parsed2 === void 0) invalid(NODE_TYPES.join(", "));
      else {
        const upper = value.toUpperCase();
        if (value !== upper) note("TL019", "hint", `The type is written in upper case: ${upper}.`, span2);
        fields.type = parsed2.type;
      }
      return;
    }
    case "follows_from":
      if (value === "nothing") fields.followsFrom = "nothing";
      else note("TL022", "error", `follows_from takes only the value nothing (found ${JSON.stringify(value)}); the field is ignored.`, span2);
      return;
    case "natural_name":
      if (/[\r\n]/.test(value)) note("TL004", "warning", "natural_name should be a single line.", span2);
      fields.naturalName = value;
      return;
    case "rationale":
      fields.rationale = value;
      return;
    case "stance":
      if (STANCES.includes(value)) fields.stance = value;
      else invalid(STANCES.join(", "));
      return;
    case "source":
      if (EVIDENTIALS.includes(value)) fields.source = value;
      else invalid(EVIDENTIALS.join(", "));
      return;
    case "asserted": {
      const date = DATE.exec(value);
      const month = Number(date?.[2]);
      const day = Number(date?.[3]);
      if (date && month >= 1 && month <= 12 && day >= 1 && day <= 31) fields.asserted = value;
      else invalid("a date YYYY-MM-DD");
      return;
    }
    case "supersedes":
    case "refines":
      if (ID_PATTERN.test(value)) fields[key] = value;
      else invalid("a node id");
      return;
    case "origin":
    case "worded_by":
      if (value === "user" || value === "agent") {
        if (key === "origin") fields.origin = value;
        else fields.wordedBy = value;
      } else invalid("user or agent");
      return;
    case "session":
      if (TOKEN.test(value)) fields.session = value;
      else invalid("letters, digits and _ . : + -");
      return;
    default:
      return;
  }
}
function findFollowingDecl(text, end, scan, blockComments) {
  const { items, decls } = scan;
  let p = end;
  for (; ; ) {
    let q = p;
    let newlines = 0;
    for (; q < text.length; q++) {
      const c = text.charCodeAt(q);
      if (c === 10) newlines++;
      else if (c !== 32 && c !== 9 && c !== 13) break;
    }
    if (q >= text.length) return {};
    const blank = newlines >= 2;
    const item = items[lowerBound(items.length, (i) => (items[i]?.start ?? Infinity) < q)];
    if (item === void 0 || item.start !== q) return {};
    if (item.comment !== void 0 && blockComments.has(item.comment)) return {};
    if (item.comment !== void 0 && (item.comment.kind === "line" || item.comment.kind === "block")) {
      if (blank) return {};
      p = item.end;
      continue;
    }
    const index = lowerBound(decls.length, (i) => (decls[i]?.span.start ?? Infinity) <= q) - 1;
    const decl = decls[index];
    if (decl === void 0 || q > decl.keywordSpan.start) return {};
    return blank ? { gap: index } : { adjacent: index };
  }
}
function parseLeanFile(path4, text) {
  const eol = detectEol(text);
  const lines = new Lines(text);
  try {
    return parse(path4, text, eol, lines);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const span2 = { start: 0, end: 0 };
    return {
      path: path4,
      text,
      eol,
      blocks: [],
      decls: [],
      imports: [],
      diagnostics: [{ code: "TL001", severity: "error", message: `telelean could not read this file (internal error: ${detail}).`, span: span2, range: lines.range(span2) }]
    };
  }
}
function parse(path4, text, eol, lines) {
  const lex = lexLean(text);
  const scan = scanDecls(text, lex, lines);
  const diags = new Diagnostics(lines);
  const raws = [];
  for (const comment of lex.comments) {
    if (comment.kind === "line") continue;
    const pending = [];
    const raw = readBlock(text, comment, diags, pending);
    if (raw !== void 0) raws.push({ raw, pending });
    else if (comment.unterminated) {
      diags.add("TL010", "error", "Unterminated comment: it swallows the rest of the file, so no telelean block after it is seen. Close it with `-/`.", {
        start: comment.span.start,
        end: Math.min(comment.span.start + 2, text.length)
      });
    }
  }
  const taken = new Set(raws.map(({ raw }) => raw.writtenId).filter((id) => id !== void 0));
  const blockComments = new Set(raws.map(({ raw }) => raw.comment));
  const blocks = raws.map(({ raw, pending }) => {
    const idWritten = raw.writtenId !== void 0;
    const id = raw.writtenId ?? deriveId(raw.fields.naturalName ?? "", (candidate) => taken.has(candidate));
    taken.add(id);
    for (const d of pending) diags.add(d.code, d.severity, d.message, d.span, id);
    if (!idWritten) {
      diags.add("TL112", "info", `This block has no \`id:\`; telelean uses \`${id}\` and writes it into the block on its next edit.`, raw.markerSpan, id);
    }
    const missing = [raw.lines.some((l) => l.key === "type") ? void 0 : "type", raw.lines.some((l) => l.key === "natural_name") ? void 0 : "natural_name"].filter(
      (k) => k !== void 0
    );
    for (const key of missing) diags.add("TL003", "error", `Missing required field \`${key}:\`.`, raw.markerSpan, id);
    if (raw.fields.type === "AXIOM" && raw.fields.rationale === void 0) {
      diags.add("TL011", "info", noRationaleMessage(raw.fields.stance), raw.markerSpan, id);
    }
    const block2 = {
      id,
      idWritten,
      version: raw.version,
      fields: raw.fields,
      extensions: raw.extensions,
      span: raw.comment.span,
      range: lines.range(raw.comment.span),
      markerSpan: raw.markerSpan,
      lines: raw.lines,
      binding: { mode: "none" }
    };
    if (raw.body !== void 0) block2.body = raw.body;
    if (raw.bodySpan !== void 0) block2.bodySpan = raw.bodySpan;
    block2.namespace = scan.namespaceAt(raw.comment.span.start);
    block2.binding = bindBlock(text, block2, scan, blockComments, diags);
    return block2;
  });
  diags.list.sort((a, b) => a.span.start - b.span.start);
  return { path: path4, text, eol, blocks, decls: scan.decls, imports: scan.imports, diagnostics: diags.list };
}
function bindBlock(text, block2, scan, blockComments, diags) {
  const following = block2.span.end < text.length ? findFollowingDecl(text, block2.span.end, scan, blockComments) : {};
  const position = {
    ...following.adjacent !== void 0 ? { adjacentDecl: following.adjacent } : {},
    ...following.gap !== void 0 ? { gapDecl: following.gap } : {}
  };
  const pinned = block2.fields.lean;
  if (pinned !== void 0 && pinned.length > 0) {
    const names = pinned.map((name) => name.startsWith("_root_.") ? name.slice("_root_.".length) : name);
    return { mode: "pinned", statement: names[0], pinned: names, ...position };
  }
  const adjacent = following.adjacent !== void 0 ? scan.decls[following.adjacent] : void 0;
  if (adjacent !== void 0) {
    if (adjacent.fullName !== void 0 && adjacent.keyword !== "example" && adjacent.keyword !== "mutual") {
      return { mode: "adjacent", statement: adjacent.fullName, ...position };
    }
    const what = adjacent.keyword === "example" ? "`example` declarations are not added to the environment" : adjacent.keyword === "mutual" ? "a `mutual` block holds several declarations: name one with `lean:`" : "this declaration has no name: name it, or pin it with `lean:`";
    diags.add("TL014", "warning", `The declaration after this block cannot be bound (${what}); the node stays code-less.`, block2.markerSpan, block2.id);
    return { mode: "none", ...position };
  }
  const gap = following.gap !== void 0 ? scan.decls[following.gap] : void 0;
  if (gap?.name !== void 0 && gap.keyword !== "example" && gap.keyword !== "mutual") {
    diags.add(
      "TL013",
      "hint",
      `This node is code-less, but \`${gap.name}\` follows after a blank line: remove the blank line to attach it.`,
      block2.markerSpan,
      block2.id
    );
  }
  return { mode: "none", ...position };
}

// ../core/src/markup/edits.ts
function deletionEdit(text, span2, lines = new Lines(text)) {
  const startLine = lines.lineOf(span2.start);
  const endLine = lines.lineOf(span2.end);
  const lineInitial = lines.isLineInitial(span2.start);
  const restBlank = isHorizontalSpace(text, span2.end, lines.contentEnd(endLine));
  let start = span2.start;
  let end = span2.end;
  if (lineInitial && restBlank) {
    start = lines.start(startLine);
    end = lines.fullEnd(endLine);
    const previousBlank = startLine === 0 || lines.isBlank(startLine - 1);
    const next = endLine + 1;
    const blankFollows = next < lines.count && lines.start(next) < text.length && lines.isBlank(next);
    if (previousBlank && blankFollows) end = lines.fullEnd(next);
    else if (end >= text.length && startLine > 0 && lines.isBlank(startLine - 1)) start = lines.start(startLine - 1);
  } else if (restBlank) {
    while (start > 0 && (text.charCodeAt(start - 1) === 32 || text.charCodeAt(start - 1) === 9)) start--;
    end = lines.contentEnd(endLine);
  } else {
    while (end < text.length && (text.charCodeAt(end) === 32 || text.charCodeAt(end) === 9)) end++;
  }
  return { span: { start, end }, newText: "" };
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
function resolveName2(name, namespace, known) {
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
    const resolved = resolveName2(token.text, namespace, known);
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
      const resolved = resolveName2(token.text, namespace, known);
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
function axiomPremisesMessage(names) {
  const one = names.length === 1;
  return `This axiom declares the premise${one ? "" : "s"} ${names.join(", ")} (\`premises:\`), written before v4, when axioms could have arrows: the board does not draw ${one ? "it" : "them"}. Make it a proposition (pending), or drop these arrows.`;
}
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
function codeJoint(statement, holds) {
  if (holds.file.path !== statement.file.path || holds.decl.span.start < statement.decl.span.end) return void 0;
  const from = statement.decl.span.end;
  const to = holds.decl.span.start;
  const quiet = !startsBetween(holds.file.decls, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(holds.file.text.slice(from, to)).trim() === "";
  return quiet ? holds.file.text.slice(from, to) : void 0;
}
function codePieces(draft) {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement) return [];
  const stmtPiece = { file: statement.file, start: statement.decl.span.start, end: statement.decl.span.end, decls: [draft.statement] };
  if (!holds || !draft.holds) return [stmtPiece];
  const holdsPiece = { file: holds.file, start: holds.decl.span.start, end: holds.decl.span.end, decls: [draft.holds] };
  if (codeJoint(statement, holds) !== void 0) return [{ file: statement.file, start: statement.decl.span.start, end: holds.decl.span.end, decls: [draft.statement, draft.holds] }];
  return [stmtPiece, holdsPiece];
}
function ownEntry(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : void 0;
}
var FOLLOWING_HINTS = /* @__PURE__ */ new Set(["TL013", "TL014"]);
function mergeSpans(text, spans) {
  const merged = [];
  for (const span2 of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last !== void 0 && (span2.start <= last.end || text.slice(last.end, span2.start).trim() === "")) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span2.end) };
    else merged.push({ start: span2.start, end: span2.end });
  }
  return merged;
}
function withoutSpans(text, spans) {
  let t = text;
  for (const span2 of mergeSpans(text, spans).reverse()) {
    const edit = deletionEdit(t, span2, new Lines(t));
    t = t.slice(0, edit.span.start) + t.slice(edit.span.end);
  }
  return t;
}
function twinBindings(file, spans, blocks, decls) {
  const twin = parseLeanFile(file.path, withoutSpans(file.text, spans));
  if (twin.blocks.length !== blocks.length || twin.decls.length !== decls.length) return void 0;
  const textOf = (text, span2) => text.slice(span2.start, span2.end);
  if (twin.blocks.some((b, k) => textOf(twin.text, b.span) !== textOf(file.text, blocks[k].span))) return void 0;
  if (twin.decls.some((d, k) => d.keyword !== decls[k]?.decl.keyword || d.fullName !== decls[k]?.decl.fullName)) return void 0;
  const back = (j) => j === void 0 ? void 0 : decls[j]?.at;
  return twin.blocks.map((b) => {
    const { adjacentDecl, gapDecl, ...rest } = b.binding;
    const adjacent = back(adjacentDecl);
    const gap = back(gapDecl);
    return {
      binding: { ...rest, ...adjacent !== void 0 ? { adjacentDecl: adjacent } : {}, ...gap !== void 0 ? { gapDecl: gap } : {} },
      hints: twin.diagnostics.filter((d) => FOLLOWING_HINTS.has(d.code) && d.span.start === b.markerSpan.start)
    };
  });
}
function maskFiles(files, mask) {
  const names = /* @__PURE__ */ new Set([...mask.drop, ...mask.absent]);
  const dropNodes = new Set(mask.dropNodes);
  const derived = new Map(Object.entries(mask.derivedIds));
  const hidden = /* @__PURE__ */ new Map();
  const overridden = /* @__PURE__ */ new Map();
  const out = files.map((file) => {
    const nameOf = (decl) => decl.fullName ?? (decl.keyword === "instance" ? anonymousInstanceName(file, decl) : void 0);
    const gone = file.decls.map((decl) => {
      const name = nameOf(decl);
      return name !== void 0 && names.has(name);
    });
    file.decls.forEach((decl, k) => {
      if (decl.keyword !== "mutual") return;
      const inside2 = file.decls.map((d, j) => ({ d, j })).filter(({ d, j }) => j !== k && d.span.start >= decl.span.start && d.span.end <= decl.span.end && nameOf(d) !== void 0);
      if (inside2.length > 0 && inside2.every(({ j }) => gone[j])) gone[k] = true;
    });
    const spans = [];
    const index = /* @__PURE__ */ new Map();
    const kept = [];
    const decls = [];
    const overrideAt = /* @__PURE__ */ new Set();
    const overrides = [];
    file.decls.forEach((decl, k) => {
      if (gone[k]) {
        spans.push(decl.span);
        return;
      }
      const override = decl.fullName !== void 0 ? ownEntry(mask.codeOverride, decl.fullName) : void 0;
      if (override !== void 0) {
        overrideAt.add(decls.length);
        overrides.push(decl.span);
      }
      index.set(k, decls.length);
      kept.push(decl);
      decls.push(override !== void 0 && override.keyword !== decl.keyword ? { ...decl, keyword: override.keyword } : decl);
    });
    if (overrides.length > 0) overridden.set(file.path, overrides);
    const keptBlocks = [];
    for (const block2 of file.blocks) {
      if (dropNodes.has(block2.id)) spans.push(block2.span);
      else keptBlocks.push(block2);
    }
    spans.push(...ownEntry(mask.lines, file.path) ?? []);
    spans.sort((a, b) => a.start - b.start);
    hidden.set(file.path, spans);
    const reread = spans.length > 0 || overrides.length > 0;
    const twinDecls = kept.flatMap((decl, at) => overrideAt.has(at) ? [] : [{ decl, at }]);
    const twin = reread ? twinBindings(file, [...spans, ...overrides], keptBlocks, twinDecls) : void 0;
    const lines = new Lines(file.text);
    const rehinted = /* @__PURE__ */ new Set();
    const added = [];
    const blocks = keptBlocks.map((block2, k) => {
      const derivedId = block2.idWritten ? derived.get(block2.id) : void 0;
      const id = derivedId ?? block2.id;
      let binding = { ...block2.binding };
      const read = twin?.[k];
      if (read !== void 0) {
        binding = { ...read.binding };
        rehinted.add(block2.markerSpan.start);
        for (const hint of read.hints) added.push({ ...hint, span: block2.markerSpan, range: lines.range(block2.markerSpan), nodeId: id });
      } else if (reread) {
        const keptAt = (j) => {
          const now = index.get(j);
          return now !== void 0 && !overrideAt.has(now) ? now : void 0;
        };
        if (binding.adjacentDecl !== void 0) {
          const now = keptAt(binding.adjacentDecl);
          if (now !== void 0) binding.adjacentDecl = now;
          else {
            rehinted.add(block2.markerSpan.start);
            if (binding.mode === "adjacent") binding = { mode: "none" };
            else delete binding.adjacentDecl;
          }
        }
        if (binding.gapDecl !== void 0) {
          const now = keptAt(binding.gapDecl);
          if (now !== void 0) binding.gapDecl = now;
          else {
            rehinted.add(block2.markerSpan.start);
            delete binding.gapDecl;
          }
        }
      }
      if (derivedId === void 0) return { ...block2, binding };
      added.push({
        code: "TL112",
        severity: "info",
        message: `This block has no \`id:\`; telelean uses \`${derivedId}\` and writes it into the block on its next edit.`,
        span: block2.markerSpan,
        range: lines.range(block2.markerSpan),
        nodeId: derivedId
      });
      return { ...block2, id: derivedId, idWritten: false, binding };
    });
    const inside = (offset) => spans.some((s) => s.start <= offset && offset < s.end);
    const diagnostics = [...file.diagnostics.filter((d) => !inside(d.span.start) && !(FOLLOWING_HINTS.has(d.code) && rehinted.has(d.span.start))), ...added];
    return { ...file, decls, blocks, diagnostics };
  });
  const arrows = /* @__PURE__ */ new Map();
  for (const { source, target } of mask.dropArrows) arrows.set(target, /* @__PURE__ */ new Set([...arrows.get(target) ?? [], source]));
  return { files: out, masking: { mask, hidden, overridden, arrows, dropNodes, restoreMarks: new Set(mask.restoreMarks) } };
}
function withoutHidden(text, from, to, spans) {
  let t = text;
  let end = to;
  let lines = 0;
  for (const span2 of mergeSpans(text, spans.filter((s) => s.start >= from && s.end <= to)).reverse()) {
    const edit = deletionEdit(t, span2, new Lines(t));
    const start = Math.max(from, edit.span.start);
    const stop = Math.min(end, edit.span.end);
    if (stop <= start) continue;
    lines += (t.slice(start, stop).match(/\n/g) ?? []).length;
    t = t.slice(0, start) + t.slice(stop);
    end -= stop - start;
  }
  return { text: t.slice(from, end), lines };
}
function blockCommentMask(text) {
  const inside = new Array(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "-" && next === "-") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"' && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
      i++;
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
      for (let k = i; k < Math.min(j, text.length); k++) inside[k] = true;
      i = j;
    } else i++;
  }
  return inside;
}
function withoutBlankLines(gap) {
  const parts = gap.split("\n");
  if (parts.length <= 2) return gap;
  const inBlock = blockCommentMask(gap);
  const out = [parts[0]];
  let at = parts[0].length + 1;
  for (let k = 1; k < parts.length - 1; k++) {
    const line = parts[k];
    if (line.trim() !== "" || inBlock[at + line.length] === true) out.push(line);
    at += line.length + 1;
  }
  out.push(parts[parts.length - 1]);
  return out.join("\n");
}
var lineBreaks = (text) => (text.match(/\n/g) ?? []).length;
var lastLineLength = (text) => text.length - (text.lastIndexOf("\n") + 1);
function maskedCode(draft, masking, lines) {
  const statement = draft.statementDecl;
  const holds = draft.holdsDecl;
  if (!statement || !draft.statement || !holds || !draft.holds) return void 0;
  const stmtText = statement.file.text.slice(statement.decl.span.start, statement.decl.span.end);
  const stmtMap = lines(statement.file);
  const stmtFrom = stmtMap.positionAt(statement.decl.span.start);
  const stmtTo = stmtMap.positionAt(statement.decl.span.end);
  const end = holds.file.path === statement.file.path ? holds.decl.span.end : statement.decl.span.end;
  const loc = { file: statement.file.path, range: stmtMap.rangeOf(statement.decl.span.start, Math.max(end, statement.decl.span.end)) };
  const stmtDecl = { name: draft.statement, from: stmtFrom, to: stmtTo, line: 0, column: 0 };
  const holdsKey = draft.holds;
  const compose = (between, holdsText2, from2, to2, files) => {
    const head = `${stmtText}${between}`;
    return { code: `${head}${holdsText2}`, decls: [stmtDecl, { name: holdsKey, from: from2, to: to2, line: lineBreaks(head), column: lastLineLength(head) }], files, loc };
  };
  const override = ownEntry(masking.mask.codeOverride, holdsKey);
  if (override !== void 0) return compose(override.joined ?? "\n\n", override.text, override.range.start, override.range.end, [statement.file, holds.file]);
  const holdsMap = lines(holds.file);
  const holdsFrom = holdsMap.positionAt(holds.decl.span.start);
  const holdsTo = holdsMap.positionAt(holds.decl.span.end);
  const holdsText = holds.file.text.slice(holds.decl.span.start, holds.decl.span.end);
  const layout = ownEntry(masking.mask.codeLayout, holdsKey);
  if (layout !== void 0) return compose(layout.joined ?? "\n\n", holdsText, holdsFrom, holdsTo, [statement.file, holds.file]);
  if (holds.file.path !== statement.file.path || holds.decl.span.start < statement.decl.span.end) return void 0;
  const from = statement.decl.span.end;
  const to = holds.decl.span.start;
  const inGap = (s) => s.start >= from && s.end <= to;
  const moved = (masking.overridden.get(holds.file.path) ?? []).filter(inGap);
  const spans = [...(masking.hidden.get(holds.file.path) ?? []).filter(inGap), ...moved];
  const gap = withoutHidden(holds.file.text, from, to, spans);
  const others = holds.file.decls.filter((d) => !moved.some((s) => s.start === d.span.start));
  const quiet = !startsBetween(others, from, to) && !startsBetween(holds.file.blocks, from, to) && blankComments(gap.text).trim() === "";
  if (!quiet) return void 0;
  return compose(withoutBlankLines(gap.text), holdsText, holdsFrom, holdsTo, [statement.file]);
}
function buildProject(input) {
  const library = input.library;
  const masked = input.mask !== void 0 ? maskFiles(input.files, input.mask) : void 0;
  const masking = masked?.masking;
  const files = [...masked?.files ?? input.files].sort(byPath);
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
      let premises = [...block2.fields.premises ?? []];
      let followsFrom = block2.fields.followsFrom === "nothing";
      if (masking !== void 0) {
        const claude = masking.arrows.get(id);
        premises = premises.filter((source) => !masking.dropNodes.has(source) && !(claude?.has(source) ?? false));
        if (masking.restoreMarks.has(id)) followsFrom = true;
      }
      drafts.push({
        id,
        file,
        block: block2,
        premises,
        followsFrom,
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
      const resolve = (name) => known(name) ? name : resolveName2(name, namespace, known) ?? name;
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
  const endorsed = /* @__PURE__ */ new Set();
  for (const item of vocab2.items) {
    if (item.kind !== "definition" || item.code === void 0 || input.endorsements === void 0) continue;
    const list = Object.prototype.hasOwnProperty.call(input.endorsements, item.subject) ? input.endorsements[item.subject] : void 0;
    if (list === void 0 || list.length === 0) continue;
    const hash = endorsementHash(item.code);
    if (list.some((e) => e.name === item.name && e.textHash === hash)) endorsed.add(item.name);
  }
  const needsEndorsement = (name) => vocab2.kindOf.get(name) === "definition" && !endorsed.has(name);
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
  for (const message of input.facts?.build.messages ?? []) {
    const severity = SEVERITY_OF_LEAN[message.severity] ?? "info";
    const where2 = message.file ? containing(message.file, message.range) : {};
    diagnostics.push({
      code: "LEAN",
      severity,
      message: message.text,
      ...message.file ? { file: message.file } : {},
      ...message.range ? { range: message.range } : {},
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
    const composed = masking !== void 0 && draft.statementFound ? maskedCode(draft, masking, lines) : void 0;
    const pieces = composed === void 0 && draft.statementFound ? codePieces(draft) : [];
    if (composed !== void 0) {
      lean.code = composed.code;
      lean.codeLoc = composed.loc;
    } else if (pieces.length > 0) {
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
    const keepRef = (ref2) => {
      const owner = ownerOfDecl.get(ref2.name);
      const ownerStmt = owner !== void 0 ? ownerStatement(owner) : void 0;
      const nodeRef = ownerStmt !== void 0 && (ref2.name === ownerStmt || ref2.name === holdsName(ownerStmt));
      return nodeRef || vocab2.itemOfName.has(ref2.name) ? { nodeRef, owner } : void 0;
    };
    if (composed !== void 0 && composed.files.every((f) => factsIndex.isFresh(f.path))) {
      const refs = [];
      for (const decl of composed.decls) {
        for (const ref2 of factsIndex.usable.get(decl.name)?.refs ?? []) {
          const kept = keepRef(ref2);
          if (kept === void 0) continue;
          if (ref2.range.start.line < decl.from.line || ref2.range.end.line > decl.to.line) continue;
          const shift = (p) => ({
            line: p.line - decl.from.line + decl.line,
            character: p.line === decl.from.line ? p.character - decl.from.character + decl.column : p.character
          });
          refs.push({ name: ref2.name, range: { start: shift(ref2.range.start), end: shift(ref2.range.end) }, ...kept.nodeRef && kept.owner !== void 0 ? { nodeId: kept.owner } : {} });
        }
      }
      lean.refs = refs;
    } else if (pieces.length > 0 && pieces.every((p) => factsIndex.isFresh(p.file.path))) {
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
    if ((draft.lean.uses ?? []).some(needsEndorsement)) draft.flags.add("definitional-choice");
  }
  for (const draft of drafts) {
    const at = { file: draft.file.path, range: draft.block.range, nodeId: draft.id };
    if (draft.type === "AXIOM" && draft.premises.length > 0) {
      const names = [...new Set(draft.premises)].map((premise) => {
        const sentence = byId.get(premise)?.block.fields.naturalName;
        return sentence === void 0 ? `"${premise}"` : `\u201C${cutText(sentence, 40)}\u201D`;
      });
      draft.diagnostics.push({ code: "TL122", severity: "info", message: axiomPremisesMessage(names), ...at });
    }
    for (const premise of draft.premises) {
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
      return draft === void 0 || draft.type === "AXIOM" ? [] : draft.premises;
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
      premises: [...draft.premises],
      // AR-5: the parser drops the mark when premises are declared (TL023); a hand-built block is held to the same rule.
      ...draft.followsFrom && draft.premises.length === 0 ? { fromNothing: true } : {},
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
      if (item && needsEndorsement(item.name) && !item.flags.includes("definitional-choice")) item.flags.push("definitional-choice");
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
    created(".gitignore", "/.lake/\n/.telelean/graph.json\n/.telelean/frozen/\n/.telelean/sessions/\n/.telelean/*.tmp\n/.telelean/runs/\n"),
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
async function waitFor(condition, timeoutMs, label3, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label3}`);
    await sleep(intervalMs);
  }
}
async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

// test/suite/activation.test.ts
suite("activation, opt-in and isolation", () => {
  test("the opted-in workspace activates the extension by itself (workspaceContains:**/.telelean/config.json)", async function() {
    this.timeout(3e4);
    const extension = vscode2.extensions.getExtension(EXTENSION_ID);
    assert2.ok(extension, `${EXTENSION_ID} is not loaded`);
    await waitFor(() => extension.isActive, 25e3, "the workspaceContains activation");
  });
  test("VS Code sees the 3 commands, the settings with their defaults and the 6 colours", async () => {
    const commands3 = await vscode2.commands.getCommands(true);
    for (const id of ["telelean.openBoard", "telelean.initializeModel", "telelean.refresh"]) assert2.ok(commands3.includes(id), id);
    const config = vscode2.workspace.getConfiguration("telelean");
    assert2.deepEqual(
      {
        cap: config.get("memory.capGiB"),
        min: config.get("memory.minAvailableGiB"),
        refresh: config.get("refresh.enabled"),
        debounce: config.get("refresh.debounceMs"),
        snapshots: config.get("git.snapshotRefs"),
        git: config.get("git.path")
      },
      { cap: 4, min: 2, refresh: true, debounce: 750, snapshots: true, git: "git" }
    );
    assert2.deepEqual(
      {
        model: config.get("model"),
        effort: config.get("effort"),
        claudePath: config.get("claude.path"),
        maxTurns: config.get("run.maxTurns"),
        maxChecks: config.get("run.maxChecks"),
        maxAgentMinutes: config.get("run.maxAgentMinutes"),
        leanJobSeconds: config.get("run.leanJobSeconds"),
        maxGateAttempts: config.get("run.maxGateAttempts"),
        keepRuns: config.get("run.keepRuns"),
        contextScope: config.get("run.contextScope")
      },
      {
        model: "claude-opus-5-5",
        effort: "high",
        claudePath: "",
        maxTurns: 80,
        maxChecks: 25,
        maxAgentMinutes: 20,
        leanJobSeconds: 120,
        maxGateAttempts: 3,
        keepRuns: 10,
        contextScope: "subject"
      }
    );
    const manifest = vscode2.extensions.getExtension(EXTENSION_ID)?.packageJSON;
    assert2.deepEqual(
      manifest.contributes.colors.map((c) => c.id),
      // Spec v4 (slice 1a): the two kinds' stripes and the proved green of the established glow and the band.
      ["telelean.kindAxiom", "telelean.kindProposition", "telelean.proved", "telelean.formalizedAura", "telelean.vocabulary", "telelean.highlight"]
    );
  });
  test("the instance runs in the isolated profile (HOME, XDG dirs, git config) set up by scripts/smoke.mjs", () => {
    const dir = process.env.TELELEAN_SMOKE_DIR;
    assert2.ok(dir, "TELELEAN_SMOKE_DIR is not set in the extension host");
    assert2.equal((0, import_node_os.homedir)(), path3.join(dir, "home"));
    assert2.equal(process.env.XDG_CONFIG_HOME, path3.join(dir, "xdg-config"));
    assert2.equal(process.env.XDG_CACHE_HOME, path3.join(dir, "xdg-cache"));
    assert2.equal(process.env.XDG_DATA_HOME, path3.join(dir, "xdg-data"));
    assert2.equal(process.env.GIT_CONFIG_GLOBAL, "/dev/null");
    assert2.equal(process.env.GIT_CONFIG_NOSYSTEM, "1");
    assert2.equal(vscode2.workspace.workspaceFolders?.[0]?.uri.fsPath, path3.join(dir, "ws"));
    assert2.equal(vscode2.workspace.getConfiguration("chat").get("disableAIFeatures"), true);
    assert2.equal(vscode2.workspace.getConfiguration("telemetry").get("telemetryLevel"), "off");
  });
  test("a folder without .telelean gets no board and no model workspace (so it never runs Lean)", async () => {
    const api = await getApi();
    const { plain } = workspacePaths();
    const result = await vscode2.commands.executeCommand("telelean.openBoard", { root: plain });
    assert2.match(result.error ?? "", /not a telelean model/);
    assert2.equal(api.boardFor(plain), void 0);
    assert2.equal(api.workspaceFor(plain), void 0);
  });
  test("with two model roots Open Board asks which one; the answer (a test argument) opens that board", async function() {
    this.timeout(6e4);
    const api = await getApi();
    assert2.ok(api.testing, "the test API exists in Test mode");
    const restore = api.testing.useRunner(FAKE_RUNNER);
    try {
      const { mental, second } = workspacePaths();
      const result = await vscode2.commands.executeCommand("telelean.openBoard", { pick: "second_model" });
      assert2.deepEqual(result, { root: second, asked: true });
      assert2.equal(api.boardFor(second)?.panel.title, "telelean: second_model");
      assert2.equal(api.boardFor(mental), void 0);
      const unanswered = await vscode2.commands.executeCommand("telelean.openBoard", { pick: "nothing-like-this" });
      assert2.equal(unanswered.asked, true);
      assert2.match(unanswered.error ?? "", /no model root matches/);
      const fake = FakeModelWorkspace.instances.find((w) => w.root === second);
      assert2.ok(fake, "the board created the root workspace");
      await waitFor(() => fake.refreshRequests.includes("open"), 1e4, 'requestRefresh("open")');
    } finally {
      await api.testing.reset();
      restore();
      await closeAllEditors();
    }
  });
});
//# sourceMappingURL=activation.test.js.map
