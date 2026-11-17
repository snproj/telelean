#!/usr/bin/env python3
"""Broad classifier for every Bash/Monitor command in calls.jsonl.
- strips heredoc bodies (keeps them separately, with the command line that consumes them)
- splits into simple commands with a quote-aware lexer (recursing into $(...), `...`, <(...), bash -c '...')
- histogram of programs; per-program effect notes; redirection targets; env assignments
Outputs several text files for manual review."""
import json, re, os, shlex, collections, sys

OUT = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/zhengyew/telelean'
SCR = '/tmp/claude-1002/-home-zhengyew-telelean/03a29d54-7342-40e3-b5f0-2697a62c93ef'
HOME = '/home/zhengyew'

HD_RX = re.compile(r"<<(-?)\s*(?:'([^']+)'|\"([^\"]+)\"|\\?([A-Za-z_][A-Za-z0-9_]*))")


def strip_heredocs(cmd):
    """Return (stripped_cmd, [(opline, delim, body)])."""
    lines = cmd.split('\n')
    out = []
    docs = []
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        pend = []
        # find heredoc operators in this line (ignore those inside single quotes roughly)
        for m in HD_RX.finditer(line):
            # skip '<<<' here-strings
            st = m.start()
            if st > 0 and line[st - 1] == '<':
                continue
            if line[st:st + 3] == '<<<':
                continue
            delim = m.group(2) or m.group(3) or m.group(4)
            pend.append((m.group(1) == '-', delim))
        i += 1
        for dash, delim in pend:
            body = []
            while i < len(lines):
                l2 = lines[i]
                chk = l2.lstrip('\t') if dash else l2
                if chk == delim:
                    i += 1
                    break
                body.append(l2)
                i += 1
            docs.append((line, delim, '\n'.join(body)))
    return '\n'.join(out), docs


def find_close(s, i, open_ch='(', close_ch=')'):
    """s[i] is just after the opening '('; return index of matching ')' (quote aware)."""
    depth = 1
    q = None
    while i < len(s):
        c = s[i]
        if q == "'":
            if c == "'":
                q = None
        elif q == '"':
            if c == '\\':
                i += 1
            elif c == '"':
                q = None
            elif c == '$' and i + 1 < len(s) and s[i + 1] == '(':
                j = find_close(s, i + 2)
                i = j
        else:
            if c == '\\':
                i += 1
            elif c == "'":
                q = "'"
            elif c == '"':
                q = '"'
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return len(s)


def split_simple(s, acc):
    """Split shell text into simple commands (strings). Recurse into substitutions."""
    cur = []
    i = 0
    q = None
    n = len(s)

    def flush():
        t = ''.join(cur).strip()
        if t:
            acc.append(t)
        cur.clear()

    while i < n:
        c = s[i]
        if q == "'":
            cur.append(c)
            if c == "'":
                q = None
            i += 1
            continue
        if q == '"':
            if c == '\\' and i + 1 < n:
                cur.append(s[i:i + 2]); i += 2; continue
            if c == '"':
                q = None; cur.append(c); i += 1; continue
            if c == '$' and i + 1 < n and s[i + 1] == '(' and not (i + 2 < n and s[i + 2] == '('):
                j = find_close(s, i + 2)
                split_simple(s[i + 2:j], acc)
                cur.append('$(…)')
                i = j + 1
                continue
            if c == '`':
                j = s.find('`', i + 1)
                if j < 0: j = n
                split_simple(s[i + 1:j], acc)
                cur.append('`…`'); i = j + 1; continue
            cur.append(c); i += 1; continue
        # unquoted
        if c == '\\' and i + 1 < n:
            if s[i + 1] == '\n':
                cur.append(' '); i += 2; continue
            cur.append(s[i:i + 2]); i += 2; continue
        if c == "'":
            q = "'"; cur.append(c); i += 1; continue
        if c == '"':
            q = '"'; cur.append(c); i += 1; continue
        if c == '#' and (i == 0 or s[i - 1] in ' \t\n;|&('):
            # comment to end of line
            j = s.find('\n', i)
            if j < 0: j = n
            i = j; continue
        if c == '$' and i + 1 < n and s[i + 1] == '(':
            if i + 2 < n and s[i + 2] == '(':
                # arithmetic $(( ))
                j = s.find('))', i + 3)
                if j < 0: j = n
                cur.append(s[i:j + 2]); i = j + 2; continue
            j = find_close(s, i + 2)
            split_simple(s[i + 2:j], acc)
            cur.append('$(…)')
            i = j + 1
            continue
        if c in '<>' and i + 1 < n and s[i + 1] == '(':
            j = find_close(s, i + 2)
            split_simple(s[i + 2:j], acc)
            cur.append(c + '(…)')
            i = j + 1
            continue
        if c == '`':
            j = s.find('`', i + 1)
            if j < 0: j = n
            split_simple(s[i + 1:j], acc)
            cur.append('`…`'); i = j + 1; continue
        if c in ';\n':
            flush(); i += 1; continue
        if c == '&':
            if i + 1 < n and s[i + 1] == '&':
                flush(); i += 2; continue
            if i + 1 < n and s[i + 1] == '>':
                cur.append('&>'); i += 2; continue
            if i > 0 and s[i - 1] in '<>':
                cur.append(c); i += 1; continue
            # background
            cur.append(' &BG'); flush(); i += 1; continue
        if c == '|':
            if i + 1 < n and s[i + 1] == '|':
                flush(); i += 2; continue
            if i > 0 and s[i - 1] == '>':  # >|
                cur.append(c); i += 1; continue
            flush(); i += 1; continue
        if c in '(){}':
            # subshell/group delimiters; braces only when standalone words
            if c in '{}':
                prev = s[i - 1] if i > 0 else ' '
                nxt = s[i + 1] if i + 1 < n else ' '
                if not (prev in ' \t\n;&|(' and nxt in ' \t\n;&|)'):
                    cur.append(c); i += 1; continue
            if c == '(' and i > 0 and s[i - 1] == '=':  # array assignment a=( ... )
                j = find_close(s, i + 1)
                cur.append(s[i:j + 1]); i = j + 1; continue
            flush(); i += 1; continue
        cur.append(c); i += 1
    flush()
    return acc


