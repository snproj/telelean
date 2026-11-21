#!/bin/sh
# Usage: savepatch.sh <name>   Writes bundle_21/evidence/patches/<name>.patch: every tracked change against HEAD
# except package-lock.json (the user's), plus every new untracked file under packages/ docs/ test-fixtures/
# (excluding node_modules, dist, out, test-results). Read-only for git.
set -e
cd /home/zhengyew/telelean
out=verbatim_prompt_log/bundle_21/evidence/patches/$1.patch
git diff HEAD --binary -- . ':(exclude)package-lock.json' > "$out"
git ls-files --others --exclude-standard -- packages docs test-fixtures scripts \
  | grep -vE '(^|/)(node_modules|dist|out|test-results|playwright-report)/' \
  | while IFS= read -r f; do git diff --no-index --binary /dev/null "$f" || true; done >> "$out"
echo "$out: $(wc -c < "$out") bytes, $(grep -c '^diff --git' "$out") files"
