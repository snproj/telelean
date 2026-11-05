"""Minimal LSP client for the Lean 4 server (`lake serve`), used to measure whether an edit
inside a comment causes re-elaboration of later commands, and to see documentSymbol output.
Usage: python3 -I lsp_probe.py <project-dir>"""
import json, os, queue, subprocess, sys, threading, time

proj = os.path.abspath(sys.argv[1])
fname = os.path.join(proj, "Probe.lean")

HEADER = "/-\n@@ telelean v1\nid: probe-a\nkind: ASSUMPTION\nnatural_name: \"VERSION_A\"\n-/\naxiom probeA : True\n\n"
SLOW = "#eval show IO Unit from do\n  IO.sleep 3000\n  IO.println s!\"stamp {← IO.monoMsNow}\"\n\n"
TAIL = "/-\n@@ telelean v1\nid: probe-z\nkind: GOAL\nnatural_name: \"TAIL_A\"\n-/\n"
body = "".join(f"theorem t{i} : True := trivial\n" for i in range(200))
text = HEADER + body + SLOW + TAIL
with open(fname, "w") as f:
    f.write(text)

p = subprocess.Popen(["lake", "serve"], cwd=proj, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL)
q: "queue.Queue[dict]" = queue.Queue()

def reader():
    f = p.stdout
    while True:
        hdr = b""
        while not hdr.endswith(b"\r\n\r\n"):
            ch = f.read(1)
            if not ch:
                return
            hdr += ch
        n = int([l for l in hdr.split(b"\r\n") if l.lower().startswith(b"content-length")][0].split(b":")[1])
        q.put(json.loads(f.read(n)))

threading.Thread(target=reader, daemon=True).start()
nid = 0
def send(method, params, is_req=True):
    global nid
    msg = {"jsonrpc": "2.0", "method": method, "params": params}
    if is_req:
        nid += 1
        msg["id"] = nid
    b = json.dumps(msg).encode()
    p.stdin.write(b"Content-Length: %d\r\n\r\n" % len(b) + b)
    p.stdin.flush()
    return msg.get("id")

def wait_response(rid, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        m = q.get(timeout=timeout)
        if m.get("id") == rid and "method" not in m:
            return m
    raise TimeoutError

uri = "file://" + fname
rid = send("initialize", {"processId": os.getpid(), "rootUri": "file://" + proj, "capabilities": {
    "textDocument": {"documentSymbol": {"hierarchicalDocumentSymbolSupport": True}}}})
init = wait_response(rid)
send("initialized", {}, is_req=False)

def wait_done(version, label, timeout=180):
    """Wait until fileProgress reports nothing processing for `version`; collect stamps."""
    t0 = time.time()
    stamps = []
    done = False
    while time.time() - t0 < timeout:
        try:
            m = q.get(timeout=timeout)
        except queue.Empty:
            break
        meth = m.get("method")
        if meth == "$/lean/fileProgress":
            prm = m["params"]
            if prm["textDocument"].get("version") == version and not prm["processing"]:
                done = True
                break
        elif meth == "textDocument/publishDiagnostics":
            for d in m["params"]["diagnostics"]:
                if "stamp" in d.get("message", ""):
                    stamps.append(d["message"].strip())
    dt = time.time() - t0
    print(f"{label:58} done={done} elapsed={dt:6.2f}s stamps={sorted(set(stamps))}")
    return dt

send("textDocument/didOpen", {"textDocument": {"uri": uri, "languageId": "lean4", "version": 1, "text": text}},
     is_req=False)
wait_done(1, "initial open")

def pos_of(s, needle):
    i = s.index(needle)
    line = s.count("\n", 0, i)
    col = i - (s.rfind("\n", 0, i) + 1)
    return {"line": line, "character": col}

def edit(version, old, new, label):
    global text
    start = pos_of(text, old)
    end = {"line": start["line"], "character": start["character"] + len(old)}
    text = text.replace(old, new, 1)
    send("textDocument/didChange", {"textDocument": {"uri": uri, "version": version},
                                    "contentChanges": [{"range": {"start": start, "end": end}, "text": new}]},
         is_req=False)
    return wait_done(version, label)

edit(2, "VERSION_A", "VERSION_B_longer", "edit natural_name in comment ABOVE slow #eval")
edit(3, "TAIL_A", "TAIL_B", "edit natural_name in comment BELOW slow #eval")
edit(4, "VERSION_B_longer", "VERSION_C_len_ch", "same-length edit in comment ABOVE slow #eval")

rid = send("textDocument/documentSymbol", {"textDocument": {"uri": uri}})
syms = wait_response(rid)["result"]
print("documentSymbol:", len(syms), "symbols; first 3:", json.dumps(syms[:3])[:600])
caps = init["result"]["capabilities"]
print("server capabilities keys:", sorted(caps.keys()))
p.terminate()
