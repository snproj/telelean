#!/bin/sh
# Usage: capped.sh <MB> <command...>   Runs the command in a transient systemd user scope with a hard memory cap and no swap,
# so an overflow kills only this job. Waits while MemAvailable is below 1.5 GB.
mb="$1"; shift
i=0
while [ "$(awk '/MemAvailable/{print $2}' /proc/meminfo)" -lt 1500000 ]; do
  i=$((i+1)); [ $i -gt 40 ] && { echo "capped.sh: MemAvailable stayed below 1.5 GB for 20 min; not starting" >&2; exit 75; }
  sleep 30
done
exec systemd-run --user --scope --quiet -p MemoryMax="${mb}M" -p MemorySwapMax=0 --setenv=TELELEAN_NO_REAL_CLAUDE=1 -- env TELELEAN_NO_REAL_CLAUDE=1 LEAN_NUM_THREADS=2 "$@"
