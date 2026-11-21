#!/bin/bash
# Full integrator check: tsc (5 configs), vitest core/webview/extension, then the FULL runner suite with real Lean.
# Usage: recheck_full.sh <tag>   -> $S/rcf_<tag>/summary.txt (last line DONE). Takes ~12 min. Run it in the background
# (nohup … &) and wait for DONE in the summary.
S=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad
B=/home/zhengyew/telelean/node_modules/.bin
R=/home/zhengyew/telelean/packages
T=$S/rcf_$1; rm -rf $T; mkdir -p $T/tmp $T/fsmc $T/rtmp
SUM=$T/summary.txt; : > $SUM; touch $T/start.marker
run() { # name dir cap cmd...
  local name=$1 dir=$2 cap=$3; shift 3
  ( cd $dir && TMPDIR=$T/tmp TELELEAN_TEST_TMP=$T/rtmp env -u UPDATE_SEMANTIC_RECORDINGS $S/capped.sh $cap "$@" ) > $T/$name.log 2>&1
  local rc=$?
  local line=$(tr '\r' '\n' < $T/$name.log | grep -E "Test Files|Tests  " | tail -2 | tr -s ' ' | tr '\n' ' ')
  echo "$name rc=$rc $line" >> $SUM
}
run tsc_core    $R/core      2000 $B/tsc --noEmit -p tsconfig.test.json
run tsc_runner  $R/runner    2000 $B/tsc --noEmit -p tsconfig.test.json
run tsc_web     $R/webview   2000 $B/tsc --noEmit -p tsconfig.json
run tsc_webnode $R/webview   2000 $B/tsc --noEmit -p tsconfig.node.json
run tsc_ext     $R/extension 2000 $B/tsc --noEmit -p tsconfig.json
run vt_core     $R/core      2000 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
run vt_web      $R/webview   2000 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
run vt_ext      $R/extension 2000 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
run vt_runner   $R/runner    6000 timeout 2400 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
# Skips: the runner's real-Lean integration tests skip themselves when MemAvailable < 12 GB (waitForMemory).
# Only one skip is expected (the opt-in real-Claude test). More means tests did not run: wait for memory, re-run once.
skips() { tr '\r' '\n' < "$1" | grep -oE "Tests +[0-9]+ passed \| [0-9]+ skipped" | tail -1 | grep -oE "[0-9]+ skipped" | grep -oE "[0-9]+"; }
SK=$(skips $T/vt_runner.log); SK=${SK:-0}
# Expected skips: the opt-in real-Claude test, plus the plan's static "moves to <later sub-slice>" placeholders.
EXP=$((1 + $(grep -rhoE "it\.skip\(['\"]moves to" $R/runner/test | wc -l)))
echo "vt_runner_expected_skips=$EXP" >> $SUM
if [ "$SK" -gt "$EXP" ]; then
  echo "vt_runner_skips=$SK (expected $EXP): waiting for >= 13 GB MemAvailable, then re-running the suite once" >> $SUM
  for i in $(seq 1 90); do [ "$(awk '/MemAvailable/{print $2}' /proc/meminfo)" -ge 13631488 ] && break; sleep 20; done
  run vt_runner2  $R/runner    6000 timeout 2400 $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
  SK2=$(skips $T/vt_runner2.log); SK2=${SK2:-0}
  if [ "$SK2" -gt "$EXP" ]; then echo "vt_runner_skips rc=98 SKIPPED=$SK2 (expected $EXP): real-Lean tests skipped because MemAvailable stayed below their 12 GB rule; not verified" >> $SUM; fi
fi
# failed test names, if any
for f in $T/vt_*.log; do tr '\r' '\n' < $f | grep -E "^ +(×|FAIL) " | head -20 | sed "s|^|$(basename $f .log): |" >> $T/failures.txt; done
leftover=$(find /tmp -maxdepth 1 -newer $T/start.marker -name 'telelean-*' 2>/dev/null | wc -l)
echo "tmp_leftovers=$leftover" >> $SUM
echo DONE >> $SUM
