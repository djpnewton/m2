import { run, mergeConfig } from './model.js?cache-tag=1';
import { scenariosFor, getScenario } from './scenarios.js?cache-tag=1';
import { paramsFor, proseFor, termsFor } from './regions.js?cache-tag=1';
import { lineChart, stackedArea, waterfall, COLORS } from './charts.js?cache-tag=1';
import { renderAccounts } from './accounts.js?cache-tag=1';
import { defineTerm, mountGlossary, setGlossaryRegion } from './glossary.js?cache-tag=1';
import { BASE_YEAR, createHistory, correlation } from './history.js?cache-tag=1';

const state = {
  region: 'us',
  scenarioId: 'neutral',
  config: mergeConfig({ ...getScenario('neutral').config, region: 'us' }),
  compareId: 'covid',
  compareOn: false,
  accountMonth: null,
  openMetric: null,
};

const el = (id) => document.getElementById(id);
const bn = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

let runs = { primary: null, compare: null };
const charts = {};

/** Active terminology and parameters. Re-bound whenever the region changes. */
let t = termsFor('us');
let P = paramsFor('us');

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function setConfig(path, value) {
  const parts = path.split('.');
  let target = state.config;
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] ??= {};
    target = target[parts[i]];
  }
  target[parts.at(-1)] = value;
}

function control({ label, path, min, max, step, value, format, hint, disabled }) {
  const id = `ctl-${path.replaceAll('.', '-')}`;
  if (format) formatters.set(path, format);
  return `<div class="control${disabled ? ' is-disabled' : ''}">
      <label for="${id}"><span>${label}</span><output id="${id}-out">${format(value)}</output></label>
      <input type="range" id="${id}" data-path="${path}" min="${min}" max="${max}" step="${step}"
             value="${value}" ${disabled ? 'disabled' : ''}>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
    </div>`;
}

/** Rebuild everything that depends on the region. */
function setRegion(id) {
  if (id === state.region) return;
  state.region = id;
  t = termsFor(id);
  P = paramsFor(id);
  setGlossaryRegion(id);
  state.scenarioId = 'neutral';
  state.config = mergeConfig({ ...getScenario('neutral', id).config, region: id });
  renderControls();
  render();
}

function renderProse() {
  const reservesTerm = el('term-reserves');
  if (reservesTerm) reservesTerm.textContent = t.reservesLabel;
  const eyebrow = el('masthead-region');
  if (eyebrow) eyebrow.textContent = `Monetary mechanics · modelled on the ${t.centralBankFull}`;
  const units = el('footer-units');
  if (units) {
    units.textContent = `A teaching model, not a forecast. All figures are ${t.currency} billions unless stated. The model solves no optimisation problem and has no expectations beyond a simple backward-looking anchor — it exists to make the accounting visible.`;
  }
  const node = el('assumptions');
  if (!node) return;
  const markup = proseFor(state.region);
  if (node.dataset.region !== state.region) {
    node.innerHTML = markup;
    node.dataset.region = state.region;
  }
}

