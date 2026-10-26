import test from 'node:test';
import assert from 'node:assert/strict';

import {
  run,
  createInitialState,
  mergeConfig,
  DEFAULT_CONFIG,
  INITIAL,
  PARAMS,
  m2,
  m3,
  depositsTotal,
  monetaryBase,
  bankAssets,
  bankLiabilities,
  rbnzAssets,
  rbnzLiabilities,
  balanceSheets,
} from '../src/model.js';
import { SCENARIOS, getScenario } from '../src/scenarios.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('the opening balance sheet balances', () => {
  assert.ok(close(bankAssets(INITIAL), bankLiabilities(INITIAL)));
});

test('opening capital ratio is above the capital target', () => {
  const rwa =
    PARAMS.riskWeightHousing * INITIAL.loansHousing +
    PARAMS.riskWeightBusiness * INITIAL.loansBusiness +
    PARAMS.riskWeightConsumer * INITIAL.loansConsumer +
    PARAMS.riskWeightSecurities * INITIAL.bankSecurities;
  assert.ok(INITIAL.bankEquity / rwa > PARAMS.capitalTarget);
});

for (const scenario of SCENARIOS) {
  test(`[${scenario.id}] bank balance sheet balances every month`, () => {
    const { final } = run(scenario.config);
    assert.ok(close(bankAssets(final), bankLiabilities(final), 1e-6));
  });

  test(`[${scenario.id}] M2 identity holds for every month`, () => {
    const { history } = run(scenario.config);
    for (const r of history.slice(1)) {
      assert.ok(
        close(r.dM3, r.dCredit + r.dQeNonBank - r.dRetained - r.dFlight, 1e-9),
        `month ${r.month}: dM3 ${r.dM3} != credit ${r.dCredit} + QE ${r.dQeNonBank} - retained ${r.dRetained} - flight ${r.dFlight}`,
      );
    }
  });

  test(`[${scenario.id}] M2 = M3 minus the term-deposit shift`, () => {
    const { history } = run(scenario.config);
    for (const r of history.slice(1)) {
      assert.ok(close(r.dM2, r.dM3 - r.dTermShift, 1e-9), `month ${r.month}`);
    }
  });

  test(`[${scenario.id}] recorded flows reconcile with stock changes`, () => {
    const { history } = run(scenario.config);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const cur = history[i];
      assert.ok(close(cur.m2 - prev.m2, cur.dM2, 1e-9), `M2 stock/flow mismatch at month ${cur.month}`);
      assert.ok(close(cur.m3 - prev.m3, cur.dM3, 1e-9), `M3 stock/flow mismatch at month ${cur.month}`);
    }
  });

  test(`[${scenario.id}] the monetary base moves only with central bank operations`, () => {
    const { history } = run(scenario.config);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const cur = history[i];
      const purchases = cur.qeGovt + cur.qeBankBonds;
      const advances = (cur.rbnzAdvances ?? 0) - (prev.rbnzAdvances ?? 0);
      assert.ok(
        close(cur.base - prev.base, purchases + cur.flpDraw + advances, 1e-9),
        `month ${cur.month}: base change ${cur.base - prev.base} != purchases ${purchases} + flp ${cur.flpDraw} + advances ${advances}`,
      );
    }
  });

  test(`[${scenario.id}] settlement cash is purchases and funding less currency issued`, () => {
    const { history } = run(scenario.config);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const cur = history[i];
      const purchases = cur.qeGovt + cur.qeBankBonds;
      const advances = (cur.rbnzAdvances ?? 0) - (prev.rbnzAdvances ?? 0);
      assert.ok(
        close(
          cur.settlementCash - prev.settlementCash,
          purchases + cur.flpDraw + advances - cur.dCurrency,
          1e-9,
        ),
        `month ${cur.month}: settlement cash change does not reconcile`,
      );
    }
  });

  test(`[${scenario.id}] purchases split exactly between banks and non-banks`, () => {
    const { history } = run(scenario.config);
    for (const r of history.slice(1)) {
      const purchases = r.qeGovt + r.qeBankBonds;
      assert.ok(r.dQeNonBank <= Math.max(purchases, 0) + 1e-9, `non-bank share exceeds purchases at month ${r.month}`);
      assert.ok(r.dQeNonBank >= Math.min(purchases, 0) - 1e-9, `non-bank share below total at month ${r.month}`);
    }
  });

  test(`[${scenario.id}] opening rates match the first simulated month`, () => {
    // Guards against the opening record drifting from the step function's maths.
    const { history } = run({ ...scenario.config, policy: { start: 3.5, end: 3.5, convergeMonths: 1 } }, 1);
    for (const key of ['mortgage', 'termRate', 'businessRate', 'wholesale']) {
      if (history[0][key] === undefined) continue;
      assert.ok(
        close(history[0][key], history[1][key], 1e-9),
        `${key} drifted: opening ${history[0][key]} vs month 1 ${history[1][key]}`,
      );
    }
  });

  test(`[${scenario.id}] wholesale funding is the residual, and the book balances`, () => {
    const { history } = run(scenario.config);
    for (const r of history) {
      const assets =
        r.settlementCash +
        r.bankSecurities +
        r.loansHousing +
        r.loansBusiness +
        r.loansConsumer +
        r.bankOtherAssets;
      const liabilities =
        r.depositsTotal +
        r.bankDebt +
        r.bankBondsIssued +
        r.bankFlpBorrowing +
        r.bankAdvances +
        r.bankEquity;
      assert.ok(close(assets, liabilities, 1e-6), `month ${r.month}: bank book does not balance`);
      const residual =
        assets -
        r.depositsTotal -
        r.bankEquity -
        r.bankAdvances -
        r.bankFlpBorrowing -
        r.bankBondsIssued;
      assert.ok(
        close(r.bankDebt, residual, 1e-6),
        `month ${r.month}: bankDebt ${r.bankDebt} is not the residual ${residual}`,
      );
    }
  });

  test(`[${scenario.id}] bond holdings never exceed the stock outstanding`, () => {
    const { history } = run(scenario.config);
    for (const r of history) {
      assert.ok(
        r.rbnzGovtBonds + r.bankSecurities <= r.crownDebt + 1e-6,
        `month ${r.month}: central bank ${r.rbnzGovtBonds.toFixed(1)} + banks ${r.bankSecurities.toFixed(1)} exceeds debt ${r.crownDebt.toFixed(1)}`,
      );
      assert.ok(r.rbnzGovtBonds <= r.crownDebt + 1e-6, `month ${r.month}: central bank holds more than exists`);
    }
  });

  test(`[${scenario.id}] stocks stay non-negative and finite`, () => {
    const { history } = run(scenario.config);
    for (const r of history) {
      for (const [key, value] of Object.entries(r)) {
        assert.ok(Number.isFinite(value), `month ${r.month}: ${key} is ${value}`);
      }
      assert.ok(r.currency >= 0, `negative currency at month ${r.month}`);
      assert.ok(r.settlementCash >= 0, `negative settlement cash at month ${r.month}`);
      assert.ok(r.bankSecurities >= 0, `negative bank securities at month ${r.month}`);
      assert.ok(r.crownDebt > 0, `non-positive crown debt at month ${r.month}`);
      assert.ok(r.multiplier > 0, `non-positive multiplier at month ${r.month}`);
    }
  });

  test(`[${scenario.id}] M2 always equals currency plus on-call deposits`, () => {
    const { history } = run(scenario.config);
    for (const r of history) {
      assert.ok(close(r.m2, r.currency + r.depTransaction + r.depSavings, 1e-9));
      assert.ok(close(r.m3, r.m2 + r.depTerm, 1e-9));
      assert.ok(close(r.base, r.currency + r.settlementCash, 1e-9));
    }
  });
}

