"""Save a finished workflow's agent outputs into the log bundle.

Usage: python3 -I savewf.py <run-id e.g. wf_a685862b-718> <dest dir> [script path]
Writes <dest>/agents/<label>.json (verbatim result) and <label>.md (readable), <dest>/_index.json, and copies the
workflow script to <dest>/workflow_script.js when given.
"""
import json, os, re, shutil, sys

run, dest = sys.argv[1], sys.argv[2]
script = sys.argv[3] if len(sys.argv) > 3 else None
base = f"/home/zhengyew/.claude/projects/-home-zhengyew-telelean/c398a83b-d60f-46a4-ad9a-8d926e6fdd1b/subagents/workflows/{run}"
rows = [json.loads(l) for l in open(os.path.join(base, 'journal.jsonl'))]
labels = {r['agentId']: r.get('label') for r in rows if r.get('type') == 'started'}
os.makedirs(os.path.join(dest, 'agents'), exist_ok=True)
index = []


def md(value, depth=0):
    if isinstance(value, dict):
        out = []
        for k, v in value.items():
            if isinstance(v, (dict, list)):
                out.append(f"{'  ' * depth}- **{k}:**")
                out.append(md(v, depth + 1))
            else:
                out.append(f"{'  ' * depth}- **{k}:** {v}")
        return '\n'.join(out)
    if isinstance(value, list):
        out = []
        for i, v in enumerate(value):
            if isinstance(v, (dict, list)):
                out.append(f"{'  ' * depth}- [{i + 1}]")
                out.append(md(v, depth + 1))
            else:
                out.append(f"{'  ' * depth}- {v}")
        return '\n'.join(out)
    return f"{'  ' * depth}{value}"


for r in rows:
    if r.get('type') != 'result':
        continue
    label = labels.get(r['agentId']) or r['agentId']
    name = re.sub(r'[^A-Za-z0-9._-]+', '_', label)
    result = r.get('result')
    if isinstance(result, dict) and 'result' in result and len(result) <= 3:
        result = result['result']
    with open(os.path.join(dest, 'agents', name + '.json'), 'w') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    with open(os.path.join(dest, 'agents', name + '.md'), 'w') as f:
        f.write(f"# {label}\n\nAgent `{r['agentId']}` of workflow `{run}`. Verbatim output (JSON alongside).\n\n")
        f.write(result if isinstance(result, str) else md(result))
        f.write('\n')
    index.append({'label': label, 'agentId': r['agentId'], 'file': f'agents/{name}.json', 'toolsUsed': r.get('toolsUsed')})
with open(os.path.join(dest, 'agents', '_index.json'), 'w') as f:
    json.dump(index, f, indent=2)
if script:
    shutil.copy(script, os.path.join(dest, 'workflow_script.js'))
print(f"saved {len(index)} agent outputs to {dest}")
