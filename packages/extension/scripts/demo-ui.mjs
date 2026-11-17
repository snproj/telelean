// The demo driver's hands and eyes (scripts/demo-driver.mjs; docs/DEMO.md): VS Code's workbench and the telelean
// board, driven through the DevTools protocol with playwright-core, as the end-to-end suites do from inside VS Code
// (test/suite/cdp.ts, e2e-runs.test.ts): clicks and typing are trusted input events in the real webview. The driver
// runs outside VS Code, so the workbench is driven like a user does it too: the command palette, quick picks, input
// boxes, and VS Code's own dialogs (the instance's settings draw them in the page: window.dialogStyle = custom).
//
// VS Code's notification toasts sit over the board's bottom-right corner (the A|D|G box and the tray's buttons) and
// would take clicks meant for the board (a click in the webview lands on whatever is on top in the page), so they
// are recorded and closed before every board gesture.
//
// Not a script to run: scripts/demo-driver.mjs imports it.
import path from 'node:path';

import { chromium } from 'playwright-core';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `condition` until it returns a truthy value (returned) or `timeoutMs` passes (throws, naming `label`). */
export async function waitFor(condition, timeoutMs, label, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      const value = await condition();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)} s waiting for ${label}${lastError ? ` (last error: ${lastError.message})` : ''}`);
    await sleep(intervalMs);
  }
}

/** Connects to the instance's DevTools endpoint (attaching only: closing the Browser disconnects) and finds its workbench. */
export async function connectWorkbench(port, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let browser;
  for (;;) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`cannot connect to VS Code's DevTools endpoint on port ${port}: ${error.message}`);
      await sleep(500);
    }
  }
  const page = await waitFor(
    () => browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes('workbench.html')),
    Math.max(1_000, deadline - Date.now()),
    "VS Code's workbench page",
  );
  return { browser, page };
}

const TOASTS = '.notifications-toasts .notification-toast';
const KIND_NOUN = { ASSUMPTION: 'Assumption', DERIVATION: 'Derivation', GOAL: 'Goal' };

/**
 * The text of the first element `locator` matches, '' when there is none. (Playwright's own textContent() waits up to
 * its default 30 s for an element that is not there.)
 */
async function textOf(locator) {
  if ((await locator.count()) === 0) return '';
  return ((await locator.first().textContent({ timeout: 2_000 }).catch(() => '')) ?? '').trim();
}

/** An attribute of the first element `locator` matches, null when there is none (no waiting, see textOf). */
async function attrOf(locator, name) {
  if ((await locator.count()) === 0) return null;
  return locator.first().getAttribute(name, { timeout: 2_000 }).catch(() => null);
}

export class Workbench {
  /**
   * @param {import('playwright-core').Page} page
   * @param {{ screenshots: string, log: (message: string) => void }} options
   */
  constructor(page, { screenshots, log }) {
    this.page = page;
    this.screenshots = screenshots;
    this.log = log;
    /** Every VS Code notification seen (text), in order. */
    this.notifications = [];
    /** Screenshots taken: { name, file, at }. */
    this.shots = [];
  }

  async ready(timeoutMs = 60_000) {
    await this.page.locator('.monaco-workbench').waitFor({ timeout: timeoutMs });
    await this.page.locator('.part.statusbar').waitFor({ timeout: timeoutMs });
  }

