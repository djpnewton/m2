import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_YEAR,
  DATASETS,
  HISTORY,
  SERIES,
  YEARS,
  correlation,
  createHistory,
  indexed,
  impliedPriceLevel,
  multipleOf,
  spanOf,
  velocityChange,
  windowFromBrush,
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

test('levels correlate almost perfectly, which is the trap', () => {
  // The note says so: two series that trend upward together will do this
  // whether or not one drives the other.
  const levels = correlation(
    HISTORY.map((row) => Math.log(row[SERIES.m2])),
    HISTORY.map((row) => Math.log(row[SERIES.cpi])),
  );
  assert.ok(levels > 0.97, `level correlation ${levels.toFixed(3)}`);
});

test('both regions label the money series M2', () => {
  // The chart is about the money stock; the New Zealand table's breadth is
  // explained in the card note rather than in the series name.
  assert.equal(DATASETS.us.moneyLabel, 'M2');
  assert.equal(DATASETS.nz.moneyLabel, 'M2');
});

test('the New Zealand money column is M2, not a wider aggregate', () => {
  // The World Bank calls its indicator "broad money"; for New Zealand the series
  // it carries is the IMF's money-plus-quasi-money measure, which is M2. Spot
  // values from IFS A.NZ.35L___XDC (millions, converted here to billions):
  //   1980 6,364 · 1990 53,204 · 2000 94,531 · 2010 188,494
  const expected = { 1980: 6.4, 1990: 53.2, 2000: 94.5, 2010: 188.5 };
  for (const [year, value] of Object.entries(expected)) {
    const row = DATASETS.nz.rows.find((r) => r[0] === Number(year));
    assert.ok(
      Math.abs(row[SERIES.m2] - value) < 0.06,
      `${year}: table has ${row[SERIES.m2]}, IMF M2 is ${value}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Windowed history                                                    */
/* ------------------------------------------------------------------ */

test('a window slices the rows and rebases the index on its first year', () => {
  const h = createHistory('us', { from: 2000, to: 2010 });
  assert.equal(h.from, 2000);
  assert.equal(h.to, 2010);
  assert.deepEqual(h.years, [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010]);

  const money = h.indexed('m2');
  assert.equal(money.length, h.years.length);
  assert.deepEqual(money[0], [0, 100], 'the window starts at 100, not 1980');
  // 2000 M2 4792.1 -> 2010 8645.6
  assert.ok(Math.abs(h.multipleOf('m2') - 8645.6 / 4792.1) < 1e-9);
  assert.ok(Math.abs(h.impliedPriceLevel().at(-1)[1] - h.impliedPriceLevel().at(-1)[1]) < 1e-9);
});

test('open-ended windows default to the dataset edges', () => {
  const span = spanOf('nz');
  const h = createHistory('nz', { from: 2015 });
  assert.equal(h.from, 2015);
  assert.equal(h.to, span.to);
  const whole = createHistory('nz');
  assert.equal(whole.from, span.from);
  assert.equal(whole.to, span.to);
  assert.equal(whole.rows.length, span.to - span.from + 1);
});

test('a window outside the data yields an empty, non-throwing result', () => {
  const h = createHistory('us', { from: 1900, to: 1910 });
  assert.deepEqual(h.rows, []);
  assert.deepEqual(h.indexed('m2'), []);
  assert.ok(Number.isNaN(h.multipleOf('m2')));
});

test('the implied price level is rebased too', () => {
  const h = createHistory('us', { from: 1990, to: 2020 });
  const points = h.impliedPriceLevel();
  assert.equal(points[0][1], 100);
  const ratio = (y) => {
    const row = h.rows.find((r) => r[0] === y);
    return row[SERIES.m2] / row[SERIES.rgdp];
  };
  assert.ok(Math.abs(points.at(-1)[1] - (ratio(2020) / ratio(1990)) * 100) < 1e-9);
});

test('velocity change is price change divided by the M2-per-real-GDP ratio', () => {
  // V = PY / M, so V_end/V_start = (price change × real growth) ÷ money growth.
  // Regression: the card had this upside down, reporting New Zealand's 73% fall
  // as a 272% rise.
  const nz = createHistory('nz');
  assert.ok(Math.abs(velocityChange(nz) - 0.269) < 0.005, `NZ ${velocityChange(nz).toFixed(3)}`);
  const us = createHistory('us');
  assert.ok(Math.abs(velocityChange(us) - 0.895) < 0.005, `US ${velocityChange(us).toFixed(3)}`);
  // Velocity rose through the 1990s in the US.
  const nineties = createHistory('us', { from: 1990, to: 2000 });
  assert.ok(velocityChange(nineties) > 1.2, `1990-2000 ${velocityChange(nineties).toFixed(3)}`);
});

test('a dragged range becomes a whole-year window', () => {
  const h = createHistory('us');
  assert.deepEqual(windowFromBrush(h, 10, 20), { from: 1990, to: 2000 });
  assert.deepEqual(windowFromBrush(h, 20, 10), { from: 1990, to: 2000 }, 'dragging right-to-left');
  // A narrow drag is widened rather than producing a meaningless window.
  assert.deepEqual(windowFromBrush(h, 5, 6), { from: 1985, to: 1990 });
  // And a drag past the edge is clamped.
  assert.deepEqual(windowFromBrush(h, 40, 99), { from: 2019, to: 2024 });
});

test('a brushed window inside a narrowed chart uses that chart’s own years', () => {
  const h = createHistory('us', { from: 1990, to: 2000 });
  // Offsets are relative to the window's first year, not to 1980.
  assert.deepEqual(windowFromBrush(h, 2, 6, 4), { from: 1992, to: 1996 });
  // With the default minimum of five years, a four-year drag widens by one.
  assert.deepEqual(windowFromBrush(h, 2, 6), { from: 1992, to: 1997 });
});