function renderControls() {
  const c = state.config;
  const scenarios = scenariosFor(state.region);
  const hasKeyframes = Array.isArray(c.policy.keyframes);
  // The rate a bank would pay before any scenario movement, straight from the model.
  const openingWholesale = run(c, 0).history[0].wholesale;

  el('controls').innerHTML = `
    <div class="panel-block">
      <h2>Scenarios</h2>
      <div class="chips">
        ${scenarios.map(
          (s) =>
            `<button class="chip${s.id === state.scenarioId ? ' is-active' : ''}" data-scenario="${s.id}">${s.name}</button>`,
        ).join('')}
      </div>
      <p class="blurb">${blurbFor(state.scenarioId)}</p>
    </div>

    <details class="panel-block" open>
      <summary><h2>Policy rate</h2></summary>
      ${
        hasKeyframes
          ? `<p class="badge-note">This scenario follows a preset rate path with several turning points.</p>
             <ul class="path-list">
               ${c.policy.keyframes
                 .map((k) => `<li><span>month ${k.month}</span><b>${k.value.toFixed(2)}%</b></li>`)
                 .join('')}
             </ul>
             <button class="ghost" id="ctl-simplify">Use a simple two-point path instead</button>`
          : `${control({ label: `${t.policyRateLabel} to start`, path: 'policy.start', min: 0, max: 8, step: 0.05, value: c.policy.start ?? 4.4, format: (v) => `${v.toFixed(2)}%` })}
             ${control({ label: `${t.policyRateLabel} once settled`, path: 'policy.end', min: 0, max: 8, step: 0.05, value: c.policy.end ?? 4.4, format: (v) => `${v.toFixed(2)}%` })}
             ${control({ label: 'Months to get there', path: 'policy.convergeMonths', min: 1, max: 36, step: 1, value: c.policy.convergeMonths ?? 12, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}`
      }
      <label class="switch">
        <input type="checkbox" id="ctl-autopilot" ${c.autopilot ? 'checked' : ''}>
        <span>Let the central bank react automatically</span>
      </label>
      <p class="hint">
        Reacts using a simple ${defineTerm('taylor-rule', 'Taylor rule')}: raise the rate when
        inflation is above target or demand is above potential, cut it when the reverse holds.
      </p>
    </details>

    <details class="panel-block">
      <summary><h2>Government bond purchases</h2></summary>
      ${control({ label: 'Government bonds bought each month', path: 'govtPurchases.pace', min: 0, max: 300, step: 5, value: c.govtPurchases.pace, format: (v) => `${t.currency}${v.toFixed(0)}bn / month` })}
      ${control({ label: 'Purchase period (government)', path: 'govtPurchases.months', min: 0, max: 60, step: 1, value: c.govtPurchases.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
      ${control({
        label: 'Government bonds bought from non-banks',
        path: 'govtPurchases.nonBankShare',
        min: 0,
        max: 1,
        step: 0.05,
        value: c.govtPurchases.nonBankShare,
        format: (v) => `${Math.round(v * 100)}%`,
        hint: `Only bonds sold by a non-bank create a deposit straight away. When a bank sells it swaps a bond for ${defineTerm('reserve-balances', 'reserves')} and no deposit exists — but the reserves do reach M2 eventually: the central bank now owns the bond, which compresses the ${defineTerm('term-premium', 'term premium')} and pulls lending rates down, so credit and deposits rise.`,
      })}
      ${control({ label: 'Government bonds sold each month', path: 'govtSales.pace', min: 0, max: 200, step: 5, value: c.govtSales.pace, format: (v) => `${t.currency}${v.toFixed(0)}bn / month`, hint: `Selling bonds back — ${defineTerm('qt', 'quantitative tightening')} — drains ${t.reserves} and shrinks the base.` })}
      ${control({ label: 'Selling starts at month', path: 'govtSales.startMonth', min: 0, max: 96, step: 1, value: c.govtSales.startMonth, format: (v) => (v >= 96 ? 'not within window' : `month ${v}`) })}
    </details>

    <details class="panel-block">
      <summary><h2>Bank bonds and funding</h2></summary>
      ${control({ label: 'Bank bonds bought each month', path: 'bankBondPurchases.pace', min: 0, max: 200, step: 5, value: c.bankBondPurchases.pace, format: (v) => `${t.currency}${v.toFixed(0)}bn / month` })}
      ${control({ label: 'Purchase period (bank bonds)', path: 'bankBondPurchases.months', min: 0, max: 60, step: 1, value: c.bankBondPurchases.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
      ${control({ label: 'Bank bonds bought from non-banks', path: 'bankBondPurchases.nonBankShare', min: 0, max: 1, step: 0.05, value: c.bankBondPurchases.nonBankShare, format: (v) => `${Math.round(v * 100)}%` })}
      ${control({ label: 'Cheap funding offered to banks', path: 'fundingFacility.total', min: 0, max: 2000, step: 25, value: c.fundingFacility.total, format: (v) => `${t.currency}${v.toFixed(0)}bn`, hint: `Like the ${defineTerm('funding-facility', '${t.fundingFacility}')}. It creates reserves but no deposits; it reaches M2 only through the lending rate — cheaper funding lowers the rate, which raises credit demand, and each new loan creates a deposit. Small lever, slow channel.` })}
      ${control({ label: 'Cheap funding drawn over', path: 'fundingFacility.months', min: 0, max: 36, step: 1, value: c.fundingFacility.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
    </details>

    <details class="panel-block">
      <summary><h2>Fiscal and credit conditions</h2></summary>
      ${control({
        label: 'Debt risk premium',
        path: 'fiscal.riskSensitivity',
        min: 0,
        max: 0.15,
        step: 0.01,
        value: c.fiscal.riskSensitivity ?? 0,
        format: (v) => (v === 0 ? 'off' : `${(v * 100).toFixed(0)}bp per point`),
        hint: `Extra yield lenders demand for each point of debt above ${P.debtThresholdPct}% of GDP. Turning it on also puts the interest bill inside the deficit, so a larger debt stock borrows against itself. Above nominal growth the debt ratio compounds without limit.`,
      })}
      ${control({ label: 'Government deficit', path: 'fiscal.deficitPctGdp', min: 0, max: 20, step: 0.5, value: c.fiscal.deficitPctGdp, format: (v) => `${v.toFixed(1)}% of GDP`, hint: `Bonds sold to the public swap a deposit for a bond, so the financing itself creates no deposit. Above the ${P.fiscalBaseline.toFixed(0)}%-of-GDP baseline the deficit also lifts demand, and the borrowing that follows does create deposits.` })}
      ${control({ label: 'Confidence', path: 'credit.confidence', min: 0.2, max: 1.6, step: 0.05, value: c.credit.confidence, format: (v) => `${Math.round(v * 100)}%` })}
      ${control({ label: `Lending restrictions (${t.macroRule})`, path: 'credit.creditTightness', min: 0, max: 1, step: 0.05, value: c.credit.creditTightness, format: (v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`), hint: `Restrictions on high-${defineTerm('lvr', 'LTV')} or high-${defineTerm('dti', 'DTI')} lending. These slow credit without moving the policy rate.` })}
      ${control({ label: 'Capital banks must hold', path: 'credit.capitalTarget', min: 0.1, max: 0.3, step: 0.005, value: c.credit.capitalTarget ?? P.capitalTarget, format: (v) => `${(v * 100).toFixed(1)}%`, hint: `Equity against ${defineTerm('risk-weighted-capital', 'risk-weighted assets')}. This is the binding constraint on lending.` })}
      ${control({ label: "Savers' preference for term deposits", path: 'households.termPreference', min: -0.15, max: 0.25, step: 0.01, value: c.households.termPreference, format: (v) => signed(v * 100) + 'pp' })}
      ${control({
        label: 'Deposit rate discount',
        path: 'deposits.margin',
        min: 0,
        max: 1.5,
        step: 0.05,
        value: c.deposits.margin,
        format: (v) => `${v.toFixed(2)}pp under market`,
        hint: `How much the bank shaves off market rates when pricing term deposits. Past about ${P.depositConvenience.toFixed(1)}pp savers move money elsewhere, and the bank replaces it with ${defineTerm('wholesale-funding', 'wholesale funding')} at <span id="hint-wholesale">${openingWholesale.toFixed(2)}%</span>.`,
      })}
    </details>

    <div class="panel-block">
      <h2>Window</h2>
      ${control({ label: 'How far ahead to show', path: 'months', min: 24, max: 120, step: 12, value: c.months, format: (v) => `${v} months (${Math.round(v / 12)} years)` })}
      <label class="switch">
        <input type="checkbox" id="ctl-compare" ${state.compareOn ? 'checked' : ''}>
        <span>Compare with another scenario</span>
      </label>
      ${
        state.compareOn
          ? `<select id="ctl-compare-scenario" class="select">
              ${scenarios.filter((s) => s.id !== state.scenarioId)
                .map((s) => `<option value="${s.id}" ${s.id === state.compareId ? 'selected' : ''}>${s.name}</option>`)
                .join('')}
            </select>`
          : ''
      }
      <button class="ghost" id="ctl-reset">Reset to preset</button>
    </div>
  `;

  for (const input of el('controls').querySelectorAll('input[type="range"]')) {
    input.addEventListener('input', () => {
      const value = Number(input.value);
      const path = input.dataset.path;
      setConfig(path, value);
      if (path.startsWith('policy.') && Array.isArray(state.config.policy.keyframes)) {
        state.config.policy.keyframes = undefined;
        renderControls();
      }
      const out = document.getElementById(`${input.id}-out`);
      if (out) out.textContent = formatFor(path, value);
      scheduleRender();
    });
  }

  el('controls').querySelector('#ctl-simplify')?.addEventListener('click', () => {
    const frames = state.config.policy.keyframes;
    state.config.policy = {
      start: frames[0].value,
      end: frames.at(-1).value,
      convergeMonths: Math.max(1, frames.at(-1).month - frames[0].month),
    };
    renderControls();
    scheduleRender();
  });

  el('controls').querySelector('#ctl-reset')?.addEventListener('click', () => {
    loadScenario(state.scenarioId);
  });

  el('controls').querySelector('#ctl-autopilot')?.addEventListener('change', (e) => {
    state.config.autopilot = e.target.checked;
    scheduleRender();
  });

  el('controls').querySelector('#ctl-compare')?.addEventListener('change', (e) => {
    state.compareOn = e.target.checked;
    ensureCompareDistinct();
    renderControls();
    scheduleRender();
  });

  el('controls').querySelector('#ctl-compare-scenario')?.addEventListener('change', (e) => {
    state.compareId = e.target.value;
    scheduleRender();
  });

  for (const chip of el('controls').querySelectorAll('[data-scenario]')) {
    chip.addEventListener('click', () => loadScenario(chip.dataset.scenario));
  }
}

/**
 * Each slider formatter is defined once, at its call site, and recorded here as
 * the controls render so live updates reuse the same function.
 */
const formatters = new Map();

function formatFor(path, value) {
  return (formatters.get(path) ?? String)(value);
}

function ensureCompareDistinct() {
  if (state.compareId === state.scenarioId) {
    state.compareId = scenariosFor(state.region).find((s) => s.id !== state.scenarioId)?.id ?? state.compareId;
  }
}

/** Scenario blurbs are functions when they quote figures derived from their own config. */
function blurbFor(id) {
  const scenario = getScenario(id);
  return typeof scenario.blurb === 'function'
    ? scenario.blurb(mergeConfig(scenario.config))
    : scenario.blurb;
}

function loadScenario(id) {
  state.scenarioId = id;
  ensureCompareDistinct();
  state.config = mergeConfig(getScenario(id).config);
  state.accountMonth = null;
  renderControls();
  scheduleRender();
}


/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

let frame = null;
function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    render();
  });
}

function refreshRuns() {
  runs.primary = run(state.config);
  const compareCfg = state.compareOn
    ? { ...getScenario(state.compareId, state.region).config, region: state.region }
    : null;
  runs.compare = compareCfg ? run(compareCfg) : null;
}

function seriesFor(accessor, name, color, opts = {}) {
  const out = [
    {
      name,
      color,
      points: runs.primary.history.map((r) => [r.month, accessor(r)]),
      area: opts.area,
      width: opts.width,
    },
  ];
  if (runs.compare) {
    out.push({
      name: `${name} · ${getScenario(state.compareId, state.region).name}`,
      color,
      dashed: true,
      width: 1.6,
      points: runs.compare.history.map((r) => [r.month, accessor(r)]),
    });
  }
  return out;
}

/** Twelve-month growth in a stock, paired with the month it is measured at. */
function growthRateSeries(history, accessor) {
  const out = [];
  for (let i = 12; i < history.length; i++) {
    const then = accessor(history[i - 12]);
    const now = accessor(history[i]);
    out.push([history[i].month, then > 0 ? (now / then - 1) * 100 : 0]);
  }
  return out;
}

function metricContext() {
  const h = runs.primary.history;
  const last = h.at(-1);
  const start = h[0];
  return {
    h,
    last,
    start,
    sum: (key) => h.reduce((a, r) => a + (r[key] ?? 0), 0),
    prevYear: h.at(-13) ?? start,
    cmp: runs.compare?.history.at(-1) ?? null,
    months: h.length - 1,
    cfg: state.config,
  };
}

const growthPct = (now, then) => (then > 0 ? (now / then - 1) * 100 : 0);
const pc = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const times = (v) => `${v.toFixed(1)}×`;
const flow = (v) => (Math.abs(v) < 0.005 ? '0.0' : signed(v));
const kindOf = (v) => (Math.abs(v) < 0.005 ? 'nil' : v > 0 ? 'add' : 'sub');

/**
 * The M2 identity, split into the flows that make it up. Shared by the KPI panel
 * and the waterfall so the two cannot disagree.
 *
 * Flight appears in dTermShift already (term deposits that left were booked as a
 * fall in the term stock), but those balances were never M2 and their departure
 * leaves M2 untouched — so the term row is built from the two together, which
 * cancels it: dM2 = credit + QE − retained − (dTermShift + flight).
 */
export function decomposeM2(history) {
  const sum = (key) => history.reduce((a, r) => a + (r[key] ?? 0), 0);
  const credit = sum('dCredit');
  const qe = sum('dQeNonBank');
  const retained = -sum('dRetained');
  const term = -(sum('dTermShift') + sum('dFlight'));
  return { credit, qe, retained, term, total: credit + qe + retained + term };
}

/**
 * The loan book, split by borrower, at the end of the window and at its start.
 * The three parts sum to total bank credit, which is what makes the chart stack
 * comparable with the bank credit tile.
 */
export function creditMix(history) {
  const first = history[0];
  const last = history.at(-1);
  const split = (r) => ({
    housing: r.loansHousing,
    business: r.loansBusiness,
    consumer: r.loansConsumer,
    total: r.loansTotal,
  });
  const housingShare = (r) => (r.loansTotal > 0 ? (r.loansHousing / r.loansTotal) * 100 : 0);
  return {
    first: split(first),
    last: split(last),
    openingHousingShare: housingShare(first),
    housingShare: housingShare(last),
  };
}

export const METRICS = [
  {
    key: 'm2',
    label: 'M2',
    value: (c) => `${t.currency}${bn(c.last.m2)}bn`,
    sub: (c) =>
      `${growthPct(c.last.m2, c.prevYear.m2).toFixed(1)}% over the past year · ` +
      `${t.currency}${Math.round(c.last.m2 / P.population)}k per person`,
    compare: (c) => (c.cmp ? `vs ${t.currency}${bn(c.cmp.m2)}bn in comparison` : ''),
    detail: (c) => {
      const { credit, qe, retained, term } = decomposeM2(c.h);
      const total = c.last.m2 - c.start.m2;
      const share = Math.abs(total) > 0.5 ? (Math.abs(qe) / Math.abs(total)) * 100 : 0;
      return {
        title: 'M2 — money you can spend',
        definition:
          `Currency in circulation plus transaction and on-call savings deposits: the money households and firms can spend without giving notice — about ${t.currency}${Math.round(c.last.m2 / P.population)}k for every ${t.citizen}. Every row below is a flow that adds to or subtracts from it.`,
        rows: [
          {
            label: 'New bank lending',
            value: flow(credit),
            kind: kindOf(credit),
            note: 'Every new loan creates the deposit that funds it. This is where most money comes from.',
          },
          {
            label: 'Bond purchases from non-banks',
            value: flow(qe),
            kind: kindOf(qe),
            note: 'Only the share sold by a non-bank becomes a deposit. When a bank sells, it swaps a bond for reserves and no money is created.',
          },
          {
            label: 'Retained bank earnings',
            value: flow(retained),
            kind: kindOf(retained),
            note: 'Profit banks keep rather than pay out is money that stops circulating.',
          },
          {
            label: 'Shift into term deposits',
            value: flow(term),
            kind: kindOf(term),
            note: `Term deposits leave M2 but stay inside M3 — the same money, relabelled. They create no lendable funds: lending creates the deposit, not the other way round. Banks compete for them anyway, because the alternative is dearer — wholesale funding costs ${c.last.wholesale.toFixed(2)}%, against ${c.last.termRate.toFixed(2)}% for a term deposit. The extra paid over an on-call balance (${c.last.onCallRate.toFixed(2)}%) buys duration: money that cannot walk out tomorrow.`,
          },
          {
            label: 'Notes and coins vs deposits',
            value: '0.0',
            kind: 'nil',
            note: (() => {
              const dc = c.sum('dCurrency');
              const dir = dc >= 0 ? 'higher' : 'lower';
              return `Currency demand ended ${t.currency}${Math.abs(dc).toFixed(1)}bn ${dir} than it started, but a dollar moving between a deposit and a banknote is still M2. It shifts the monetary base instead.`;
            })(),
          },
        ],
        total: { label: 'Change in M2', value: flow(total) },
        reading: (() => {
          if (qe > 0.5) {
            return `Of the ${t.currency}${total.toFixed(1)}bn created over ${c.months} months, ${t.currency}${credit.toFixed(1)}bn came from lending and ${t.currency}${qe.toFixed(1)}bn from the purchase programme — about ${share.toFixed(0)}% of the total. Lending remains the dominant source even during a large asset purchase programme.`;
          }
          if (qe < -0.5) {
            return `The central bank sold bonds back over these ${c.months} months, which destroyed ${t.currency}${Math.abs(qe).toFixed(1)}bn of deposits. Lending ${credit >= 0 ? 'added' : 'removed'} ${t.currency}${Math.abs(credit).toFixed(1)}bn, leaving M2 ${t.currency}${Math.abs(total).toFixed(1)}bn ${total >= 0 ? 'higher' : 'lower'}.`;
          }
          return 'With no bond operations in this run, M2 moved with bank lending and deposit behaviour alone.';
        })(),
      };
    },
  },
  {
    key: 'm3',
    label: 'M3',
    value: (c) => `${t.currency}${bn(c.last.m3)}bn`,
    sub: (c) => `${signed(c.last.m3 - c.start.m3)}bn over the window`,
    compare: (c) => (c.cmp ? `vs ${t.currency}${bn(c.cmp.m3)}bn in comparison` : ''),
    detail: (c) => {
      const credit = c.sum('dCredit');
      const qe = c.sum('dQeNonBank');
      const retained = -c.sum('dRetained');
      const total = c.last.m3 - c.start.m3;
      const gap = c.last.m3 - c.last.m2;
      const flight = c.sum('dFlight');
      const termShare = (c.last.depTerm / c.last.depositsTotal) * 100;
      return {
        title: 'M3 — M2 plus term deposits',
        definition:
          'M2 plus term deposits. Still bank money, just not spendable at call. It moves with the same flows as M2, without the reshuffling between deposit types.',
        rows: [
          {
            label: 'New bank lending',
            value: flow(credit),
            kind: kindOf(credit),
            note: 'Identical to the M2 contribution: a loan creates a deposit wherever it is parked.',
          },
          {
            label: 'Bond purchases from non-banks',
            value: flow(qe),
            kind: kindOf(qe),
            note: 'Also identical. Purchases create a deposit; whether it ends up on call or on term is a separate decision.',
          },
          {
            label: 'Retained bank earnings',
            value: flow(retained),
            kind: kindOf(retained),
            note: 'Also identical — profit retention destroys deposits of any type.',
          },
          ...(Math.abs(flight) > 0.005
            ? [
                {
                  label: 'Deposits lost to non-banks',
                  value: flow(-flight),
                  kind: 'sub',
                  note: `Term deposits priced below the savers' outside option (${c.last.outsideRate.toFixed(2)}%). The bank replaces them with wholesale borrowing, which is why its funding cost rises.`,
                },
              ]
            : []),
        ],
        total: { label: 'Change in M3', value: flow(total) },
        reading: `M3 − M2 is ${t.currency}${gap.toFixed(1)}bn of term deposits, ${termShare.toFixed(0)}% of all bank deposits. Because a shift between deposit types redistributes money rather than creating it, M3 is the cleaner measure of how much the banking system actually created.`,
      };
    },
  },
  {
    key: 'base',
    label: 'Monetary base',
    value: (c) => `${t.currency}${bn(c.last.base)}bn`,
    sub: (c) => `${times(c.last.base / c.start.base)} the opening level`,
    compare: (c) => (c.cmp ? `vs ${t.currency}${bn(c.cmp.base)}bn in comparison` : ''),
    detail: (c) => {
      const purchases = c.sum('qeGovt') + c.sum('qeBankBonds');
      const fundingFacility = c.sum('fundingDraw');
      const advances = (c.last.cbAdvances ?? 0) - (c.start.cbAdvances ?? 0);
      const total = c.last.base - c.start.base;
      return {
        title: "Monetary base — what the central bank pays with",
        definition:
          `Currency in circulation plus the ${t.reserves} banks keep at the ${t.centralBank}. It is the central bank's own liability, so only the central bank's operations can change it.`,
        rows: [
          {
            label: 'Bond purchases',
            value: flow(purchases),
            kind: kindOf(purchases),
            note: `Paid for by crediting the seller’s bank with ${t.reserves}. The base rises by the full amount, whoever sold.`,
          },
          {
            label: 'Cheap funding drawn',
            value: flow(fundingFacility),
            kind: kindOf(fundingFacility),
            note: 'Central-bank funding also creates reserves.',
          },
          {
            label: 'Standing facility advances',
            value: flow(advances),
            kind: kindOf(advances),
            note: 'Reserves borrowed against collateral when the balance would otherwise go negative.',
          },
          {
            label: 'Notes and coins',
            value: '0.0',
            kind: 'nil',
            note: 'Issuing a banknote swaps reserves for currency: the composition changes, the total does not.',
          },
        ],
        total: { label: 'Change in base', value: flow(total) },
        reading: (() => {
          const head = "The base is set by the central bank's own operations, not by how much banks want to lend.";
          const sources = [];
          if (Math.abs(purchases) > 0.05) sources.push(`${t.currency}${purchases.toFixed(1)}bn of net asset purchases`);
          if (Math.abs(fundingFacility) > 0.05) sources.push(`${t.currency}${fundingFacility.toFixed(1)}bn drawn under the funding facility`);
          if (Math.abs(advances) > 0.05) sources.push(`${t.currency}${advances.toFixed(1)}bn of standing-facility advances`);
          if (!sources.length) {
            return `${head} There were no central bank operations in this window, so the base did not move.`;
          }
          const joined =
            sources.length === 1 ? sources[0] : `${sources.slice(0, -1).join(', ')} and ${sources.at(-1)}`;
          return `${head} The ${total >= 0 ? 'rise' : 'fall'} of ${t.currency}${Math.abs(total).toFixed(1)}bn came from ${joined}.`;
        })(),
      };
    },
  },
  {
    key: 'mult',
    label: 'Money multiplier',
    value: (c) => c.last.multiplier.toFixed(1),
    sub: () => 'M2 per dollar of base',
    tone: (c) => (c.last.multiplier < c.start.multiplier * 0.7 ? 'down' : ''),
    compare: (c) => (c.cmp ? `vs ${c.cmp.multiplier.toFixed(1)} in comparison` : ''),
    detail: (c) => {
      const m2g = growthPct(c.last.m2, c.start.m2);
      const basG = growthPct(c.last.base, c.start.base);
      const ratG = growthPct(c.last.multiplier, c.start.multiplier);
      return {
        title: 'Money multiplier — an arithmetic ratio, not a machine',
        definition:
          'M2 divided by the monetary base. It is what you get after dividing the money stock by reserves. It does not cause either of them.',
        rows: [
          {
            label: 'M2',
            value: `${t.currency}${c.start.m2.toFixed(0)}bn → ${t.currency}${c.last.m2.toFixed(0)}bn`,
            kind: 'level',
            note: `${pc(m2g)} over the window.`,
          },
          {
            label: 'Monetary base',
            value: `${t.currency}${c.start.base.toFixed(1)}bn → ${t.currency}${c.last.base.toFixed(1)}bn`,
            kind: 'level',
            note: `${pc(basG)} over the window.`,
          },
          {
            label: 'Ratio',
            value: `${c.start.multiplier.toFixed(1)} → ${c.last.multiplier.toFixed(1)}`,
            kind: 'level',
            note: `${pc(ratG)} — the ratio tracks whichever of the two is growing faster.`,
          },
        ],
        total: null,
        reading: `M2 grew ${m2g.toFixed(0)}% while the base grew ${basG.toFixed(0)}%, so the ratio fell ${Math.abs(ratG).toFixed(0)}%. The reserves were created to settle asset purchases; nobody had to build deposits on top of them. A rising multiplier would only mean reserves were being created faster than money.`,
      };
    },
  },
  {
    key: 'settlement',
    get label() {
      return t.reservesLabel;
    },
    value: (c) => `${t.currency}${bn(c.last.reserves)}bn`,
    sub: (c) => `${times(c.last.reserves / c.start.reserves)} the opening level`,
    compare: (c) => (c.cmp ? `vs ${t.currency}${bn(c.cmp.reserves)}bn in comparison` : ''),
    detail: (c) => {
      const purchases = c.sum('qeGovt') + c.sum('qeBankBonds');
      const fundingFacility = c.sum('fundingDraw');
      const advances = (c.last.cbAdvances ?? 0) - (c.start.cbAdvances ?? 0);
      const currency = c.last.currency - c.start.currency;
      const total = c.last.reserves - c.start.reserves;
      return {
        title: `${t.reservesLabel} — the ${t.centralBank}’s own liability`,
        definition:
          `Reserves banks hold at the ${t.centralBank} to settle payments with each other, with the ${t.government} and with the ${t.centralBank} itself. ${t.reserveHistory}, and the ${t.centralBank} pays interest on these balances, so they are supplied on demand rather than rationed.`,
        rows: [
          {
            label: 'Credited from bond purchases',
            value: flow(purchases),
            kind: kindOf(purchases),
            note: 'Every purchase lands here first, whoever the seller was.',
          },
          {
            label: 'Cheap funding drawn',
            value: flow(fundingFacility),
            kind: kindOf(fundingFacility),
            note: 'The facility lends reserves directly to banks.',
          },
          {
            label: 'Standing facility',
            value: flow(advances),
            kind: kindOf(advances),
            note: 'Drawn when settlements would otherwise run the balance negative.',
          },
          {
            label: 'Less currency issued',
            value: flow(-currency),
            kind: kindOf(-currency),
            note: `Banknotes are funded by draining ${t.reserves} — the public swapping deposits for cash.`,
          },
        ],
        total: { label: `Change in ${t.reserves}`, value: flow(total) },
        reading: `Now ${times(c.last.reserves / c.start.reserves)} the opening level, earning the policy rate and funding nothing. This is the money the purchase programme actually created — and it is not M2.`,
      };
    },
  },
  {
    key: 'credit',
    label: 'Bank credit',
    value: (c) => `${t.currency}${bn(c.last.loansTotal)}bn`,
    sub: (c) => `${signed(c.last.loansTotal - c.start.loansTotal)}bn over the window`,
    compare: (c) => (c.cmp ? `vs ${t.currency}${bn(c.cmp.loansTotal)}bn in comparison` : ''),
    detail: (c) => {
      const dH = c.last.loansHousing - c.start.loansHousing;
      const dB = c.last.loansBusiness - c.start.loansBusiness;
      const dC = c.last.loansConsumer - c.start.loansConsumer;
      const total = dH + dB + dC;
      const ocrMoved = Math.abs(c.last.policyRate - c.start.policyRate) > 0.01;
      const mortFall = c.start.mortgage - c.last.mortgage;
      return {
        title: 'Bank credit — the asset that makes the money',
        definition:
          'Loans outstanding to households and firms. When a bank issues one it creates the matching deposit; when one is repaid the deposit disappears. This is the main engine of M2.',
        rows: [
          {
            label: 'Housing',
            value: flow(dH),
            kind: kindOf(dH),
            note: `Now ${t.currency}${c.last.loansHousing.toFixed(0)}bn, growing ${growthPct(c.last.loansHousing, c.start.loansHousing).toFixed(1)}% over the window.`,
          },
          {
            label: 'Business',
            value: flow(dB),
            kind: kindOf(dB),
            note: `Now ${t.currency}${c.last.loansBusiness.toFixed(0)}bn, growing ${growthPct(c.last.loansBusiness, c.start.loansBusiness).toFixed(1)}%.`,
          },
          {
            label: 'Consumer',
            value: flow(dC),
            kind: kindOf(dC),
            note: `Now ${t.currency}${c.last.loansConsumer.toFixed(0)}bn, growing ${growthPct(c.last.loansConsumer, c.start.loansConsumer).toFixed(1)}%.`,
          },
        ],
        total: { label: 'Change in credit', value: flow(total) },
        reading:
          !ocrMoved && mortFall > 0.05
            ? `The ${t.policyRate} never moved, yet the mortgage rate fell ${mortFall.toFixed(2)}pp because the purchases compressed the term premium. Part of this credit growth therefore came from the purchase programme reaching the money stock through lending rates rather than directly.`
            : `Credit grew ${growthPct(c.last.loansTotal, c.start.loansTotal).toFixed(1)}% over the window, and that is what moved the money stock. The rate works by changing how much credit is worth taking on.`,
      };
    },
  },
  {
    key: 'policyRate',
    get label() {
      return t.policyRateLabel;
    },
    value: (c) => `${c.last.policyRate.toFixed(2)}%`,
    sub: (c) => `mortgage rate ${c.last.mortgage.toFixed(2)}%`,
    compare: () => '',
    detail: (c) => {
      const holdings = c.last.cbGovtBonds + c.last.cbBankBonds;
      const compression = c.last.qeCompression;
      const subsidy = c.last.fundingSubsidy;
      return {
        title: `${t.policyRateLabel} — the policy rate`,
        definition:
          `The ${t.centralBank}'s policy rate, and the rate it pays on ${t.reserves}. The ${t.centralBank} sets a price for reserves rather than a quantity, so this reaches M2 indirectly — by changing the price of credit.`,
        rows: [
          {
            get label() {
      return t.policyRateLabel;
    },
            value: `${c.start.policyRate.toFixed(2)}% → ${c.last.policyRate.toFixed(2)}%`,
            kind: 'level',
            note: 'Set directly, or by the Taylor rule when autopilot is on.',
          },
          {
            label: 'Wholesale funding rate',
            value: `${c.last.wholesale.toFixed(2)}%`,
            kind: 'level',
            note: `The ${t.policyRate} plus a ${P.termPremium.toFixed(2)}pp ${defineTerm('term-premium', 'term premium')}${
              c.last.riskPremium > 0.015
                ? ` and ${c.last.riskPremium.toFixed(2)}pp of debt risk`
                : ''
            }, less ${compression.toFixed(2)}pp compressed by ${t.currency}${holdings.toFixed(0)}bn of central bank holdings.`,
          },
          {
            label: 'Mortgage rate',
            value: `${c.last.mortgage.toFixed(2)}%`,
            kind: 'level',
            note: 'Half the policy rate and half wholesale funding, plus the bank margin.',
          },
          {
            label: 'Term deposit rate',
            value: `${c.last.termRate.toFixed(2)}%`,
            kind: 'level',
            note: `What savers are offered, priced ${c.cfg.deposits.margin.toFixed(2)}pp below the funding benchmark.`,
          },
          ...(c.last.cbFunding > 0.05
            ? [
                {
                  label: 'Funding facility subsidy',
                  value: `−${(subsidy * 100).toFixed(0)}bp`,
                  kind: 'sub',
                  note: `${t.currency}${c.last.cbFunding.toFixed(0)}bn drawn, passed through as ${subsidy.toFixed(2)}pp off
                    business lending rates and ${(subsidy * 0.3).toFixed(2)}pp off mortgages. That rate cut is the
                    only route from the facility to M2 — the facility itself creates no deposits.`,
                },
              ]
            : []),
          ...(c.last.riskPremium > 0.015
            ? [
                {
                  label: 'Debt risk premium',
                  value: `+${c.last.riskPremium.toFixed(2)}pp`,
                  kind: 'add',
                  note: `Debt at ${c.last.debtRatio.toFixed(0)}% of GDP against a ${P.debtThresholdPct}% threshold. This sits inside the deficit too, so a bigger debt stock raises its own interest bill.`,
                },
              ]
            : []),
          {
            label: "Savers' outside option",
            value: `${c.last.outsideRate.toFixed(2)}%`,
            kind: 'level',
            note:
              c.last.underpricing > 0.005
                ? `Term deposits pay ${c.last.underpricing.toFixed(2)}pp less than this, so balances are leaving. That is why the money stock is shrinking and the bank is borrowing wholesale.`
                : 'Term deposits beat this, so balances stay. This is the floor under how cheaply the bank can price them.',
          },
        ],
        total: { label: 'Mortgage − policy rate', value: `${(c.last.mortgage - c.last.policyRate).toFixed(2)}pp` },
        reading: (() => {
          if ((c.cfg.fiscal.riskSensitivity ?? 0) > 0 && c.last.wholesale > P.gdpNominalGrowth) {
            return `Lenders are charging ${c.last.riskPremium.toFixed(2)}pp on debt at ${c.last.debtRatio.toFixed(0)}% of GDP, which puts the long rate at ${c.last.wholesale.toFixed(2)}% — above nominal growth of ${P.gdpNominalGrowth.toFixed(1)}%. At that spread the debt ratio compounds upward on its own, and nothing in this model pulls it back.`;
          }
          if (c.last.riskPremium > 0.015) {
            return `Debt at ${c.last.debtRatio.toFixed(0)}% of GDP is adding ${c.last.riskPremium.toFixed(2)}pp to the long rate, while ${t.currency}${holdings.toFixed(0)}bn of central bank holdings takes ${compression.toFixed(2)}pp off it. The two partly cancel — and the debt risk is also inside the deficit, so it borrows against itself.`;
          }
          if (Math.abs(c.last.policyRate - c.start.policyRate) < 0.01) {
            return `The ${t.policyRate} never moved in this run, so the only thing that changed in the rate structure was ${compression.toFixed(2)}pp of term-premium compression from ${t.currency}${holdings.toFixed(0)}bn of central bank holdings. That is how a purchase programme reaches lending rates without touching the policy rate.`;
          }
          return 'A rate cut raises M2 only if it persuades someone to borrow. That is why the rate channel is usually larger than the purchase channel — but slower, and dependent on borrowers showing up.';
        })(),
      };
    },
  },
  {
    key: 'inflation',
    label: 'Inflation',
    value: (c) => `${c.last.inflation.toFixed(1)}%`,
    sub: (c) => `output gap ${c.last.outputGap.toFixed(1)}%`,
    compare: () => '',
    detail: (c) => {
      const yoyGrowth = growthPct(c.last.m2, c.prevYear.m2);
      return {
        title: "Inflation — the model's reduced form",
        definition:
          'Annual CPI inflation as this model projects it. A small illustrative reduced form, not a forecasting model: it exists so the policy reaction has something to respond to.',
        rows: [
          {
            label: 'Output gap',
            value: `${c.last.outputGap.toFixed(2)}%`,
            kind: 'level',
            note: 'Demand pressure, pushed by the policy stance and the fiscal deficit.',
          },
          {
            label: 'M2 growth, last 12 months',
            value: `${yoyGrowth.toFixed(1)}%`,
            kind: 'level',
            note: `Money growth above the ${P.moneyGrowthReference}% reference adds to inflation; below it subtracts.`,
          },
          {
            label: 'Expected inflation',
            value: `${c.last.expectedInflation.toFixed(2)}%`,
            kind: 'level',
            note: 'A backward-looking anchor that slowly follows realised inflation.',
          },
          {
            label: 'Target',
            value: `${P.inflationTarget.toFixed(2)}%`,
            kind: 'level',
            note: 'The midpoint the model treats as neutral.',
          },
        ],
        total: null,
        reading: `Treat this as direction, not forecast. Rates and the money stock reach inflation through the output gap, so it is the last thing to move — which is exactly why the money stock is worth watching separately.`,
      };
    },
  },
];

