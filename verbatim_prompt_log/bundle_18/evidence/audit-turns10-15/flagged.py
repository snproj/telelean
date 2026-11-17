import json, re, sys
sys.path.insert(0, "/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn16/audit-turns10-15")
calls = json.load(open(sys.argv[1]))
src = sys.argv[2]
cats = sys.argv[3].split(",")
maxlen = int(sys.argv[4]) if len(sys.argv) > 4 else 1500
exec(open("/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef/scratchpad/turn16/audit-turns10-15/classify.py").read().split("rx = {k")[0].split("calls = json.load")[0])
