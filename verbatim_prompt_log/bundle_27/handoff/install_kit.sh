#!/bin/sh
# install_kit.sh: set up the telelean orchestration kit in a NEW Claude Code session, on any machine.
#
# Usage:  sh install_kit.sh <new scratchpad dir> [--with-memory]
#   <new scratchpad dir>  the new session's scratchpad, e.g. /tmp/claude-1000/-home-me-telelean/<session-id>/scratchpad
#                         (the system prompt names it).
#   --with-memory         also copy the memory notes in ../memory/ into this machine's Claude Code memory folder for
#                         the repo, without overwriting notes already there.
# Env overrides: NEW_SESSION_DIR (the session's transcript folder, when it can't be derived from the scratchpad path).
#
# What it does:
#   - copies kit/scripts/* into the scratchpad, kit/briefs/* into <scratchpad>/briefs, and kit/final_checks/* into
#     <scratchpad>/final_checks_2k;
#   - rewrites the old machine's paths in the copies: the repo, the scratchpad, the session transcript folder, the
#     /tmp/claude-<uid> root, /run/user/<uid> and the home folder;
#   - prints every line that still names the old machine, for a human-style check.
# It writes only into the scratchpad (and, with --with-memory, the memory folder). It changes nothing in git.
set -e
NEW_S=${1:?usage: install_kit.sh <new scratchpad dir> [--with-memory]}
NEW_S=${NEW_S%/}
HERE=$(cd "$(dirname "$0")" && pwd)
NEW_R=$(cd "$HERE/../../.." && pwd)               # handoff/ -> bundle_27/ -> verbatim_prompt_log/ -> repo
[ -f "$NEW_R/package.json" ] && [ -d "$NEW_R/packages/runner" ] || { echo "not a telelean repo: $NEW_R" >&2; exit 2; }
sid=$(basename "$(dirname "$NEW_S")")
slug=$(basename "$(dirname "$(dirname "$NEW_S")")")
NEW_TMPROOT=$(dirname "$(dirname "$(dirname "$NEW_S")")")
NEW_SD=${NEW_SESSION_DIR:-$HOME/.claude/projects/$slug/$sid}
UIDN=$(id -u)

OLD_SD=/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b
OLD_S=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad
OLD_TMPROOT=/tmp/claude-1002
OLD_R=/home/zhengyew/telelean
OLD_H=/home/zhengyew

rewrite() { # src dst. Two passes through placeholder tokens, so a new path that happens to contain an old one
  # (e.g. the same user name on both machines) is never rewritten twice. Longest old paths first.
  sed -e "s#$OLD_SD#@@KIT_SD@@#g" -e "s#$OLD_S#@@KIT_S@@#g" -e "s#$OLD_TMPROOT/#@@KIT_TMP@@/#g" \
      -e "s#/run/user/1002#@@KIT_RUN@@#g" -e "s#$OLD_R#@@KIT_R@@#g" -e "s#$OLD_H/#@@KIT_H@@/#g" -e "s#'$OLD_H'#'@@KIT_H@@'#g" "$1" |
  sed -e "s#@@KIT_SD@@#$NEW_SD#g" -e "s#@@KIT_S@@#$NEW_S#g" -e "s#@@KIT_TMP@@#$NEW_TMPROOT#g" \
      -e "s#@@KIT_RUN@@#/run/user/$UIDN#g" -e "s#@@KIT_R@@#$NEW_R#g" -e "s#@@KIT_H@@#$HOME#g" > "$2"
}

mkdir -p "$NEW_S/briefs" "$NEW_S/extracts" "$NEW_S/final_checks_2k"
for f in "$HERE"/kit/scripts/*;      do rewrite "$f" "$NEW_S/$(basename "$f")"; done
for f in "$HERE"/kit/briefs/*;       do rewrite "$f" "$NEW_S/briefs/$(basename "$f")"; done
for f in "$HERE"/kit/final_checks/*; do rewrite "$f" "$NEW_S/final_checks_2k/$(basename "$f")"; done
chmod +x "$NEW_S"/*.sh "$NEW_S"/*.py "$NEW_S"/final_checks_2k/*.sh

if [ "$2" = "--with-memory" ]; then
  MEM=$HOME/.claude/projects/$slug/memory
  mkdir -p "$MEM"
  for f in "$HERE"/memory/*.md; do
    if [ -e "$MEM/$(basename "$f")" ]; then echo "memory: kept existing $(basename "$f")"; else rewrite "$f" "$MEM/$(basename "$f")"; fi
  done
  echo "memory notes -> $MEM"
fi

echo "kit installed:"
echo "  repo        $NEW_R"
echo "  scratchpad  $NEW_S"
echo "  session dir $NEW_SD   (wf_usage.py, savewf.py, build_interim.py and ledger_scan.py read workflow journals and transcripts here)"
echo
echo "Lines that still name the old machine (expected only if this machine's home is also /home/zhengyew):"
grep -rn -e 'claude-1002' -e 'c398a83b' -e '/home/zhengyew' "$NEW_S"/*.sh "$NEW_S"/*.py "$NEW_S"/*.js "$NEW_S"/*.md "$NEW_S"/briefs "$NEW_S"/final_checks_2k 2>/dev/null | cut -c1-200 || true
echo
echo "Still to edit by hand (see START_HERE.md, 'Machine-specific values'):"
echo "  - builder_rules.md, chain_2k.js and briefs: the HEAD commit id, the dist/out timestamps and the bundle folder for patches;"
echo "  - ledger_disk.py: the start time of the turn being audited, and its list of folders to scan;"
echo "  - capped.sh: needs 'systemd-run --user'; recheck_full.sh's real-Lean tests skip themselves below 12 GB free RAM;"
echo "  - final_checks_2k/run_vscode_smoke.sh: it uses the snap VS Code (/snap/code/current). Without one, ask the user"
echo "    (smoke.mjs would otherwise download a VS Code test build, and downloads are not allowed for agents)."
