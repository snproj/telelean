#!/bin/sh
# Run each Playwright spec on its own against the scratch webview build (RESUME Step 4.1).
NS=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad
OUT=$NS/final_checks_2k
cd /home/zhengyew/telelean/packages/webview || exit 2
: > $OUT/specs_summary.txt
for f in test/e2e/*.spec.ts; do
  s=$(basename $f)
  t0=$(date +%s)
  TELELEAN_WEBVIEW_OUT=$NS/final-webview-build-2k TELELEAN_NO_REAL_CLAUDE=1 $NS/capped.sh 3000 sh -c 'ulimit -c 0; /home/zhengyew/telelean/node_modules/.bin/playwright test '"$f"' --reporter=line' > $OUT/pw_$s.log 2>&1
  rc=$?
  t1=$(date +%s)
  if [ -d test-results ]; then mkdir -p $OUT/test-results; mv test-results $OUT/test-results/$s; fi
  sumline=$(grep -E '^\s*[0-9]+ (passed|failed|skipped|flaky|did not run)' $OUT/pw_$s.log | tr -s ' ' | tr '\n' ';')
  echo "$s rc=$rc $((t1-t0))s $sumline mem_avail_mb=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" >> $OUT/specs_summary.txt
done
echo DONE >> $OUT/specs_summary.txt
