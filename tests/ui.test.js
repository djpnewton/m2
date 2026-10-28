import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { mergeConfig, PARAMS, run } from '../src/model.js';
import { SCENARIOS } from '../src/scenarios.js';
import { creditMix, decomposeM2, METRICS, START_HINTS } from '../src/ui.js';

const source = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const prose = fs.readFileSync(new URL('../src/regions.js', import.meta.url), 'utf8');

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

test('the country picker lives outside the panel, so it survives a re-render', () => {
  // Regression: it was rendered by renderControls(), which replaced the panel's
  // innerHTML on every scenario change — and on narrow screens the whole panel
  // sits below nine charts, where the picker was effectively invisible.
  const masthead = html.slice(html.indexOf('class="masthead"'), html.indexOf('</header>'));
  assert.match(masthead, /id="region-select"/, 'the picker belongs in the masthead');
  assert.doesNotMatch(source, /<h2>Country<\/h2>/, 'the picker must not come from the panel template');
  assert.match(source, /el\('region-select'\)\.addEventListener/);
});

test('the controls stay ahead of the output in the document', () => {
  // Narrow screens swap them with CSS `order`. Keeping the panel first in the
  // source means a stale stylesheet falls back to the two-column layout rather
  // than dropping the output into the 342px column, which is what happened once.
  const panel = html.indexOf('id="controls"');
  const output = html.indexOf('class="output"');
  assert.ok(panel > -1 && output > -1, 'expected both a panel and an output container');
  assert.ok(panel < output, 'the panel must come before the output in the source');
});

test('every control supplies a formatter', () => {
  // control() records each formatter as it renders so live slider updates reuse
  // it; a control without one would show a raw number mid-drag.
  const paths = controlPaths().length;
  const formats = (source.match(/\bformat:/g) ?? []).length;
  assert.equal(formats, paths, `${paths} control paths but ${formats} formatters`);
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
  const headline = total >= 1000 ? `${(total / 1000).toFixed(1)}tn` : `${Math.round(total)}bn`;
  assert.match(covid.blurb(cfg), new RegExp(headline.replace('.', '\\.')));
  assert.match(covid.blurb(cfg), new RegExp(`${cfg.fiscal.deficitPctGdp}%-of-GDP`));
});

test('the deposit margin copy does not restate model figures', () => {
  // These were literals: a 0.7pp threshold and a 3.27% wholesale rate.
  assert.ok(!source.includes('3.27'), 'wholesale rate must come from the model');
  assert.ok(!/roughly\s+0\.7pp/.test(source), 'threshold must come from PARAMS.depositConvenience');
  assert.match(source, /depositConvenience/);
  assert.match(source, /openingWholesale/);
});

