/**
 * Long-run evidence, 1980–2024, annual averages, for both regions.
 *
 * Four series per country that the argument about money and inflation keeps
 * appealing to, each indexed to 100 in the first year so one axis can carry
 * them. Column order is the same for both, so `SERIES` indexes either table.
 *
 * United States
 *   gold  — US$ per troy ounce, London market (World Bank Pink Sheet)
 *   cpi   — US consumer price index, all items (BLS series CPIAUCSL)
 *   m2    — US M2, US$ billions (Federal Reserve series M2SL)
 *   rgdp  — US real GDP, US$ billions chained 2017 (BEA series GDPC1)
 *
 * New Zealand
 *   gold  — NZ$ per troy ounce: the same London price at the average NZD/USD rate
 *   cpi   — consumer price index (World Bank FP.CPI.TOTL)
 *   m2    — M2, NZ$ billions: money plus quasi-money (IMF IFS, as published by the
 *           World Bank under FM.LBL.BMNY.CN — the indicator's name is "broad
 *           money", but the series is the IMF's money-plus-quasi-money measure,
 *           matching IFS A.NZ.35L___XDC to rounding across 1980–2010)
 *   rgdp  — real GDP, constant 2015 US$ (World Bank NY.GDP.MKTP.KD)
 *
 * The World Bank series has no observations for 2011 or 2012; those two years are
 * geometrically interpolated between 2010 and 2013 and are the only constructed
 * points in either table. Levels are annual averages, so 2020's
 * V-shaped quarterly path is smoothed, and the last year is a complete calendar
 * year. Nothing is fetched at runtime.
 */

export const BASE_YEAR = 1980;

/** [year, gold, cpi, m2, rgdp] */
const US_ROWS = [
  [1980, 607.9, 82.4, 1540.2, 7257.3],
  [1981, 459.8, 90.9, 1679.3, 7441.5],
  [1982, 375.8, 96.5, 1830.9, 7307.3],
  [1983, 422.5, 99.6, 2054.5, 7642.3],
  [1984, 360.5, 103.9, 2219.0, 8195.3],
  [1985, 317.9, 107.6, 2416.5, 8537.0],
  [1986, 367.7, 109.7, 2612.8, 8832.6],
  [1987, 446.5, 113.6, 2782.3, 9137.7],
  [1988, 437.0, 118.3, 2931.1, 9519.4],
  [1989, 381.4, 123.9, 3054.1, 9869.0],
  [1990, 383.5, 130.7, 3222.2, 10055.1],
  [1991, 362.2, 136.2, 3342.1, 10044.2],
  [1992, 343.7, 140.3, 3404.6, 10398.0],
  [1993, 359.8, 144.5, 3439.8, 10684.2],
  [1994, 384.0, 148.2, 3483.4, 11114.6],
  [1995, 384.2, 152.4, 3555.6, 11413.0],
  [1996, 387.7, 156.9, 3729.0, 11843.6],
  [1997, 331.1, 160.5, 3925.7, 12370.3],
  [1998, 294.2, 163.0, 4206.6, 12924.9],
  [1999, 278.8, 166.6, 4518.2, 13543.8],
  [2000, 279.0, 172.2, 4792.1, 14096.0],
  [2001, 271.0, 177.0, 5208.9, 14230.7],
  [2002, 310.0, 179.9, 5598.2, 14472.7],
  [2003, 363.5, 184.0, 5988.1, 14877.3],
  [2004, 409.2, 188.9, 6273.8, 15449.8],
  [2005, 444.8, 195.3, 6541.1, 15988.0],
  [2006, 604.3, 201.6, 6884.9, 16433.1],
  [2007, 696.7, 207.3, 7308.2, 16762.4],
  [2008, 871.7, 215.3, 7804.2, 16781.5],
  [2009, 973.0, 214.6, 8433.3, 16349.1],
  [2010, 1224.7, 218.1, 8645.6, 16789.8],
  [2011, 1569.2, 224.9, 9282.6, 17052.4],
  [2012, 1669.5, 229.6, 10073.9, 17442.8],
  [2013, 1411.5, 233.0, 10752.4, 17812.2],
  [2014, 1265.6, 236.7, 11414.4, 18261.7],
  [2015, 1160.7, 237.0, 12074.4, 18799.6],
  [2016, 1249.0, 240.0, 12892.2, 19141.7],
  [2017, 1257.6, 245.1, 13621.5, 19612.1],
  [2018, 1269.2, 251.1, 14141.6, 20193.9],
  [2019, 1392.5, 255.7, 14863.8, 20715.7],
  [2020, 1770.3, 258.9, 17696.6, 20284.5],
  [2021, 1799.6, 271.0, 20546.1, 21556.0],
  [2022, 1800.6, 292.6, 21588.5, 22079.7],
  [2023, 1942.7, 304.7, 20850.7, 22724.1],
  [2024, 2387.7, 313.7, 21108.9, 23394.9],
];

