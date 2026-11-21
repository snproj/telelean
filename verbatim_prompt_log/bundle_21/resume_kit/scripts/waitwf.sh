#!/bin/sh
# Usage: waitwf.sh <run-id> <min results> <seconds>   Waits until the workflow journal has that many results.
J=/home/zhengyew/.claude/projects/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/subagents/workflows/$1/journal.jsonl
end=$(( $(date +%s) + $3 ))
while [ "$(date +%s)" -lt "$end" ]; do
  n=$(grep -c '"type":"result"' "$J" 2>/dev/null); n=${n:-0}
  [ "$n" -ge "$2" ] && break
  sleep 20
done
n=$(grep -c '"type":"result"' "$J" 2>/dev/null); echo "results=${n:-0} started=$(grep -c '"type":"started"' "$J") at $(date +%H:%M); diff: $(cd /home/zhengyew/telelean && git diff --stat | tail -1); $(grep MemAvailable /proc/meminfo)"
