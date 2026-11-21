import { appendFileSync } from 'node:fs';
const say = (...xs: unknown[]) => appendFileSync('/tmp/claude-1000/-home-zhengyew-telelean/20626c17-0334-4498-ad86-9dc24b7010ed/scratchpad/b2e/logs/say.out', xs.map(String).join(' ') + '\n');
import { afterEach, describe, expect, it } from 'vitest';

import { makeHarness, rawRun, START, waitForStage, type Harness } from './helpers/harness.js';
import { decision, main, PG, pgScript, record, RESULT, session, settled } from './helpers/review.js';

const toDispose: Array<() => void> = [];
afterEach(() => {
  for (const d of toDispose.splice(0)) d();
});

describe('explore', () => {
  it('a stage with Formalize(pg) and the Result; then Reject pg', async () => {
    const h: Harness = makeHarness({ script: [pgScript('proved')] });
    toDispose.push(() => h.dispose());
    await h.manager.start(START);
    const v = await waitForStage(h.manager, 1);
    const s = session(h);
    say('ITEMS', JSON.stringify(s.items.map((r) => [r.key, r.kind, r.status, r.rev])));
    say('JUDGED', JSON.stringify(s.judged));
    const view = h.manager.session();
    say('VIEW', JSON.stringify({ shown: view?.results, items: view?.items.map((i) => [i.label, i.status, i.classes, i.dependsOn, i.accept]) }));
    const out = await h.manager.decide(v.runId, 1, true, [decision(h, PG, 'declined', { option: 'reject' })], false);
    say('OUT', JSON.stringify(out));
    await settled(h);
    say('AFTER', JSON.stringify(session(h).items.map((r) => [r.key, r.status, r.redo, r.decline])));
    say('MAIN', await main(h));
    say('COMMITS', JSON.stringify((await h.shadow().commits()).map((c) => [c.kind, c.label])));
    say('STACK', JSON.stringify(session(h).stack));
    say('ENGINE', JSON.stringify(h.engine.methods()));
    const back = await h.manager.decide(v.runId, 1, true, [decision(h, PG, 'in-review')], false);
    say('UNREJECT', JSON.stringify(back));
    await settled(h);
    say('AFTER2', JSON.stringify(session(h).items.map((r) => [r.key, r.status, r.redo, r.decline])));
    say('MAIN2', await main(h));
    expect(record(h, RESULT)).toBeDefined();
    void rawRun;
  });
});
