import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CONTEXT_SCOPES, EFFORTS, RUN_SETTING_BOUNDS, SETTING_DEFAULTS } from '../../src/logic/settings';

interface Manifest {
  main: string;
  activationEvents: string[];
  capabilities: { untrustedWorkspaces: { supported: boolean }; virtualWorkspaces: boolean };
  contributes: {
    commands: Array<{ command: string; title: string; category?: string }>;
    menus: Record<string, Array<{ command: string; when?: string }>>;
    configuration: {
      properties: Record<
        string,
        { type: string; default: unknown; scope?: string; minimum?: number; maximum?: number; enum?: string[]; markdownDescription?: string }
      >;
    };
    colors: Array<{ id: string; description: string; defaults: Record<string, string> }>;
  };
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as Manifest;

describe('package.json (AT5.2)', () => {
  it('contributes the three commands', () => {
    expect(manifest.contributes.commands.map((c) => [c.command, c.title, c.category])).toEqual([
      ['telelean.openBoard', 'Open Board', 'telelean'],
      ['telelean.initializeModel', 'Initialize Model Here', 'telelean'],
      ['telelean.refresh', 'Refresh Lean Check', 'telelean'],
    ]);
    expect(manifest.contributes.menus['explorer/context']).toEqual([
      { command: 'telelean.initializeModel', when: 'explorerResourceIsFolder', group: 'telelean@1' },
    ]);
  });

  it('activates on opted-in folders and on a restored board only', () => {
    expect(manifest.activationEvents).toEqual(['workspaceContains:**/.telelean/config.json', 'onWebviewPanel:telelean.board']);
    expect(manifest.main).toBe('./dist/extension.js');
  });

  it('refuses untrusted and virtual workspaces', () => {
    expect(manifest.capabilities.untrustedWorkspaces.supported).toBe(false);
    expect(manifest.capabilities.virtualWorkspaces).toBe(false);
  });

  it('declares the settings with their defaults (the same defaults the host falls back to)', () => {
    const properties = manifest.contributes.configuration.properties;
    const declared = Object.fromEntries(Object.entries(properties).map(([key, p]) => [key, p.default]));
    expect(declared).toEqual({
      'telelean.memory.capGiB': 4,
      'telelean.memory.minAvailableGiB': 2,
      'telelean.refresh.enabled': true,
      'telelean.refresh.debounceMs': 750,
      'telelean.git.snapshotRefs': true,
      'telelean.git.path': 'git',
      // M2 (docs/m2-plan.md section 8.3)
      'telelean.model': 'claude-opus-5-5',
      'telelean.effort': 'high',
      'telelean.claude.path': '',
      'telelean.run.maxTurns': 80,
      'telelean.run.maxChecks': 25,
      'telelean.run.maxAgentMinutes': 20,
      'telelean.run.leanJobSeconds': 120,
      'telelean.run.maxGateAttempts': 3,
      'telelean.run.keepRuns': 10,
      'telelean.run.contextScope': 'subject',
      'telelean.run.reuseLeanBuild': false,
    });
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) expect(declared[`telelean.${key}`], key).toBe(value);
    expect(properties['telelean.git.path']?.scope).toBe('machine'); // an executable path never comes from a workspace
  });

  it('M2: the run settings have the plan\'s scopes, enums and the bounds the host clamps to (AT5.3)', () => {
    const properties = manifest.contributes.configuration.properties;
    const scopes = Object.fromEntries(
      ['model', 'effort', 'claude.path', ...Object.keys(RUN_SETTING_BOUNDS), 'run.contextScope', 'run.reuseLeanBuild'].map((key) => [key, properties[`telelean.${key}`]?.scope]),
    );
    expect(scopes).toEqual({
      model: 'resource',
      effort: 'resource',
      'claude.path': 'machine', // an executable path never comes from a workspace
      'run.maxTurns': 'resource',
      'run.maxChecks': 'resource',
      'run.maxAgentMinutes': 'resource',
      'run.leanJobSeconds': 'resource',
      'run.maxGateAttempts': 'resource',
      'run.keepRuns': 'machine',
      'run.contextScope': 'resource',
      'run.reuseLeanBuild': 'resource',
    });
    expect(properties['telelean.run.reuseLeanBuild']?.type).toBe('boolean');
    expect(properties['telelean.effort']?.enum).toEqual([...EFFORTS]);
    expect(properties['telelean.run.contextScope']?.enum).toEqual([...CONTEXT_SCOPES]);
    for (const [key, [min, max]] of Object.entries(RUN_SETTING_BOUNDS)) {
      const property = properties[`telelean.${key}`];
      expect([property?.type, property?.minimum, property?.maximum], key).toEqual(['integer', min, max]);
    }
    for (const [key, property] of Object.entries(properties)) {
      expect(property.markdownDescription, key).toMatch(/Takes effect after a window reload/);
    }
  });

  it('contributes 6 colours with exactly one dot each and explicit hex defaults for every theme kind (no charts.*)', () => {
    const colors = manifest.contributes.colors;
    // Spec v4 BD-9: the axiom and proposition stripes (the old Assumption and Goal colours) and green for "proved".
    expect(colors.map((c) => c.id)).toEqual([
      'telelean.kindAxiom',
      'telelean.kindProposition',
      'telelean.proved',
      'telelean.formalizedAura',
      'telelean.vocabulary',
      'telelean.highlight',
    ]);
    for (const color of colors) {
      expect(color.id.split('.'), color.id).toHaveLength(2);
      expect(Object.keys(color.defaults).sort(), color.id).toEqual(['dark', 'highContrast', 'highContrastLight', 'light']);
      for (const [theme, value] of Object.entries(color.defaults)) {
        expect(value, `${color.id} ${theme}`).toMatch(/^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/);
        expect(value).not.toMatch(/charts\./);
      }
      expect(color.description.length).toBeGreaterThan(10);
    }
  });
});