test('run() does not mutate the caller config', () => {
  const config = { months: 12, policy: { start: 1, end: 2, convergeMonths: 6 } };
  const before = JSON.stringify(config);
  run(config);
  assert.equal(JSON.stringify(config), before);
});

test('run() is deterministic', () => {
  const a = run(SCENARIOS[1].config);
  const b = run(SCENARIOS[1].config);
  assert.deepEqual(a.history, b.history);
});

test('a rate cut raises M2 growth relative to a rate hike', () => {
  const cut = run({ months: 60, policy: { start: 3.5, end: 0.5, convergeMonths: 6 } }).history.at(-1);
  const hike = run({ months: 60, policy: { start: 3.5, end: 6.5, convergeMonths: 6 } }).history.at(-1);
  assert.ok(cut.m2 > hike.m2, 'cut should leave a larger money stock than a hike');
  assert.ok(cut.loansTotal > hike.loansTotal, 'cut should leave more credit outstanding');
});

test('a higher policy rate raises the mortgage rate', () => {
  const low = run({ months: 24, policy: { start: 1, end: 1, convergeMonths: 1 } }).history.at(-1);
  const high = run({ months: 24, policy: { start: 6, end: 6, convergeMonths: 1 } }).history.at(-1);
  assert.ok(high.mortgage > low.mortgage);
});

