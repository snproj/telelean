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

// test/suite/board.test.ts
var assert2 = __toESM(require("node:assert/strict"));
var vscode2 = __toESM(require("vscode"));

// test/suite/helpers.ts
var assert = __toESM(require("node:assert/strict"));
var vscode = __toESM(require("vscode"));
var EXTENSION_ID = "telelean.telelean";
var BOARD_VIEW_TYPE = "telelean.board";
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
function nextMessage(api, predicate, timeoutMs, label) {
  return nextEvent((listener) => api.onDidReceiveBoardMessage(listener), predicate, timeoutMs, `the webview to post ${label}`);
}
var isRendered = (m) => m.type === "diagnostic" && m.payload.code === "rendered";

// test/suite/board.test.ts
suite("telelean board webview (sample board)", () => {
  let api;
  const seen = [];
  let subscription;
  suiteSetup(async () => {
    api = await getApi();
    await api.testing?.reset();
    subscription = api.onDidReceiveBoardMessage((message) => seen.push(message));
  });
  suiteTeardown(async () => {
    subscription?.dispose();
    await api.testing?.reset();
    await vscode2.commands.executeCommand("workbench.action.closeAllEditors");
  });
  test("openBoard({ sample }) opens the panel; the webview loads under the CSP, posts ready and renders the graph", async function() {
    this.timeout(9e4);
    const ready = nextMessage(api, (m) => m.type === "ready", 6e4, '"ready"');
    const rendered = nextMessage(api, isRendered, 6e4, 'the "rendered" diagnostic');
    await vscode2.commands.executeCommand("telelean.openBoard", { sample: "spyro" });
    const panel = api.boardPanel;
    assert2.ok(panel, "no board panel after the command");
    assert2.equal(panel.viewType, "telelean.board");
    assert2.equal(panel.title, "telelean: sample");
    assert2.deepEqual(await ready, { v: 1, type: "ready", payload: { lastVersion: null } });
    const done = await rendered;
    assert2.ok(done.type === "diagnostic");
    console.log(`      webview reported: ${done.payload.message}`);
    const tabs = vscode2.window.tabGroups.all.flatMap((group) => group.tabs);
    const describe = tabs.map((t) => `${t.label} [${t.input instanceof vscode2.TabInputWebview ? `webview ${t.input.viewType}` : String(t.input?.constructor?.name)}]`);
    const tab = tabs.find((t) => t.input instanceof vscode2.TabInputWebview && t.input.viewType.endsWith(BOARD_VIEW_TYPE));
    assert2.ok(tab, `no webview tab for the board; tabs: ${describe.join("; ")}`);
    assert2.ok(panel.visible, "the board panel is not visible");
    assert2.equal(done.payload.data?.cards, 4, done.payload.message);
    assert2.equal(done.payload.data?.edges, 3, done.payload.message);
    assert2.equal(done.payload.data?.styled, true, done.payload.message);
    await sleep(1e3);
    const violations = seen.filter((m) => m.type === "diagnostic" && m.payload.code === "csp-violation");
    assert2.deepEqual(violations, []);
    assert2.equal(seen.filter((m) => m.type === "diagnostic" && m.payload.level !== "info").length, 0);
  });
  test("running the command again reveals the same panel and sends the new graph to the live webview", async function() {
    this.timeout(6e4);
    const first = api.boardPanel;
    const rendered = nextMessage(api, isRendered, 45e3, 'the "rendered" diagnostic for the large sample');
    await vscode2.commands.executeCommand("telelean.openBoard", { sample: "large" });
    assert2.equal(api.boardPanel, first, "a second panel was created");
    const done = await rendered;
    assert2.ok(done.type === "diagnostic");
    console.log(`      webview reported: ${done.payload.message}`);
    assert2.equal(done.payload.data?.cards, 75, done.payload.message);
    assert2.ok(Number(done.payload.data?.edges) > 0, done.payload.message);
    assert2.ok(Number(done.payload.data?.stubs) > 0, `expected stubs for off-screen ends: ${done.payload.message}`);
  });
  test('a graph sent while the webview is still loading is re-sent on "ready" (the latest graph wins)', async function() {
    this.timeout(9e4);
    api.boardPanel?.dispose();
    const ready = nextMessage(api, (m) => m.type === "ready", 6e4, '"ready" from the new panel');
    const rendered = nextMessage(api, isRendered, 6e4, 'the "rendered" diagnostic');
    await vscode2.commands.executeCommand("telelean.openBoard", { sample: "large" });
    await vscode2.commands.executeCommand("telelean.openBoard", { sample: "spyro-proved" });
    await ready;
    const done = await rendered;
    assert2.ok(done.type === "diagnostic");
    console.log(`      webview reported: ${done.payload.message}`);
    assert2.equal(done.payload.data?.cards, 4, done.payload.message);
    assert2.equal(done.payload.data?.edges, 3, done.payload.message);
  });
  test("the colours the extension contributes reach the webview (workbench.colorCustomizations)", async function() {
    this.timeout(9e4);
    const custom = {
      "telelean.formalizedAura": "#ff00ff",
      "telelean.kindAxiom": "#00ff00",
      "telelean.kindProposition": "#ffff00",
      "telelean.proved": "#00ffff",
      "telelean.vocabulary": "#123456",
      "telelean.highlight": "#654321"
    };
    const expected = {
      aura: "rgb(255, 0, 255)",
      kindA: "rgb(0, 255, 0)",
      kindP: "rgb(255, 255, 0)",
      proved: "rgb(0, 255, 255)",
      vocabulary: "rgb(18, 52, 86)",
      highlight: "rgb(101, 67, 33)"
    };
    const resolved = (m) => {
      const data = m.type === "diagnostic" ? m.payload.data : void 0;
      return { aura: data?.aura, kindA: data?.kindA, kindP: data?.kindP, proved: data?.proved, vocabulary: data?.vocabulary, highlight: data?.highlight };
    };
    const contributed = (vscode2.extensions.getExtension(EXTENSION_ID)?.packageJSON).contributes.colors.map((c) => c.id).sort();
    assert2.deepEqual(contributed, Object.keys(custom).sort());
    const workbench = vscode2.workspace.getConfiguration("workbench");
    await workbench.update("colorCustomizations", custom, vscode2.ConfigurationTarget.Global);
    try {
      const deadline = Date.now() + 2e4;
      let done;
      for (; ; ) {
        api.boardPanel?.dispose();
        const rendered = nextMessage(api, isRendered, 45e3, 'the "rendered" diagnostic');
        await vscode2.commands.executeCommand("telelean.openBoard", { sample: "spyro" });
        done = await rendered;
        if (JSON.stringify(resolved(done)) === JSON.stringify(expected) || Date.now() > deadline) break;
        await sleep(500);
      }
      assert2.ok(done.type === "diagnostic");
      console.log(`      webview reported: ${done.payload.message}; formalised card: ${String(done.payload.data?.cardAura)}`);
      assert2.deepEqual(resolved(done), expected, done.payload.message);
      assert2.match(String(done.payload.data?.cardAura), /rgb\(255, 0, 255\)/, "the formalised card does not use the aura colour");
    } finally {
      await workbench.update("colorCustomizations", void 0, vscode2.ConfigurationTarget.Global);
    }
  });
});
//# sourceMappingURL=board.test.js.map
