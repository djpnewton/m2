import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { mergeConfig, PARAMS } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';

const source = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Labels of slider controls only — a `label:` immediately followed by a `path:`. */
const controlLabels = () => [...source.matchAll(/label: '([^']+)',\s*\n?\s*path: '/g)].map((m) => m[1]);
const controlPaths = () => [...source.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);

test('every control has a distinct label', () => {
  // Regression: two sliders were both called "Share bought from non-banks", in
  // different sections, so it was impossible to tell which one you were moving.
  const labels = controlLabels();
  assert.ok(labels.length > 5, `expected several controls, found ${labels.length}`);

  const seen = new Map();
  for (const label of labels) {
    if (seen.has(label)) {
      assert.fail(`duplicate control label: "${label}"`);
    }
    seen.set(label, true);
  }
});

test('every control writes to a path the model actually reads', () => {
  // A typo here would silently create a config key nothing consumes.
  const cfg = mergeConfig({});
  const paths = controlPaths();
  assert.ok(paths.length > 5);

  for (const path of paths) {
    let node = cfg;
    for (const part of path.split('.')) {
      assert.ok(
        node && typeof node === 'object' && part in node,
        `control path "${path}" does not exist in the default config`,
      );
      node = node[part];
    }
  }
});

test('every control range is ordered and stepped sensibly', () => {
  const controls = [...source.matchAll(/min: (-?[\d.]+), max: (-?[\d.]+), step: ([\d.]+)/g)];
  assert.ok(controls.length > 5);
  for (const [, min, max, step] of controls) {
    assert.ok(Number(min) < Number(max), `min ${min} is not below max ${max}`);
    assert.ok(Number(step) > 0, `step ${step} must be positive`);
  }
});

/* ------------------------------------------------------------------ */
/* No stale hard-coded figures                                         */
/* ------------------------------------------------------------------ */

test('scenario blurbs quote figures derived from their own config', () => {
  const covid = SCENARIOS.find((s) => s.id === 'covid');
  assert.equal(typeof covid.blurb, 'function', 'a blurb that quotes figures must be derived');

  const cfg = mergeConfig(covid.config);
  const total = cfg.govtPurchases.pace * cfg.govtPurchases.months;
  assert.match(covid.blurb(cfg), new RegExp(`${Math.round(total)}bn`));
  assert.match(covid.blurb(cfg), new RegExp(`${cfg.fiscal.deficitPctGdp}%-of-GDP`));
});

test('the deposit margin copy does not restate model figures', () => {
  // These were literals: a 0.7pp threshold and a 3.27% wholesale rate.
  assert.ok(!source.includes('3.27'), 'wholesale rate must come from the model');
  assert.ok(!/roughly\s+0\.7pp/.test(source), 'threshold must come from PARAMS.depositConvenience');
  assert.match(source, /PARAMS\.depositConvenience/);
  assert.match(source, /openingWholesale/);
});

test('the page prose fills its figures at runtime', () => {
  assert.match(html, /id="prose-convenience"/);
  assert.match(html, /id="prose-wholesale"/);

  // Each placeholder carries a no-JS fallback; the model overwrites it on load.
  // What must not happen is a stray hard-coded rate anywhere else in the prose.
  const withoutPlaceholders = html
    .replace(/<span id="prose-wholesale">[^<]*<\/span>/g, '')
    .replace(/<span id="prose-convenience">[^<]*<\/span>/g, '');
  assert.ok(!withoutPlaceholders.includes('3.27'), 'stray hard-coded wholesale rate');
  assert.ok(!/roughly\s+0\.7\s+percentage/.test(withoutPlaceholders), 'stray hard-coded threshold');
});

test('the inflation target and money-growth reference live in PARAMS', () => {
  assert.ok(Number.isFinite(PARAMS.inflationTarget), 'inflationTarget missing from PARAMS');
  assert.ok(Number.isFinite(PARAMS.moneyGrowthReference), 'moneyGrowthReference missing from PARAMS');
  assert.ok(!source.includes("'2.00%'"), 'target must be read from PARAMS, not restated');
  assert.ok(!source.includes('4% reference adds'), 'reference must be read from PARAMS');
});