test('bond purchases raise settlement cash far more than they raise M2', () => {
  const base = run({ months: 48 }).history.at(-1);
  const qe = run({
    months: 48,
    govtPurchases: { pace: 2, months: 30, startMonth: 0, nonBankShare: 0.2 },
  }).history.at(-1);
  const baseGrowth = qe.base / base.base;
  const m2Growth = (qe.m2 - base.m2) / base.m2;
  assert.ok(baseGrowth > 3, `base should more than triple, got ${baseGrowth.toFixed(2)}x`);
  assert.ok(m2Growth < 0.5, `M2 should rise far less than the base, got ${(m2Growth * 100).toFixed(1)}%`);
});

test('the money multiplier falls when the central bank buys bonds', () => {
  const base = run({ months: 36 }).history.at(-1);
  const qe = run({
    months: 36,
    govtPurchases: { pace: 2, months: 24, startMonth: 0, nonBankShare: 0.3 },
  }).history.at(-1);
  assert.ok(qe.multiplier < base.multiplier * 0.6);
});

test('who sells the bonds matters: non-bank sellers create more money', () => {
  const fromBanks = run({
    months: 24,
    govtPurchases: { pace: 0.4, months: 24, startMonth: 0, nonBankShare: 0 },
  }).history.at(-1);
  const fromNonBanks = run({
    months: 24,
    govtPurchases: { pace: 0.4, months: 24, startMonth: 0, nonBankShare: 1 },
  }).history.at(-1);
  assert.ok(
    fromNonBanks.m2 > fromBanks.m2,
    `non-bank sellers should create more M2 (${fromNonBanks.m2.toFixed(1)} vs ${fromBanks.m2.toFixed(1)})`,
  );
});

test('a deficit financed by the public creates no deposits directly', () => {
  const low = run({ months: 1, fiscal: { deficitPctGdp: 0 } }).history.at(-1);
  const high = run({ months: 1, fiscal: { deficitPctGdp: 10 } }).history.at(-1);
  assert.ok(close(high.dM2, low.dM2, 1e-9), 'fiscal deficits should not move M2 without monetisation');
});

test('term-deposit shifts move M2 but not M3', () => {
  const prefHigh = run({ months: 24, households: { termPreference: 0.2 } }).history.at(-1);
  const prefLow = run({ months: 24, households: { termPreference: -0.1 } }).history.at(-1);
  assert.ok(prefHigh.m2 < prefLow.m2, 'a preference for term deposits should shrink M2');
  assert.ok(
    Math.abs(prefHigh.m3 - prefLow.m3) < prefLow.m3 * 0.2,
    'M3 should be far less sensitive to deposit composition',
  );
});

test('currency demand rises at low rates and drains reserves, not M2', () => {
  const cheap = run({ months: 24, policy: { start: 0.25, end: 0.25, convergeMonths: 1 } }).history.at(-1);
  const dear = run({ months: 24, policy: { start: 7, end: 7, convergeMonths: 1 } }).history.at(-1);
  assert.ok(cheap.currency > dear.currency, 'low rates should raise currency demand');
  assert.ok(cheap.currency > 10, 'currency demand should rise from the opening level');
  assert.ok(
    cheap.settlementCash < dear.settlementCash,
    'more currency in circulation should mean fewer reserves, not more',
  );
});

test('the capital constraint throttles credit when capital is scarce', () => {
  const normal = run({ months: 60, credit: { confidence: 1, lvrTightness: 0, capitalTarget: 0.135 } }).history.at(-1);
  const strained = run({ months: 60, credit: { confidence: 1, lvrTightness: 0, capitalTarget: 0.3 } }).history.at(-1);
  assert.ok(strained.loansTotal < normal.loansTotal, 'a binding capital target should reduce lending');
});

test('a credit crunch shrinks money growth even with rate cuts', () => {
  const neutral = run({ months: 36 }).history.at(-1);
  const crunch = run({
    months: 36,
    policy: { start: 3.5, end: 2.0, convergeMonths: 6 },
    credit: { confidence: 0.2, lvrTightness: 1, capitalTarget: 0.16 },
  }).history.at(-1);
  assert.ok(crunch.m2 < neutral.m2);
});