  /** Window and page size (for the summary). */
  async size() {
    return this.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight, screen: `${screen.width}x${screen.height}` }));
  }

  async shot(name) {
    const file = path.join(this.screenshots, `${String(this.shots.length + 1).padStart(2, '0')}-${name}.png`);
    try {
      await this.page.screenshot({ path: file });
      this.shots.push({ name, file, at: new Date().toISOString() });
    } catch (error) {
      this.log(`screenshot ${name} failed: ${error.message}`);
    }
    return file;
  }

  async toastTexts() {
    return this.page.locator(`${TOASTS} .notification-list-item-message`).allTextContents();
  }

  /** Records VS Code's notification toasts and closes them (Notifications: Clear All Notifications). */
  async clearToasts() {
    const texts = await this.toastTexts().catch(() => []);
    if (texts.length === 0) return [];
    for (const text of texts) {
      if (!this.notifications.includes(text)) {
        this.notifications.push(text);
        this.log(`VS Code says: ${text}`);
      }
    }
    await this.command('Notifications: Clear All Notifications');
    await waitFor(async () => (await this.page.locator(TOASTS).count()) === 0, 10_000, "VS Code's notification toasts to close");
    return texts;
  }

  async quickInputOpen() {
    return this.page.locator('.quick-input-widget').isVisible();
  }

  /** Runs a command from the palette by its title ("telelean: Initialize Model Here"). */
  async command(title, timeoutMs = 20_000) {
    if (await this.quickInputOpen()) await this.page.keyboard.press('Escape');
    const widget = this.page.locator('.quick-input-widget');
    for (const key of ['F1', 'Control+Shift+P']) {
      await this.page.keyboard.press(key);
      try {
        await widget.waitFor({ state: 'visible', timeout: 5_000 });
        break;
      } catch {
        // focus was somewhere that ate the key: try the other binding
      }
    }
    await widget.waitFor({ state: 'visible', timeout: timeoutMs });
    await this.page.keyboard.type(title);
    const index = await waitFor(
      async () => {
        const labels = await widget.locator('.monaco-list-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));
        const i = labels.findIndex((label) => label === title || label.startsWith(`${title},`) || label.startsWith(`${title} `));
        return i >= 0 ? i + 1 : 0;
      },
      timeoutMs,
      `"${title}" in the command palette`,
    );
    await widget.locator('.monaco-list-row').nth(index - 1).click();
  }

  /** Picks the quick-pick row whose label starts with `label`; returns the rows offered. */
  async pick(label, timeoutMs = 30_000) {
    const widget = this.page.locator('.quick-input-widget');
    await widget.waitFor({ state: 'visible', timeout: timeoutMs });
    let offered = [];
    const index = await waitFor(
      async () => {
        offered = await widget.locator('.monaco-list-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));
        const i = offered.findIndex((row) => row === label || row.startsWith(`${label},`) || row.startsWith(label));
        return i >= 0 ? i + 1 : 0;
      },
      timeoutMs,
      `"${label}" in the quick pick`,
    );
    await widget.locator('.monaco-list-row').nth(index - 1).click();
    return offered;
  }

  /** Answers the open input box with `value` (replacing its suggestion); returns { title, suggested }. */
  async inputBox(value, timeoutMs = 30_000) {
    const widget = this.page.locator('.quick-input-widget');
    await widget.waitFor({ state: 'visible', timeout: timeoutMs });
    const box = widget.locator('.quick-input-box input');
    const input = (await box.count()) > 0 ? box.first() : widget.locator('input').first();
    await input.waitFor({ timeout: timeoutMs });
    const title = await textOf(widget.locator('.quick-input-title'));
    const suggested = await input.inputValue();
    await input.fill(value);
    await input.press('Enter');
    await waitFor(async () => !(await this.quickInputOpen()), timeoutMs, 'the input box to close');
    return { title, suggested };
  }

  /** The open VS Code dialog (custom style), or undefined. */
  async dialog() {
    const box = this.page.locator('.monaco-dialog-box');
    if ((await box.count()) === 0 || !(await box.first().isVisible())) return undefined;
    return {
      message: await textOf(box.locator('.dialog-message-text')),
      detail: await textOf(box.locator('.dialog-message-detail')),
      buttons: (await box.locator('.dialog-buttons .monaco-button').allTextContents()).map((b) => b.trim()),
    };
  }

  /** Waits for a dialog whose message matches `message`, clicks `button`, and returns the dialog as it was shown. */
  async answerDialog(message, button, timeoutMs = 60_000) {
    const shown = await waitFor(async () => {
      const d = await this.dialog();
      return d && message.test(d.message) ? d : undefined;
    }, timeoutMs, `the dialog "${message.source}"`);
    const box = this.page.locator('.monaco-dialog-box');
    await box.getByRole('button', { name: button, exact: true }).click();
    await waitFor(async () => (await this.dialog()) === undefined, 15_000, 'the dialog to close');
    return shown;
  }
}

/** The telelean board in its webview. */
export class Board {
  /** @param {Workbench} wb */
  constructor(wb) {
    this.wb = wb;
    this.page = wb.page;
    /** @type {import('playwright-core').Frame | undefined} */
    this.cached = undefined;
  }

  /** The frame of the board webview (`.tl-app` with its subject picker); re-found when VS Code reloaded it. */
  async frame(timeoutMs = 60_000) {
    if (this.cached && !this.cached.isDetached()) return this.cached;
    this.cached = await waitFor(
      async () => {
        for (const frame of this.page.frames()) {
          if (frame.isDetached() || !frame.url().startsWith('vscode-webview://') || !frame.url().includes('fake.html')) continue;
          try {
            if ((await frame.locator('.tl-app [data-testid="subject-picker"]').count()) > 0) return frame;
          } catch {
            // detached while probing
          }
        }
        return undefined;
      },
      timeoutMs,
      'the telelean board',
    );
    return this.cached;
  }

  async subject() {
    return textOf((await this.frame()).getByTestId('subject-picker').getByTestId('subject'));
  }

  /** The Lean badge's state (fresh, checking, stale, failed, unavailable, paused-low-memory, …). */
  async lean() {
    const badge = (await this.frame()).getByTestId('lean-badge');
    return { state: await attrOf(badge, 'data-state'), text: await textOf(badge) };
  }

  async waitLean(states, timeoutMs, label) {
    return waitFor(async () => {
      const lean = await this.lean();
      return states.includes(lean.state) ? lean : undefined;
    }, timeoutMs, label ?? `Lean ${states.join(' or ')}`);
  }

  /** The cards the board shows (the current view, or the proposed one while it is on). */
  async cards() {
    const f = await this.frame();
    return f.locator('[data-node-id]').evaluateAll((els) =>
      els.map((el) => {
        const text = el.querySelector('.tl-card__text');
        return {
          id: el.getAttribute('data-node-id'),
          kind: el.getAttribute('data-kind'),
          formal: el.getAttribute('data-formal'),
          text: (text?.firstChild?.textContent ?? '').trim(),
          wordedBy: text?.getAttribute('data-provenance') === 'agent' ? 'agent' : 'user',
          provisional: el.hasAttribute('data-provisional'),
          selected: el.hasAttribute('data-selected'),
          diff: el.getAttribute('data-diff') ?? undefined,
          chips: [...el.querySelectorAll('[data-chip]')].map((chip) => ({ chip: chip.getAttribute('data-chip'), text: (chip.textContent ?? '').trim() })),
          attention: el.querySelector('[data-testid="attention"]')?.getAttribute('title') ?? undefined,
        };
      }),
    );
  }

  /** Types a card into the A|D|G box and adds it; resolves with its id once the extension wrote it. */
  async addCard(kind, text, timeoutMs = 60_000) {
    await this.wb.clearToasts();
    const f = await this.frame();
    const noun = KIND_NOUN[kind];
    await f.getByRole('radio', { name: noun, exact: true }).click();
    await f.getByLabel(`New ${noun.toLowerCase()}`, { exact: true }).fill(text);
    await f.getByRole('button', { name: `Add ${noun.toLowerCase()}`, exact: true }).click();
    return waitFor(
      async () => {
        const card = (await this.cards()).find((c) => c.text === text && c.kind === kind && !c.provisional);
        return card?.id;
      },
      timeoutMs,
      `the ${noun.toLowerCase()} "${text}" on the board`,
    );
  }

  /** Selects exactly `ids` (a plain click replaces the selection, Ctrl+click adds). */
  async select(ids, timeoutMs = 30_000) {
    await this.wb.clearToasts();
    const f = await this.frame();
    for (const [i, id] of ids.entries()) {
      const card = f.locator(`[data-node-id="${id}"]`);
      await card.waitFor({ timeout: timeoutMs });
      await card.scrollIntoViewIfNeeded();
      await card.locator('.tl-card__text').click(i === 0 ? {} : { modifiers: ['ControlOrMeta'] });
    }
    await waitFor(async () => (await textOf(f.getByTestId('tray-count'))).startsWith(`${ids.length} selected`), timeoutMs, `${ids.length} cards selected`);
  }

  async tray() {
    const f = await this.frame();
    const button = f.getByTestId('tray-these-suffice');
    return {
      count: await textOf(f.getByTestId('tray-count')),
      target: await textOf(f.getByTestId('tray-target').locator('.tl-chipcard__text')),
      premises: (await f.locator('.tl-chipcard[data-role="premise"] .tl-chipcard__text').allTextContents()).map((t) => t.trim()),
      blocked: (await f.getByTestId('tray-blocked').allTextContents()).join(' ').trim(),
      replaces: await textOf(f.getByTestId('tray-replaces')),
      enabled: (await button.count()) > 0 && (await button.isEnabled()),
    };
  }

  /** Presses "These suffice ▶" once it can be pressed. */
  async theseSuffice(timeoutMs = 60_000) {
    await this.wb.clearToasts();
    const f = await this.frame();
    const button = f.getByTestId('tray-these-suffice');
    await waitFor(async () => (await button.count()) > 0 && (await button.isEnabled()), timeoutMs, '"These suffice" to be enabled');
    await button.click();
  }

  /** The board's own toasts (refusals, "Run started", ...). */
  async boardToasts() {
    const f = await this.frame();
    return (await f.getByTestId('toast').allTextContents()).map((t) => t.trim());
  }

  /** Opens the run panel when it is closed (the header's Claude badge). */
  async ensureRunPanel() {
    const f = await this.frame();
    if ((await f.getByTestId('run-panel').count()) > 0) return;
    const badge = f.getByTestId('run-badge');
    if ((await badge.count()) > 0) await badge.click();
    await f.getByTestId('run-panel').waitFor({ timeout: 15_000 });
  }

  /** What the run panel shows: its state, the status line and the backend line. */
  async runPanel() {
    const f = await this.frame();
    const panel = f.getByTestId('run-panel');
    if ((await panel.count()) === 0) return undefined;
    return {
      state: await attrOf(panel, 'data-state'),
      stage: await attrOf(panel, 'data-stage'),
      label: await textOf(panel.getByTestId('run-state')),
      stats: await panel.getByTestId('run-stats').locator('[data-part]').evaluateAll((els) => els.map((el) => ({ part: el.getAttribute('data-part'), text: (el.textContent ?? '').trim(), title: el.getAttribute('title') ?? undefined }))),
      backend: await textOf(panel.getByTestId('run-backend')),
      error: (await textOf(panel.getByTestId('run-error'))) || undefined,
    };
  }

  /**
   * Answers the question set `setId` on the board: `answers[i]` is { kind: 'option', option } | { kind: 'free-text',
   * text } | { kind: 'leave-open' } | { kind: 'decide-for-me' }, with an optional scope (run, nodes, subject); then
   * presses Send.
   */
  async answerQuestions(setId, answers, beforeSend) {
    await this.wb.clearToasts();
    await this.ensureRunPanel();
    const f = await this.frame();
    const set = f.locator(`[data-testid="question-set"][data-set-id="${setId}"]`);
    await set.waitFor({ timeout: 60_000 });
    await set.scrollIntoViewIfNeeded();
    const questions = set.getByTestId('question');
    const count = await questions.count();
    for (let i = 0; i < count; i++) {
      const q = questions.nth(i);
      const answer = answers[i] ?? { kind: 'option', option: 0 };
      if (answer.kind === 'option') await q.getByTestId('option').nth(answer.option).click();
      else if (answer.kind === 'free-text') {
        await q.getByTestId('option-free-text').click();
        await q.getByTestId('free-text').fill(answer.text);
      } else if (answer.kind === 'leave-open') await q.getByTestId('option-leave-open').click();
      else await q.getByTestId('option-decide-for-me').click();
      if (answer.scope && answer.scope !== 'run') await q.locator(`.tl-scope[data-scope="${answer.scope}"] input`).check();
    }
    if (beforeSend) await beforeSend();
    const send = set.getByTestId('send-answers');
    await waitFor(() => send.isEnabled(), 15_000, '"Send" to be enabled');
    await send.click();
  }

  /**
   * Steps through the review like a reader: every step in order (statements, vocabulary, definitions, result,
   * card changes), "Show result" when the result is still hidden, a yes for each definition question when
   * `approveDefinitions`. Calls `onStep(kind, index)` on each step (screenshots). Returns each step's text.
   */
  async readReview({ approveDefinitions, onStep }) {
    await this.wb.clearToasts();
    await this.ensureRunPanel();
    const f = await this.frame();
    const review = f.getByTestId('review');
    await review.waitFor({ timeout: 60_000 });
    const kinds = await review.locator('.tl-review__step').evaluateAll((els) => els.map((el) => el.getAttribute('data-step-kind')));
    const steps = [];
    const definitions = [];
    for (let i = 0; i < kinds.length; i++) {
      await review.locator('.tl-review__step').nth(i).click();
      const body = review.getByTestId('review-step');
      await waitFor(async () => (await body.getAttribute('data-step')) === kinds[i], 10_000, `review step ${i + 1} (${kinds[i]})`);
      if (kinds[i] === 'definitions') {
        const items = body.getByTestId('definition');
        for (let d = 0; d < (await items.count()); d++) {
          const item = items.nth(d);
          definitions.push(((await item.textContent()) ?? '').trim().slice(0, 400));
          if (approveDefinitions) await item.getByTestId('definition-yes').click();
        }
      }
      if (kinds[i] === 'result' && (await body.getByTestId('result-hidden').count()) > 0) {
        await body.getByTestId('result-hidden').getByRole('button', { name: 'Show result' }).click();
        await body.getByTestId('report-card').waitFor({ timeout: 10_000 });
      }
      await body.scrollIntoViewIfNeeded();
      steps.push({ kind: kinds[i], text: ((await body.innerText()) ?? '').trim() });
      if (onStep) await onStep(kinds[i], i);
    }
    const verdict = await attrOf(review.getByTestId('report-verdict'), 'data-verdict');
    return { steps, definitions, verdict };
  }

  async accept(timeoutMs = 30_000) {
    await this.wb.clearToasts();
    const f = await this.frame();
    const inReview = f.getByTestId('review').getByTestId('accept');
    const button = (await inReview.count()) > 0 ? inReview : f.getByTestId('banner-accept');
    await waitFor(() => button.isEnabled(), timeoutMs, 'Accept to be enabled');
    await button.click();
  }

  async discard(timeoutMs = 30_000) {
    await this.wb.clearToasts();
    const f = await this.frame();
    const inReview = f.getByTestId('review').getByTestId('discard');
    const button = (await inReview.count()) > 0 ? inReview : f.getByTestId('banner-discard');
    await waitFor(() => button.isEnabled(), timeoutMs, 'Discard to be enabled');
    await button.click();
  }

  async cancelRun() {
    await this.ensureRunPanel();
    await (await this.frame()).getByTestId('run-panel').getByTestId('cancel-run').click();
  }

  /** "I hold this" on Claude's suggested premise `ghostId`, with `reason` (the card on the board, else the review's). */
  async adoptGhost(ghostId, reason) {
    await this.wb.clearToasts();
    const f = await this.frame();
    let ghost = f.locator(`[data-ghost-id="${ghostId}"][data-variant="board"]`);
    if ((await ghost.count()) === 0) ghost = f.locator(`[data-ghost-id="${ghostId}"]`).first();
    await ghost.scrollIntoViewIfNeeded();
    await ghost.getByRole('button', { name: 'I hold this' }).click();
    const why = ghost.getByRole('textbox', { name: 'Why do you hold it? (optional)' });
    await why.fill(reason);
    await why.press('Enter');
  }

  /** Whether the board shows the proposal's overlay (the Proposed view). */
  async proposedView() {
    return (await (await this.frame()).locator('.tl-board[data-view="proposed"]').count()) > 0;
  }
}
