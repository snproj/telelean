#!/bin/sh
# Usage: snapdiff.sh <outfile>   Same content as savepatch.sh (every change against HEAD except package-lock.json,
# plus new untracked files under packages/ docs/ test-fixtures/ scripts/), written to <outfile> (in a scratch dir).
# Read-only for git and for the repository. Compare two snapshots with: diff <before> <after>
set -e
out="$1"; cd /home/zhengyew/telelean
git diff HEAD --binary -- . ':(exclude)package-lock.json' > "$out"
git ls-files --others --exclude-standard -- packages docs test-fixtures scripts \
  | grep -vE '(^|/)(node_modules|dist|out|test-results|playwright-report)/' \
  | while IFS= read -r f; do git diff --no-index --binary /dev/null "$f" || true; done >> "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
