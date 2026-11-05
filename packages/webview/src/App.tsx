import { Board } from './board/Board';
import { Dialogs } from './dialogs/Dialogs';
import { Header } from './header/Header';
import { LeanBanner } from './header/LeanStatus';
import { PromptBox } from './prompt/PromptBox';
import { ProposalBanner } from './run/ProposalBanner';
import { RunElsewhere } from './run/RunBadge';
import { RunPanel } from './run/RunPanel';
import { Toasts } from './toasts/Toasts';
import { SelectionTray } from './tray/SelectionTray';

export function App() {
  return (
    <div className="tl-app">
      <Header />
      <LeanBanner />
      <RunElsewhere />
      <ProposalBanner />
      {/* The board and its toasts, with the run panel beside them (below them on a narrow board). Toasts sit at the
          bottom of the board area, never over the panel, the tray or the A|D|G box. */}
      <div className="tl-workspace">
        <div className="tl-main">
          <Board />
          <Toasts />
        </div>
        <RunPanel />
      </div>
      <SelectionTray />
      <PromptBox />
      <Dialogs />
    </div>
  );
}
