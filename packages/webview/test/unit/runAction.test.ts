import { describe, expect, it, vi } from 'vitest';
import { runBoardAction, type ActionDeps } from '../../src/board/runAction';

// Fixer 2j2 r1 (F-F1): the board's right-click "Decline…" never declines at once: every decline takes an optional note
// for Claude (2j2, D2-92, D2-94), an arrow item's included.
describe('the right-click menu: Decline… on a review item (2j2, D2-92, D2-94)', () => {
  it.each(['add-arrow', 'remove-arrow', 'add-premise'])('a %s item opens its decline menu and declines nothing', (kind) => {
    const actions = { declineItem: vi.fn(), focusItem: vi.fn(), openDeclineMenu: vi.fn() };
    const store = { getState: () => ({ session: { items: [{ id: 'i1', kind }] } }) };
    runBoardAction('decline-item', null, { actions, store, nodes: {} } as unknown as ActionDeps, { item: 'i1' });
    expect(actions.declineItem).not.toHaveBeenCalled();
    expect(actions.focusItem).toHaveBeenCalledWith('i1');
    expect(actions.openDeclineMenu).toHaveBeenCalledWith(['i1'], 'item');
  });
});
