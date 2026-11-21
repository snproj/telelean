#!/bin/sh
# Emits one line per change of RAM level (with hysteresis). Levels: ok >=3 GB, low <3 GB, crit <1.5 GB, severe <0.8 GB.
prev=""
while true; do
  a=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  case "$prev" in
    ""|ok) if [ $a -lt 800 ]; then l=severe; elif [ $a -lt 1536 ]; then l=crit; elif [ $a -lt 3072 ]; then l=low; else l=ok; fi;;
    low) if [ $a -lt 800 ]; then l=severe; elif [ $a -lt 1536 ]; then l=crit; elif [ $a -ge 3372 ]; then l=ok; else l=low; fi;;
    crit) if [ $a -lt 800 ]; then l=severe; elif [ $a -ge 3372 ]; then l=ok; elif [ $a -ge 1836 ]; then l=low; else l=crit; fi;;
    severe) if [ $a -ge 3372 ]; then l=ok; elif [ $a -ge 1836 ]; then l=low; elif [ $a -ge 1100 ]; then l=crit; else l=severe; fi;;
  esac
  if [ "$l" != "$prev" ]; then echo "RAM $l: MemAvailable ${a} MB ($(date +%H:%M:%S))"; prev=$l; fi
  sleep 5
done
