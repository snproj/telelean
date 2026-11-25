#!/bin/sh
# Usage: snapdiff2.sh <outfile>   Every change against HEAD (4640902 since turn 27) (see snapdiff2_core.sh), written to <outfile> (in a scratch dir).
set -e
/tmp/claude-1000/-home-zhengyew-telelean/3358448c-d9b7-4f38-afd0-3f73c08df70e/scratchpad/snapdiff2_core.sh > "$1"
echo "$1: $(wc -c < "$1") bytes, $(grep -c '^diff --git' "$1") files"
