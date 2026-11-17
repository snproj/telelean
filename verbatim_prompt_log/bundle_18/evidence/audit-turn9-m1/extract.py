#!/usr/bin/env python3
"""Extract every tool_use (with its tool_result) from Claude Code jsonl transcripts.

Usage: python3 -I extract.py OUT.jsonl START_ISO END_ISO label=path [label=path ...]
A record is kept if its timestamp is within [START, END] (inclusive); pass '' to disable.
"""
import json
import sys

out_path, start, end = sys.argv[1], sys.argv[2], sys.argv[3]
sources = [a.split('=', 1) for a in sys.argv[4:]]


def in_window(ts):
    if not ts:
        return False
    if start and ts < start:
        return False
    if end and ts > end:
        return False
    return True


def result_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict):
                if c.get('type') == 'text':
                    parts.append(c.get('text', ''))
                else:
                    parts.append('[' + str(c.get('type')) + ']')
            else:
                parts.append(str(c))
        return '\n'.join(parts)
    return str(content)


n_out = 0
with open(out_path, 'w') as out:
    for label, path in sources:
        uses = {}
        order = []
        with open(path) as f:
            for lineno, line in enumerate(f, 1):
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                ts = d.get('timestamp', '')
                msg = d.get('message') or {}
                content = msg.get('content') if isinstance(msg, dict) else None
                if d.get('type') == 'assistant' and isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict) and c.get('type') == 'tool_use':
                            if not in_window(ts):
                                continue
                            rec = {
                                'src': label,
                                'ts': ts,
                                'line': lineno,
                                'id': c.get('id'),
                                'name': c.get('name'),
                                'input': c.get('input'),
                                'result': None,
                                'is_error': None,
                                'sidechain': d.get('isSidechain'),
                                'agentId': d.get('agentId'),
                            }
                            uses[c.get('id')] = rec
                            order.append(c.get('id'))
                elif d.get('type') == 'user' and isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict) and c.get('type') == 'tool_result':
                            tid = c.get('tool_use_id')
                            if tid in uses:
                                uses[tid]['result'] = result_text(c.get('content'))[:6000]
                                uses[tid]['is_error'] = c.get('is_error')
                                uses[tid]['result_ts'] = ts
                    tur = d.get('toolUseResult')
                    if isinstance(tur, dict):
                        # keep some structured metadata, e.g. backgroundTaskId, interrupted
                        for c in content:
                            if isinstance(c, dict) and c.get('type') == 'tool_result':
                                tid = c.get('tool_use_id')
                                if tid in uses:
                                    meta = {k: tur[k] for k in ('interrupted', 'backgroundTaskId', 'isImage', 'returnCodeInterpretation', 'type', 'filePath') if k in tur}
                                    uses[tid]['tur'] = meta
        for tid in order:
            out.write(json.dumps(uses[tid]) + '\n')
            n_out += 1
print('wrote', n_out)
