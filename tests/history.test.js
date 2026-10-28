import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_YEAR,
  DATASETS,
  HISTORY,
  SERIES,
  YEARS,
  correlation,
  indexed,
  impliedPriceLevel,
  multipleOf,
} from '../src/history.js';

/**
 * The long-run chart is the page's only claim about actual history rather than
 * about the model, so the table it draws has to be internally consistent: no
 * gaps, no zero denominators, and an index that genuinely starts at 100.
 */

test('the table runs 1980 to 2024 with no missing years', () => {
  assert.equal(BASE_YEAR, 1980);
  assert.equal(HISTORY.length, 45);
  for (let i = 1; i < HISTORY.length; i++) {
    assert.equal(HISTORY[i][0], HISTORY[i - 1][0] + 1, `gap after ${HISTORY[i - 1][0]}`);
  }
  assert.deepEqual(YEARS, HISTORY.map((r) => r[0]));
});

test('every observation is a finite positive number', () => {
  for (const row of HISTORY) {
    assert.equal(row.length, 5, `row ${row[0]} has ${row.length} columns`);
    for (const [i, value] of row.entries()) {
      assert.ok(Number.isFinite(value), `row ${row[0]} column ${i} is ${value}`);
      if (i > 0) assert.ok(value > 0, `row ${row[0]} column ${i} is ${value}`);
    }
  }
});

test('every series is indexed to 100 in the base year', () => {
  for (const key of Object.keys(SERIES)) {
    const points = indexed(key);
    assert.equal(points.length, HISTORY.length, `${key} lost rows`);
    assert.equal(points[0][1], 100, `${key} does not start at 100`);
  }
});

test('series share one x axis measured in years from 1980', () => {
  const xs = indexed('m2').map(([x]) => x);
  assert.deepEqual(xs, YEARS.map((y) => y - BASE_YEAR));
  for (const key of Object.keys(SERIES)) {
    assert.deepEqual(indexed(key).map(([x]) => x), xs, `${key} x values differ`);
  }
});

test('the headline multiples match the published series', () => {
  // These are the numbers the card note quotes: 13.7x, 3.8x, 3.9x, 3.2x.
  assert.ok(Math.abs(multipleOf('m2') - 13.7) < 0.1, `M2 grew ${multipleOf('m2').toFixed(2)}x`);
  assert.ok(Math.abs(multipleOf('cpi') - 3.8) < 0.05, `CPI grew ${multipleOf('cpi').toFixed(2)}x`);
  assert.ok(Math.abs(multipleOf('gold') - 3.9) < 0.1, `gold grew ${multipleOf('gold').toFixed(2)}x`);
  assert.ok(Math.abs(multipleOf('rgdp') - 3.2) < 0.05, `real GDP grew ${multipleOf('rgdp').toFixed(2)}x`);
});

test('gold tracked prices, not the money stock', () => {
  // The chart's point: over four decades gold held its purchasing power (within
  // a tenth of the CPI multiple) while M2 ran several times faster.
  assert.ok(Math.abs(multipleOf('gold') - multipleOf('cpi')) < 0.15);
  assert.ok(multipleOf('m2') > multipleOf('cpi') * 3);
});

test('real growth absorbed most of the money growth', () => {
  const implied = multipleOf('m2') / multipleOf('rgdp');
  assert.ok(Math.abs(implied - 4.25) < 0.1, `M2/real GDP grew ${implied.toFixed(2)}x`);
  // The quantity equation overshoots CPI by roughly the fall in velocity.
  assert.ok(implied > multipleOf('cpi'));
  assert.ok(implied / multipleOf('cpi') < 1.2, 'velocity drift should not be large');
});

test('the implied price level is the M2/real GDP ratio, rebased', () => {
  const points = impliedPriceLevel();
  assert.equal(points.length, HISTORY.length);
  assert.equal(points[0][1], 100);
  const last = HISTORY.at(-1);
  const first = HISTORY[0];
  const expected = (last[SERIES.m2] / last[SERIES.rgdp]) / (first[SERIES.m2] / first[SERIES.rgdp]) * 100;
  assert.ok(Math.abs(points.at(-1)[1] - expected) < 1e-9);
});

test('a different base year rebases without moving the x axis', () => {
  const points = indexed('cpi', 2000);
  assert.equal(points[0][1], (HISTORY[0][SERIES.cpi] / 172.2) * 100);
  const y2000 = points.find(([x]) => x === 2000 - BASE_YEAR);
  assert.equal(y2000[1], 100);
  assert.ok(Math.abs(multipleOf('cpi', 2000) - HISTORY.at(-1)[SERIES.cpi] / 172.2) < 1e-9);
});

test('unknown series and base years degrade to empty rather than throwing', () => {
  assert.deepEqual(indexed('silver'), []);
  assert.deepEqual(indexed('cpi', 1900), []);
  assert.deepEqual(impliedPriceLevel(1900), []);
  assert.ok(Number.isNaN(multipleOf('cpi', 1900)));
});

test('correlation is bounded and sign-correct', () => {
  assert.ok(Math.abs(correlation([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.ok(Math.abs(correlation([1, 2, 3], [6, 4, 2]) + 1) < 1e-12);
  assert.ok(Number.isNaN(correlation([1], [2])));
});

test('only the region whose chart plots broad money links the term', () => {
  assert.equal(DATASETS.us.moneyTerm, null);
  assert.equal(DATASETS.nz.moneyTerm, 'broad-money');
});

test('levels correlate almost perfectly, which is the trap', () => {
  // The note says so: two series that trend upward together will do this
  // whether or not one drives the other.
  const levels = correlation(
    HISTORY.map((row) => Math.log(row[SERIES.m2])),
    HISTORY.map((row) => Math.log(row[SERIES.cpi])),
  );
  assert.ok(levels > 0.97, `level correlation ${levels.toFixed(3)}`);
});
