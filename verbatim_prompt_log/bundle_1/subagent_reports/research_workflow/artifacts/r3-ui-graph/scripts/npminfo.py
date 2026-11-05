#!/usr/bin/env python3
"""Fetch npm registry metadata for a list of packages and print a compact summary.

Usage: python3 -I npminfo.py OUTDIR pkg1 pkg2 ...
Writes raw JSON (abbreviated) to OUTDIR/<safe-name>.json and prints TSV summary lines.
"""
import json
import sys
import urllib.request
import urllib.parse
import os

outdir = sys.argv[1]
pkgs = sys.argv[2:]


def fetch(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


for p in pkgs:
    safe = p.replace("/", "__")
    url = "https://registry.npmjs.org/" + urllib.parse.quote(p, safe="@")
    try:
        d = fetch(url)
    except Exception as e:  # noqa
        print(f"{p}\tERROR\t{e}")
        continue
    tags = d.get("dist-tags", {})
    latest = tags.get("latest")
    times = d.get("time", {})
    v = d.get("versions", {}).get(latest, {}) if latest else {}
    deprecated = v.get("deprecated")
    lic = v.get("license") or d.get("license")
    if isinstance(lic, dict):
        lic = lic.get("type")
    unpacked = (v.get("dist") or {}).get("unpackedSize")
    filecount = (v.get("dist") or {}).get("fileCount")
    tarball = (v.get("dist") or {}).get("tarball")
    deps = v.get("dependencies") or {}
    peers = v.get("peerDependencies") or {}
    repo = v.get("repository") or d.get("repository")
    if isinstance(repo, dict):
        repo = repo.get("url")
    # last 5 published versions by time
    vt = [(k, t) for k, t in times.items() if k not in ("created", "modified")]
    vt.sort(key=lambda x: x[1])
    recent = vt[-5:]
    summary = {
        "name": p,
        "latest": latest,
        "dist_tags": tags,
        "latest_published": times.get(latest),
        "modified": times.get("modified"),
        "created": times.get("created"),
        "license": lic,
        "deprecated": deprecated,
        "unpackedSize": unpacked,
        "fileCount": filecount,
        "tarball": tarball,
        "dependencies": deps,
        "peerDependencies": peers,
        "repository": repo,
        "recent_versions": recent,
        "homepage": v.get("homepage") or d.get("homepage"),
        "description": v.get("description") or d.get("description"),
    }
    with open(os.path.join(outdir, safe + ".json"), "w") as f:
        json.dump(summary, f, indent=1)
    print(
        "\t".join(
            str(x)
            for x in [
                p,
                latest,
                (times.get(latest) or "")[:10],
                lic,
                ("DEPRECATED: " + str(deprecated)[:80]) if deprecated else "",
                unpacked,
                ",".join(f"{k}@{v2}" for k, v2 in peers.items()),
                ",".join(f"{k}" for k in deps.keys())[:150],
                " ".join(f"{k}:{t[:10]}" for k, t in recent),
            ]
        )
    )
