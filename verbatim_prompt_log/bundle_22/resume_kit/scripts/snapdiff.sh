#!/bin/sh
# Usage: snapdiff.sh <outfile>   Every change against 187673d (see snapdiff_core.sh), written to <outfile> (in a scratch dir).
# Same layout as the bundle_21 patches, so: diff <previous patch> <outfile> isolates the newest work. Read-only for git.
set -e
out="$1"
/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/snapdiff_core.sh > "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
