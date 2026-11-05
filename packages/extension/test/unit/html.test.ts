import { describe, expect, it } from 'vitest';
import { boardCsp, renderBoardHtml } from '../../src/board/html';

const args = {
  cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
  nonce: 'abc123+/=',
  bootUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/boot.js',
  scriptUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/webview.js',
  styleUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview/webview.css',
};

describe('board webview HTML', () => {
  it('uses a strict nonce CSP without unsafe-inline or unsafe-eval', () => {
    const csp = boardCsp(args.cspSource, args.nonce);
    expect(csp).toBe(
      "default-src 'none'; img-src https://file+.vscode-resource.vscode-cdn.net data:; font-src https://file+.vscode-resource.vscode-cdn.net; " +
        "style-src https://file+.vscode-resource.vscode-cdn.net 'nonce-abc123+/='; script-src 'nonce-abc123+/='",
    );
    expect(csp).not.toMatch(/unsafe/);
  });

  it('loads two nonce-tagged scripts from files, no inline script or style: the classic boot script, then the module bundle', () => {
    const html = renderBoardHtml(args);
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(2);
    const [boot, bundle] = scripts;
    expect(boot?.[0]).toBe(`<script nonce="${args.nonce}" src="${args.bootUri}"></script>`); // classic: no type
    expect(bundle?.[0]).toBe(`<script type="module" nonce="${args.nonce}" src="${args.scriptUri}"></script>`);
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${boardCsp(args.cspSource, args.nonce)}">`);
  });

  it('runs the boot script before the stylesheet is requested, so it sees a refused stylesheet', () => {
    const html = renderBoardHtml(args);
    const csp = html.indexOf('http-equiv="Content-Security-Policy"');
    const boot = html.indexOf(`src="${args.bootUri}"`);
    const style = html.indexOf(`href="${args.styleUri}"`);
    const bundle = html.indexOf(`src="${args.scriptUri}"`);
    expect(csp).toBeGreaterThan(-1);
    expect(boot).toBeGreaterThan(csp);
    expect(style).toBeGreaterThan(boot);
    expect(bundle).toBeGreaterThan(html.indexOf('<div id="root">'));
    expect(html.indexOf('</head>')).toBeGreaterThan(style);
  });

  it('escapes attribute values', () => {
    const html = renderBoardHtml({ ...args, scriptUri: 'x"><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('x&quot;&gt;&lt;script&gt;');
  });
});
