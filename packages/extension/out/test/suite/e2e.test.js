"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/import-meta-url.mjs
var import_node_url = require("node:url");
var teleleanImportMetaUrl = (0, import_node_url.pathToFileURL)(__filename).href;

// test/suite/e2e.test.ts
var assert2 = __toESM(require("node:assert/strict"));
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var path = __toESM(require("node:path"));
var import_node_util = require("node:util");
var vscode3 = __toESM(require("vscode"));

// test/suite/cdp.ts
var import_playwright_core = require("playwright-core");
var vscode2 = __toESM(require("vscode"));

// test/suite/helpers.ts
var assert = __toESM(require("node:assert/strict"));
var vscode = __toESM(require("vscode"));
var EXTENSION_ID = "telelean.telelean";
async function getApi() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  return extension.activate();
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function nextEvent(subscribe, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`timed out after ${timeoutMs} ms waiting for ${label}`));
    }, timeoutMs);
    const subscription = subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve(event);
    });
  });
}
function nextBoardMessage(api, root, predicate, timeoutMs, label) {
  return nextEvent(
    (listener) => api.onDidReceiveBoardEvent(listener),
    (event) => event.root === root && predicate(event.message),
    timeoutMs,
    `the board of ${root ?? "the sample"} to post ${label}`
  ).then((event) => event.message);
}
async function waitFor(condition, timeoutMs, label, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    await sleep(intervalMs);
  }
}
var isRendered = (m) => m.type === "diagnostic" && m.payload.code === "rendered";
async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
async function settleEditors(timeoutMs = 5e3) {
  await closeAllEditors();
  await waitFor(() => vscode.window.tabGroups.all.every((group) => group.tabs.length === 0), timeoutMs, "every editor tab to close");
  await sleep(300);
}

// test/suite/cdp.ts
var TOASTS = ".notifications-toasts .notification-toast";
var EXTENSIONS_DISABLED = /temporarily disabled/;
async function clearWorkbenchToasts(page, timeoutMs = 1e4) {
  const count = await page.locator(TOASTS).count();
  if (count === 0) return 0;
  await vscode2.commands.executeCommand("notifications.clearAll");
  await waitFor(async () => await page.locator(TOASTS).count() === 0, timeoutMs, "VS Code's notification toasts to close", 100);
  return count;
}
async function settleStartupToasts(page, timeoutMs = 2e4) {
  const startup = page.locator(TOASTS).filter({ hasText: EXTENSIONS_DISABLED });
  let seen = true;
  try {
    await startup.first().waitFor({ state: "attached", timeout: timeoutMs });
  } catch {
    seen = false;
  }
  await clearWorkbenchToasts(page);
  return seen;
}
async function connectWorkbench(port, timeoutMs = 3e4) {
  const deadline = Date.now() + timeoutMs;
  let browser;
  for (; ; ) {
    try {
      browser = await import_playwright_core.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`cannot connect to the test instance on port ${port}: ${String(error)}`);
      await sleep(500);
    }
  }
  for (; ; ) {
    const page = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes("workbench.html"));
    if (page) return { browser, page };
    if (Date.now() > deadline) throw new Error("the workbench page did not appear");
    await sleep(250);
  }
}
async function boardFrame(page, label, timeoutMs = 3e4) {
  const deadline = Date.now() + timeoutMs;
  for (; ; ) {
    for (const frame of page.frames()) {
      if (frame.isDetached() || !frame.url().startsWith("vscode-webview://") || !frame.url().includes("fake.html")) continue;
      try {
        if (await frame.locator('.tl-app [data-testid="subject-picker"]').count() > 0) return frame;
      } catch {
      }
    }
    if (Date.now() > deadline) throw new Error(`no board webview for ${label} appeared`);
    await sleep(250);
  }
}

