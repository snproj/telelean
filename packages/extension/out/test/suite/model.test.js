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

// test/suite/model.test.ts
var assert2 = __toESM(require("node:assert/strict"));
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var path2 = __toESM(require("node:path"));
var vscode2 = __toESM(require("vscode"));

// test/suite/helpers.ts
var assert = __toESM(require("node:assert/strict"));
var path = __toESM(require("node:path"));
var vscode = __toESM(require("vscode"));
var EXTENSION_ID = "telelean.telelean";
async function getApi() {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is not loaded`);
  return extension.activate();
}
function workspacePaths() {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(folder, "the smoke test needs the scratch workspace folder");
  return {
    ws: folder,
    mental: path.join(folder, "mental_model"),
    second: path.join(folder, "second_model"),
    plain: path.join(folder, "plain_folder"),
    empty: path.join(folder, "empty_folder")
  };
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
function nextPost(api, predicate, timeoutMs, label) {
  return nextEvent((listener) => api.onDidPostToBoard(listener), predicate, timeoutMs, `the host to post ${label}`);
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
function message(type, payload = {}) {
  return { v: 1, type, payload };
}
async function closeAllEditors() {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
async function settleEditors(timeoutMs = 5e3) {
  await closeAllEditors();
  await waitFor(() => vscode.window.tabGroups.all.every((group) => group.tabs.length === 0), timeoutMs, "every editor tab to close");
  await sleep(300);
}
async function closeTextEditors() {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => !(tab.input instanceof vscode.TabInputWebview));
  if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
}

// test/suite/model.test.ts
var LEAN_TIMEOUT_MS = 24e4;
function git(root, args) {
  const result = (0, import_node_child_process.spawnSync)("git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" }
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}
suite("model board on the copied sample (real workspace; AT5.5)", () => {
  let api;
  let root;
  let latest;
  let subscription;
  async function request(type, payload) {
    const requestId = String(payload.requestId);
    const result = nextPost(api, (e) => e.root === root && e.message.type === "actionResult" && e.message.payload.requestId === requestId, LEAN_TIMEOUT_MS, `actionResult ${requestId}`);
    await api.simulateBoardMessage(root, message(type, payload));
    const event = await result;
    assert2.ok(event.message.type === "actionResult");
    return event.message.payload.outcome;
  }
  suiteSetup(async function() {
    this.timeout(3e4);
    api = await getApi();
    await api.testing?.reset();
    await settleEditors();
    root = workspacePaths().mental;
    subscription = api.onDidPostToBoard((e) => {
      if (e.root === root && e.message.type === "graph") latest = e.message.payload.graph;
    });
  });
  suiteTeardown(async () => {
    subscription?.dispose();
    await api?.testing?.reset();
    await closeAllEditors();
  });
  test("Open Board (two roots: asks) shows the 4 Spyro cards", async function() {
    this.timeout(9e4);
    const rendered = nextBoardMessage(api, root, isRendered, 6e4, 'the "rendered" diagnostic');
    const result = await vscode2.commands.executeCommand("telelean.openBoard", { pick: "mental_model" });
    assert2.deepEqual(result, { root, asked: true });
    await waitFor(() => latest?.nodes.length === 4, 3e4, "a graph with 4 cards");
    assert2.deepEqual(latest?.nodes.map((n) => n.id).sort(), ["cynder-dark-past", "cynder-not-good", "new-spyro-pg", "pg-no-dark-past"]);
    const done = await rendered;
    assert2.ok(done.type === "diagnostic");
    assert2.equal(done.payload.data?.cards, 4, done.payload.message);
  });
  test("after a refresh: semantic fresh and 9 vocabulary items", async function() {
    this.timeout(LEAN_TIMEOUT_MS + 1e4);
    await api.simulateBoardMessage(root, message("refresh"));
    await waitFor(() => latest?.semantic.state === "fresh", LEAN_TIMEOUT_MS, `semantic "fresh" (now ${latest?.semantic.state}: ${latest?.semantic.detail ?? ""})`, 500);
    assert2.equal(latest?.vocabulary.length, 9, JSON.stringify(latest?.vocabulary.map((v) => v.name)));
    assert2.equal(latest?.nodes.find((n) => n.id === "cynder-dark-past")?.status.proof.kind, "assumed");
    assert2.equal(latest?.nodes.find((n) => n.id === "cynder-not-good")?.status.proof.kind, "none");
  });
  test("addNode writes a block to Model/Spyro/Inbox.lean; undo removes it", async function() {
    this.timeout(6e4);
    const inbox = path2.join(root, "Model", "Spyro", "Inbox.lean");
    const before = (0, import_node_fs.existsSync)(inbox) ? (0, import_node_fs.readFileSync)(inbox, "utf8") : null;
    const added = await request("addNode", { clientId: "tmp-1", type: "AXIOM", naturalName: "Cynder can fly", requestId: "m-add" });
    assert2.equal(added.ok, true, JSON.stringify(added));
    assert2.match((0, import_node_fs.readFileSync)(inbox, "utf8"), /natural_name: Cynder can fly/);
    await waitFor(() => latest?.nodes.length === 5, 3e4, "a graph with 5 cards");
    const undone = await request("undo", { requestId: "m-undo" });
    assert2.equal(undone.ok, true, JSON.stringify(undone));
    assert2.equal((0, import_node_fs.existsSync)(inbox) ? (0, import_node_fs.readFileSync)(inbox, "utf8") : null, before);
  });
  test('P->A ("Move to axioms") on cynder-not-good adds the axiom and drops its arrows; the refresh shows it assumed', async function() {
    this.timeout(LEAN_TIMEOUT_MS + 3e4);
    const outcome = await request("kindChange", { id: "cynder-not-good", from: "PROPOSITION", to: "AXIOM", beforeId: null, requestId: "m-p2a" });
    assert2.equal(outcome.ok, true, JSON.stringify(outcome));
    const main = (0, import_node_fs.readFileSync)(path2.join(root, "Model", "Spyro", "Main.lean"), "utf8");
    assert2.match(main, /axiom cynder_not_good\.holds/);
    assert2.doesNotMatch(main, /premises: cynder-dark-past, new-spyro-pg, pg-no-dark-past/);
    await waitFor(
      () => {
        const node = latest?.nodes.find((n) => n.id === "cynder-not-good");
        return node?.type === "AXIOM" && node.status.proof.kind === "assumed" && latest?.semantic.state === "fresh";
      },
      LEAN_TIMEOUT_MS,
      "cynder-not-good assumed after the refresh",
      500
    );
  });
  test("copyText puts the code on the clipboard", async function() {
    this.timeout(3e4);
    const code = latest?.nodes.find((n) => n.id === "cynder-dark-past")?.lean.code ?? "abbrev cynder_dark_past : Prop := HasDarkPast cynder";
    await api.simulateBoardMessage(root, message("copyText", { text: code }));
    assert2.equal(await vscode2.env.clipboard.readText(), code);
  });
  test("initGit, historyList, historyPreview (diff editor) and historyRevert work, with private refs only", async function() {
    this.timeout(12e4);
    assert2.ok(api.testing);
    api.testing.answerPrompts({ initGit: true });
    const init = await request("initGit", { requestId: "m-git" });
    api.testing.answerPrompts({ initGit: void 0 });
    assert2.equal(init.ok, true, JSON.stringify(init));
    assert2.ok((0, import_node_fs.existsSync)(path2.join(root, ".git")));
    assert2.equal((await request("editNode", { id: "new-spyro-pg", field: "rationale", value: "announced at a showcase", requestId: "m-edit" })).ok, true);
    const listed = nextPost(api, (e) => e.root === root && e.message.type === "history", 3e4, "the history listing");
    await api.simulateBoardMessage(root, message("historyList", { subject: "Spyro" }));
    const event = await listed;
    assert2.ok(event.message.type === "history");
    const { entries, storage } = event.message.payload.listing;
    assert2.ok(entries.length >= 2, JSON.stringify(entries));
    assert2.ok(storage.subjectBytes > 0 && storage.totalBytes >= storage.subjectBytes, JSON.stringify(storage));
    const newest = entries[0];
    const oldest = entries[entries.length - 1];
    assert2.ok(newest && oldest);
    await api.simulateBoardMessage(root, message("historyPreview", { subject: "Spyro", entryId: newest.id, compare: "parent" }));
    await waitFor(() => vscode2.window.tabGroups.all.flatMap((g) => g.tabs).some((t) => t.label.startsWith("History: ")), 15e3, "the history diff editor");
    const reverted = await request("historyRevert", { subject: "Spyro", entryId: oldest.id, requestId: "m-revert" });
    assert2.equal(reverted.ok, true, JSON.stringify(reverted));
    const undone = await request("undo", { requestId: "m-undo-revert" });
    assert2.equal(undone.ok, true, JSON.stringify(undone));
    const refs = git(root, ["for-each-ref", "--format=%(refname)"]).stdout.split("\n").filter(Boolean);
    assert2.ok(refs.length > 0 && refs.every((ref) => ref.startsWith("refs/telelean/")), `refs: ${refs.join(", ")}`);
    assert2.notEqual(git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).status, 0, "no commit may land on a branch");
    assert2.equal(git(root, ["status", "--porcelain", "--untracked-files=no"]).stdout, "", "the index must stay untouched");
    await closeTextEditors();
  });
  test("openInEditor opens Main.lean", async function() {
    this.timeout(3e4);
    const main = path2.join(root, "Model", "Spyro", "Main.lean");
    await api.simulateBoardMessage(root, message("openInEditor", { file: "Model/Spyro/Main.lean", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } }));
    await waitFor(() => vscode2.window.activeTextEditor?.document.uri.fsPath === main, 15e3, "Main.lean in the active editor");
    await closeTextEditors();
  });
  test(".telelean/graph.json exists", async function() {
    this.timeout(3e4);
    const file = path2.join(root, ".telelean", "graph.json");
    await waitFor(() => (0, import_node_fs.existsSync)(file), 2e4, ".telelean/graph.json");
    const json = JSON.parse((0, import_node_fs.readFileSync)(file, "utf8"));
    assert2.equal(json.format, "telelean-graph");
    assert2.ok(Array.isArray(json.nodes) && json.nodes.length >= 4);
  });
  test("Initialize Model Here on a fresh empty folder (real planInitialize): refuses a bad name, scaffolds, git offer, board (AT5.3)", async function() {
    this.timeout(12e4);
    const fresh = path2.join(workspacePaths().ws, "fresh_model");
    (0, import_node_fs.mkdirSync)(fresh, { recursive: true });
    const invalid = await vscode2.commands.executeCommand("telelean.initializeModel", { folder: fresh, subject: "lower", gitInit: false });
    assert2.equal(invalid?.status, "failed");
    assert2.equal((0, import_node_fs.existsSync)(path2.join(fresh, ".telelean")), false);
    const result = await vscode2.commands.executeCommand("telelean.initializeModel", { folder: fresh, subject: "FreshModel", gitInit: true });
    assert2.ok(result?.status === "initialized", JSON.stringify(result));
    for (const file of ["lakefile.toml", "lean-toolchain", "lake-manifest.json", ".gitignore", "Model.lean", "Model/FreshModel.lean", "Model/FreshModel/Main.lean", ".telelean/config.json", ".telelean/subjects/FreshModel/layout.json"]) {
      assert2.ok((0, import_node_fs.existsSync)(path2.join(fresh, file)), `${file} missing`);
    }
    assert2.equal(result.git, "initialized", JSON.stringify(result));
    assert2.ok((0, import_node_fs.existsSync)(path2.join(fresh, ".git")));
    await waitFor(() => api.boardFor(fresh)?.subject === "FreshModel", 3e4, "the new board on subject FreshModel");
  });
});
//# sourceMappingURL=model.test.js.map
