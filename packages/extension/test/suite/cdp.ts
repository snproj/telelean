/**
 * Drives the test instance's real board webview through the Chrome DevTools Protocol, for the end-to-end suite
 * (e2e.test.ts): clicks, typing and mouse drags are trusted input events, so native text selection and HTML5 drag
 * behave exactly as for the user (synthetic DOM events could not show that a drag in the code selects text).
 *
 * scripts/smoke.mjs picks a free local port and .vscode-test.mjs starts the e2e configuration's own isolated test
 * instance with `--remote-debugging-port=<port>` (Chromium binds it to 127.0.0.1; the other suites run in an instance
 * without it); this module connects with the installed playwright-core (`connectOverCDP` only attaches: it launches
 * no browser, and closing it only disconnects). VS Code's own notification toasts are cleared before the board is
 * used (settleStartupToasts, clearWorkbenchToasts): a toast over the board would take the clicks meant for it.
 */
import { chromium, type Browser, type Frame, type Page } from 'playwright-core';
import * as vscode from 'vscode';

import { sleep, waitFor } from './helpers';

/** VS Code's own notification toasts in the workbench (bottom right; they sit over the board and take its clicks). */
const TOASTS = '.notifications-toasts .notification-toast';
/**
 * The toast VS Code 1.140 raises a few seconds after start for `--disable-extensions` ("All installed extensions are
 * temporarily disabled"). It is sticky and urgent, so it stays (even in do-not-disturb mode) over the board's
 * bottom-right corner, where the A|D|G box's Add button is: the test instances get it because .vscode-test.mjs keeps
 * `--disable-extensions` (docs/m1-plan.md section 10).
 */
const EXTENSIONS_DISABLED = /temporarily disabled/;

/** Closes every VS Code notification toast (Clear All Notifications) and waits until none is shown. */
export async function clearWorkbenchToasts(page: Page, timeoutMs = 10_000): Promise<number> {
  const count = await page.locator(TOASTS).count();
  if (count === 0) return 0;
  await vscode.commands.executeCommand('notifications.clearAll');
  await waitFor(async () => (await page.locator(TOASTS).count()) === 0, timeoutMs, "VS Code's notification toasts to close", 100);
  return count;
}

/**
 * Waits (at most `timeoutMs`) for VS Code's startup toast about `--disable-extensions`, then clears the toasts. VS Code
 * shows that toast once per window, at the end of its startup ("eventually" phase, a few seconds after the window
 * opens), so after this it cannot land on the board in the middle of a gesture. Returns whether the toast was seen (a
 * VS Code without it only costs the wait).
 */
export async function settleStartupToasts(page: Page, timeoutMs = 20_000): Promise<boolean> {
  const startup = page.locator(TOASTS).filter({ hasText: EXTENSIONS_DISABLED });
  let seen = true;
  try {
    await startup.first().waitFor({ state: 'attached', timeout: timeoutMs });
  } catch {
    seen = false;
  }
  await clearWorkbenchToasts(page);
  return seen;
}

export interface Workbench {
  browser: Browser;
  page: Page;
}

/** Connects to the test instance's renderer and returns its workbench page. */
export async function connectWorkbench(port: string, timeoutMs = 30_000): Promise<Workbench> {
  const deadline = Date.now() + timeoutMs;
  let browser: Browser | undefined;
  for (;;) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`cannot connect to the test instance on port ${port}: ${String(error)}`);
      await sleep(500);
    }
  }
  for (;;) {
    const page = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes('workbench.html'));
    if (page) return { browser, page };
    if (Date.now() > deadline) throw new Error('the workbench page did not appear');
    await sleep(250);
  }
}

/**
 * The frame that holds the open model board (`.tl-app` with a subject picker), once it exists. The suite keeps a
 * single model board open (the test API's reset() closes the others), so the first such frame is the one.
 */
export async function boardFrame(page: Page, label: string, timeoutMs = 30_000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const frame of page.frames()) {
      if (frame.isDetached() || !frame.url().startsWith('vscode-webview://') || !frame.url().includes('fake.html')) continue;
      try {
        if ((await frame.locator('.tl-app [data-testid="subject-picker"]').count()) > 0) return frame;
      } catch {
        // detached while probing: try the next one
      }
    }
    if (Date.now() > deadline) throw new Error(`no board webview for ${label} appeared`);
    await sleep(250);
  }
}
