#!/bin/bash
# Orchestrator re-check after a sub-slice: tsc (5 configs) + vitest core/webview/extension, one at a time, capped.
# Usage: recheck.sh <tag>   -> writes $S/rc_<tag>/summary.txt and per-command logs
S=/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad
B=/home/zhengyew/telelean/node_modules/.bin
R=/home/zhengyew/telelean/packages
T=$S/rc_$1; mkdir -p $T/tmp $T/fsmc
SUM=$T/summary.txt; : > $SUM
run() { # name dir cmd...
  local name=$1 dir=$2; shift 2
  ( cd $dir && TMPDIR=$T/tmp TELELEAN_TEST_TMP=$T/tmp $S/capped.sh 2000 "$@" ) > $T/$name.log 2>&1
  local rc=$?
  local line=$(grep -E "Test Files|Tests  " $T/$name.log | tail -2 | tr -s ' ' | tr '\n' ' ')
  echo "$name rc=$rc $line" >> $SUM
}
run tsc_core    $R/core     $B/tsc --noEmit -p tsconfig.test.json
run tsc_runner  $R/runner   $B/tsc --noEmit -p tsconfig.test.json
run tsc_web     $R/webview  $B/tsc --noEmit -p tsconfig.json
run tsc_webnode $R/webview  $B/tsc --noEmit -p tsconfig.node.json
run tsc_ext     $R/extension $B/tsc --noEmit -p tsconfig.json
run vt_core     $R/core     $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
run vt_web      $R/webview  $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
run vt_ext      $R/extension $B/vitest run --maxWorkers=1 --no-cache --fsModuleCachePath=$T/fsmc
echo DONE >> $SUM
