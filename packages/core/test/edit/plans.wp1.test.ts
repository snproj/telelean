/**
 * The planner's text scenarios (AT2.6-AT2.8) with WP-markup's real primitives and parser (integrated: no gate).
 */
import { describe } from 'vitest';
import { parseLeanFile } from '../../src/markup/api.js';
import { planScenarios } from './helpers/scenarios.js';

describe('with WP-markup', () => {
  planScenarios(parseLeanFile);
});
