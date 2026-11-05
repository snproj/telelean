#!/usr/bin/env python3
"""Tiny localhost server for headless-Chrome experiments (my own code only).

Serves files from ROOT (GET) and accepts POST /result (JSON body), appending each
result as one line to OUTFILE. Exits after `expect` results or `timeout` seconds.

Usage: python3 -I serve.py ROOT PORT OUTFILE EXPECT TIMEOUT_S
"""
import http.server
import json
import os
import sys
import threading
import time

root, port, outfile, expect, timeout = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), float(sys.argv[5])
received = 0
lock = threading.Lock()
done = threading.Event()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=root, **kw)

    def log_message(self, fmt, *args):  # quiet
        pass

    def do_POST(self):
        global received
        n = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(n).decode("utf-8", "replace")
        with lock:
            with open(outfile, "a") as f:
                f.write(body.replace("\n", " ") + "\n")
            received += 1
            if received >= expect:
                done.set()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b"ok")


srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
done.wait(timeout)
srv.shutdown()
print(f"received {received} result(s)")
