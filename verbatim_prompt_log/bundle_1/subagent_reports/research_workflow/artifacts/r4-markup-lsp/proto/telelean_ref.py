#!/usr/bin/env python3
"""
telelean markup v1 -- REFERENCE PROTOTYPE (research artefact, not production code).

Purpose: prove that the proposed "@@ telelean v1" block grammar is trivially parseable
without a YAML/TOML dependency, that block->declaration binding can be computed from
text alone, and that a versioned JSON graph (format 1.0) can be emitted for scripts.
The production implementation is meant to be a TypeScript core library used in-process
by the VS Code extension and by a Node CLI; this file mirrors that design 1:1.

Usage:
  python3 -I telelean_ref.py export <workspace-root> [--facts lean_facts.json] [--pretty]
  python3 -I telelean_ref.py check  <workspace-root> [--facts lean_facts.json]   # gnu-style diagnostics
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

FORMAT_NAME = "telelean-graph"
FORMAT_VERSION = "1.0"
GENERATOR = {"name": "telelean-ref-proto", "version": "0.0.1"}
SUPPORTED_MARKUP_VERSIONS = {1}
KINDS = ("ASSUMPTION", "DERIVATION", "GOAL", "DEFINITION")
ORIGINS = ("user", "llm")
# Axioms every Lean development may use without them counting as user assumptions.
STANDARD_AXIOMS = {"propext", "Classical.choice", "Quot.sound"}

# ----------------------------------------------------------------------------------
# 1. Lean-compatible lexer (comments / strings / chars / identifiers only)
#    Mirrors Lean 4.35 Lean/Parser/Basic.lean: finishCommentBlock (nesting), whitespace
#    ("/--" and "/-!" are doc tokens, other "/-" is a plain comment), tokenFnAux
#    (string, char, raw string dispatch) and Init/Meta/Defs.lean isIdFirst/isIdRest.
# ----------------------------------------------------------------------------------

def _is_letter_like(o: int) -> bool:
    return ((0x3B1 <= o <= 0x3C9 and o != 0x3BB) or
            (0x391 <= o <= 0x3A9 and o not in (0x3A0, 0x3A3)) or
            (0x3CA <= o <= 0x3FB) or (0x1F00 <= o <= 0x1FFE) or
            (0x2100 <= o <= 0x214F) or (0x1D49C <= o <= 0x1D59F) or
            (0x00C0 <= o <= 0x00FF and o not in (0xD7, 0xF7)) or (0x0100 <= o <= 0x017F))

def _is_subscript_alnum(o: int) -> bool:
    return (0x2080 <= o <= 0x2089) or (0x2090 <= o <= 0x209C) or (0x1D62 <= o <= 0x1D6A) or o == 0x2C7C

def is_id_first(ch: str) -> bool:
    return ("a" <= ch <= "z") or ("A" <= ch <= "Z") or ch == "_" or _is_letter_like(ord(ch))

def is_id_rest(ch: str) -> bool:
    return (is_id_first(ch) or ("0" <= ch <= "9") or ch in "'!?" or _is_subscript_alnum(ord(ch)))


@dataclass
class Comment:
    kind: str            # "line" | "block" | "doc" | "moddoc"
    start: int           # offset of first char of the opener
    end: int             # offset just after the closer (or EOF if unterminated)
    body_start: int
    body_end: int
    unterminated: bool = False


def lex(text: str) -> tuple[list[Comment], list[tuple[int, int]]]:
    """Return (comments, code_tokens). code_tokens are (start,end) spans of identifiers and
    single significant characters outside comments/strings (enough for header parsing)."""
    comments: list[Comment] = []
    toks: list[tuple[int, int]] = []
    n = len(text)
    i = 0
    while i < n:
        c = text[i]
        if c == "-" and i + 1 < n and text[i + 1] == "-":
            j = text.find("\n", i)
            j = n if j < 0 else j
            comments.append(Comment("line", i, j, i + 2, j))
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "-":
            third = text[i + 2] if i + 2 < n else ""
            kind = "doc" if third == "-" else "moddoc" if third == "!" else "block"
            body_start = i + (3 if kind != "block" else 2)
            depth, j = 1, i + 2
            # NB: Lean starts nesting-scan right after "/-" even for doc comments
            while j < n:
                if text[j] == "-" and j + 1 < n and text[j + 1] == "/":
                    depth -= 1
                    j += 2
                    if depth == 0:
                        break
                    continue
                if text[j] == "/" and j + 1 < n and text[j + 1] == "-":
                    depth += 1
                    j += 2
                    continue
                j += 1
            if depth == 0:
                comments.append(Comment(kind, i, j, body_start, j - 2))
            else:
                comments.append(Comment(kind, i, n, body_start, n, unterminated=True))
                j = n
            i = j
            continue
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            toks.append((i, min(j + 1, n)))
            i = j + 1
            continue
        if c == "r" and (i == 0 or not is_id_rest(text[i - 1])):
            j = i + 1
            hashes = 0
            while j < n and text[j] == "#":
                hashes += 1
                j += 1
            if j < n and text[j] == '"':
                close = '"' + "#" * hashes
                k = text.find(close, j + 1)
                k = n if k < 0 else k + len(close)
                toks.append((i, k))
                i = k
                continue
        if c == "'" and not (i + 1 < n and text[i + 1] == "'"):
            # char literal at token start: 'x' or '\n' / '\x41' / '\u{..}'
            if i + 1 < n and text[i + 1] == "\\":
                k = text.find("'", i + 2, i + 14)
                if k > 0:
                    toks.append((i, k + 1)); i = k + 1; continue
            elif i + 2 < n and text[i + 2] == "'":
                toks.append((i, i + 3)); i += 3; continue
        if c == "«" or is_id_first(c):
            j = i
            while True:  # dotted identifier with «escaped» parts
                if j < n and text[j] == "«":
                    k = text.find("»", j + 1)
                    j = n if k < 0 else k + 1
                elif j < n and is_id_first(text[j]):
                    j += 1
                    while j < n and is_id_rest(text[j]):
                        j += 1
                else:
                    break
                if j + 1 < n and text[j] == "." and (is_id_first(text[j + 1]) or text[j + 1] == "«"):
                    j += 1
                    continue
                break
            toks.append((i, j))
            i = j
            continue
        if not c.isspace():
            toks.append((i, i + 1))
        i += 1
    return comments, toks


# ----------------------------------------------------------------------------------
# 2. Positions (0-based line, UTF-16 column -- the LSP default) via a line index
# ----------------------------------------------------------------------------------

class LineIndex:
    def __init__(self, text: str):
        self.text = text
        self.starts = [0]
        for m in re.finditer("\n", text):
            self.starts.append(m.end())

    def pos(self, off: int) -> dict:
        import bisect
        line = bisect.bisect_right(self.starts, off) - 1
        seg = self.text[self.starts[line]:off]
        utf16 = sum(2 if ord(ch) > 0xFFFF else 1 for ch in seg)
        return {"line": line, "character": utf16}

    def rng(self, a: int, b: int) -> dict:
        return {"start": self.pos(a), "end": self.pos(b)}


# ----------------------------------------------------------------------------------
# 3. Block grammar ("@@ telelean v1")
# ----------------------------------------------------------------------------------

MARKER_RE = re.compile(r"^@@\s*telelean(?:\s+v(\d+))?\s*$")
KEY_RE = re.compile(r"^([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)\s*:(.*)$")
ID_RE = re.compile(r"^[a-z0-9]+(?:[-_.][a-z0-9]+)*$")
TAG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_./-]*$")
TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:+-]*$")
LEAN_NAME_RE = re.compile(r"^[^\s,\[\]]+$")

# field -> (value type, allowed kinds or None)
FIELDS = {
    "id": ("id", None),
    "kind": ("kind", None),
    "natural_name": ("text", None),
    "rationale": ("text", None),
    "premises": ("idlist", ("DERIVATION", "GOAL")),
    "lean": ("namelist", None),
    "origin": ("origin", None),
    "session": ("token", None),
    "tags": ("taglist", None),
}
REQUIRED = ("id", "kind", "natural_name")
ALIASES = {"type": "kind"}            # user's original spelling, accepted with a hint
LIST_FIELDS = {"premises", "lean", "tags"}


@dataclass
class Diag:
    code: str
    severity: str  # error | warning | info | hint
    message: str
    file: str
    start: int
    end: int
    node_id: Optional[str] = None
    related: list = field(default_factory=list)


@dataclass
class Block:
    file: str
    comment: Comment
    version: int
    fields: dict
    extensions: dict
    description: Optional[str]
    field_spans: dict
    binding: Optional[dict] = None  # {"mode":..., "decls":[...]}


def parse_text_value(raw: str) -> tuple[Optional[str], Optional[str]]:
    v = raw.strip()
    if v.startswith('"'):
        try:
            s = json.loads(v)
            if not isinstance(s, str):
                return None, "quoted value must be a JSON string"
            return s, None
        except json.JSONDecodeError as e:
            return None, f"invalid JSON string literal ({e.msg})"
    return v, None


def split_list(raw: str) -> list[str]:
    v = raw.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1]
    return [x.strip() for x in v.split(",") if x.strip()]


def parse_block(file: str, text: str, cm: Comment, diags: list[Diag]) -> Optional[Block]:
    body = text[cm.body_start:cm.body_end]
    lines = body.replace("\r\n", "\n").split("\n")
    # locate marker (first non-blank line)
    off = cm.body_start
    idx = 0
    while idx < len(lines) and not lines[idx].strip():
        off += len(lines[idx]) + 1
        idx += 1
    if idx == len(lines):
        return None
    m = MARKER_RE.match(lines[idx].strip())
    if not m:
        return None
    if cm.kind in ("doc", "moddoc"):
        diags.append(Diag("TL009", "warning", "telelean block inside a doc comment ('/--' or '/-!'); "
                          "use a plain '/- ... -/' comment so it is not part of the docstring",
                          file, cm.start, cm.end))
        return None
    if cm.unterminated:
        diags.append(Diag("TL010", "error", "unterminated comment: this block swallows the rest of the "
                          "file (Lean reports 'unterminated comment')", file, cm.start, cm.end))
    version = int(m.group(1)) if m.group(1) else 1
    if not m.group(1):
        diags.append(Diag("TL016", "hint", "marker has no version; assuming '@@ telelean v1'",
                          file, off, off + len(lines[idx])))
    if version not in SUPPORTED_MARKUP_VERSIONS:
        diags.append(Diag("TL008", "warning", f"markup v{version} is newer than this tool supports "
                          f"({sorted(SUPPORTED_MARKUP_VERSIONS)}); unknown fields are kept but not interpreted",
                          file, off, off + len(lines[idx])))
    off += len(lines[idx]) + 1
    idx += 1
    fields: dict = {}
    spans: dict = {}
    ext: dict = {}
    description = None
    while idx < len(lines):
        line = lines[idx]
        lstart, lend = off, off + len(line)
        off += len(line) + 1
        idx += 1
        s = line.strip()
        if not s:
            continue
        if s == "---":
            rest = lines[idx:]
            # dedent + strip trailing blank lines
            ind = min((len(l) - len(l.lstrip()) for l in rest if l.strip()), default=0)
            description = "\n".join(l[ind:] for l in rest).strip("\n") or None
            break
        km = KEY_RE.match(s)
        if not km:
            diags.append(Diag("TL001", "error", f"malformed line (expected 'key: value'): {s[:60]!r}",
                              file, lstart, lend))
            continue
        key, raw = km.group(1), km.group(2)
        if key in ALIASES:
            diags.append(Diag("TL018", "hint", f"'{key}:' is accepted as an alias of '{ALIASES[key]}:'",
                              file, lstart, lend))
            key = ALIASES[key]
        if "." in key:  # namespaced extension field: kept verbatim, never warned about
            ext.setdefault(key, []).append(raw.strip())
            continue
        if key not in FIELDS:
            diags.append(Diag("TL002", "warning", f"unknown field '{key}' (kept; use a dotted key such as "
                              f"'mytool.{key}' for tool-specific data)", file, lstart, lend))
            ext.setdefault(key, []).append(raw.strip())
            continue
        vtype, _ = FIELDS[key]
        if key in fields and key not in LIST_FIELDS:
            diags.append(Diag("TL005", "error", f"duplicate field '{key}' (first value kept)", file, lstart, lend))
            continue
        spans.setdefault(key, (lstart, lend))
        if vtype == "text":
            val, err = parse_text_value(raw)
            if err:
                diags.append(Diag("TL004", "error", f"{key}: {err}", file, lstart, lend))
                continue
            if "\n" in val and key == "natural_name":
                diags.append(Diag("TL004", "warning", "natural_name should be a single line", file, lstart, lend))
            fields[key] = val
        elif vtype == "id":
            val = raw.strip()
            if not ID_RE.match(val):
                diags.append(Diag("TL004", "error", f"invalid id {val!r} (lowercase letters, digits, "
                                  "'-', '_' or '.' separators)", file, lstart, lend))
            fields[key] = val
        elif vtype == "kind":
            val = raw.strip()
            if val.upper() in KINDS:
                if val != val.upper():
                    diags.append(Diag("TL019", "hint", f"kind is canonically upper-case: {val.upper()}",
                                      file, lstart, lend))
                fields[key] = val.upper()
            else:
                diags.append(Diag("TL004", "error", f"invalid kind {val!r} (expected one of {', '.join(KINDS)})",
                                  file, lstart, lend))
        elif vtype == "origin":
            val = raw.strip().lower()
            if val not in ORIGINS:
                diags.append(Diag("TL004", "error", f"invalid origin {val!r} (expected user|llm)", file, lstart, lend))
            else:
                fields[key] = val
        elif vtype == "token":
            val = raw.strip()
            if not TOKEN_RE.match(val):
                diags.append(Diag("TL004", "error", f"invalid {key} token {val!r}", file, lstart, lend))
            fields[key] = val
        else:  # lists
            items = split_list(raw)
            rx = {"idlist": ID_RE, "namelist": LEAN_NAME_RE, "taglist": TAG_RE}[vtype]
            for it in items:
                if not rx.match(it):
                    diags.append(Diag("TL004", "error", f"{key}: invalid item {it!r}", file, lstart, lend))
            fields.setdefault(key, []).extend(it for it in items if rx.match(it))
    for r in REQUIRED:
        if r not in fields:
            diags.append(Diag("TL003", "error", f"missing required field '{r}'", file, cm.start, cm.end,
                              node_id=fields.get("id")))
    k = fields.get("kind")
    if k == "ASSUMPTION" and "rationale" not in fields:
        diags.append(Diag("TL011", "warning", "ASSUMPTION without 'rationale:' (why do you believe it?)",
                          file, cm.start, cm.end, node_id=fields.get("id")))
    if "premises" in fields and k not in (None, "DERIVATION", "GOAL"):
        a, b = spans["premises"]
        diags.append(Diag("TL012", "warning", f"'premises' has no meaning on a {k} node", file, a, b,
                          node_id=fields.get("id")))
    return Block(file, cm, version, fields, ext, description, spans)


# ----------------------------------------------------------------------------------
# 4. Binding a block to the declaration that follows it (text-only heuristic)
# ----------------------------------------------------------------------------------

MODIFIERS = {"private", "public", "protected", "meta", "noncomputable", "unsafe", "partial", "nonrec",
             "scoped", "local"}
DECL_KW = {"def", "theorem", "lemma", "abbrev", "axiom", "opaque", "instance", "example", "inductive",
           "coinductive", "structure", "class"}


class FileModel:
    def __init__(self, path: str, text: str):
        self.path = path
        self.text = text
        self.comments, self.toks = lex(text)
        self.li = LineIndex(text)
        # map from offset -> token index for fast "next token after offset" queries
        self.tok_starts = [a for a, _ in self.toks]
        self.ns_events = self._namespace_events()

    def tok_text(self, k: int) -> str:
        a, b = self.toks[k]
        return self.text[a:b]

    def next_tok(self, off: int) -> int:
        import bisect
        return bisect.bisect_left(self.tok_starts, off)

    def _namespace_events(self):
        """(offset, op, name) for namespace/section/end commands (heuristic: command-initial words)."""
        ev = []
        for k in range(len(self.toks)):
            w = self.tok_text(k)
            if w in ("namespace", "section", "end"):
                a, _ = self.toks[k]
                line_start = self.text.rfind("\n", 0, a) + 1
                prefix = self.text[line_start:a].strip()
                if prefix and not all(p in ("public", "noncomputable", "meta", "@[expose]") for p in prefix.split()):
                    continue
                nm = self.tok_text(k + 1) if k + 1 < len(self.toks) else ""
                same_line = k + 1 < len(self.toks) and "\n" not in self.text[a:self.toks[k + 1][0]]
                ev.append((a, w, nm if same_line and is_id_first(nm[:1] or " ") else None))
        return ev

    def namespace_at(self, off: int) -> list[str]:
        stack: list[tuple[str, Optional[str]]] = []
        for a, op, nm in self.ns_events:
            if a >= off:
                break
            if op in ("namespace", "section"):
                stack.append((op, nm))
            elif stack:
                stack.pop()
        parts: list[str] = []
        for op, nm in stack:
            if op == "namespace" and nm:
                parts.extend(nm.split("."))
        return parts

    def parse_decl_header(self, off: int) -> Optional[dict]:
        """Parse `[docComment] [@[attrs]]* modifiers* keyword [name]` starting at the first code
        token at/after `off`. Returns dict(keyword, name, start, name_span) or None."""
        k = self.next_tok(off)
        n = len(self.toks)
        start = self.toks[k][0] if k < n else None
        # attributes: '@' '[' ... ']' (balanced)
        while k + 1 < n and self.tok_text(k) == "@" and self.tok_text(k + 1) == "[":
            depth, k = 0, k + 1
            while k < n:
                t = self.tok_text(k)
                depth += t == "["
                depth -= t == "]"
                k += 1
                if depth == 0:
                    break
        while k < n and self.tok_text(k) in MODIFIERS:
            k += 1
        if k >= n:
            return None
        kw = self.tok_text(k)
        if kw == "class" and k + 1 < n and self.tok_text(k + 1) in ("inductive", "abbrev"):
            kw, k = "class " + self.tok_text(k + 1), k + 1
        if kw not in DECL_KW and kw not in ("class inductive", "class abbrev", "mutual"):
            return None
        k += 1
        name, nspan = None, None
        if kw == "instance" and k + 1 < n and self.tok_text(k) == "(":   # (priority := ...)
            depth = 0
            while k < n:
                t = self.tok_text(k); depth += t == "("; depth -= t == ")"; k += 1
                if depth == 0:
                    break
        if kw not in ("example", "mutual") and k < n:
            t = self.tok_text(k)
            if is_id_first(t[:1]) or t.startswith("«"):
                name, nspan = t, self.toks[k]
        return {"keyword": kw, "name": name, "start": start, "name_span": nspan}

    def bind(self, blk: Block, block_comment_ids: set) -> dict:
        """Go-style adjacency: the declaration must start with no blank line between the block's
        closing '-/' and the declaration (other non-telelean comments may intervene).
        An explicit `lean:` field overrides adjacency."""
        explicit = blk.fields.get("lean")
        text = self.text
        p = blk.comment.end
        adjacent = None
        gap_decl = None
        import bisect
        if not hasattr(self, "_comment_starts"):
            self._comment_starts = [c.start for c in self.comments]
        ci_iter = iter(self.comments[bisect.bisect_left(self._comment_starts, p):])
        nxt = next(ci_iter, None)
        while True:
            # skip horizontal whitespace and newlines, detecting blank lines
            q = p
            newlines = 0
            while q < len(text) and text[q] in " \t\r\n":
                newlines += text[q] == "\n"
                q += 1
            blank = newlines >= 2
            if q >= len(text):
                break
            if nxt is not None and nxt.start == q and nxt.kind in ("line", "block") and id(nxt) not in block_comment_ids:
                if blank:
                    break
                p = nxt.end
                nxt = next(ci_iter, None)
                continue
            if nxt is not None and nxt.start == q and id(nxt) in block_comment_ids:
                break  # another telelean block: this one is code-less
            hdr = self.parse_decl_header(q) if not (nxt is not None and nxt.start == q and nxt.kind == "doc") \
                else self.parse_decl_header(nxt.end)
            if hdr is not None and nxt is not None and nxt.start == q and nxt.kind == "doc":
                hdr["start"] = q
            if hdr is None:
                break
            if blank:
                gap_decl = hdr
            else:
                adjacent = hdr
            break
        ns = self.namespace_at(blk.comment.start)

        def fq(name: Optional[str]) -> Optional[str]:
            if name is None:
                return None
            if name.startswith("_root_."):
                return name[len("_root_."):]
            return ".".join(ns + [name]) if ns else name

        decls = []
        mode = "none"
        if explicit:
            mode = "explicit"
            for nm in explicit:
                decls.append({"name": fq(nm) if not nm.startswith("_root_.") else nm[7:], "written": nm,
                              "keyword": None, "range": None})
        elif adjacent is not None:
            mode = "adjacent"
            a, b = adjacent["name_span"] if adjacent["name_span"] else (adjacent["start"], adjacent["start"])
            decls.append({"name": fq(adjacent["name"]), "written": adjacent["name"], "keyword": adjacent["keyword"],
                          "range": self.li.rng(a, b), "_off": a})
        return {"mode": mode, "decls": decls, "gap_decl": gap_decl, "adjacent": adjacent}


# ----------------------------------------------------------------------------------
# 5. Workspace scan, graph assembly, validation, JSON export
# ----------------------------------------------------------------------------------

def iter_lean_files(root: str):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in (".lake", ".git", "lake-packages", "node_modules", ".telelean")]
        for fn in fns:
            if fn.endswith(".lean"):
                yield os.path.join(dp, fn)


def build_graph(root: str, facts: Optional[dict] = None) -> dict:
    t0 = time.perf_counter()
    diags: list[Diag] = []
    blocks: list[Block] = []
    files_out = []
    fms: dict[str, FileModel] = {}
    for path in sorted(iter_lean_files(root)):
        rel = os.path.relpath(path, root)
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
        fm = FileModel(rel, text)
        fms[rel] = fm
        fblocks = []
        for cm in fm.comments:
            if cm.kind == "line":
                continue
            b = parse_block(rel, text, cm, diags)
            if b:
                fblocks.append(b)
        ids = {id(b.comment) for b in fblocks}
        for b in fblocks:
            b.binding = fm.bind(b, ids)
            if b.binding["mode"] == "none" and b.binding["gap_decl"] is not None:
                g = b.binding["gap_decl"]
                diags.append(Diag("TL013", "hint", f"block is code-less, but a declaration "
                                  f"'{g['name'] or g['keyword']}' follows after a blank line; remove the blank "
                                  f"line to attach it", rel, b.comment.start, b.comment.end, b.fields.get("id")))
            if b.binding["adjacent"] and b.binding["adjacent"]["keyword"] in ("example", "mutual"):
                diags.append(Diag("TL014", "warning", f"'{b.binding['adjacent']['keyword']}' cannot be bound "
                                  "(examples are not added to the environment; for mutual blocks use 'lean:')",
                                  rel, b.comment.start, b.comment.end, b.fields.get("id")))
        blocks.extend(fblocks)
        files_out.append({"path": rel, "sha256": hashlib.sha256(text.encode()).hexdigest(),
                          "node_count": len(fblocks)})
    t_parse = time.perf_counter() - t0

    # --- nodes, duplicates
    nodes: dict[str, dict] = {}
    first_block: dict[str, Block] = {}
    for b in blocks:
        nid = b.fields.get("id")
        if not nid:
            continue
        if nid in nodes:
            fb = first_block[nid]
            diags.append(Diag("TL006", "error", f"duplicate id '{nid}' (first defined in {fb.file})", b.file,
                              b.comment.start, b.comment.end, nid,
                              related=[{"file": fb.file, "range": fms[fb.file].li.rng(fb.comment.start, fb.comment.end)}]))
            continue
        fm = fms[b.file]
        first_block[nid] = b
        nodes[nid] = {
            "id": nid,
            "kind": b.fields.get("kind"),
            "natural_name": b.fields.get("natural_name"),
            "rationale": b.fields.get("rationale"),
            "description": b.description,
            "premises": list(dict.fromkeys(b.fields.get("premises", []))),
            "origin": b.fields.get("origin", "user"),
            "session": b.fields.get("session"),
            "tags": b.fields.get("tags", []),
            "extensions": b.extensions,
            "source": {"file": b.file, "range": fm.li.rng(b.comment.start, b.comment.end),
                       "markup_version": b.version},
            "lean": {"binding": b.binding["mode"],
                     "decls": [{k: v for k, v in d.items() if not k.startswith("_")} for d in b.binding["decls"]]},
            "status": {"formal": bool(b.binding["decls"]), "check": "unknown", "purity": "n/a"},
        }

    # --- declaration bound twice
    owner: dict[str, str] = {}
    for nid, nd in nodes.items():
        for d in nd["lean"]["decls"]:
            if d["name"] is None:
                continue
            if d["name"] in owner:
                b = first_block[nid]
                diags.append(Diag("TL017", "error", f"declaration '{d['name']}' is bound by both "
                                  f"'{owner[d['name']]}' and '{nid}'", b.file, b.comment.start, b.comment.end, nid))
            else:
                owner[d["name"]] = nid

    # --- declared edges + dangling + cycles
    edges = []
    for nid, nd in nodes.items():
        for p in nd["premises"]:
            if p not in nodes:
                b = first_block[nid]
                a, e = b.field_spans.get("premises", (b.comment.start, b.comment.end))
                diags.append(Diag("TL007", "error", f"premise '{p}' does not exist", b.file, a, e, nid))
                continue
            edges.append({"type": "premise", "source": p, "target": nid, "origin": "declared"})
    # cycle detection on declared premise graph (iterative DFS, colours)
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e["target"], []).append(e["source"])
    colour: dict[str, int] = {}
    for s in nodes:
        if colour.get(s):
            continue
        stack = [(s, iter(adj.get(s, [])))]
        colour[s] = 1
        path = [s]
        while stack:
            v, it = stack[-1]
            w = next(it, None)
            if w is None:
                colour[v] = 2
                stack.pop(); path.pop()
                continue
            if colour.get(w) == 1:
                cyc = path[path.index(w):] + [w]
                b = first_block[v]
                diags.append(Diag("TL015", "warning", "circular premises: " + " <- ".join(cyc), b.file,
                                  b.comment.start, b.comment.end, v))
            elif not colour.get(w):
                colour[w] = 1
                stack.append((w, iter(adj.get(w, []))))
                path.append(w)

    # --- semantic merge with Lean facts (optional)
    semantic = {"available": False}
    if facts is not None:
        semantic = {"available": True, "lean_version": facts.get("lean_version"),
                    "source": facts.get("schema")}
        by_name = {d["name"]: d for d in facts["decls"]}
        decl_owner = {}
        for nid, nd in nodes.items():
            for d in nd["lean"]["decls"]:
                if d["name"]:
                    decl_owner[d["name"]] = nid
        assumption_axioms = set()
        for nid, nd in nodes.items():
            if nd["kind"] == "ASSUMPTION":
                for d in nd["lean"]["decls"]:
                    f = by_name.get(d["name"])
                    if f and f["leanKind"] == "axiom":
                        assumption_axioms.add(d["name"])
        definition_axioms = {d["name"] for nid, nd in nodes.items() if nd["kind"] == "DEFINITION"
                             for d in nd["lean"]["decls"] if d["name"] in by_name
                             and by_name[d["name"]]["leanKind"] == "axiom"}
        covered = set(facts.get("files") or {d.get("file") for d in facts["decls"]})
        for nid, nd in nodes.items():
            if not nd["lean"]["decls"]:
                nd["status"]["check"] = "n/a"
                continue
            b = first_block[nid]
            if b.file not in covered:      # file not part of the elaborated modules: stay 'unknown'
                continue
            checks, purity = [], "n/a"
            for d in nd["lean"]["decls"]:
                f = by_name.get(d["name"])
                if f is None:
                    checks.append("error")
                    diags.append(Diag("TL101", "error", f"bound declaration '{d['name']}' not found in the "
                                      "elaborated environment (compile error, rename, or stale build)",
                                      b.file, b.comment.start, b.comment.end, nid))
                    continue
                d.update({"lean_kind": f["leanKind"], "is_prop": f["isProp"], "uses_sorry": f["usesSorry"],
                          "axioms": f["axioms"], "type": f.get("type")})
                checks.append("sorry" if f["usesSorry"] else "ok")
                for r in f.get("refs", []):
                    m = decl_owner.get(r)
                    if m and m != nid:
                        edges.append({"type": "lean_ref", "source": m, "target": nid, "origin": "lean",
                                      "where": "statement" if r in f.get("typeRefs", []) else "proof"})
                if nd["kind"] in ("DERIVATION", "GOAL"):
                    bad = [a for a in f["axioms"] if a not in assumption_axioms and a not in STANDARD_AXIOMS
                           and a not in definition_axioms and a != "sorryAx"]
                    purity = "impure" if bad else ("pure" if purity != "impure" else purity)
                    if nd["kind"] == "DERIVATION" and f["usesSorry"]:
                        diags.append(Diag("TL102", "error", f"DERIVATION '{nid}' is not proved "
                                          f"('{d['name']}' depends on sorry)", b.file, b.comment.start,
                                          b.comment.end, nid))
                    if bad and nd["kind"] == "DERIVATION":
                        diags.append(Diag("TL103", "error", f"DERIVATION '{nid}' depends on axioms that are "
                                          f"not ASSUMPTION nodes: {', '.join(bad)}", b.file, b.comment.start,
                                          b.comment.end, nid))
                    if nd["kind"] == "GOAL" and not f["usesSorry"] and not bad:
                        diags.append(Diag("TL105", "info", f"GOAL '{nid}' is already proved from assumptions; "
                                          "promote it to DERIVATION?", b.file, b.comment.start, b.comment.end, nid))
                    used_assumptions = {decl_owner[a] for a in f["axioms"] if a in assumption_axioms}
                    declared = set(nd["premises"])
                    # closure of declared premises over declared edges
                    clos, todo = set(), list(declared)
                    while todo:
                        x = todo.pop()
                        if x in clos:
                            continue
                        clos.add(x)
                        todo.extend(nodes[x]["premises"] if x in nodes else [])
                    extra = sorted(used_assumptions - clos)
                    if extra and declared:
                        diags.append(Diag("TL107", "warning", f"proof of '{nid}' uses assumptions outside its "
                                          f"declared premises: {', '.join(extra)}", b.file, b.comment.start,
                                          b.comment.end, nid))
                if nd["kind"] == "ASSUMPTION" and f["leanKind"] != "axiom":
                    diags.append(Diag("TL106", "warning", f"ASSUMPTION '{nid}' is formalized as a "
                                      f"{f['leanKind']}, not an axiom (if it has a proof it is a DERIVATION)",
                                      b.file, b.comment.start, b.comment.end, nid))
            nd["status"]["check"] = "error" if "error" in checks else "sorry" if "sorry" in checks else "ok"
            nd["status"]["purity"] = purity
        # hidden assumptions: Prop-valued axioms with no ASSUMPTION node
        for f in facts["decls"]:
            if f["leanKind"] == "axiom" and f["name"] not in decl_owner:
                sev, code, msg = ("warning", "TL104", "hidden assumption: Prop-valued axiom") if f["isProp"] else \
                    ("info", "TL108", "postulated object: non-Prop axiom")
                rng = f.get("range") or {}
                diags.append(Diag(code, sev, f"{msg} '{f['name']}' is not bound to any telelean node",
                                  f.get("file") or f["module"], -1, -1,
                                  related=[{"lean_range": rng}]))

    # --- export
    def diag_json(d: Diag) -> dict:
        fm = fms.get(d.file)
        out = {"code": d.code, "severity": d.severity, "message": d.message, "file": d.file,
               "range": fm.li.rng(d.start, d.end) if (fm and d.start >= 0) else None}
        if d.node_id:
            out["node_id"] = d.node_id
        if d.related:
            out["related"] = d.related
        return out

    graph = {
        "format": FORMAT_NAME,
        "format_version": FORMAT_VERSION,
        "generator": GENERATOR,
        "position_encoding": "utf-16",
        "line_base": 0,
        "semantic": semantic,
        "nodes": list(nodes.values()),
        "edges": edges,
        "diagnostics": [diag_json(d) for d in diags],
        "files": files_out,
        "stats": {"files": len(files_out), "nodes": len(nodes), "edges": len(edges),
                  "parse_seconds": round(t_parse, 4), "total_seconds": round(time.perf_counter() - t0, 4)},
    }
    return graph


def main(argv: list[str]) -> int:
    if len(argv) < 3 or argv[1] not in ("export", "check"):
        print(__doc__)
        return 2
    root = argv[2]
    facts = None
    if "--facts" in argv:
        with open(argv[argv.index("--facts") + 1], encoding="utf-8") as f:
            facts = json.load(f)
    g = build_graph(root, facts)
    if argv[1] == "export":
        json.dump(g, sys.stdout, indent=2 if "--pretty" in argv else None, ensure_ascii=False)
        print()
    else:
        for d in g["diagnostics"]:
            r = d["range"]
            loc = f"{d['file']}:{r['start']['line'] + 1}:{r['start']['character'] + 1}" if r else d["file"]
            print(f"{loc}: {d['severity']}: [{d['code']}] {d['message']}")
        print(f"-- {g['stats']}", file=sys.stderr)
    return 1 if any(d["severity"] == "error" for d in g["diagnostics"]) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
