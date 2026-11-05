#!/usr/bin/env python3
"""Download npm tarballs (pkg@version) and extract each into its own fresh directory.

Usage: python3 -I fetchtar.py DLROOT pkg@ver [pkg@ver ...]
Extraction uses tarfile's 'data' filter (no absolute paths, no links outside, no devices).
Nothing downloaded is executed.
"""
import io
import json
import os
import sys
import tarfile
import urllib.parse
import urllib.request

root = sys.argv[1]
for spec in sys.argv[2:]:
    if spec.startswith("@"):
        name, _, ver = spec[1:].partition("@")
        name = "@" + name
    else:
        name, _, ver = spec.partition("@")
    meta_url = "https://registry.npmjs.org/" + urllib.parse.quote(name, safe="@") + "/" + (ver or "latest")
    with urllib.request.urlopen(meta_url, timeout=60) as r:
        meta = json.loads(r.read())
    tb = meta["dist"]["tarball"]
    dest = os.path.join(root, name.replace("/", "__") + "@" + meta["version"])
    if os.path.exists(dest):
        print("exists", dest)
        continue
    os.makedirs(dest)
    with urllib.request.urlopen(tb, timeout=300) as r:
        data = r.read()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
        tf.extractall(dest, filter="data")
    print(f"{name}@{meta['version']}\t{len(data)} bytes tgz\t-> {dest}")
