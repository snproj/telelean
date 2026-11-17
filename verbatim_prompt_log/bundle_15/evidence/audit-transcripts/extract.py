#!/usr/bin/env python3
"""Read-only extractor: every tool call (with its result, abridged) since the cutoff,
from the main transcript and all subagent transcripts. Output: calls.jsonl"""
import json, os, glob, sys

S = '/home/zhengyew/.claude/projects/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
OUT = os.path.dirname(os.path.abspath(__file__))
CUTOFF = '2026-11-01T02:16:34'

# labels from journals
labels = {}
for j in glob.glob(S + '/subagents/workflows/*/journal.jsonl'):
    run = os.path.basename(os.path.dirname(j))
    for line in open(j):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get('type') == 'started':
            labels[(run, d.get('agentId'))] = d.get('label')

files = [('main', 'main', S + '.jsonl')]
for f in sorted(glob.glob(S + '/subagents/**/agent-*.jsonl', recursive=True)):
    run = os.path.basename(os.path.dirname(f))
    aid = os.path.basename(f)[len('agent-'):-len('.jsonl')]
    lab = labels.get((run, aid))
    if not lab:
        meta = f[:-len('.jsonl')] + '.meta.json'
        try:
            lab = json.load(open(meta)).get('description', '')
        except Exception:
            lab = '?'
    files.append((run, f'{lab} [{aid}]', f))


def turn_of(ts):
    if ts is None:
        return '?'
    if ts < '2026-11-01T02:16:34':
        return 'pre9'
    if ts < '2026-11-10T16:00':
        return '9'
    if ts < '2026-11-10T16:29:45':
        return '10'
    if ts < '2026-11-10T16:32:57':
        return '11'
    if ts < '2026-11-10T16:38:16':
        return '12'
    if ts < '2026-11-10T17:00:04':
        return '13'
    if ts < '2026-11-13T12:36:36':
        return '13/14'
    return '15'


def result_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        out = []
        for x in c:
            if isinstance(x, dict):
                if x.get('type') == 'text':
                    out.append(x.get('text', ''))
                else:
                    out.append('<' + str(x.get('type')) + '>')
        return '\n'.join(out)
    return str(c)


n = 0
with open(os.path.join(OUT, 'calls.jsonl'), 'w') as out:
    for run, label, path in files:
        calls = {}
        order = []
        for line in open(path):
            try:
                d = json.loads(line)
            except Exception:
                continue
            ts = d.get('timestamp')
            t = d.get('type')
            if t == 'assistant':
                if ts and ts < CUTOFF:
                    continue
                for it in (d.get('message', {}).get('content') or []):
                    if isinstance(it, dict) and it.get('type') == 'tool_use':
                        rec = {'run': run, 'agent': label, 'ts': ts, 'turn': turn_of(ts),
                               'id': it.get('id'), 'tool': it.get('name'), 'input': it.get('input'),
                               'result': None, 'is_error': None}
                        calls[it.get('id')] = rec
                        order.append(it.get('id'))
            elif t == 'user':
                c = d.get('message', {}).get('content')
                if isinstance(c, list):
                    for it in c:
                        if isinstance(it, dict) and it.get('type') == 'tool_result':
                            r = calls.get(it.get('tool_use_id'))
                            if r is not None:
                                txt = result_text(it.get('content'))
                                r['result'] = txt[:6000]
                                r['result_len'] = len(txt)
                                r['is_error'] = it.get('is_error')
                                tur = d.get('toolUseResult')
                                if isinstance(tur, dict):
                                    r['tur_keys'] = sorted(tur.keys())
                                    for k in ('backgroundTaskId', 'interrupted', 'returnCodeInterpretation', 'isImage', 'persistedOutputPath'):
                                        if k in tur:
                                            r['tur_' + k] = tur[k]
        for cid in order:
            out.write(json.dumps(calls[cid]) + '\n')
            n += 1
print('calls', n)