/** [year, gold, cpi, m2, rgdp] */
const NZ_ROWS = [
  [1980, 624.5, 23.47, 6.4, 72.8],
  [1981, 529.4, 27.07, 7.4, 76.2],
  [1982, 500.4, 31.45, 8.4, 76.9],
  [1983, 632.6, 33.76, 9.0, 79.6],
  [1984, 623.3, 35.84, 10.8, 83.4],
  [1985, 639.0, 41.37, 14.4, 84.7],
  [1986, 701.0, 46.83, 18.0, 87.0],
  [1987, 752.6, 54.21, 21.1, 87.9],
  [1988, 666.6, 57.66, 44.1, 87.6],
  [1989, 637.9, 60.96, 48.3, 87.7],
  [1990, 643.3, 64.68, 53.2, 87.9],
  [1991, 626.3, 66.36, 54.1, 86.9],
  [1992, 638.9, 67.03, 56.2, 87.9],
  [1993, 664.7, 67.90, 59.7, 93.5],
  [1994, 646.9, 69.08, 65.1, 98.3],
  [1995, 585.4, 71.67, 71.2, 102.9],
  [1996, 563.8, 73.31, 81.3, 106.6],
  [1997, 499.8, 74.18, 86.7, 108.8],
  [1998, 548.7, 75.12, 86.9, 109.7],
  [1999, 526.9, 75.04, 93.1, 115.7],
  [2000, 610.8, 77.00, 94.5, 119.0],
  [2001, 645.0, 79.02, 103.1, 123.0],
  [2002, 667.4, 81.14, 103.4, 128.8],
  [2003, 624.4, 82.56, 113.2, 134.9],
  [2004, 616.0, 84.45, 117.2, 140.4],
  [2005, 631.0, 87.01, 128.3, 145.1],
  [2006, 930.8, 89.94, 142.7, 149.2],
  [2007, 945.9, 92.08, 158.6, 153.7],
  [2008, 1218.9, 95.72, 175.1, 152.2],
  [2009, 1530.3, 97.75, 174.0, 152.1],
  [2010, 1697.1, 100.00, 188.5, 154.3],
  [2011, 1981.3, 104.03, 197.3, 157.7],
  [2012, 2060.0, 105.13, 206.5, 161.3],
  [2013, 1720.5, 106.32, 216.1, 165.4],
  [2014, 1522.4, 107.63, 230.6, 171.7],
  [2015, 1657.9, 107.94, 253.3, 178.1],
  [2016, 1790.3, 108.64, 272.7, 184.8],
  [2017, 1768.6, 110.65, 292.6, 190.9],
  [2018, 1831.7, 112.42, 311.4, 197.3],
  [2019, 2112.7, 114.24, 326.1, 201.9],
  [2020, 2724.3, 116.20, 365.8, 201.4],
  [2021, 2544.0, 120.78, 391.6, 210.0],
  [2022, 2830.8, 129.44, 398.8, 217.1],
  [2023, 3162.6, 136.86, 413.0, 221.0],
  [2024, 3946.7, 140.86, 430.1, 219.1],
];

export const SERIES = { gold: 1, cpi: 2, m2: 3, rgdp: 4 };

