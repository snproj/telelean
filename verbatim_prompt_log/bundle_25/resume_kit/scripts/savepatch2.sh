#!/bin/sh
# Usage: savepatch2.sh <name>   Writes bundle_25/evidence/patches/<name>.patch: every change against c557f06, cumulative. Read-only for git.
set -e
out=/home/zhengyew/telelean/verbatim_prompt_log/bundle_25/evidence/patches/$1.patch
/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/snapdiff2_core.sh > "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
