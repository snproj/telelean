#!/bin/sh
# Usage: snapdiff2.sh <outfile>   Every change against HEAD (4640902 since turn 27) (see snapdiff2_core.sh), written to <outfile> (in a scratch dir).
set -e
/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/snapdiff2_core.sh > "$1"
echo "$1: $(wc -c < "$1") bytes, $(grep -c '^diff --git' "$1") files"
