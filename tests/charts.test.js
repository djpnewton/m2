import test from 'node:test';
import assert from 'node:assert/strict';

import { niceTicks, extent, linePath, xTickLabels } from '../src/charts.js';

/**
 * The real domains the page asks for. Axis bugs are invisible in a passing
 * smoke test — a collapsed or reversed scale still renders an SVG — so these
 * pin the behaviour of the helpers that decide where gridlines land.
 */
const RANGES = [
  { name: 'money stock', min: 240, max: 500, count: 4 },
  { name: 'monetary base', min: 5, max: 120, count: 4 },
  { name: 'money multiplier', min: 3, max: 18, count: 4 },
  { name: 'policy rates', min: 0, max: 8, count: 4 },
  // The real domain of the rates chart on a quiet preset: three flat lines and a
  // narrow spread. This used to yield gridlines at 4.0 and 5.0 only.
  { name: 'policy rates (tight spread)', min: 3.13, max: 5.41, count: 4 },
  { name: 'growth rate (negative)', min: -15, max: 25, count: 4 },
  { name: 'waterfall contributions', min: -90, max: 110, count: 4 },
  { name: 'fractional', min: 0.1, max: 0.9, count: 5 },
  { name: 'tiny magnitudes', min: 1e-12, max: 2e-12, count: 4 },
  { name: 'huge magnitudes', min: 1e15, max: 2e15, count: 4 },
];

for (const range of RANGES) {
  const { name, min, max, count } = range;

  test(`[${name}] ticks are finite, increasing and inside the domain`, () => {
    const ticks = niceTicks(min, max, count);
    const span = max - min;

    assert.ok(ticks.length >= 2, `expected at least 2 ticks, got ${ticks.length}`);
    for (let i = 0; i < ticks.length; i++) {
      assert.ok(Number.isFinite(ticks[i]), `tick ${i} is ${ticks[i]}`);
      if (i > 0) assert.ok(ticks[i] > ticks[i - 1], `ticks not increasing at ${i}`);
    }
    // Ticks may sit on the boundary, but never meaningfully outside it.
    const tolerance = span * 1e-6;
    assert.ok(ticks[0] >= min - tolerance, `first tick ${ticks[0]} below ${min}`);
    assert.ok(ticks.at(-1) <= max + tolerance, `last tick ${ticks.at(-1)} above ${max}`);
  });

  test(`[${name}] tick spacing is uniform and drawn from the 1/2/5 family`, () => {
    const ticks = niceTicks(min, max, count);
    if (ticks.length < 2) return;

    const diffs = ticks.slice(1).map((v, i) => v - ticks[i]);
    const first = diffs[0];
    assert.ok(first > 0, 'step must be positive');

    for (const d of diffs) {
      assert.ok(
        Math.abs(d - first) <= Math.abs(first) * 1e-9,
        `uneven spacing: ${d} vs ${first}`,
      );
    }

    const magnitude = Math.pow(10, Math.floor(Math.log10(first)));
    const normalised = first / magnitude;
    const family = [1, 2, 5, 10];
    assert.ok(
      family.some((f) => Math.abs(normalised - f) < 1e-6),
      `step ${first} normalises to ${normalised}, which is not 1/2/5 x 10^n`,
    );
  });

  test(`[${name}] tick count is close to the requested count`, () => {
    const ticks = niceTicks(min, max, count);
    assert.ok(ticks.length <= count + 3, `${ticks.length} ticks for a request of ${count}`);
  });
}

test('no axis is left with only two gridlines', () => {
  // Regression: the rates chart asked for 3.1-5.4 and got lines at 4.0 and 5.0,
  // leaving the policy-rate and term-deposit lines floating with nothing to read them against.
  for (const { name, min, max, count } of RANGES) {
    const ticks = niceTicks(min, max, count);
    assert.ok(ticks.length >= 3, `${name}: only ${ticks.length} gridlines (${JSON.stringify(ticks)})`);
  }
});