/**
 * What to look at in the scenario currently loaded. Approachability, not analysis:
 * each one names the thing that is about to happen before it happens.
 */
export const START_HINTS = {
  get neutral() {
    return `Nothing moves here, by design — this is the control case. Try <b>Bond purchases only</b> next: the ${t.centralBank} creates a great deal of reserves and comparatively little money.`;
  },
  covid:
    'Everything at once: deep cuts, bond purchases, cheap bank funding and a large deficit, then the fastest tightening since the Volcker era. Use the compare switch to hold it against the control case.',
  'qe-only':
    'Watch the monetary base outrun M2. The multiplier collapses because buying bonds from banks mostly swaps one asset for another. Compare it with <b>Rate cuts only</b>.',
  'rates-only':
    'No asset purchases at all, and M2 still moves further than in the bond-buying case. The rate works by changing how much borrowing is worth doing.',
  'bank-bonds':
    'The central bank buys bank bonds rather than government ones. Its balance sheet grows either way; M2 only grows to the extent non-banks did the selling.',
  tightening:
    'This is money being destroyed: credit contracts, so deposits shrink, and the central bank is selling bonds back at the same time.',
  'credit-crunch':
    'Cheap money with no willing borrowers. Confidence and capital, not the interest rate, are what bind here.',
  'fiscal-dominance':
    'Debt now prices into interest rates. Watch the long rate climb as the debt stock grows — then watch the central bank buy bonds to hold it down, and where those purchases end up.',
};

