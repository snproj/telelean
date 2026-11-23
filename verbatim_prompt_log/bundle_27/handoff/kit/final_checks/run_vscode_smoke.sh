#!/bin/sh
# The extension's in-VS-Code suites (smoke + e2e instances) in the user's snap VS Code, isolated profile in scratch.
NS=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad
cd /home/zhengyew/telelean/packages/extension || exit 2
export TELELEAN_TEST_TMP=$NS/final_checks_2k/vscode TELELEAN_NO_REAL_CLAUDE=1 npm_config_offline=true npm_config_update_notifier=false
t0=$(date +%s)
$NS/capped.sh 14000 timeout 5400 node scripts/smoke.mjs --snap > $NS/final_checks_2k/vscode_smoke.log 2>&1
rc=$?
echo "smoke rc=$rc $(( $(date +%s) - t0 ))s mem_avail_mb=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" >> $NS/final_checks_2k/vscode_smoke.log