export const DATASETS = {
  us: {
    id: 'us',
    label: 'the United States',
    moneyLabel: 'M2',
    goldLabel: 'Gold, US$ an ounce',
    rows: US_ROWS,
  },
  nz: {
    id: 'nz',
    label: 'New Zealand',
    moneyLabel: 'M2',
    goldLabel: 'Gold, NZ$ an ounce',
    rows: NZ_ROWS,
  },
};

/** Column index of each series in a row. */
export function yearsOf(rows) {
  return rows.map((row) => row[0]);
}

function baseValue(rows, col, baseYear) {
  const row = rows.find((r) => r[0] === baseYear);
  return row ? row[col] : undefined;
}

function indexOf(rows, key, baseYear) {
  const col = SERIES[key];
  const base = baseValue(rows, col, baseYear);
  if (!base) return [];
  return rows.map((row) => [row[0] - rows[0][0], (row[col] / base) * 100]);
}

function impliedOf(rows, baseYear) {
  const ratio = (row) => row[SERIES.m2] / row[SERIES.rgdp];
  const base = rows.find((r) => r[0] === baseYear);
  if (!base) return [];
  return rows.map((row) => [row[0] - rows[0][0], (ratio(row) / ratio(base)) * 100]);
}

function multipleOf_(rows, key, baseYear) {
  const col = SERIES[key];
  const base = baseValue(rows, col, baseYear);
  if (!base) return NaN;
  return rows.at(-1)[col] / base;
}

/** The years every dataset spans, so the page can offer a window without hard-coding one. */
export function spanOf(regionId = 'us') {
  const rows = (DATASETS[regionId] ?? DATASETS.us).rows;
  return { from: rows[0][0], to: rows.at(-1)[0] };
}

/**
 * Everything the long-run panel needs for one region, optionally restricted to a
 * window of years. The index is rebased on the window's first year, so a chart of
 * 2000–2010 starts at 100 in 2000 rather than in 1980.
 */
export function createHistory(regionId = 'us', { from, to } = {}) {
  const d = DATASETS[regionId] ?? DATASETS.us;
  const start = from ?? d.rows[0][0];
  const end = to ?? d.rows.at(-1)[0];
  const rows = d.rows.filter((row) => row[0] >= start && row[0] <= end);
  const baseYear = rows.length > 0 ? rows[0][0] : start;
  return {
    ...d,
    rows,
    years: yearsOf(rows),
    from: baseYear,
    to: rows.length > 0 ? rows.at(-1)[0] : end,
    indexed: (key, base = baseYear) => indexOf(rows, key, base),
    impliedPriceLevel: (base = baseYear) => impliedOf(rows, base),
    multipleOf: (key, base = baseYear) => multipleOf_(rows, key, base),
  };
}

/**
 * Turn a dragged range on the chart into a whole-year window. The offsets are in
 * x units (years since the window's first year); the result is clamped to the
 * dataset and widened to at least `min` years, because a drag can be a few pixels
 * wide and the card's figures stop meaning anything below that.
 */
export function windowFromBrush(h, a, b, min = 5) {
  const low = Math.round(h.from + Math.min(a, b));
  const high = Math.round(h.from + Math.max(a, b));
  let from = Math.min(Math.max(low, h.from), h.to);
  let to = Math.min(Math.max(high, from), h.to);
  if (to - from < min) to = Math.min(h.to, from + min);
  if (to - from < min) from = Math.max(h.from, to - min);
  return { from, to };
}

/**
 * Velocity change across a history window, as a ratio: V = PY / M, so
 * V_end / V_start = (real growth × price change) ÷ money growth.
 */
export function velocityChange(h) {
  const implied = h.multipleOf('m2') / h.multipleOf('rgdp');
  return h.multipleOf('cpi') / implied;
}

/** Pearson correlation of two equal-length numeric arrays. */
export function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/* The US table as named exports: the model itself is US-calibrated by default. */
export const HISTORY = US_ROWS;
export const YEARS = yearsOf(US_ROWS);
export const indexed = (key, baseYear = BASE_YEAR) => indexOf(US_ROWS, key, baseYear);
export const impliedPriceLevel = (baseYear = BASE_YEAR) => impliedOf(US_ROWS, baseYear);
export const multipleOf = (key, baseYear = BASE_YEAR) => multipleOf_(US_ROWS, key, baseYear);