function renderStartHint() {
  const node = el('start-hint');
  if (!node) return;
  const text = START_HINTS[state.scenarioId];
  node.hidden = !text;
  node.innerHTML = text ?? '';
}

function renderKpis() {
  const c = metricContext();

  el('kpis').innerHTML = METRICS.map((metric) => {
    const tone = metric.tone?.(c) ?? '';
    const open = state.openMetric === metric.key;
    const cmpText = metric.compare?.(c) ?? '';
    return `<button type="button" class="kpi${tone ? ` ${tone}` : ''}${open ? ' is-open' : ''}"
              data-metric="${metric.key}" aria-expanded="${open}" aria-controls="kpi-detail">
        <span class="kpi-label">${metric.label}</span>
        <span class="kpi-value">${metric.value(c)}</span>
        <span class="kpi-sub">${metric.sub(c)}</span>
        ${cmpText ? `<span class="kpi-cmp">${cmpText}</span>` : ''}
        <span class="kpi-more">${open ? 'Hide breakdown' : 'Breakdown'}</span>
      </button>`;
  }).join('');

  el('kpi-compare-note').innerHTML = c.cmp
    ? `Comparing with <b>${getScenario(state.compareId).name}</b>. That scenario ends with M2 at
       ${t.currency}<b>${bn(c.cmp.m2)}bn</b> — ${t.currency}${Math.abs(c.last.m2 - c.cmp.m2).toFixed(1)}bn
       ${c.last.m2 >= c.cmp.m2 ? 'higher' : 'lower'} than this one.`
    : '';

  renderKpiDetail(c);
}

