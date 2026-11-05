#!/bin/bash
# Usage: run_page.sh PAGE(relative to bench) OUTFILE [EXPECT] [TIMEOUT] [EXTRA_CHROME_FLAGS...]
R=/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/research/r3-ui-graph
PAGE=$1; OUT=$2; EXPECT=${3:-1}; TIMEOUT=${4:-60}; shift 4 2>/dev/null
PORT=$(( 20000 + RANDOM % 20000 ))
mkdir -p $R/home/.config $R/home/.cache $R/home/.local/share
python3 -I $R/scripts/serve.py $R/bench $PORT $OUT $EXPECT $TIMEOUT &
SPID=$!
sleep 0.5
HOME=$R/home XDG_CONFIG_HOME=$R/home/.config XDG_CACHE_HOME=$R/home/.cache XDG_DATA_HOME=$R/home/.local/share \
  google-chrome --headless=new --user-data-dir=$R/home/chrome-profile --no-first-run --no-default-browser-check \
  --disable-extensions --disable-background-networking --disable-component-update --disable-sync --disable-default-apps \
  --password-store=basic --use-mock-keychain --window-size=1600,1000 "$@" "http://127.0.0.1:$PORT/$PAGE" >/dev/null 2>&1 &
CPID=$!
wait $SPID
kill $CPID 2>/dev/null; sleep 0.5; kill -9 $CPID 2>/dev/null
pkill -f "user-data-dir=$R/home/chrome-profile" 2>/dev/null
true