test('one decimal keeps every gridline label distinct', () => {
  // Why the growth and multiplier charts format with a decimal: these real domains
  // produce fractional steps, and a whole-number format printed "14 15 15 15 15".
  const domains = [
    [13.4, 15.4],
    [2.8, 3.85],
    [1.2, 3.1],
    [0.35, 0.65],
  ];
  for (const [min, max] of domains) {
    const ticks = niceTicks(min, max, 4);
    assert.ok(ticks.length >= 3, `[${min}, ${max}] gave only ${ticks.length} gridlines`);
    const labels = ticks.map((t) => t.toFixed(1));
    assert.equal(
      new Set(labels).size,
      labels.length,
      `duplicate labels at [${min}, ${max}]: ${labels.join(' ')}`,
    );
  }
});

test('degenerate domains fall back to a single tick instead of looping', () => {
  assert.deepEqual(niceTicks(5, 5), [5]);
  assert.deepEqual(niceTicks(10, 0), [10], 'a reversed domain must not hang');
  assert.deepEqual(niceTicks(0, -0.0001), [0]);
});

test('tiny magnitudes do not collapse to zero', () => {
  // Regression: rounding with toFixed(10) turned every tick into 0 here.
  const ticks = niceTicks(1e-12, 2e-12, 4);
  assert.ok(ticks.length >= 2);
  assert.ok(ticks.every((t) => t > 0), `ticks collapsed: ${JSON.stringify(ticks)}`);
  assert.equal(new Set(ticks).size, ticks.length, 'ticks must be distinct');
});

test('a domain spanning zero includes a zero gridline', () => {
  for (const [min, max] of [[-15, 25], [-90, 110], [-5, 5]]) {
    const ticks = niceTicks(min, max, 4);
    assert.ok(ticks.includes(0), `no zero tick in ${min}..${max}: ${JSON.stringify(ticks)}`);
  }
});

/* ------------------------------------------------------------------ */
/* extent                                                              */
/* ------------------------------------------------------------------ */

test('extent finds the range and ignores non-finite values', () => {
  const series = [{ points: [[0, 5], [1, NaN], [2, -3], [3, 12]] }];
  assert.deepEqual(extent(series), [-3, 12]);
});

test('extent handles empty and flat series', () => {
  assert.deepEqual(extent([]), [0, 1]);
  assert.deepEqual(extent([{ points: [] }]), [0, 1]);
  assert.deepEqual(extent([{ points: [[0, NaN]] }]), [0, 1]);
  assert.deepEqual(extent([{ points: [[0, 7], [1, 7]] }]), [6, 8], 'a flat series is widened');
});

/* ------------------------------------------------------------------ */
/* linePath                                                            */
/* ------------------------------------------------------------------ */

const scale = (fn) => fn;

test('linePath builds a move followed by lines', () => {
  const d = linePath([[0, 1], [1, 2], [2, 3]], (v) => v * 10, scale((v) => v));
  assert.equal(d, 'M0.00,1.00L10.00,2.00L20.00,3.00');
});

test('linePath breaks the line at missing values instead of bridging them', () => {
  const d = linePath([[0, 1], [1, NaN], [2, 3]], (v) => v * 10, scale((v) => v));
  assert.equal(d, 'M0.00,1.00M20.00,3.00', 'a gap must restart with M, not connect with L');
});

test('linePath returns an empty string when nothing is drawable', () => {
  assert.equal(linePath([[0, NaN], [1, Infinity]], (v) => v, (v) => v), '');
});

/* ------------------------------------------------------------------ */
/* xTickLabels                                                         */
/* ------------------------------------------------------------------ */

test('x tick labels always include both ends of the window', () => {
  for (const [months, count] of [[60, 8], [120, 12], [24, 3], [12, 5]]) {
    const labels = xTickLabels(months, count);
    assert.equal(labels[0], 0);
    assert.equal(labels.at(-1), months);
    for (let i = 1; i < labels.length; i++) {
      assert.ok(labels[i] > labels[i - 1], `labels not increasing at ${i}`);
    }
  }
});

test('x tick labels never use a fractional or zero step', () => {
  // A zero step would loop forever; a fractional one renders duplicate months.
  const labels = xTickLabels(6, 12);
  const step = labels[1] - labels[0];
  assert.ok(Number.isInteger(step) && step >= 1, `step was ${step}`);
});

test('x tick labels handle a zero-length window', () => {
  assert.deepEqual(xTickLabels(0, 5), [0]);
});
