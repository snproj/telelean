"""Minimal JSON-RPC client for `lake serve` to verify Lean LSP extensions headlessly.
usage: python3 -I lsp_probe.py <project_dir> <relpath.lean> <goal_line0> <goal_char0>"""
import json, os, subprocess, sys, time, threading, queue, pathlib

proj, rel, gl, gc = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
path = pathlib.Path(proj, rel).resolve()
uri = path.as_uri()
p = subprocess.Popen(['lake', 'serve'], cwd=proj, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
q = queue.Queue()

def reader():
    f = p.stdout
    while True:
        headers = {}
        while True:
            line = f.readline()
            if not line:
                return
            line = line.decode().strip()
            if not line:
                break
            k, v = line.split(':', 1)
            headers[k.lower()] = v.strip()
        body = f.read(int(headers['content-length']))
        q.put(json.loads(body))
threading.Thread(target=reader, daemon=True).start()

def send(obj):
    b = json.dumps(obj).encode()
    p.stdin.write(b'Content-Length: %d\r\n\r\n' % len(b) + b)
    p.stdin.flush()

nid = [0]
def request(method, params, timeout=60):
    nid[0] += 1
    rid = nid[0]
    send({'jsonrpc': '2.0', 'id': rid, 'method': method, 'params': params})
    deadline = time.time() + timeout
    while time.time() < deadline:
        msg = q.get(timeout=max(0.1, deadline - time.time()))
        if msg.get('id') == rid and 'method' not in msg:
            return msg
        handle(msg)
    raise TimeoutError(method)

seen = {'publishDiagnostics': 0, 'fileProgress': 0, 'other': set()}
diags = []
def handle(msg):
    m = msg.get('method')
    if m == 'textDocument/publishDiagnostics':
        seen['publishDiagnostics'] += 1
        diags.append(msg['params'])
    elif m == '$/lean/fileProgress':
        seen['fileProgress'] += 1
    elif m:
        seen['other'].add(m)
        if 'id' in msg:  # server->client request (e.g. client/registerCapability): reply null
            send({'jsonrpc': '2.0', 'id': msg['id'], 'result': None})

t0 = time.time()
init = request('initialize', {'processId': os.getpid(), 'rootUri': pathlib.Path(proj).resolve().as_uri(), 'capabilities': {}})
print('serverInfo:', init['result'].get('serverInfo'), 'in %.2fs' % (time.time() - t0))
caps = init['result'].get('capabilities', {})
print('capability keys:', sorted(caps.keys()))
send({'jsonrpc': '2.0', 'method': 'initialized', 'params': {}})
text = path.read_text()
send({'jsonrpc': '2.0', 'method': 'textDocument/didOpen', 'params': {
    'textDocument': {'uri': uri, 'languageId': 'lean4', 'version': 1, 'text': text},
    'dependencyBuildMode': 'never'}})
t1 = time.time()
r = request('textDocument/waitForDiagnostics', {'uri': uri, 'version': 1}, timeout=120)
print('waitForDiagnostics ->', r.get('result', r.get('error')), 'after %.2fs' % (time.time() - t1))
# drain a little
end = time.time() + 0.5
while time.time() < end:
    try: handle(q.get(timeout=0.1))
    except queue.Empty: pass
last = diags[-1] if diags else None
if last:
    print('last publishDiagnostics: %d diags' % len(last['diagnostics']))
    for d in last['diagnostics']:
        print('  ', d['severity'], d['range']['start'], repr(d['message'][:80]), 'fullRange' in d, d.get('leanTags'), d.get('isSilent'))
print('notification counts:', {k: (v if not isinstance(v, set) else sorted(v)) for k, v in seen.items()})
g = request('$/lean/plainGoal', {'textDocument': {'uri': uri}, 'position': {'line': gl, 'character': gc}})
print('plainGoal ->', json.dumps(g.get('result', g.get('error')))[:300])
tg = request('$/lean/plainTermGoal', {'textDocument': {'uri': uri}, 'position': {'line': gl, 'character': gc}})
print('plainTermGoal ->', json.dumps(tg.get('result', tg.get('error')))[:300])
ds = request('textDocument/documentSymbol', {'textDocument': {'uri': uri}})
syms = ds.get('result') or []
print('documentSymbol ->', [(s.get('name'), s.get('kind')) for s in syms][:20])
rc = request('$/lean/rpc/connect', {'uri': uri})
print('rpc/connect ->', rc.get('result', rc.get('error')))
request('shutdown', None)
send({'jsonrpc': '2.0', 'method': 'exit'})
try:
    p.wait(timeout=10)
except subprocess.TimeoutExpired:
    p.kill()
print('total %.2fs, exit=%s' % (time.time() - t0, p.returncode))