function renderKpiDetail(c = metricContext()) {
  const panel = el('kpi-detail');
  const metric = METRICS.find((m) => m.key === state.openMetric);
  if (!metric) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const d = metric.detail(c);
  const rows = d.rows
    .map(
      (r) => `<div class="brk-row">
          <div class="brk-row-head"><span>${r.label}</span><b class="brk-${r.kind ?? 'nil'}">${r.value}</b></div>
          ${r.note ? `<p>${r.note}</p>` : ''}
        </div>`,
    )
    .join('');

  const total = d.total
    ? `<div class="brk-row brk-total">
         <div class="brk-row-head"><span>${d.total.label}</span><b>${d.total.value}</b></div>
       </div>`
    : '';

  panel.hidden = false;
  panel.innerHTML = `
    <div class="kpi-detail-head">
      <div>
        <h3>${d.title}</h3>
        <p class="kpi-detail-def">${d.definition}</p>
      </div>
      <button type="button" class="detail-close" data-close-detail>Close</button>
    </div>
    <p class="brk-heading">What moved it over ${c.months} months</p>
    ${rows}
    ${total}
    <p class="kpi-detail-reading">${d.reading}</p>`;
}

function applyChart(key, factory, mountId, spec) {
  const mount = el(mountId);
  // A missing mount means the markup and the scripts are from different builds.
  // Skip the chart rather than throwing and leaving the rest of the page blank.
  if (!mount) {
    console.warn(`[charts] no #${mountId} on the page; skipping "${key}"`);
    return;
  }
  if (!charts[key]) charts[key] = factory(mount, spec);
  else charts[key].update(spec);
}

