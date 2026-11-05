/**
 * The planner's text scenarios (AT2.6-AT2.8) against a reference fake of WP-markup's primitives, so the planner's
 * orchestration (sessions, re-parsing, block re-location, Lean ops before block edits) is tested before WP-markup
 * lands. The same scenarios run against the real primitives in plans.wp1.test.ts.
 */
import { vi } from 'vitest';
import { parseFixture } from '../project/helpers/parseFixture.js';
import { planScenarios } from './helpers/scenarios.js';

vi.mock('../../src/markup/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/markup/api.js')>();
  const { fakeMarkup } = await import('./helpers/fakeMarkup.js');
  return { ...original, ...fakeMarkup };
});

planScenarios(parseFixture);