test('autopilot responds to an inflationary shock by raising the OCR', () => {
  const { history } = run({
    months: 60,
    autopilot: true,
    fiscal: { deficitPctGdp: 8 },
  });
  assert.ok(history.at(-1).ocr > 3.5, `autopilot should tighten, got ${history.at(-1).ocr.toFixed(2)}`);
});

test('balanceSheets() returns balanced sectors', () => {
  const { final } = run(SCENARIOS[1].config);
  const sheets = balanceSheets(final);
  const sum = (rows) => rows.reduce((a, r) => a + r.value, 0);
  assert.ok(close(sum(sheets.banks.assets), sum(sheets.banks.liabilities), 1e-6));
  assert.ok(close(sum(sheets.rbnz.assets), sum(sheets.rbnz.liabilities) + sheets.rbnz.netWorth, 1e-6));
});

test('mergeConfig deep-merges nested objects', () => {
  const cfg = mergeConfig({ policy: { end: 1 } });
  assert.equal(cfg.policy.end, 1);
  assert.equal(cfg.policy.start, DEFAULT_CONFIG.policy.start);
  assert.equal(cfg.months, DEFAULT_CONFIG.months);
});

test('wholesale funding never flexes: there is no aggregate funding gap', () => {
  // This is a finding, not an accident. Every flow that changes bank assets also
  // changes liabilities by the same amount, so the residual wholesale line is
  // invariant. A model with deposits pinned by lending cannot show why a bank
  // competes for term deposits — only a model where deposits can leave can.
  for (const scenario of SCENARIOS) {
    const { history } = run(scenario.config);
    const values = history.map((r) => r.bankDebt);
    const range = Math.max(...values) - Math.min(...values);
    assert.ok(range < 1e-9, `[${scenario.id}] bankDebt moved by ${range}`);
  }
});

test('cheap funding is a central bank liability, not wholesale funding', () => {
  const { history } = run(SCENARIOS.find((s) => s.id === 'covid').config);
  const last = history.at(-1);
  assert.ok(last.bankFlpBorrowing > 0, 'covid preset should draw on the funding facility');
  assert.ok(
    Math.abs(last.bankDebt - 117) < 1e-9,
    'drawing the facility must not be booked as wholesale funding',
  );
});

test('flight reconciles with the money stock and the funding residual', () => {
  const { history } = run({ ...SCENARIOS[0].config, deposits: { margin: 1.5 } });
  const last = history.at(-1);
  const flight = history.reduce((a, r) => a + r.dFlight, 0);

  assert.ok(flight > 10, `expected meaningful flight, got ${flight.toFixed(1)}`);
  // M3 must fall by exactly what left.
  assert.ok(close(last.m3 - history[0].m3, history.reduce((a, r) => a + r.dM3, 0), 1e-6));
  // Wholesale funding replaces it one-for-one.
  assert.ok(
    close(last.bankDebt - history[0].bankDebt, flight, 1e-6),
    `bankDebt rose ${(last.bankDebt - history[0].bankDebt).toFixed(2)} but flight was ${flight.toFixed(2)}`,
  );
});

test('under-pricing term deposits empties them and forces wholesale funding', () => {
  const base = { ...SCENARIOS[0].config };
  const fair = run({ ...base, deposits: { margin: 0.5 } });
  const squeeze = run({ ...base, deposits: { margin: 1.5 } });
  const f = fair.history.at(-1);
  const q = squeeze.history.at(-1);

  assert.ok(f.depTerm > q.depTerm, 'squeezing should shrink term deposits');
  assert.ok(f.bankDebt < q.bankDebt, 'lost deposits must be replaced by wholesale funding');
  assert.ok(f.m3 > q.m3, 'money that leaves the banking system reduces M3');
  assert.ok(
    Math.abs(f.m2 - q.m2) < f.m2 * 0.02,
    'flight out of term deposits must not drain M2, which excludes them',
  );
});

test('no flight while the bank pays savers their outside option', () => {
  for (const scenario of SCENARIOS) {
    const { history } = run(scenario.config);
    const flight = history.reduce((a, r) => a + r.dFlight, 0);
    assert.ok(flight < 1e-9, `[${scenario.id}] unexpected flight of ${flight}`);
  }
});

