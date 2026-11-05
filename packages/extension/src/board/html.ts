/**
 * The board's webview HTML (pure: no vscode import, so it is unit-testable outside VS Code).
 * Strict CSP: only the two nonce'd scripts from the extension's own files run; styles come from the extension's own
 * files too (no inline style attributes, no 'unsafe-inline'); no 'unsafe-eval'.
 *
 * Load order matters: boot.js is a classic script in <head>, before the stylesheet, so its
 * `securitypolicyviolation` listener exists before anything the CSP could refuse is requested. The module bundle runs
 * only after parsing, too late to see a refused stylesheet; it forwards what boot.js buffered.
 */
export interface BoardHtmlArgs {
  /** `webview.cspSource`: the origin the webview serves local resources from. */
  cspSource: string;
  nonce: string;
  /** `webview.asWebviewUri(...)` of dist/webview/boot.js, webview.js and webview.css. */
  bootUri: string;
  scriptUri: string;
  styleUri: string;
}

export function boardCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderBoardHtml(args: BoardHtmlArgs): string {
  const nonce = escapeAttribute(args.nonce);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(boardCsp(args.cspSource, args.nonce))}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>telelean board</title>
<script nonce="${nonce}" src="${escapeAttribute(args.bootUri)}"></script>
<link rel="stylesheet" nonce="${nonce}" href="${escapeAttribute(args.styleUri)}">
</head>
<body>
<div id="root"></div>
<script type="module" nonce="${nonce}" src="${escapeAttribute(args.scriptUri)}"></script>
</body>
</html>
`;
}
