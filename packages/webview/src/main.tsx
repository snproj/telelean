import '@vscode/codicons/dist/codicon.css';
import './styles/board.css';
import { webviewMessage, type TlGraph } from '@telelean/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { currentEngineStats, stylesApplied, themeColors } from './board/diagnostics';
import { connectHost, reportCspViolations, type HostBridge } from './host/bridge';
import { isTextEntry, shortcutFor } from './model/format';
import { BoardStoreProvider } from './state/context';
import { createBoardStore, readSplit, type BoardStore, type PersistedState } from './state/store';

/**
 * Tells the host what is on screen once the edge engine has drawn a frame that measured this graph's cards (the
 * board's `data-graph-seq` names the graph the engine measured) with a real layout. Both can lag the graph by a
 * frame or two: the panel may still be laid out (columns 0 px tall), and if the graph arrives before zustand's React
 * subscriptions attach (they attach in passive effects, after paint), React commits the cards one frame later than
 * the engine's first measure. Gives up after about two seconds of frames and reports whatever is there. A report
 * whose graph has been replaced in the meantime is dropped (the newer graph reports for itself), so a "rendered"
 * message never describes a graph other than the one it names.
 * The report is sent from the frame callback, before the browser paints that frame: "rendered" means laid out and
 * drawn into the DOM, not necessarily visible on screen yet.
 */
function reportRendered(host: HostBridge, graph: TlGraph, seq: number, latestSeq: () => number) {
  const framesAtApply = currentEngineStats()?.frames ?? 0;
  let waited = 0;
  const tick = () => {
    if (latestSeq() !== seq) return;
    const stats = currentEngineStats();
    const settled =
      stats !== null &&
      stats.graphSeq === seq &&
      stats.frames > framesAtApply &&
      stats.minColumnHeight > 0 &&
      stats.cards === graph.nodes.length;
    if (!settled && waited++ < 120) {
      requestAnimationFrame(tick);
      return;
    }
    requestAnimationFrame(() => {
      if (latestSeq() !== seq) return;
      const cards = document.querySelectorAll('[data-node-id]').length;
      const edges = document.querySelectorAll('path[data-edge-id]').length;
      const stubs = document.querySelectorAll('path[data-edge-id][data-stub]').length;
      const lists = [...document.querySelectorAll<HTMLElement>('.tl-col__list')].map((l) => l.clientHeight).join(',');
      const engine = currentEngineStats();
      const styled = stylesApplied();
      const theme = themeColors();
      host.post(
        webviewMessage('diagnostic', {
          level: 'info',
          code: 'rendered',
          message:
            `graph v${graph.version} (#${seq}): ${cards} cards, ${edges} arrows drawn (${stubs} stubs); viewport ${innerWidth}x${innerHeight}, ` +
            `column heights ${lists}, styled ${styled}, ${document.visibilityState}; aura ${theme.aura}, kinds ${theme.kindA} ${theme.kindD} ${theme.kindG}, vocabulary ${theme.vocabulary}, highlight ${theme.highlight}; ` +
            `engine frames ${engine?.frames ?? '-'}, measures ${engine?.measures ?? '-'}, measured graph #${engine?.graphSeq ?? '-'}, ` +
            `culled ${engine?.culled ?? '-'}, missing ${engine?.missing ?? '-'}, cards measured ${engine?.cards ?? '-'}, ` +
            `lists connected ${engine?.listsConnected ?? '-'}, waited ${waited} frames`,
          data: {
            version: graph.version,
            seq,
            cards,
            edges,
            stubs,
            viewport: `${innerWidth}x${innerHeight}`,
            lists,
            styled,
            visibility: document.visibilityState,
            ...theme,
            engineFrames: engine?.frames ?? -1,
            engineMeasures: engine?.measures ?? -1,
            measuredSeq: engine?.graphSeq ?? -1,
            culled: engine?.culled ?? -1,
            missing: engine?.missing ?? -1,
            minColumnHeight: engine?.minColumnHeight ?? -1,
            cardsMeasured: engine?.cards ?? -1,
            waitedFrames: waited,
          },
        }),
      );
    });
  };
  requestAnimationFrame(tick);
}

/** The persisted per-board state, read defensively (the panel serializer or an older build may have written it). */
function readPersisted(host: HostBridge): PersistedState {
  const raw = host.readState();
  return {
    ...(typeof raw.subject === 'string' ? { subject: raw.subject } : {}),
    ...(typeof raw.vocabCollapsed === 'boolean' ? { vocabCollapsed: raw.vocabCollapsed } : {}),
    ...(typeof raw.requestCounter === 'number' && Number.isSafeInteger(raw.requestCounter) && raw.requestCounter >= 0 ? { requestCounter: raw.requestCounter } : {}),
    ...(raw.runSplit !== undefined ? { runSplit: readSplit(raw.runSplit) } : {}),
  };
}

/**
 * Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) on the board post undo/redo, except while typing in a field (the
 * field's own undo applies) or while a dialog is open.
 */
function installShortcuts(store: BoardStore) {
  window.addEventListener('keydown', (event) => {
    const action = shortcutFor(event);
    if (!action || event.repeat) return;
    if (isTextEntry(event.target) || isTextEntry(document.activeElement) || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    if (action === 'undo') store.getState().undo();
    else store.getState().redo();
  });
}

const host = connectHost();
reportCspViolations(host);
const store = createBoardStore(host.post, { persisted: readPersisted(host), persist: (patch) => host.updateState({ ...patch }) });
installShortcuts(store);

host.onMessage((message) => {
  if (message.type === 'graph') {
    if (store.getState().applyGraph(message.payload.graph)) reportRendered(host, message.payload.graph, store.getState().seq, () => store.getState().seq);
    return;
  }
  store.getState().receive(message);
});

const root = document.getElementById('root');
if (!root) throw new Error('telelean: #root element missing');
createRoot(root).render(
  <StrictMode>
    <BoardStoreProvider store={store}>
      <App />
    </BoardStoreProvider>
  </StrictMode>,
);

host.post(webviewMessage('ready', { lastVersion: store.getState().version }));
