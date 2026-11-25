#!/bin/sh
# Usage: [PATCHES=<dir>] savepatch2.sh <name>   Writes $PATCHES (default bundle_27/evidence/patches)/<name>.patch: every change against HEAD (4640902 since turn 27), cumulative. Read-only for git.
set -e
out=${PATCHES:-/home/zhengyew/telelean/verbatim_prompt_log/bundle_32/evidence/patches}/$1.patch; mkdir -p "$(dirname "$out")"
/tmp/claude-1000/-home-zhengyew-telelean/3358448c-d9b7-4f38-afd0-3f73c08df70e/scratchpad/snapdiff2_core.sh > "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
