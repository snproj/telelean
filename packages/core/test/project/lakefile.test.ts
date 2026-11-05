/**
 * TL110 (`autoImplicit` on, docs/m1-plan.md section 6.5): computed from the lakefile text the caller passes in
 * ProjectInput.lakefile (integrator addition), shown on every board as a project-level warning.
 */
import { describe, expect, it } from 'vitest';

import { buildProjectModel, subjectGraph } from '../../src/project/index.js';
import { autoImplicitDiagnostic } from '../../src/project/lakefile.js';
import scaffoldLakefile from '../../../../test-fixtures/spyro/lakefile.toml?raw';

describe('TL110 autoImplicit', () => {
  it('the scaffold lakefile (autoImplicit = false) is fine', () => {
    expect(autoImplicitDiagnostic({ path: 'lakefile.toml', text: scaffoldLakefile })).toBeUndefined();
    expect(autoImplicitDiagnostic({ path: 'lakefile.toml', text: 'name = "M"\n[[lean_lib]]\nname = "M"\nleanOptions = { autoImplicit = false }\n' })).toBeUndefined();
  });

  it('a missing setting is Lean\'s default (on): warning at the file start', () => {
    const d = autoImplicitDiagnostic({ path: 'lakefile.toml', text: 'name = "M"\n\n[[lean_lib]]\nname = "M"\n' });
    expect(d).toMatchObject({ code: 'TL110', severity: 'warning', file: 'lakefile.toml', range: { start: { line: 0, character: 0 } } });
    expect(d?.message).toContain("Lean's default");
  });

  it('an explicit `true` is reported on its line; a commented-out `false` does not count', () => {
    const text = 'name = "M"\n[leanOptions]\n# autoImplicit = false\nautoImplicit = true\n';
    expect(autoImplicitDiagnostic({ path: 'lakefile.toml', text })).toMatchObject({ code: 'TL110', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 19 } } });
  });

  it('lakefile.lean: `autoImplicit, false` is off, anything else is on', () => {
    expect(autoImplicitDiagnostic({ path: 'lakefile.lean', text: 'package M where\n  leanOptions := #[⟨`autoImplicit, false⟩]\n' })).toBeUndefined();
    expect(autoImplicitDiagnostic({ path: 'lakefile.lean', text: 'package M where\n  -- leanOptions := #[⟨`autoImplicit, false⟩]\n' })).toMatchObject({ code: 'TL110' });
  });

  it('buildProjectModel reports it as a project-level diagnostic, shown on every subject board', () => {
    const model = buildProjectModel({ files: [], fileHashes: {}, library: 'Model', lakefile: { path: 'lakefile.toml', text: 'name = "Model"\n' } });
    expect(model.diagnostics.filter((d) => d.code === 'TL110')).toHaveLength(1);
    expect(subjectGraph(model, 'Spyro', { version: 1, semantic: { state: 'unavailable' } }).diagnostics.map((d) => d.code)).toContain('TL110');
    const clean = buildProjectModel({ files: [], fileHashes: {}, library: 'Model', lakefile: { path: 'lakefile.toml', text: scaffoldLakefile } });
    expect(clean.diagnostics.some((d) => d.code === 'TL110')).toBe(false);
    expect(buildProjectModel({ files: [], fileHashes: {}, library: 'Model' }).diagnostics.some((d) => d.code === 'TL110')).toBe(false);
  });
});