/**
 * The historical chart does not depend on the model at all: it is the evidence the
 * model is arguing about, fixed to complete calendar years.
 */
function renderLongRun() {
  const h = createHistory(state.region);
  const money = h.moneyLabel;
  const years = h.years;

  applyChart('longrun', lineChart, 'chart-longrun', {
    series: [
      { name: money, color: COLORS.m2, width: 2.6, points: h.indexed('m2') },
      { name: 'Consumer prices', color: COLORS.rates, points: h.indexed('cpi') },
      { name: `Gold, ${t.goldUnit}`, color: COLORS.base, points: h.indexed('gold') },
      { name: 'Real GDP', color: COLORS.credit, points: h.indexed('rgdp') },
      {
        name: `${money} ÷ real GDP`,
        color: COLORS.m3,
        dashed: true,
        width: 1.8,
        points: h.impliedPriceLevel(),
      },
    ],
    xTicks: [...years.filter((y) => y % 5 === 0), years.at(-1)].map((y) => y - BASE_YEAR),
    xFormat: (v) => String(BASE_YEAR + v),
    yFormat: (v) => v.toFixed(0),
    height: 300,
  });

  const blurb = el('longrun-blurb');
  if (blurb) {
    blurb.textContent = `Gold, consumer prices, ${money} and real GDP for ${h.label}, each indexed to 100 in ${BASE_YEAR}. The dashed line is what the quantity equation implies if velocity never moved: ${money} ÷ real GDP.`;
  }

  const f = (v) => v.toFixed(1);
  const r = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('-', '−') : '—');
  const implied = h.multipleOf('m2') / h.multipleOf('rgdp');
  const gap = Math.round((1 - h.multipleOf('cpi') / implied) * 100);
  const goldRatio = h.multipleOf('gold') / h.multipleOf('cpi');
  const goldVsPrices =
    Math.abs(goldRatio - 1) < 0.15
      ? `within ${Math.abs(Math.round((goldRatio - 1) * 100))}% of consumer prices`
      : `${goldRatio > 1 ? 'ahead of' : 'behind'} consumer prices`;
  const levels = correlation(
    h.rows.map((row) => Math.log(row[3])),
    h.rows.map((row) => Math.log(row[2])),
  );

  el('longrun-note').innerHTML = `${money} grew <b>${f(h.multipleOf('m2'))}×</b> in ${h.label} while
    consumer prices grew <b>${f(h.multipleOf('cpi'))}×</b>. Real GDP grew
    <b>${f(h.multipleOf('rgdp'))}×</b>, so money growth in excess of real growth — the dashed line — rose
    <b>${f(implied)}×</b>, ${gap}% above actual inflation. Gold grew <b>${f(h.multipleOf('gold'))}×</b>,
    ${goldVsPrices} — but nothing like ${money}, which grew <b>${f(h.multipleOf('m2'))}×</b>. The gap
    between the dashed line and consumer prices is velocity, and velocity drifted down over the period. The correlation between the two log levels is
    <b>${r(levels)}</b> — but both series trend upward, so that number is mostly the shared trend.`;
}

