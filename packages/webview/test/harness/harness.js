/*
 * Static harness for the telelean board bundle. It provides what VS Code and the extension give a webview:
 *  - the --vscode-* theme variables and body classes (approximations of Dark Modern, Light Modern, High Contrast);
 *  - a mock acquireVsCodeApi() that records every posted message in window.__tlHarness.posted;
 *  - getState/setState kept in sessionStorage, so the webview state survives page.reload() as it survives a webview
 *    reload in VS Code;
 *  - a minimal host: "ready" is answered with window.__TL_HARNESS__.workspace (if any) and then .graph; every
 *    mutating message with a requestId gets an actionResult (ok, with outcome.nodeId = clientId for addNode, unless a
 *    queued reply says otherwise); historyList gets the canned listing (.history); copyText gets a "Copied" notice.
 * URL parameter: ?theme=dark|light|hc
 * window.__TL_HARNESS__ (set by the Playwright test before the page loads):
 *   graph       the TlGraph sent after "ready"
 *   workspace   optional WorkspaceState sent after "ready", before the graph
 *   history     optional HistoryListing (default: an empty listing for the graph's subject)
 *   vars        optional extra CSS variables, by full name, applied after the theme's
 *   autoReply   false: no automatic actionResults (the test sends them)
 *   run         optional RunView sent after the graph (M2 `run` message)
 *   session     optional SessionView sent after the run (slice 2g `session` message; 2h retired M2's `proposal`)
 * window.__tlHarness (for the test):
 *   posted                 every message the board posted (JSON copies)
 *   sendToWebview(msg)     delivers a host message
 *   replies                queue of { type, outcome } used, in order, instead of "ok" for the next message of that type
 */
