/*
 * telelean board: boot script.
 *
 * A classic (non-module) script that the webview HTML loads with the CSP nonce in <head>, BEFORE the stylesheet and
 * the module bundle. Module scripts run only after the whole document is parsed, which is too late to see the
 * Content-Security-Policy violations raised while the document itself loads (a refused stylesheet, say). This script
 * listens from the start and buffers those violations until the bundle connects to the host and calls
 * `window.__teleleanBoot.drain(sink)`; from then on every violation goes straight to the sink.
 *
 * No imports and no build step: Vite copies this file verbatim from packages/webview/public/ to dist/webview/.
 */
(function () {
  'use strict';
  var MAX_BUFFERED = 50;
  var buffered = [];
  var sink = null;

  document.addEventListener('securitypolicyviolation', function (event) {
    var violation = {
      directive: event.effectiveDirective || event.violatedDirective || '',
      blocked: event.blockedURI || '',
      sample: (event.sample || '').slice(0, 120),
      source: event.sourceFile || '',
      line: event.lineNumber || 0,
    };
    if (sink) sink(violation);
    else if (buffered.length < MAX_BUFFERED) buffered.push(violation);
  });

  window.__teleleanBoot = Object.freeze({
    drain: function (next) {
      sink = next;
      var pending = buffered.splice(0);
      for (var i = 0; i < pending.length; i++) next(pending[i]);
    },
  });
})();
