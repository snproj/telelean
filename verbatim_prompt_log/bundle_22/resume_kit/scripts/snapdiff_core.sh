#!/bin/sh
# Shared body of snapdiff.sh and savepatch.sh (2026-11-21, new machine; AP-39). Prints, to stdout, every change of the
# working tree against BASE=187673d (the commit before the autopilot), in the SAME layout as all bundle_21 patches:
#   (1) changes to files that exist in BASE (git diff, no rename detection), sorted by path; then
#   (2) every file added since BASE (whether the user committed it in 1473ca0 or it is untracked) under
#       packages/ docs/ test-fixtures/ scripts/, as a /dev/null diff, sorted by path.
# Excludes package-lock.json (the user's), the prompt logs, the user's own .gitignore and scraps*.md, and build output
# (node_modules, dist, out, test-results, playwright-report). Read-only for git and for the repository.
set -e
cd /home/zhengyew/telelean
BASE=187673d
git diff $BASE --no-renames --binary --diff-filter=MDT -- . ':(exclude)package-lock.json' ':(exclude)verbatim_prompt_log' \
  ':(exclude).gitignore' ':(exclude)scraps.md' ':(exclude)scraps2.md' ':(exclude)packages/extension/dist' ':(exclude)packages/extension/out'
{ git diff $BASE --no-renames --name-only --diff-filter=A -- packages docs test-fixtures scripts
  git ls-files --others --exclude-standard -- packages docs test-fixtures scripts; } \
  | grep -vE '(^|/)(node_modules|dist|out|test-results|playwright-report)/' | LC_ALL=C sort -u \
  | while IFS= read -r f; do git diff --no-index --binary /dev/null "$f" || true; done