// test/suite/e2e.test.ts
var LEAN_TIMEOUT_MS = 24e4;
var UI_TIMEOUT_MS = 3e4;
var E2E_ROOT = process.env.TELELEAN_E2E_ROOT;
var CDP_PORT = process.env.TELELEAN_CDP_PORT;
var FILES = {
  main: "Model/Spyro/Main.lean",
  inbox: "Model/Spyro/Inbox.lean",
  layout: ".telelean/subjects/Spyro/layout.json",
  library: "Model.lean"
};
function git(root, args) {
  const result = (0, import_node_child_process.spawnSync)("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" }
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}
function blockOf(text, id) {
  const match2 = new RegExp(`/-\\n@@ telelean v1\\nid: ${id}\\n[\\s\\S]*?-/`).exec(text);
  assert2.ok(match2, `no block "${id}" in:
${text}`);
  return match2[0];
}
suite("end to end on a copy of mental_model (real workspace, Lean, git, the board UI through CDP)", () => {
  let api;
  let root;
  let wb;
  let latest;
  let latestState;
  let pristine;
  const subscriptions = [];
  const read = (key) => (0, import_node_fs.readFileSync)(path.join(root, FILES[key]), "utf8");
  const snapshot = () => ({ main: read("main"), inbox: read("inbox"), layout: read("layout"), library: read("library") });
  const node = (id) => latest?.subject === "Spyro" ? latest.nodes.find((n) => n.id === id) : void 0;
  const frame = () => {
    assert2.ok(wb, "not connected to the test instance");
    return boardFrame(wb.page, "e2e_model");
  };
  const card = async (id) => (await frame()).locator(`[data-node-id="${id}"]`);
  const undoButton = async () => (await frame()).locator('button.tl-icon-button--toolbar[aria-label="Undo"]');
  const redoButton = async () => (await frame()).locator('button.tl-icon-button--toolbar[aria-label="Redo"]');
  const fresh = () => latest?.subject === "Spyro" && latest.semantic.state === "fresh";
  const expand = async (id) => {
    const chevron = (await card(id)).locator(".tl-card__chevron");
    if (await chevron.getAttribute("aria-expanded") !== "true") await chevron.click();
    await (await card(id)).locator(".tl-details").waitFor({ timeout: UI_TIMEOUT_MS });
  };
  const waitFiles = async (expected, label) => {
    await waitFor(() => Object.entries(expected).every(([key, text]) => read(key) === text), UI_TIMEOUT_MS, label, 100);
  };
  suiteSetup(async function() {
    this.timeout(9e4);
    assert2.ok(E2E_ROOT && CDP_PORT, "TELELEAN_E2E_ROOT and TELELEAN_CDP_PORT are set by scripts/smoke.mjs (run `npm run test:smoke`)");
    root = E2E_ROOT;
    assert2.ok((0, import_node_fs.existsSync)(path.join(root, ".telelean", "config.json")), `${root} is not a copy of mental_model/`);
    assert2.ok(!(0, import_node_fs.existsSync)(path.join(root, ".git")), "the copy must start without a repository");
    pristine = snapshot();
    api = await getApi();
    assert2.ok(api.testing, "the test API (extension mode Test)");
    await api.testing.reset();
    await settleEditors();
    subscriptions.push(
      api.onDidPostToBoard((event) => {
        if (event.root !== root) return;
        if (event.message.type === "graph") latest = event.message.payload.graph;
        if (event.message.type === "workspace") latestState = event.message.payload.state;
      })
    );
    wb = await connectWorkbench(CDP_PORT);
    const seen = await settleStartupToasts(wb.page);
    console.log(`      [e2e] VS Code's startup toast about --disable-extensions ${seen ? "appeared and was cleared" : "did not appear within 20 s"}`);
  });
  setup(async () => {
    if (wb) await clearWorkbenchToasts(wb.page);
  });
  suiteTeardown(async () => {
    for (const subscription of subscriptions) subscription.dispose();
    await wb?.browser.close().catch(() => void 0);
    api?.testing?.answerPrompts({ initGit: void 0 });
    await api?.testing?.reset();
    await closeAllEditors();
  });
  test("Open Board: the graph comes from the files, with Lean statuses", async function() {
    this.timeout(LEAN_TIMEOUT_MS + 6e4);
    const rendered = nextBoardMessage(api, root, isRendered, 6e4, 'the "rendered" diagnostic');
    const result = await vscode3.commands.executeCommand("telelean.openBoard", { root });
    assert2.deepEqual(result, { root, asked: false });
    await rendered;
    await waitFor(fresh, LEAN_TIMEOUT_MS, `fresh Lean facts (now ${latest?.semantic.state}: ${latest?.semantic.detail ?? ""})`, 250);
    assert2.ok(latest);
    assert2.deepEqual(
      latest.nodes.map((n) => [n.id, n.type, n.status.formal, n.status.proof.kind]),
      [
        ["pg-no-dark-past", "AXIOM", "informal", "none"],
        ["cynder-dark-past", "AXIOM", "formalized", "assumed"],
        ["new-spyro-pg", "AXIOM", "formalized", "assumed"],
        // The files say GOAL (spec v4 reads ASSUMPTION, DERIVATION and GOAL as aliases of the two kinds).
        ["cynder-not-good", "PROPOSITION", "formalized", "none"]
      ]
    );
    assert2.equal(node("pg-no-dark-past")?.stance, "rule");
    assert2.equal(latest.vocabulary.length, 9, JSON.stringify(latest.vocabulary.map((v) => v.name)));
    assert2.deepEqual(latest.edges.filter((e) => e.type === "premise").map((e) => e.id).sort(), [
      "premise:cynder-dark-past->cynder-not-good",
      "premise:new-spyro-pg->cynder-not-good",
      "premise:pg-no-dark-past->cynder-not-good"
    ]);
    const f = await frame();
    await waitFor(async () => await f.locator('[data-chip="proof"]').count() >= 3, UI_TIMEOUT_MS, "the status chips");
    assert2.deepEqual(await f.locator("[data-node-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-node-id"))), [
      "pg-no-dark-past",
      "cynder-dark-past",
      "new-spyro-pg",
      "cynder-not-good"
    ]);
    assert2.equal(await (await card("cynder-dark-past")).locator('[data-chip="proof"]').textContent(), "assumed");
    assert2.equal(await (await card("cynder-not-good")).locator('[data-chip="proof"]').textContent(), "unproved");
    assert2.equal(await (await card("pg-no-dark-past")).locator('[data-chip="lean"]').textContent(), "no Lean yet");
    assert2.equal(await (await card("pg-no-dark-past")).getAttribute("data-formal"), "informal");
  });
  test('History dropdown: "Initialize git" creates the repository and starts the history', async function() {
    this.timeout(6e4);
    assert2.ok(api.testing);
    api.testing.answerPrompts({ initGit: true });
    const f = await frame();
    await f.getByTestId("history-button").click();
    await f.getByTestId("history-unavailable").getByRole("button", { name: "Initialize git" }).click();
    await waitFor(() => latestState?.history.state === "ready", UI_TIMEOUT_MS, `history ready (now ${JSON.stringify(latestState?.history)})`);
    api.testing.answerPrompts({ initGit: void 0 });
    assert2.ok((0, import_node_fs.existsSync)(path.join(root, ".git")));
    await wb?.page.keyboard.press("Escape");
    const refs = git(root, ["for-each-ref", "--format=%(refname)"]).stdout.split("\n").filter(Boolean);
    assert2.ok(refs.some((ref) => ref.endsWith("/subjects/Spyro")), `refs: ${refs.join(", ")}`);
  });
  test("the A|P box adds an axiom with stance and why: the block is written to the Inbox", async function() {
    this.timeout(6e4);
    const f = await frame();
    await f.getByRole("radio", { name: "Axiom" }).click();
    await f.getByLabel("New axiom").fill("Cynder can breathe fire");
    await f.getByRole("group", { name: "Stance" }).getByRole("button", { name: "I believe it" }).click();
    await f.getByLabel("Why (optional)").fill("seen in the games");
    await f.getByRole("button", { name: "Add axiom" }).click();
    await waitFor(() => read("inbox").includes("natural_name: Cynder can breathe fire"), UI_TIMEOUT_MS, "the block in Inbox.lean");
    const block = blockOf(read("inbox"), "cynder-can-breathe-fire");
    assert2.match(block, /\ntype: AXIOM\nnatural_name: Cynder can breathe fire\n/);
    assert2.match(block, /\nrationale: seen in the games\n/);
    assert2.match(block, /\nstance: believe\n/);
    assert2.match(block, /\nasserted: \d{4}-\d{2}-\d{2}\n/);
    assert2.equal(read("main"), pristine.main);
    await waitFor(() => node("cynder-can-breathe-fire")?.stance === "believe", UI_TIMEOUT_MS, "the new card in the graph");
    await (await card("cynder-can-breathe-fire")).waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.equal(await (await card("cynder-can-breathe-fire")).getAttribute("data-provisional"), null);
  });
  test("editing a card's sentence rewrites natural_name and the docstring that mirrors it (D-9)", async function() {
    this.timeout(6e4);
    await expand("cynder-dark-past");
    const c = await card("cynder-dark-past");
    await c.locator(".tl-details__actions").getByRole("button", { name: "Edit", exact: true }).click();
    const input = c.getByLabel("Edit the sentence");
    await input.fill("Cynder has a dark past");
    await input.press("Enter");
    await waitFor(() => read("main").includes("natural_name: Cynder has a dark past"), UI_TIMEOUT_MS, "the new natural_name in Main.lean");
    const main = read("main");
    assert2.match(main, /\/-- Cynder has a dark past -\/\nabbrev cynder_dark_past : Prop := HasDarkPast cynder\n/);
    assert2.doesNotMatch(main, /Cynder is a character who has a dark past/);
    await waitFor(() => node("cynder-dark-past")?.naturalName === "Cynder has a dark past", UI_TIMEOUT_MS, "the edited card in the graph");
  });
  let beforeKindChange;
  test('"Move to axioms" on the goal: the D-11 impact, the "why" dialog, the axiom, its arrows removed; Lean then says assumed', async function() {
    this.timeout(LEAN_TIMEOUT_MS + 6e4);
    beforeKindChange = snapshot();
    await expand("cynder-not-good");
    const make = (await card("cynder-not-good")).getByTestId("make-axiom");
    assert2.equal(await make.textContent(), "Move to axioms");
    assert2.equal(
      await make.getAttribute("title"),
      // (a tooltip shows no markup: core's backtick spans arrive as plain text; spec v4 AR-7: the arrows it loses)
      "Move to axioms: adds axiom cynder_not_good.holds. Adds axiom cynder_not_good.holds : cynder_not_good after the statement, so proofs may use it. Its 3 incoming arrows are removed."
    );
    await (await card("cynder-not-good")).locator(".tl-card__text").click({ button: "right" });
    const menu = (await frame()).getByTestId("board-menu");
    await menu.waitFor({ timeout: UI_TIMEOUT_MS });
    await menu.locator('[data-action="move-to-axioms"]').click();
    const dialog = (await frame()).getByTestId("dialog-rationale");
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.match(await dialog.locator(".tl-dialog__detail").textContent() ?? "", /Adds axiom cynder_not_good\.holds : cynder_not_good after the statement/);
    await dialog.getByLabel("Why do you hold it?").fill("too dark for a PG game");
    await dialog.getByTestId("rationale-confirm").click();
    await waitFor(() => /\naxiom cynder_not_good\.holds : cynder_not_good\n/.test(read("main")), UI_TIMEOUT_MS, "the axiom in Main.lean");
    const block = blockOf(read("main"), "cynder-not-good");
    assert2.match(block, /\ntype: AXIOM\n/);
    assert2.match(block, /\nrationale: too dark for a PG game\n/);
    assert2.doesNotMatch(block, /\npremises:/, "AR-7: its incoming arrows are removed");
    await waitFor(
      () => fresh() && node("cynder-not-good")?.type === "AXIOM" && node("cynder-not-good")?.status.proof.kind === "assumed",
      LEAN_TIMEOUT_MS,
      `cynder-not-good assumed after the refresh (now ${node("cynder-not-good")?.type} ${node("cynder-not-good")?.status.proof.kind}, ${latest?.semantic.state})`,
      250
    );
    await waitFor(async () => await (await card("cynder-not-good")).getAttribute("data-kind") === "AXIOM", UI_TIMEOUT_MS, "the card in the AXIOMS column");
  });
  let afterRedo;
  test("Undo restores the files byte-exactly (three steps back to the copy as it was); Redo brings them back", async function() {
    this.timeout(9e4);
    const afterKindChange = snapshot();
    await (await undoButton()).click();
    await waitFiles(beforeKindChange, "Undo of Move to axioms: the files as before it, byte for byte");
    await (await undoButton()).click();
    await waitFiles({ main: pristine.main }, "Undo of the edit: Main.lean as in the copy");
    await (await undoButton()).click();
    await waitFiles(pristine, "Undo of the add: every file as in the copy");
    for (let i = 0; i < 3; i++) {
      await (await redoButton()).click();
      await sleep(300);
    }
    await waitFiles(afterKindChange, "Redo x3: the files as after Move to axioms");
    afterRedo = snapshot();
  });
  test('History lists the snapshots; "Revert to this" restores Initial state byte-exactly, and the revert can be undone', async function() {
    this.timeout(9e4);
    const f = await frame();
    await f.getByTestId("history-button").click();
    const entries = f.getByTestId("history-entry");
    await waitFor(async () => await entries.count() >= 8, UI_TIMEOUT_MS, "the history entries");
    const lines = await entries.locator(".tl-history__line").allTextContents();
    for (const label of ["Initial state", "Add axiom: Cynder can breathe fire", "Edit sentence: Cynder has a dark past", "Move to axioms: Cynder would not be a good addition", "Undo: ", "Redo: "]) {
      assert2.ok(lines.some((line) => line.includes(label)), `no "${label}" entry in:
${lines.join("\n")}`);
    }
    assert2.match(await f.getByTestId("history-storage").textContent() ?? "", /^This subject: .+ · All subjects: .+/);
    await entries.filter({ hasText: "Initial state" }).last().getByRole("button", { name: "Revert to this" }).click();
    const dialog = f.getByTestId("dialog-revert");
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    await dialog.getByRole("button", { name: "Revert", exact: true }).click();
    await waitFiles({ main: pristine.main, inbox: pristine.inbox, layout: pristine.layout }, "the revert: the subject as in the copy, byte for byte");
    await (await undoButton()).click();
    await waitFiles(afterRedo, "Undo of the revert: the files as before it, byte for byte");
    const refs = git(root, ["for-each-ref", "--format=%(refname)"]).stdout.split("\n").filter(Boolean);
    assert2.ok(refs.length > 0 && refs.every((ref) => ref.startsWith("refs/telelean/")), `refs: ${refs.join(", ")}`);
    assert2.notEqual(git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).status, 0, "no commit may land on a branch");
    assert2.equal(git(root, ["ls-files"]).stdout, "", "the index must stay empty");
  });
  test('"New subject\u2026" in the picker: a second subject appears there, and the board can switch back', async function() {
    this.timeout(6e4);
    const f = await frame();
    await f.getByTestId("subject-picker").click();
    const menu = f.getByTestId("subject-menu");
    await menu.getByRole("button", { name: /New subject/ }).click();
    await menu.getByLabel("New subject name").fill("Bayonetta");
    await menu.getByRole("button", { name: "Create" }).click();
    await waitFor(() => latest?.subject === "Bayonetta", UI_TIMEOUT_MS, "the board on subject Bayonetta");
    assert2.ok((0, import_node_fs.existsSync)(path.join(root, "Model", "Bayonetta", "Main.lean")));
    assert2.equal(read("library"), "import Model.Spyro\nimport Model.Bayonetta\n");
    await waitFor(async () => await f.getByTestId("subject-picker").getByTestId("subject").textContent() === "Bayonetta", UI_TIMEOUT_MS, "the picker showing Bayonetta");
    await f.getByTestId("subject-picker").click();
    const items = f.getByTestId("subject-menu").locator("[data-subject]");
    assert2.deepEqual(await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-subject"))), ["Bayonetta", "Spyro"]);
    await f.getByTestId("subject-menu").locator('[data-subject="Spyro"]').click();
    await waitFor(() => latest?.subject === "Spyro", UI_TIMEOUT_MS, "the board back on Spyro");
  });
  test('the card shows the "uses:" vocabulary from Lean, truncated inline, with the full list in its dropdown', async function() {
    this.timeout(LEAN_TIMEOUT_MS + 3e4);
    await waitFor(() => fresh() && (node("cynder-not-good")?.lean.uses?.length ?? 0) > 0, LEAN_TIMEOUT_MS, 'fresh facts with "uses"', 250);
    assert2.deepEqual(node("cynder-dark-past")?.lean.uses, ["Spyro.HasDarkPast", "Spyro.cynder"]);
    assert2.deepEqual(node("cynder-not-good")?.lean.uses, ["Spyro.GoodAddition", "Spyro.cynder", "Spyro.newSpyro"]);
    const dark = await card("cynder-dark-past");
    await waitFor(async () => await dark.locator(".tl-uses__text").count() > 0, UI_TIMEOUT_MS, "the uses line");
    assert2.equal(await dark.locator(".tl-uses__text").textContent(), "uses: HasDarkPast, cynder");
    const goal = await card("cynder-not-good");
    assert2.equal(await goal.locator(".tl-uses__text").textContent(), "uses: GoodAddition, cynder, \u2026");
    assert2.equal(await goal.locator(".tl-uses__toggle").textContent(), "\u25BE 3");
    await goal.locator(".tl-uses__toggle").click();
    const menu = (await frame()).getByTestId("uses-menu");
    await menu.waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.deepEqual(await menu.locator("[data-vocab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-vocab"))), ["Spyro.GoodAddition", "Spyro.cynder", "Spyro.newSpyro"]);
    assert2.match(await menu.locator('[data-vocab="Spyro.cynder"]').textContent() ?? "", /Cynder/);
    await wb?.page.keyboard.press("Escape");
  });
  test("the expanded card's Copy button puts exactly its Lean code on the clipboard", async function() {
    this.timeout(6e4);
    await expand("cynder-dark-past");
    const code = node("cynder-dark-past")?.lean.code;
    assert2.ok(code && /abbrev cynder_dark_past : Prop := HasDarkPast cynder/.test(code), String(code));
    await vscode3.env.clipboard.writeText("(the clipboard before Copy)");
    await (await card("cynder-dark-past")).getByRole("button", { name: "Copy the Lean code" }).click();
    await waitFor(async () => await vscode3.env.clipboard.readText() === code, UI_TIMEOUT_MS, "the Lean code on the clipboard");
  });
  test("hovering an identifier in the expanded code shows its gloss; clicking it highlights it in the Vocabulary group (request 4)", async function() {
    this.timeout(6e4);
    assert2.ok(wb);
    await expand("cynder-dark-past");
    const ref = (await card("cynder-dark-past")).locator('.tl-lean .tl-ref[data-ref="Spyro.HasDarkPast"]');
    await ref.scrollIntoViewIfNeeded();
    await ref.hover();
    const tip = (await frame()).getByTestId("ref-tooltip");
    await tip.waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.match(await tip.textContent() ?? "", /has a dark past/);
    await ref.click();
    const item = (await frame()).locator('.tl-vocab__item[data-vocab="Spyro.HasDarkPast"]');
    await waitFor(async () => await item.getAttribute("data-highlight") === "true", UI_TIMEOUT_MS, "the highlighted vocabulary item");
    assert2.equal(node("cynder-dark-past")?.type, "AXIOM");
    await wb.page.mouse.move(0, 0);
  });
  test("a mouse drag inside the expanded Lean code selects text and never drags the card (request 1)", async function() {
    this.timeout(6e4);
    assert2.ok(wb);
    await expand("cynder-dark-past");
    const f = await frame();
    const code = (await card("cynder-dark-past")).locator(".tl-lean");
    await code.scrollIntoViewIfNeeded();
    const box = await code.boundingBox();
    assert2.ok(box && box.width > 20 && box.height > 10, JSON.stringify(box));
    const column = f.locator('.tl-col[data-kind="AXIOM"] [data-node-id]');
    const orderBefore = await column.evaluateAll((els) => els.map((e) => e.getAttribute("data-node-id")));
    await f.evaluate("window.getSelection()?.removeAllRanges()");
    const sent = [];
    const listening = api.onDidReceiveBoardEvent((event) => {
      if (event.root === root) sent.push(event.message);
    });
    try {
      await wb.page.mouse.move(box.x + 4, box.y + 6);
      await wb.page.mouse.down();
      await wb.page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
      await wb.page.mouse.move(box.x + box.width - 6, box.y + box.height - 4, { steps: 8 });
      assert2.equal(await (await card("cynder-dark-past")).getAttribute("data-dragging"), null, "the card is being dragged");
      await wb.page.mouse.up();
      await sleep(500);
    } finally {
      listening.dispose();
    }
    const selected = String(await f.evaluate("window.getSelection()?.toString() ?? ''"));
    assert2.ok(selected.length > 0, "no text was selected");
    assert2.ok(node("cynder-dark-past")?.lean.code?.includes(selected), `the selection is not code text: ${JSON.stringify(selected)}`);
    const moves = sent.filter((m) => m.type === "reorder" || m.type === "kindChange");
    assert2.deepEqual(moves, [], "the drag posted a move");
    assert2.deepEqual(await column.evaluateAll((els) => els.map((e) => e.getAttribute("data-node-id"))), orderBefore);
    assert2.equal(node("cynder-dark-past")?.type, "AXIOM");
    assert2.equal(await f.locator(".tl-board").getAttribute("data-dragging"), null);
  });
  test('deleting a card with its Lean code while others use it: the dialog lists them, "Delete anyway" deletes what core plans, Undo restores it (D-18)', async function() {
    this.timeout(3 * LEAN_TIMEOUT_MS + 6e4);
    assert2.ok(wb);
    const extra = [
      "",
      "/-",
      "@@ telelean v1",
      "id: dark-lemma",
      "type: PROPOSITION",
      "natural_name: Cynder's dark past is on record",
      "lean: Spyro.dark_lemma",
      "-/",
      "abbrev dark_lemma : Prop := HasDarkPast cynder",
      "theorem dark_lemma.holds : dark_lemma := cynder_dark_past.holds",
      "",
      "theorem helper_lemma : cynder_dark_past := cynder_dark_past.holds",
      ""
    ].join("\n");
    const doc = await vscode3.workspace.openTextDocument(path.join(root, FILES.main));
    const text = doc.getText();
    assert2.match(text, /\nend Spyro\n$/);
    const edit = new vscode3.WorkspaceEdit();
    edit.replace(doc.uri, new vscode3.Range(doc.positionAt(0), doc.positionAt(text.length)), text.replace(/\nend Spyro\n$/, `${extra}
end Spyro
`));
    assert2.ok(await vscode3.workspace.applyEdit(edit));
    assert2.ok(await doc.save());
    const verified = (source, target) => latest?.edges.some((e) => e.type === "verified" && e.source === source && e.target === target) === true;
    await waitFor(
      () => fresh() && node("dark-lemma")?.status.proof.kind === "proved" && verified("cynder-dark-past", "dark-lemma"),
      LEAN_TIMEOUT_MS,
      `dark-lemma proved from cynder-dark-past (now ${node("dark-lemma")?.status.proof.kind}, ${latest?.semantic.state})`,
      250
    );
    const beforeDelete = snapshot();
    await expand("cynder-dark-past");
    await (await card("cynder-dark-past")).locator(".tl-details__actions").getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = (await frame()).getByTestId("dialog-delete");
    await dialog.waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.match(await dialog.getByTestId("delete-proofs").textContent() ?? "", /Cynder's dark past is on record/);
    await dialog.getByRole("button", { name: "Delete card and its Lean code" }).click();
    const breaks = dialog.getByTestId("delete-breaks");
    await breaks.waitFor({ timeout: UI_TIMEOUT_MS });
    assert2.deepEqual(await breaks.locator("li").allTextContents(), ["PCynder's dark past is on record", "Spyro.helper_lemma"]);
    assert2.deepEqual(await breaks.locator("code").allTextContents(), ["Spyro.helper_lemma"]);
    assert2.equal(await dialog.getByTestId("delete-breaks-explanation").textContent(), "These 2 declarations use its Lean code. They stop compiling if the code is deleted:");
    assert2.equal(await (await frame()).getByTestId("toast").filter({ hasText: "stop compiling" }).count(), 0, "the question is not an error toast");
    assert2.equal(snapshot().main, beforeDelete.main, "nothing is deleted before the answer");
    await dialog.getByRole("button", { name: "Delete anyway" }).click();
    await waitFor(() => !read("main").includes("id: cynder-dark-past"), UI_TIMEOUT_MS, "the delete in Main.lean", 100);
    const blockStart = beforeDelete.main.indexOf("/-\n@@ telelean v1\nid: cynder-dark-past\n");
    const axiomLine = "axiom cynder_dark_past.holds : cynder_dark_past\n";
    const blockEnd = beforeDelete.main.indexOf(axiomLine, blockStart) + axiomLine.length;
    assert2.ok(blockStart > 0 && blockEnd > blockStart && beforeDelete.main[blockEnd] === "\n", "the block of cynder-dark-past, as written");
    const premises = "premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past\n";
    const expectedMain = (beforeDelete.main.slice(0, blockStart) + beforeDelete.main.slice(blockEnd + 1)).replace(premises, "premises: new-spyro-pg, pg-no-dark-past\n");
    const layoutBefore = JSON.parse(beforeDelete.layout);
    const expectedLayout = { ...layoutBefore, columns: Object.fromEntries(Object.entries(layoutBefore.columns).map(([k, ids]) => [k, ids.filter((id) => id !== "cynder-dark-past")])) };
    const layoutNow = () => {
      try {
        return JSON.parse(read("layout"));
      } catch {
        return void 0;
      }
    };
    await waitFor(() => read("main") === expectedMain && (0, import_node_util.isDeepStrictEqual)(layoutNow(), expectedLayout), UI_TIMEOUT_MS, "Main.lean and layout.json as core plans the delete", 100).catch(() => void 0);
    const after = snapshot();
    assert2.equal(after.main, expectedMain, "Main.lean as core plans the delete");
    assert2.ok(after.main.includes("theorem dark_lemma.holds : dark_lemma := cynder_dark_past.holds\n") && after.main.includes("theorem helper_lemma : cynder_dark_past := cynder_dark_past.holds\n"));
    assert2.deepEqual(JSON.parse(after.layout), expectedLayout, "layout.json without the card");
    assert2.equal(after.inbox, beforeDelete.inbox);
    assert2.equal(after.library, beforeDelete.library);
    assert2.ok(!(0, import_node_fs.existsSync)(path.join(root, ".telelean", "subjects", "Spyro", "attic", "cynder-dark-past.lean")), "an axiom has no proof to archive");
    await waitFor(() => latest?.subject === "Spyro" && !node("cynder-dark-past"), UI_TIMEOUT_MS, "the card gone from the graph");
    await waitFor(async () => await (await card("cynder-dark-past")).count() === 0, UI_TIMEOUT_MS, "the card gone from the board");
    await (await undoButton()).click();
    await waitFiles(beforeDelete, "Undo of the delete: every file as before it, byte for byte");
    await waitFor(() => node("cynder-dark-past") !== void 0, UI_TIMEOUT_MS, "the card back in the graph");
    await waitFor(
      () => fresh() && node("dark-lemma")?.status.proof.kind === "proved",
      LEAN_TIMEOUT_MS,
      `fresh facts after the undo, dark-lemma proved again (now ${node("dark-lemma")?.status.proof.kind}, ${latest?.semantic.state})`,
      250
    );
  });
});
//# sourceMappingURL=e2e.test.js.map
