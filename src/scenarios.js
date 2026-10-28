/**
 * Preset scenarios, one set per region. Each set is a list of complete configs,
 * so a preset can be loaded into the controls and then edited.
 */

import { SCENARIOS as US_SCENARIOS } from './scenarios-us.js';
import { SCENARIOS as NZ_SCENARIOS } from './scenarios-nz.js';

export const SCENARIOS_BY_REGION = { us: US_SCENARIOS, nz: NZ_SCENARIOS };

/** The US list, for callers that do not name a region. */
export const SCENARIOS = US_SCENARIOS;

export function scenariosFor(region = 'us') {
  return SCENARIOS_BY_REGION[region] ?? US_SCENARIOS;
}

export function getScenario(id, region = 'us') {
  const list = scenariosFor(region);
  return list.find((s) => s.id === id) ?? list[0];
}
