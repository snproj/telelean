#!/bin/sh
# Usage: savepatch.sh <name>   Writes bundle_21/evidence/patches/<name>.patch: every change against 187673d, cumulative,
# in the same layout as the earlier patches (see snapdiff_core.sh). Read-only for git.
set -e
out=/home/zhengyew/telelean/verbatim_prompt_log/bundle_21/evidence/patches/$1.patch
/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/snapdiff_core.sh > "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
