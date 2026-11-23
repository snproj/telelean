#!/bin/sh
cd /home/zhengyew/telelean/packages/webview || exit 2
TELELEAN_WEBVIEW_OUT=/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/final-webview-build-2k /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/capped.sh 1500 /home/zhengyew/telelean/node_modules/.bin/vite build > /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/final_checks_2k/vite_build.log 2>&1
echo "vite rc=$?" >> /tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/final_checks_2k/vite_build.log
/tmp/claude-1002/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/scratchpad/final_checks_2k/run_specs.sh