test('the page prose fills its figures at runtime', () => {
  assert.match(html, /id="assumptions"/);
  assert.match(prose, /id="prose-convenience"/);
  assert.match(prose, /id="prose-wholesale"/);
  assert.match(prose, /id="prose-fiscal-baseline"/);
  assert.match(prose, /id="prose-fiscal-credit"/);
  assert.match(source, /set\('prose-fiscal-baseline'/);
  assert.match(source, /set\('prose-fiscal-credit'/);

  // Each placeholder carries a no-JS fallback; the model overwrites it on load.
  // What must not happen is a stray hard-coded rate anywhere else in the prose.
  const withoutPlaceholders = prose.replace(/<span id="prose-[a-z-]+">[^<]*<\/span>/g, '');
  assert.ok(!withoutPlaceholders.includes('3.27'), 'stray hard-coded wholesale rate');
  assert.ok(!/roughly\s+0\.7\s+percentage/.test(withoutPlaceholders), 'stray hard-coded threshold');
  assert.ok(
    !prose.includes('A deficit alone creates no money'),
    'the prose must not claim a deficit creates no money - it reaches M2 through credit',
  );
});

test('the inflation target and money-growth reference live in PARAMS', () => {
  assert.ok(Number.isFinite(PARAMS.inflationTarget), 'inflationTarget missing from PARAMS');
  assert.ok(Number.isFinite(PARAMS.moneyGrowthReference), 'moneyGrowthReference missing from PARAMS');
  assert.ok(!source.includes("'2.00%'"), 'target must be read from PARAMS, not restated');
  assert.ok(!source.includes('4% reference adds'), 'reference must be read from PARAMS');
});

/* ------------------------------------------------------------------ */
/* KPI breakdowns and the sentences they carry                         */
/* ------------------------------------------------------------------ */

/** The shape metricContext() builds, without needing a DOM. */
function contextFor(config) {
  const { history } = run(config);
  const start = history[0];
  return {
    h: history,
    start,
    last: history.at(-1),
    sum: (key) => history.reduce((a, r) => a + (r[key] ?? 0), 0),
    prevYear: history.at(-13) ?? start,
    cmp: null,
    months: history.length - 1,
    cfg: mergeConfig(config),
  };
}

const detailOf = (key, config) => METRICS.find((m) => m.key === key).detail(contextFor(config));

/** Read a formatted row value back to a number, e.g. "+100.8" or "−24.5". */
const rowNumber = (value) => {
  const n = Number.parseFloat(String(value).replace('−', '-'));
  return Number.isFinite(n) ? n : 0;
};

test('every preset tells the reader what to look at', () => {
  // A preset that lands without a steer is the whole approachability problem back again.
  for (const scenario of SCENARIOS) {
    const hint = START_HINTS[scenario.id];
    assert.ok(hint, `${scenario.id} has no starting hint`);
    assert.ok(hint.length > 40 && hint.length < 260, `${scenario.id}: hint is ${hint.length} chars`);
  }
  assert.equal(
    Object.keys(START_HINTS).length,
    SCENARIOS.length,
    'a hint is defined for a preset that no longer exists',
  );
});

test('every KPI breakdown renders for every preset', () => {
  for (const scenario of SCENARIOS) {
    for (const metric of METRICS) {
      const d = metric.detail(contextFor(scenario.config));
      assert.ok(d.title && d.definition, `${scenario.id}/${metric.key}: missing title or definition`);
      assert.ok(Array.isArray(d.rows) && d.rows.length > 0, `${scenario.id}/${metric.key}: no rows`);
      assert.ok(
        typeof d.reading === 'string' && d.reading.length > 20,
        `${scenario.id}/${metric.key}: no reading`,
      );
    }
  }
});

test('the M2 breakdown adds up, including when deposits flee', () => {
  // Regression: flight was left out of both the panel and the waterfall, so at a
  // 0.9pp deposit margin the rows added to NZ$101.5bn against an actual move of
  // NZ$51.6bn, and the waterfall's total contradicted the M2 tile.
  const neutral = SCENARIOS.find((s) => s.id === 'neutral').config;
  const cases = [
    ...SCENARIOS.map((s) => [s.id, s.config]),
    ...[0.9, 1.2, 1.5].map((margin) => [`neutral at ${margin}pp`, { ...neutral, deposits: { margin } }]),
  ];

  for (const [name, config] of cases) {
    const { history } = run(config);
    const actual = history.at(-1).m2 - history[0].m2;
    const d = decomposeM2(history);
    assert.ok(
      Math.abs(d.total - actual) < 1e-6,
      `${name}: decomposition is off by ${(d.total - actual).toFixed(3)}`,
    );

    const rowSum = detailOf('m2', config).rows.reduce((a, r) => a + rowNumber(r.value), 0);
    assert.ok(
      Math.abs(rowSum - actual) < 0.2,
      `${name}: panel rows sum to ${rowSum.toFixed(1)}, M2 moved ${actual.toFixed(1)}`,
    );
  }
});

test('the policy-rate breakdown warns when the rate outruns nominal growth', () => {
  const hot = detailOf('policyRate', { months: 120, fiscal: { deficitPctGdp: 10, riskSensitivity: 0.08 } });
  assert.match(hot.reading, /above nominal growth/, 'a debt spiral should be called out');

  // A debt premium is a second thing moving the rate structure, so the "only thing
  // that changed was compression" sentence must not survive alongside it.
  const fiscal = detailOf('policyRate', { months: 60, fiscal: { deficitPctGdp: 7, riskSensitivity: 0.04 } });
  assert.doesNotMatch(fiscal.reading, /the only thing that changed/);
  assert.match(fiscal.reading, /debt at/i);

  const wholesale = hot.rows.find((r) => r.label === 'Wholesale funding rate');
  assert.match(wholesale.note, /debt risk/, 'the note must account for the premium it contains');

  const mild = detailOf('policyRate', { months: 60, fiscal: { deficitPctGdp: 1, riskSensitivity: 0.01 } });
  assert.doesNotMatch(mild.reading, /above nominal growth/);
});

test('the credit mix covers the whole loan book', () => {
  // The stacked area is only meaningful if its three layers add up to the bank
  // credit figure the KPI tile reports.
  for (const scenario of SCENARIOS) {
    const { history } = run(scenario.config);
    const mix = creditMix(history);
    for (const [label, point] of [['opening', mix.first], ['final', mix.last]]) {
      const parts = point.housing + point.business + point.consumer;
      assert.ok(
        Math.abs(parts - point.total) < 1e-9,
        `${scenario.id} ${label}: parts ${parts.toFixed(2)} vs total ${point.total.toFixed(2)}`,
      );
    }
    assert.ok(mix.housingShare > 0 && mix.housingShare < 100, `${scenario.id}: implausible housing share`);
  }
});

test('the M2 breakdown does not describe a bond sale as "no purchases"', () => {
  // Regression: the branch keyed on qe > 0.5, so every QT run fell through to
  // "no asset purchases in this run" despite selling NZ$5bn of bonds.
  const tightening = SCENARIOS.find((s) => s.id === 'tightening');
  const reading = detailOf('m2', tightening.config).reading;
  assert.match(reading, /sold bonds back/, 'a QT run must describe the sales');
  assert.doesNotMatch(reading, /no bond operations/);
});

test('the base breakdown attributes the change to every source', () => {
  // Regression: it claimed the base "rose by exactly" the asset purchases, which
  // is false once the funding facility or the standing facility is used.
  const covid = SCENARIOS.find((s) => s.id === 'covid');
  const reading = detailOf('base', covid.config).reading;
  assert.match(reading, /funding facility/, 'the funding facility also creates reserves');
  assert.doesNotMatch(reading, /rose by exactly that amount/);
});

test('a missing chart mount is skipped, not thrown', () => {
  // Regression: a stale ui.js ran against new markup, the mount lookup returned
  // null, and the whole page died before anything was drawn.
  assert.match(source, /const mount = el\(mountId\)/);
  assert.match(source, /if \(!mount\)/);
  assert.match(source, /no #\$\{mountId\} on the page/);
});

test('boot failures name the stale-cache cause', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /catch \(error\)/);
  assert.match(main, /cached copy of the scripts/);
  assert.match(main, /reportFatal/);
});

test('the entry module and stylesheet are cache-versioned', () => {
  // Not a fix on its own — nested module imports keep their own URLs — but it
  // stops the entry point and the CSS from drifting apart from the HTML.
  assert.match(html, /src="src\/main\.js\?v=\d+"/);
  assert.match(html, /href="styles\.css\?v=\d+"/);
});