test('there is an optimal deposit margin: squeezing too hard costs more than it saves', () => {
  const base = { ...SCENARIOS[0].config };
  const nii = (margin) => run({ ...base, deposits: { margin } }).history.at(-1).netInterestIncome;
  const fair = nii(0.5);
  const optimal = nii(0.7);
  const greedy = nii(1.5);

  assert.ok(optimal > fair, 'the bank gains by pricing closer to the outside option');
  assert.ok(optimal > greedy, 'squeezing past the outside option loses money');
});

/* ------------------------------------------------------------------ */
/* Policy path                                                         */
/* ------------------------------------------------------------------ */

test('the opening record reflects the configured policy start', () => {
  // Regression: the opening record used to show the INITIAL ocr regardless of config.
  const { history } = run({ months: 2, policy: { start: 1, end: 1, convergeMonths: 1 } });
  assert.ok(close(history[0].ocr, 1), `opening ocr was ${history[0].ocr}`);
  assert.ok(
    close(history[0].mortgage, history[1].mortgage, 1e-9),
    'opening rates must match the first simulated month',
  );
});

test('keyframes are hit in the month they are labelled', () => {
  // Regression: the path used to run one month late.
  const { history } = run({
    months: 20,
    policy: { keyframes: [{ month: 0, value: 3.5 }, { month: 10, value: 0.5 }] },
  });
  assert.ok(close(history[0].ocr, 3.5), `month 0 = ${history[0].ocr}`);
  assert.ok(close(history[5].ocr, 2.0), `month 5 = ${history[5].ocr}`);
  assert.ok(close(history[10].ocr, 0.5), `month 10 = ${history[10].ocr}`);
  assert.ok(close(history[20].ocr, 0.5), 'holds the final keyframe');
});

test('a two-point path reaches its target exactly at convergeMonths', () => {
  // Regression: "converge in 12 months" used to land at month 13.
  const { history } = run({ months: 14, policy: { start: 3.5, end: 0.25, convergeMonths: 12 } });
  assert.ok(close(history[6].ocr, (3.5 + 0.25) / 2, 1e-9), `month 6 = ${history[6].ocr}`);
  assert.ok(close(history[12].ocr, 0.25), `month 12 = ${history[12].ocr}`);
  assert.ok(close(history[14].ocr, 0.25), 'stays at the target afterwards');
});