(function () {
  'use strict';

  var common = {
    'font-family': 'system-ui, Ubuntu, "Droid Sans", sans-serif',
    'font-size': '13px',
    'font-weight': 'normal',
    'editor-font-family': '"Droid Sans Mono", "DejaVu Sans Mono", monospace',
    'editor-font-size': '12px',
  };
  var THEMES = {
    dark: {
      kind: 'vscode-dark',
      name: 'Dark Modern',
      vars: {
        foreground: '#cccccc', descriptionForeground: '#9d9d9d', 'editor-background': '#1f1f1f',
        'editorWidget-background': '#252526', 'widget-border': '#313131', 'panel-border': '#2b2b2b', focusBorder: '#0078d4',
        'button-background': '#0078d4', 'button-foreground': '#ffffff', 'button-hoverBackground': '#026ec1',
        'button-secondaryBackground': '#313131', 'button-secondaryForeground': '#cccccc', 'button-secondaryHoverBackground': '#3c3c3c',
        'input-background': '#313131', 'input-foreground': '#cccccc', 'input-border': '#3c3c3c', 'input-placeholderForeground': '#989898',
        'badge-background': '#616161', 'badge-foreground': '#f8f8f8', 'list-activeSelectionBackground': '#04395e',
        'charts-blue': '#3794ff', 'charts-green': '#89d185', 'charts-orange': '#d18616', 'charts-purple': '#b180d7',
        'textCodeBlock-background': '#2b2b2b', 'toolbar-hoverBackground': 'rgba(90, 93, 94, 0.31)',
        'editorWarning-foreground': '#cca700', 'scrollbarSlider-background': 'rgba(121, 121, 121, 0.4)',
        'scrollbarSlider-hoverBackground': 'rgba(100, 100, 100, 0.7)',
        'textLink-foreground': '#4daafc', 'editor-findMatchHighlightBackground': 'rgba(234, 92, 0, 0.33)',
        errorForeground: '#f85149', 'editorInfo-foreground': '#3794ff', 'menu-background': '#1f1f1f', 'menu-border': '#454545',
      },
    },
    light: {
      kind: 'vscode-light',
      name: 'Light Modern',
      vars: {
        foreground: '#3b3b3b', descriptionForeground: '#616161', 'editor-background': '#ffffff',
        'editorWidget-background': '#f8f8f8', 'widget-border': '#e5e5e5', 'panel-border': '#e5e5e5', focusBorder: '#005fb8',
        'button-background': '#005fb8', 'button-foreground': '#ffffff', 'button-hoverBackground': '#0258a8',
        'button-secondaryBackground': '#e5e5e5', 'button-secondaryForeground': '#3b3b3b', 'button-secondaryHoverBackground': '#cccccc',
        'input-background': '#ffffff', 'input-foreground': '#3b3b3b', 'input-border': '#cecece', 'input-placeholderForeground': '#767676',
        'badge-background': '#cccccc', 'badge-foreground': '#3b3b3b', 'list-activeSelectionBackground': '#cce3f7',
        'charts-blue': '#1a85ff', 'charts-green': '#388a34', 'charts-orange': '#d18616', 'charts-purple': '#652d90',
        'textCodeBlock-background': '#f0f0f0', 'toolbar-hoverBackground': 'rgba(184, 184, 184, 0.31)',
        'editorWarning-foreground': '#bf8803', 'scrollbarSlider-background': 'rgba(100, 100, 100, 0.4)',
        'scrollbarSlider-hoverBackground': 'rgba(100, 100, 100, 0.7)',
        'textLink-foreground': '#005fb8', 'editor-findMatchHighlightBackground': 'rgba(234, 92, 0, 0.33)',
        errorForeground: '#f85149', 'editorInfo-foreground': '#1a85ff', 'menu-background': '#ffffff', 'menu-border': '#cecece',
      },
    },
    hc: {
      kind: 'vscode-high-contrast',
      name: 'Dark High Contrast',
      vars: {
        foreground: '#ffffff', descriptionForeground: '#ffffff', 'editor-background': '#000000',
        'editorWidget-background': '#0c141f', 'widget-border': '#6fc3df', 'panel-border': '#6fc3df',
        contrastBorder: '#6fc3df', contrastActiveBorder: '#f38518', focusBorder: '#f38518',
        'button-background': '#000000', 'button-foreground': '#ffffff', 'button-border': '#6fc3df', 'button-hoverBackground': '#000000',
        'button-secondaryBackground': '#000000', 'button-secondaryForeground': '#ffffff', 'button-secondaryHoverBackground': '#000000',
        'input-background': '#000000', 'input-foreground': '#ffffff', 'input-border': '#6fc3df', 'input-placeholderForeground': '#ffffffb3',
        'badge-background': '#000000', 'badge-foreground': '#ffffff', 'list-activeSelectionBackground': '#000000',
        'charts-blue': '#3794ff', 'charts-green': '#89d185', 'charts-orange': '#d18616', 'charts-purple': '#b180d7',
        'textCodeBlock-background': '#000000', 'toolbar-hoverBackground': 'transparent',
        'editorWarning-foreground': '#fff000', 'scrollbarSlider-background': 'rgba(111, 195, 223, 0.6)',
        'scrollbarSlider-hoverBackground': 'rgba(111, 195, 223, 0.8)',
        'textLink-foreground': '#21a6ff', 'editor-findMatchHighlightBackground': 'transparent',
        errorForeground: '#f48771', 'editorInfo-foreground': '#3794ff', 'menu-background': '#000000', 'menu-border': '#6fc3df',
      },
    },
  };

  var MUTATIONS = {
    addNode: true, kindChange: true, theseSuffice: true, editNode: true, deleteNode: true, reorder: true, undo: true, redo: true,
    createSubject: true, historyRevert: true, historyPrune: true, initGit: true,
    // Spec v4 slice 1b: the arrow edits and canvas moves (slice 1e: Formalize's AR-8 marks are claimPending).
    addArrows: true, removeArrows: true, setFromNothing: true, claimPending: true, moveCards: true,
    // M2 run messages that carry a requestId (dismissRun gets no actionResult). Slice 2h: a start is a `formalize`
    // (M2's startRun, acceptProposal, feedback, discardProposal, adoptGhost and rejectGhost are retired).
    formalize: true, answerQuestions: true, cancelRun: true, resumeRun: true,
    // Slice 2g: the edit session's messages the review panel and the session bar post (2h: moveProposed too).
    decideItems: true, revealResult: true, sessionUndo: true, sessionRedo: true, submitReview: true, endSession: true, retryStep: true,
    openSessionDiff: true, moveProposed: true,
  };
  var STATE_KEY = 'tl-harness-webview-state';

  var params = new URLSearchParams(location.search);
  var theme = THEMES[params.get('theme') || 'dark'] || THEMES.dark;
  var config = window.__TL_HARNESS__ || {};
  var style = document.documentElement.style; // CSSOM writes are allowed by the CSP
  var vars = Object.assign({}, common, theme.vars);
  Object.keys(vars).forEach(function (name) {
    style.setProperty('--vscode-' + name, vars[name]);
  });
  var extra = config.vars || {};
  Object.keys(extra).forEach(function (name) {
    style.setProperty(name, extra[name]);
  });
  document.body.classList.add(theme.kind);
  document.body.setAttribute('data-vscode-theme-kind', theme.kind);
  document.body.setAttribute('data-vscode-theme-name', theme.name);

  var posted = [];
  var replies = [];
  var acquired = false;

  function send(message) {
    setTimeout(function () {
      window.postMessage(message, '*');
    }, 0);
  }

  function takeReply(type) {
    for (var i = 0; i < replies.length; i++) {
      if (replies[i].type === type) return replies.splice(i, 1)[0].outcome;
    }
    return null;
  }

  function answer(message) {
    var type = message.type;
    var payload = message.payload || {};
    if (type === 'ready') {
      if (config.workspace) send({ v: 1, type: 'workspace', payload: { state: config.workspace } });
      if (config.graph) send({ v: 1, type: 'graph', payload: { graph: config.graph } });
      if (config.run) send({ v: 1, type: 'run', payload: { run: config.run } });
      if (config.session) send({ v: 1, type: 'session', payload: { session: config.session } });
      return;
    }
    if (type === 'historyList') {
      var listing = config.history || {
        subject: payload.subject,
        entries: [],
        storage: { subjectBytes: 0, totalBytes: 0, perSubject: {} },
        more: false,
      };
      send({ v: 1, type: 'history', payload: { listing: listing } });
      return;
    }
    if (type === 'copyText') {
      send({ v: 1, type: 'notice', payload: { id: 'copied', level: 'info', text: 'Copied the Lean code to the clipboard.', undoable: false } });
      return;
    }
    if (MUTATIONS[type] && payload.requestId && config.autoReply !== false) {
      var outcome = takeReply(type) || { ok: true, label: type + ' done', undoable: true };
      if (outcome.ok && type === 'addNode' && outcome.nodeId === undefined) outcome = Object.assign({}, outcome, { nodeId: payload.clientId });
      send({ v: 1, type: 'actionResult', payload: { requestId: payload.requestId, outcome: outcome } });
    }
  }

  window.__tlHarness = {
    posted: posted,
    replies: replies,
    sendToWebview: function (message) {
      window.postMessage(message, '*');
    },
  };
  window.acquireVsCodeApi = function () {
    if (acquired) throw new Error('An instance of the VS Code API has already been acquired');
    acquired = true;
    return Object.freeze({
      postMessage: function (message) {
        var copy = JSON.parse(JSON.stringify(message)); // the real channel clones too
        posted.push(copy);
        if (copy && typeof copy.type === 'string') answer(copy);
      },
      getState: function () {
        var raw = sessionStorage.getItem(STATE_KEY);
        return raw === null ? undefined : JSON.parse(raw);
      },
      setState: function (next) {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
        return next;
      },
    });
  };
})();
