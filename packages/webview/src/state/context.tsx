import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { BoardActions, BoardState, BoardStore } from './store';

const BoardStoreContext = createContext<BoardStore | null>(null);

export function BoardStoreProvider({ store, children }: { store: BoardStore; children: ReactNode }) {
  return <BoardStoreContext.Provider value={store}>{children}</BoardStoreContext.Provider>;
}

export function useBoardStore(): BoardStore {
  const store = useContext(BoardStoreContext);
  if (!store) throw new Error('useBoardStore must be used inside <BoardStoreProvider>');
  return store;
}

/** Subscribes to a slice. The selector must return a stable value (a primitive or an existing object). */
export function useBoard<T>(selector: (state: BoardState) => T): T {
  return useStore(useBoardStore(), selector);
}

/** The actions never change identity, so components can use them without re-rendering. */
export function useBoardActions(): BoardActions {
  return useBoardStore().getState();
}
