/**
 * How VS Code exposes theme colours to a webview, for tests that must use the same names VS Code does.
 */
import { readFileSync } from 'node:fs';

/**
 * The CSS variable VS Code 1.140 defines in a webview for theme colour `id`: "--vscode-" + the id with its FIRST
 * dot replaced by "-". From resources/app/out/vs/workbench/workbench.desktop.main.js of VS Code 1.140.0:
 *   getColors().reduce((f,v)=>{let b=c.getColor(v.id);return b&&(f["vscode-"+v.id.replace(".","-")]=b.toString()),f},{})
 * (`String.prototype.replace` with a string pattern replaces only the first occurrence, so an id with two dots keeps
 * its second dot: telelean.node.formalizedAura would become --vscode-telelean-node.formalizedAura.)
 */
export function vscodeColorVariable(id: string): string {
  return `--vscode-${id.replace('.', '-')}`;
}

export interface ContributedColor {
  id: string;
  description: string;
  defaults: Record<'dark' | 'light' | 'highContrast' | 'highContrastLight', string>;
}

/** `contributes.colors` of the extension manifest (packages/extension/package.json). */
export function contributedColors(): ContributedColor[] {
  const manifest = JSON.parse(readFileSync(new URL('../../../extension/package.json', import.meta.url), 'utf8')) as {
    contributes: { colors: ContributedColor[] };
  };
  return manifest.contributes.colors;
}
