import { Board } from './board/Board';
import { Dialogs } from './dialogs/Dialogs';
import { Header } from './header/Header';
import { LeanBanner } from './header/LeanStatus';
import { PromptBox } from './prompt/PromptBox';
import { RunElsewhere } from './run/RunBadge';
import { RunPanel } from './run/RunPanel';
import { SessionBar } from './run/SessionBar';
import { Toasts } from './toasts/Toasts';

export function App() {
  return (
    <div className="tl-app">
      <Header />
      <LeanBanner />
      <RunElsewhere />
      {/* Slice 2g: during an edit session the session bar holds its controls (CM-6). Slice 2h retired M2's
          ProposalBanner with the rest of M2's review. */}
      <SessionBar />
      {/* The board and its toasts, with the run panel beside them (below them on a narrow board). Toasts sit at the
          bottom of the board area, never over the panel or the A|P box. Spec v4.1 CM-5 (slice 1e): the tray at the
          bottom is gone; the selection and its actions are in the header's Context Menu section. */}
      <div className="tl-workspace">
        <div className="tl-main">
          <Board />
          <Toasts />
        </div>
        <RunPanel />
      </div>
      <PromptBox />
      <Dialogs />
    </div>
  );
}
