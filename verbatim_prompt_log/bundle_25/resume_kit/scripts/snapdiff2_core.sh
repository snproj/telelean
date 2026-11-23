#!/bin/sh
# (2j, turn 25) Every change of the working tree against HEAD (c557f06 = slice 2 final), printed to stdout:
#   (1) git diff HEAD (no renames, binary), sorted by path; (2) every untracked file under packages/ docs/ test-fixtures/ scripts/
#   as a /dev/null diff. Excludes package-lock.json, the prompt logs and build output. Read-only for git and the repository.
set -e
cd /home/zhengyew/telelean
git diff HEAD --no-renames --binary -- . ':(exclude)package-lock.json' ':(exclude)verbatim_prompt_log' ':(exclude)packages/extension/dist' ':(exclude)packages/extension/out'
git ls-files --others --exclude-standard -- packages docs test-fixtures scripts | grep -vE '(^|/)(node_modules|dist|out|test-results|playwright-report)/' | LC_ALL=C sort -u \
  | while IFS= read -r f; do git diff --no-index --binary /dev/null "$f" || true; done