ASSIGN_RX = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=')
WRAPPERS = {'sudo', 'nohup', 'setsid', 'command', 'exec', 'builtin', 'time', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', 'ionice', 'chrt', 'taskset', 'unbuffer', 'stdbuf', 'nice', 'timeout', 'env', 'xargs', 'watch', 'flock', 'strace', 'ltrace', 'systemd-run', 'setpriv', 'xvfb-run', 'dbus-run-session', 'prlimit', 'catchsegv', 'unshare', 'bwrap', 'firejail', 'script', 'parallel', 'eval', 'cgexec'}


def tokens(sc):
    try:
        lx = shlex.shlex(sc, posix=True, punctuation_chars=False)
        lx.whitespace_split = True
        lx.commenters = ''
        return list(lx)
    except Exception:
        return sc.split()


def program_of(toks):
    """Strip env assignments and wrappers. Returns (prog, args, wrappers, assigns)."""
    i = 0
    wr = []
    asg = []
    while i < len(toks):
        t = toks[i]
        if ASSIGN_RX.match(t):
            asg.append(t); i += 1; continue
        if t in ('{', '}', '(', ')'):
            i += 1; continue
        if t in WRAPPERS:
            wr.append(t)
            i += 1
            # skip wrapper options/args
            if t == 'timeout':
                while i < len(toks) and toks[i].startswith('-'):
                    if toks[i] in ('-s', '-k', '--signal', '--kill-after'):
                        i += 2
                    else:
                        i += 1
                if i < len(toks): i += 1  # duration
            elif t == 'env':
                while i < len(toks) and (toks[i].startswith('-') or ASSIGN_RX.match(toks[i])):
                    if toks[i] in ('-u', '--unset', '-C', '--chdir', '-S'):
                        if toks[i] in ('-u', '--unset'):
                            asg.append('UNSET:' + (toks[i + 1] if i + 1 < len(toks) else ''))
                        i += 2
                    else:
                        if ASSIGN_RX.match(toks[i]): asg.append(toks[i])
                        i += 1
            elif t in ('nice', 'ionice', 'stdbuf', 'chrt', 'taskset', 'prlimit', 'flock', 'xargs', 'watch', 'strace', 'ltrace', 'systemd-run', 'setpriv', 'xvfb-run', 'unshare', 'bwrap', 'firejail', 'parallel', 'cgexec'):
                # skip options; for those with option args this is approximate
                while i < len(toks) and toks[i].startswith('-'):
                    opt = toks[i]
                    i += 1
                    if t in ('xargs',) and opt in ('-I', '-n', '-P', '-d', '-L', '-s', '-a', '-E') and i < len(toks):
                        i += 1
                    if t in ('nice',) and opt == '-n' and i < len(toks): i += 1
                    if t in ('strace',) and opt in ('-o', '-e', '-p', '-s') and i < len(toks): i += 1
                    if t in ('systemd-run',) and opt in ('-p', '--unit', '-u', '--property', '--setenv', '-E', '--slice', '--working-directory', '--uid', '--gid', '--nice', '-M', '--machine', '--description') and i < len(toks): i += 1
                    if t in ('bwrap',) and i < len(toks):
                        # bwrap options take 0-2 args; approximate: skip tokens until next '--x' or a non-option command-looking token
                        pass
                    if t in ('flock',) and opt in ('-w', '-E', '-c') and i < len(toks): i += 1
                if t == 'bwrap':
                    # skip until token '--' or until a token that looks like an executable path after options
                    while i < len(toks) and toks[i] != '--' and (toks[i].startswith('-') or toks[i].startswith('/') and i + 1 < len(toks) and toks[i + 1].startswith('/')):
                        i += 1
                    if i < len(toks) and toks[i] == '--': i += 1
                if i < len(toks) and toks[i] == '--': i += 1
            continue
        break
    if i >= len(toks):
        return None, [], wr, asg
    return toks[i], toks[i + 1:], wr, asg


REDIR_RX = re.compile(r'(?<![<>&0-9])(\d?|&)(>>|>\||>)(?!&)\s*("[^"]*"|\'[^\']*\'|[^\s;|&)<>]+)')


def redirections(sc):
    res = []
    # remove quoted segments to avoid matching > inside quotes (python/awk code etc.)
    tmp = re.sub(r"'[^']*'", "''", sc)
    tmp = re.sub(r'"(?:\\.|[^"\\])*"', lambda m: m.group(0) if re.fullmatch(r'"[^"\s]*"', m.group(0)) else '""', tmp)
    for m in REDIR_RX.finditer(tmp):
        tgt = m.group(3).strip('"\'')
        if tgt.startswith('&'):
            continue
        res.append((m.group(1) + m.group(2), tgt))
    return res


def main():
    calls = [json.loads(l) for l in open(os.path.join(OUT, 'calls.jsonl'))]
    prog_hist = collections.Counter()
    prog_examples = collections.defaultdict(list)
    redir = []
    assigns = collections.Counter()
    assign_examples = collections.defaultdict(list)
    heredocs = []
    simple_all = []
    for ci, d in enumerate(calls):
        if d['tool'] not in ('Bash', 'Monitor'):
            continue
        cmd = (d['input'] or {}).get('command') or ''
        stripped, docs = strip_heredocs(cmd)
        for opline, delim, body in docs:
            heredocs.append({'ci': ci, 'ts': d['ts'], 'agent': d['agent'], 'run': d['run'], 'opline': opline, 'delim': delim, 'body': body})
        sc_list = split_simple(stripped, [])
        # handle bash -c / sh -c recursion
        k = 0
        while k < len(sc_list):
            sc = sc_list[k]
            toks = tokens(sc)
            prog, args, wr, asg = program_of(toks)
            if prog in ('bash', 'sh', 'zsh') and '-c' in args:
                j = args.index('-c')
                if j + 1 < len(args):
                    s2, docs2 = strip_heredocs(args[j + 1])
                    sc_list.extend(split_simple(s2, []))
            k += 1
        for sc in sc_list:
            toks = tokens(sc)
            prog, args, wr, asg = program_of(toks)
            for a in asg:
                name = a.split('=', 1)[0]
                assigns[name] += 1
                if len(assign_examples[name]) < 6:
                    assign_examples[name].append((d['ts'], d['agent'], a[:200]))
            if prog is None:
                continue
            p = os.path.basename(prog) if '/' in prog else prog
            prog_hist[p] += 1
            if len(prog_examples[p]) < 400:
                prog_examples[p].append((ci, d['ts'], d['run'], d['agent'], sc[:400]))
            simple_all.append({'ci': ci, 'ts': d['ts'], 'run': d['run'], 'agent': d['agent'], 'prog': p, 'progpath': prog, 'wr': wr, 'sc': sc})
            for op, tgt in redirections(sc):
                redir.append((ci, d['ts'], d['run'], d['agent'], op, tgt, sc[:300]))
    with open(os.path.join(OUT, 'prog_hist.txt'), 'w') as f:
        for p, c in prog_hist.most_common():
            f.write(f'{c:6d} {p}\n')
    with open(os.path.join(OUT, 'simple_cmds.jsonl'), 'w') as f:
        for s in simple_all:
            f.write(json.dumps(s) + '\n')
    with open(os.path.join(OUT, 'redirs.txt'), 'w') as f:
        for r in redir:
            f.write('\t'.join(map(str, r)).replace('\n', ' ') + '\n')
    with open(os.path.join(OUT, 'assigns.txt'), 'w') as f:
        for name, c in assigns.most_common():
            f.write(f'{c:6d} {name}\n')
            for ex in assign_examples[name]:
                f.write(f'        {ex}\n')
    with open(os.path.join(OUT, 'heredocs.jsonl'), 'w') as f:
        for h in heredocs:
            f.write(json.dumps(h) + '\n')
    print('simple cmds', len(simple_all), 'programs', len(prog_hist), 'redirs', len(redir), 'heredocs', len(heredocs))


if __name__ == '__main__':
    main()