test('autopilot keeps the OCR inside its bounds', () => {
  for (const deficitPctGdp of [0, 40]) {
    const { history } = run({ months: 120, autopilot: true, fiscal: { deficitPctGdp } });
    for (const r of history) {
      assert.ok(r.ocr >= 0.25 - 1e-9 && r.ocr <= 9 + 1e-9, `ocr ${r.ocr} at month ${r.month}`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Limits and edge cases                                               */
/* ------------------------------------------------------------------ */

test('the central bank cannot buy more bonds than are outstanding', () => {
  const { history } = run({
    months: 24,
    govtPurchases: { pace: 50, months: 24, nonBankShare: 0.5 },
  });
  for (const r of history) {
    assert.ok(r.rbnzGovtBonds <= r.crownDebt + 1e-6, `month ${r.month}`);
  }
});

test('run() honours a months override, including zero', () => {
  assert.equal(run({ months: 10 }, 3).history.length, 4);
  assert.equal(run({ months: 10 }, 0).history.length, 1);
});

test('createInitialState returns independent copies', () => {
  const a = createInitialState();
  const b = createInitialState();
  a.loansHousing = 1;
  assert.notEqual(b.loansHousing, 1, 'states must not share objects');
  assert.equal(INITIAL.loansHousing, 350, 'the template must not be mutated');
});

test('run() does not mutate shared scenario presets', () => {
  const before = JSON.stringify(SCENARIOS.map((s) => s.config));
  for (const scenario of SCENARIOS) run(scenario.config);
  assert.equal(JSON.stringify(SCENARIOS.map((s) => s.config)), before);
});

test('mergeConfig does not mutate its argument', () => {
  const input = { policy: { end: 1 }, deposits: { margin: 1.2 } };
  const snapshot = JSON.stringify(input);
  const out = mergeConfig(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.notEqual(out.policy, input.policy, 'nested objects must be copied');
});

test('getScenario falls back to the first preset', () => {
  assert.equal(getScenario('does-not-exist'), SCENARIOS[0]);
});

test('the crown debt rises by the monthly deficit', () => {
  const { history } = run({
    months: 12,
    fiscal: { deficitPctGdp: 3 },
    govtPurchases: { pace: 0, months: 0, nonBankShare: 0.5 },
  });
  for (let i = 1; i < history.length; i++) {
    assert.ok(
      close(history[i].crownDebt - history[i - 1].crownDebt, history[i].deficit, 1e-9),
      `month ${history[i].month}`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* Robustness                                                          */
/* ------------------------------------------------------------------ */

test('extreme settings never produce an impossible balance sheet', () => {
  const configs = [
    { policy: { start: 0, end: 0, convergeMonths: 1 } },
    { policy: { start: 9, end: 9, convergeMonths: 1 } },
    { deposits: { margin: 1.5 } },
    { credit: { confidence: 0.2, lvrTightness: 1, capitalTarget: 0.3 } },
    { households: { termPreference: 0.25 } },
    { households: { termPreference: -0.15 } },
    { govtPurchases: { pace: 5, months: 60, nonBankShare: 0 } },
    { govtPurchases: { pace: 50, months: 24, nonBankShare: 0.5 } },
    { govtPurchases: { pace: 50, months: 24, nonBankShare: 1 } },
    { fiscal: { deficitPctGdp: 20 } },
    { flp: { total: 40, months: 6, startMonth: 0 } },
    { autopilot: true, fiscal: { deficitPctGdp: 15 } },
    { govtSales: { pace: 3, startMonth: 0 }, deposits: { margin: 1.4 } },
  ];

  for (const [i, extra] of configs.entries()) {
    const { history } = run({ months: 60, ...extra });
    for (const r of history) {
      for (const [key, value] of Object.entries(r)) {
        assert.ok(Number.isFinite(value), `config #${i} month ${r.month}: ${key} = ${value}`);
      }
      assert.ok(r.depTransaction >= -1e-9, `config #${i} month ${r.month}: negative transaction deposits`);
      assert.ok(r.depSavings >= -1e-9, `config #${i} month ${r.month}: negative savings deposits`);
      assert.ok(r.depTerm >= -1e-9, `config #${i} month ${r.month}: negative term deposits`);
      assert.ok(r.depTerm <= r.depositsTotal + 1e-6, `config #${i} month ${r.month}: term > total`);
      assert.ok(r.m2 <= r.m3 + 1e-6, `config #${i} month ${r.month}: M2 exceeds M3`);
      assert.ok(r.settlementCash >= 0, `config #${i} month ${r.month}: negative reserves`);
      assert.ok(r.bankDebt >= -1e-6, `config #${i} month ${r.month}: negative wholesale funding`);
      assert.ok(r.currency >= 0, `config #${i} month ${r.month}: negative currency`);
      assert.ok(
        r.rbnzGovtBonds + r.bankSecurities <= r.crownDebt + 1e-6,
        `config #${i} month ${r.month}: more bonds held than outstanding`,
      );
    }
  }
});

test('squeezing the deposit margin monotonically shrinks term deposits', () => {
  const margins = [0, 0.5, 0.9, 1.3, 1.5];
  const terms = margins.map(
    (margin) => run({ ...SCENARIOS[0].config, deposits: { margin } }).final.depTerm,
  );
  for (let i = 1; i < terms.length; i++) {
    assert.ok(
      terms[i] <= terms[i - 1] + 1e-9,
      `margin ${margins[i]} kept ${terms[i].toFixed(1)} vs ${terms[i - 1].toFixed(1)} at ${margins[i - 1]}`,
    );
  }
});

test('buying a bank bond from a bank creates a liability, not a securities sale', () => {
  // Regression: the central bank "buying bank bonds" used to drain the banks'
  // government securities, which are a different instrument entirely.
  const { history } = run(SCENARIOS.find((s) => s.id === 'bank-bonds').config);
  const first = history[0];
  const last = history.at(-1);
  const nonBankShare = SCENARIOS.find((s) => s.id === 'bank-bonds').config.bankBondPurchases.nonBankShare;
  const bought = last.rbnzBankBonds - first.rbnzBankBonds;

  assert.ok(close(last.bankSecurities, first.bankSecurities, 1e-6), 'government securities must not move');
  assert.ok(
    close(last.bankBondsIssued - first.bankBondsIssued, bought * (1 - nonBankShare), 1e-6),
    'the banking sector must issue the bonds it sells to the central bank',
  );
  // The non-bank share is what actually creates deposits.
  const fromNonBanks = history.reduce((a, r) => a + r.dQeNonBank, 0);
  assert.ok(close(fromNonBanks, bought * nonBankShare, 1e-6));
});