function renderCharts() {
  const monthLabel = (m) => `month ${m}`;

  applyChart('m2', lineChart, 'chart-m2', {
    series: [
      ...seriesFor((r) => r.m3, 'M3', COLORS.m3),
      ...seriesFor((r) => r.m2, 'M2', COLORS.m2, { width: 2.4 }),
    ],
    yFormat: (v) => `$${v.toFixed(0)}`,
    xFormat: monthLabel,
    height: 250,
  });

  applyChart('base', lineChart, 'chart-base', {
    series: [
      ...seriesFor((r) => r.base, 'Monetary base', COLORS.base, { width: 2.2 }),
      ...seriesFor((r) => r.reserves, t.reservesLabel, COLORS.deposit),
    ],
    yFormat: (v) => `$${v.toFixed(0)}`,
    xFormat: monthLabel,
    height: 210,
  });

  applyChart('mult', lineChart, 'chart-mult', {
    series: seriesFor((r) => r.multiplier, 'M2 ÷ base', COLORS.credit, { width: 2.2 }),
    // One decimal: the axis can step by fractions of a multiple, and rounding to
    // whole numbers makes neighbouring gridlines print the same value.
    yFormat: (v) => v.toFixed(1),
    xFormat: monthLabel,
    height: 210,
  });

  applyChart('rates', lineChart, 'chart-rates', {
    series: [
      ...seriesFor((r) => r.policyRate, t.policyRateLabel, COLORS.ink, { width: 2.2 }),
      ...seriesFor((r) => r.mortgage, 'Mortgage rate', COLORS.rates),
      ...seriesFor((r) => r.termRate, 'Term deposit rate', COLORS.deposit),
    ],
    yFormat: (v) => `${v.toFixed(1)}%`,
    xFormat: monthLabel,
    height: 210,
  });

  const growthSeries = [
    {
      name: 'M2 growth',
      color: COLORS.m2,
      width: 2.2,
      points: growthRateSeries(runs.primary.history, (r) => r.m2),
    },
    {
      name: 'Bank credit growth',
      color: COLORS.credit,
      dashed: true,
      width: 1.6,
      points: growthRateSeries(runs.primary.history, (r) => r.loansTotal),
    },
  ];
  if (runs.compare) {
    growthSeries.push({
      name: `M2 growth · ${getScenario(state.compareId).name}`,
      color: COLORS.m2,
      dashed: true,
      width: 1.4,
      points: growthRateSeries(runs.compare.history, (r) => r.m2),
    });
  }
  applyChart('growth', lineChart, 'chart-growth', {
    series: growthSeries,
    // One decimal: the axis steps by tenths of a point here, and rounding to whole
    // percentages makes neighbouring gridlines print the same number.
    yFormat: (v) => `${v.toFixed(1)}%`,
    xFormat: monthLabel,
    annotateZero: true,
    height: 210,
  });

  applyChart('fed', stackedArea, 'chart-fed', {
    title: `Central bank holdings, ${t.currency} billions`,
    layers: [
      {
        name: 'Government bonds',
        points: runs.primary.history.map((r) => [r.month, r.cbGovtBonds]),
        color: COLORS.layers[0],
      },
      {
        name: 'Bank bonds',
        points: runs.primary.history.map((r) => [r.month, r.cbBankBonds]),
        color: COLORS.layers[1],
      },
      {
        name: 'Funding facility',
        points: runs.primary.history.map((r) => [r.month, r.cbFunding]),
        color: COLORS.layers[2],
      },
    ],
    yFormat: (v) => `$${v.toFixed(0)}`,
    xFormat: monthLabel,
    height: 200,
  });
}

function renderWaterfall() {
  const history = runs.primary.history;
  const sum = (key) => history.reduce((a, r) => a + (r[key] ?? 0), 0);
  const { credit, qe, retained, term } = decomposeM2(history);
  // The bar is the money stock itself, not the sum of the rows: if a flow were
  // ever left out of the decomposition the gap would show rather than hide.
  const total = history.at(-1).m2 - history[0].m2;

  const totalQe = sum('qeGovt') + sum('qeBankBonds');

  applyChart('flow', waterfall, 'chart-flow', {
    items: [
      { label: 'Bank credit', value: credit, kind: 'add' },
      { label: 'Bond purchases from non-banks', value: qe, kind: 'add' },
      { label: 'Retained bank earnings', value: retained, kind: 'add' },
      { label: 'Shift into term deposits', value: term, kind: 'add' },
      { label: 'Change in M2', value: total, kind: 'total' },
    ],
    yFormat: (v) => `${t.currency}${signed(v)}bn`,
    yAxisFormat: (v) => (Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`),
    height: 230,
  });

  const unmonetised = totalQe - qe;
  const effectiveNonBank = Math.abs(totalQe) > 0.5 ? (qe / totalQe) * 100 : 0;
  const govtShare = Math.abs(sum('qeGovt'));
  const bankShare = Math.abs(sum('qeBankBonds'));
  const requestedNonBank =
    govtShare + bankShare > 0
      ? ((govtShare * state.config.govtPurchases.nonBankShare +
          bankShare * state.config.bankBondPurchases.nonBankShare) /
          (govtShare + bankShare)) *
        100
      : 0;

  let note = `Over ${history.length - 1} months M2 changed by <b>${t.currency}${signed(total)}bn</b>. `;
  if (Math.abs(totalQe) > 0.5) {
    const dealing = totalQe >= 0 ? 'bought' : 'sold';
    note += `The central bank ${dealing} <b>${t.currency}${Math.abs(totalQe).toFixed(1)}bn</b> of bonds. Only
      <b>${t.currency}${Math.abs(qe).toFixed(1)}bn</b> (${Math.abs(effectiveNonBank).toFixed(0)}%) was
      ${totalQe >= 0 ? 'sold by non-banks and therefore created' : 'bought from non-banks and therefore destroyed'}
      deposits; the other <b>${t.currency}${Math.abs(unmonetised).toFixed(1)}bn</b> simply swapped bonds for settlement
      cash on bank balance sheets.`;
    if (Math.abs(effectiveNonBank) > requestedNonBank + 5) {
      note += ` That is higher than the ${requestedNonBank.toFixed(0)}% you asked for: the banking sector can
        only sell what it actually holds, so a programme this large has to be sourced from non-banks.`;
    }

    // The bank-sourced slice creates no deposit, but it is not inert: the central
    // bank now owns those bonds, which compresses the term premium.
    const last = history.at(-1);
    const holdings = last.cbGovtBonds + last.cbBankBonds;
    const compression = last.qeCompression;
    if (Math.abs(unmonetised) > 1 && compression > 0.05) {
      note += ` The bank-sourced slice is not inert, though: with ${t.currency}${holdings.toFixed(0)}bn of holdings the
        ${defineTerm('term-premium', 'term premium')} is compressed by ${compression.toFixed(2)}pp, which is why
        wholesale funding costs ${last.wholesale.toFixed(2)}% rather than
        ${(last.wholesale + compression).toFixed(2)}%. That flows into lending rates, then credit, then deposits.`;
    }
  } else {
    note += 'There were no bond purchases in this run, so M2 moved with bank credit alone.';
  }
  el('flow-note').innerHTML = note;
}

function renderCreditMix() {
  const history = runs.primary.history;
  const series = (key) => history.map((r) => [r.month, r[key]]);

  applyChart('creditMix', stackedArea, 'chart-credit', {
    layers: [
      { name: 'Mortgages', color: COLORS.lending[0], points: series('loansHousing') },
      { name: 'Business', color: COLORS.lending[1], points: series('loansBusiness') },
      { name: 'Consumer', color: COLORS.lending[2], points: series('loansConsumer') },
    ],
    yFormat: (v) => `$${v.toFixed(0)}`,
    xFormat: (m) => `month ${m}`,
    title: `Bank credit by borrower, ${t.currency} billions`,
    height: 230,
  });

  const mix = creditMix(history);
  const drift = mix.housingShare - mix.openingHousingShare;
  const trend = drift > 0.5 ? 'crept up' : drift < -0.5 ? 'eased' : 'barely moved';
  el('credit-note').innerHTML = `Mortgages are <b>${t.currency}${mix.last.housing.toFixed(0)}bn</b> of the
    <b>${t.currency}${mix.last.total.toFixed(0)}bn</b> of bank credit (${mix.housingShare.toFixed(0)}%), and their
    share ${trend} over the window. Lending is the largest single source of new money, so the mortgage
    rate does most of the work here.`;
}

function renderInsight() {
  const h = runs.primary.history;
  const start = h[0];
  const last = h.at(-1);
  const m2Change = last.m2 - start.m2;
  const baseChange = last.base - start.base;
  const parts = [];

  if (baseChange > 20 && Math.abs(m2Change) < baseChange * 0.8) {
    parts.push(
      `The monetary base rose <b>${signed(baseChange)}bn</b> — ${(last.base / start.base).toFixed(1)}× — while M2 rose only <b>${signed(m2Change)}bn</b>. Reserves are the by-product of the bond purchases, not fuel for lending: there is no reserve requirement to relax, and banks create deposits when they lend, not when they hold spare reserves.`,
    );
  }

  if (last.multiplier < start.multiplier * 0.7) {
    parts.push(
      `The multiplier fell from ${start.multiplier.toFixed(1)} to ${last.multiplier.toFixed(1)}, which is the arithmetic of paying for bonds with newly created reserves rather than newly created money.`,
    );
  }

  const creditShare = Math.abs(last.loansTotal - start.loansTotal) / Math.max(1, Math.abs(m2Change));
  if (creditShare > 0.8 && Math.abs(m2Change) > 2) {
    parts.push(
      `Almost all of the change in M2 came from bank lending to households and firms (${signed(last.loansTotal - start.loansTotal)}bn of credit). The interest rate works here by changing how much credit is worth taking on.`,
    );
  }

  if ((state.config.fiscal.riskSensitivity ?? 0) > 0) {
    parts.push(
      last.wholesale > P.gdpNominalGrowth
        ? `Debt at <b>${last.debtRatio.toFixed(0)}%</b> of GDP has pushed the long rate to <b>${last.wholesale.toFixed(2)}%</b>, above nominal growth of ${P.gdpNominalGrowth.toFixed(1)}%. The debt ratio is now compounding on itself — there is no stable level for it to settle at.`
        : `Debt at <b>${last.debtRatio.toFixed(0)}%</b> of GDP adds <b>${last.riskPremium.toFixed(2)}pp</b> to the long rate, and the interest on it is inside the deficit.`,
    );
  }

  parts.push(
    `Lending rates are at ${last.mortgage.toFixed(2)}% against a ${t.policyRate} of ${last.policyRate.toFixed(2)}%, and the real mortgage rate is ${(last.mortgage - last.expectedInflation).toFixed(2)}%.`,
  );

  el('insight').innerHTML = parts.join(' ');
}

function renderAccountsPanel() {
  const months = runs.primary.history.length - 1;
  const month = Math.min(state.accountMonth ?? months, months);
  const snapshot = month === months ? runs.primary.final : run(state.config, month).final;

  el('account-month-label').textContent = month === 0 ? 'opening balance sheet' : `month ${month}`;
  el('account-slider').max = String(months);
  el('account-slider').value = String(month);
  renderAccounts(el('accounts'), snapshot, state.region);
}

/**
 * How much of the current run's M2 traces to the deficit, measured against the
 * same settings with the deficit back at baseline. Bond sales swap deposits for
 * bonds, so whatever shows up here arrives through the credit demand the deficit
 * adds, not through the financing.
 */
function fiscalCreditText() {
  if (Math.abs(state.config.fiscal.deficitPctGdp - P.fiscalBaseline) < 1e-9) return '0.0';
  const counterfactual = run({
    ...state.config,
    fiscal: { ...state.config.fiscal, deficitPctGdp: P.fiscalBaseline },
  }).history;
  const history = runs.primary.history;
  const diff = history.at(-1).m2 - counterfactual.at(-1).m2;
  const magnitude = Math.abs(diff).toFixed(1);
  if (magnitude === '0.0') return '0.0';
  return diff < 0 ? `−${magnitude}` : `+${magnitude}`;
}

function syncProseFigures() {
  // The prose quotes figures that come from the model rather than the HTML.
  const opening = runs.primary.history[0];
  const set = (id, text) => {
    const node = el(id);
    if (node && node.textContent !== text) node.textContent = text;
  };
  const wholesale = `${opening.wholesale.toFixed(2)}%`;
  set('prose-convenience', paramsFor(state.region).depositConvenience.toFixed(1));
  set('prose-wholesale', wholesale);
  set('hint-wholesale', wholesale);
  set('prose-fiscal-baseline', paramsFor(state.region).fiscalBaseline.toFixed(0));
  set('prose-fiscal-credit', fiscalCreditText());
}

function render() {
  refreshRuns();
  renderProse();
  syncProseFigures();
  renderStartHint();
  renderKpis();
  renderCharts();
  renderWaterfall();
  renderCreditMix();
  renderInsight();
  renderAccountsPanel();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export function boot() {
  setGlossaryRegion(state.region);
  mountGlossary();
  renderControls();
  renderLongRun();

  const focusTile = (key) => {
    if (!key) return;
    // Re-rendering replaces the tiles, so put focus back where the user left it.
    el('kpis').querySelector(`[data-metric="${key}"]`)?.focus({ preventScroll: true });
  };

  el('kpis').addEventListener('click', (event) => {
    const tile = event.target.closest('[data-metric]');
    if (!tile) return;
    const key = tile.dataset.metric;
    state.openMetric = state.openMetric === key ? null : key;
    renderKpis();
    focusTile(key);
    if (state.openMetric) {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el('kpi-detail').scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
  });

  el('kpi-detail').addEventListener('click', (event) => {
    if (!event.target.closest('[data-close-detail]')) return;
    const closing = state.openMetric;
    state.openMetric = null;
    renderKpis();
    focusTile(closing);
  });

  // The picker sits in the masthead, outside the panel, so it survives every
  // re-render and is reachable at any width — the panel moves below the charts
  // on narrow screens.
  el('region-select').addEventListener('change', (e) => {
    setRegion(e.target.value);
    renderLongRun();
  });

  el('account-slider').addEventListener('input', (e) => {
    state.accountMonth = Number(e.target.value);
    renderAccountsPanel();
  });

  render();
}
