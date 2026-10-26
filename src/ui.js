import { run, mergeConfig, PARAMS, bankAssets } from './model.js';
import { SCENARIOS, getScenario } from './scenarios.js';
import { lineChart, stackedArea, waterfall, COLORS } from './charts.js';
import { renderAccounts } from './accounts.js';
import { defineTerm, mountGlossary } from './glossary.js';

const state = {
  scenarioId: 'neutral',
  config: mergeConfig(getScenario('neutral').config),
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
  return `<div class="control${disabled ? ' is-disabled' : ''}">
      <label for="${id}"><span>${label}</span><output id="${id}-out">${format(value)}</output></label>
      <input type="range" id="${id}" data-path="${path}" min="${min}" max="${max}" step="${step}"
             value="${value}" ${disabled ? 'disabled' : ''}>
      ${hint ? `<p class="hint">${hint}</p>` : ''}
    </div>`;
}

function renderControls() {
  const c = state.config;
  const hasKeyframes = Array.isArray(c.policy.keyframes);
  // The rate a bank would pay before any scenario movement, straight from the model.
  const openingWholesale = run(c, 0).history[0].wholesale;

  el('controls').innerHTML = `
    <div class="panel-block">
      <h2>Scenarios</h2>
      <div class="chips">
        ${SCENARIOS.map(
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
          : `${control({ label: 'Starting OCR', path: 'policy.start', min: 0, max: 8, step: 0.05, value: c.policy.start ?? 3.5, format: (v) => `${v.toFixed(2)}%` })}
             ${control({ label: 'OCR after convergence', path: 'policy.end', min: 0, max: 8, step: 0.05, value: c.policy.end ?? 3.5, format: (v) => `${v.toFixed(2)}%` })}
             ${control({ label: 'Months to converge', path: 'policy.convergeMonths', min: 1, max: 36, step: 1, value: c.policy.convergeMonths ?? 12, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}`
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

    <details class="panel-block" open>
      <summary><h2>Government bond purchases</h2></summary>
      ${control({ label: 'Pace', path: 'govtPurchases.pace', min: 0, max: 5, step: 0.05, value: c.govtPurchases.pace, format: (v) => `NZ$${v.toFixed(2)}bn / month`, hint: '' })}
      ${control({ label: 'Government bond buying period', path: 'govtPurchases.months', min: 0, max: 60, step: 1, value: c.govtPurchases.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
      ${control({
        label: 'Share of government bonds from non-banks',
        path: 'govtPurchases.nonBankShare',
        min: 0,
        max: 1,
        step: 0.05,
        value: c.govtPurchases.nonBankShare,
        format: (v) => `${Math.round(v * 100)}%`,
        hint: `Only bonds sold by a non-bank create a deposit straight away. When a bank sells it swaps a bond for ${defineTerm('settlement-cash', 'reserves')} and no deposit exists — but the reserves do reach M2 eventually: the central bank now owns the bond, which compresses the ${defineTerm('term-premium', 'term premium')} and pulls lending rates down, so credit and deposits rise.`,
      })}
      ${control({ label: 'Bond sales (QT) pace', path: 'govtSales.pace', min: 0, max: 3, step: 0.05, value: c.govtSales.pace, format: (v) => `NZ$${v.toFixed(2)}bn / month`, hint: `Selling bonds back — ${defineTerm('qt', 'quantitative tightening')} — drains settlement cash and shrinks the base.` })}
      ${control({ label: 'Bond sales start', path: 'govtSales.startMonth', min: 0, max: 96, step: 1, value: c.govtSales.startMonth, format: (v) => (v >= 96 ? 'not within window' : `month ${v}`) })}
    </details>

    <details class="panel-block">
      <summary><h2>Bank bonds and funding</h2></summary>
      ${control({ label: 'Buy bank bonds', path: 'bankBondPurchases.pace', min: 0, max: 4, step: 0.05, value: c.bankBondPurchases.pace, format: (v) => `NZ$${v.toFixed(2)}bn / month` })}
      ${control({ label: 'Bank bond buying period', path: 'bankBondPurchases.months', min: 0, max: 60, step: 1, value: c.bankBondPurchases.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
      ${control({ label: 'Share of bank bonds from non-banks', path: 'bankBondPurchases.nonBankShare', min: 0, max: 1, step: 0.05, value: c.bankBondPurchases.nonBankShare, format: (v) => `${Math.round(v * 100)}%` })}
      ${control({ label: 'Cheap funding to banks (total)', path: 'flp.total', min: 0, max: 40, step: 1, value: c.flp.total, format: (v) => `NZ$${v.toFixed(0)}bn`, hint: `Like the ${defineTerm('funding-for-lending', 'Funding for Lending Programme')}. It creates reserves but no deposits; it reaches M2 only through the lending rate — cheaper funding lowers the rate, which raises credit demand, and each new loan creates a deposit. Small lever, slow channel.` })}
      ${control({ label: 'Funding drawn over', path: 'flp.months', min: 0, max: 36, step: 1, value: c.flp.months, format: (v) => `${v} month${v === 1 ? '' : 's'}` })}
    </details>

    <details class="panel-block">
      <summary><h2>Fiscal and credit conditions</h2></summary>
      ${control({ label: 'Government deficit', path: 'fiscal.deficitPctGdp', min: 0, max: 10, step: 0.5, value: c.fiscal.deficitPctGdp, format: (v) => `${v.toFixed(1)}% of GDP`, hint: `Bonds sold to the public swap a deposit for a bond, so the financing itself creates no deposit. Above the ${PARAMS.fiscalBaseline.toFixed(0)}%-of-GDP baseline the deficit also lifts demand, and the borrowing that follows does create deposits.` })}
      ${control({ label: 'Confidence / credit demand', path: 'credit.confidence', min: 0.2, max: 1.6, step: 0.05, value: c.credit.confidence, format: (v) => `${Math.round(v * 100)}%` })}
      ${control({ label: 'Macroprudential tightness (LVR/DTI)', path: 'credit.lvrTightness', min: 0, max: 1, step: 0.05, value: c.credit.lvrTightness, format: (v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`), hint: `Restrictions on high-${defineTerm('lvr', 'LVR')} or high-${defineTerm('dti', 'DTI')} lending. These slow credit without moving the policy rate.` })}
      ${control({ label: 'Bank capital requirement', path: 'credit.capitalTarget', min: 0.1, max: 0.3, step: 0.005, value: c.credit.capitalTarget ?? PARAMS.capitalTarget, format: (v) => `${(v * 100).toFixed(1)}%`, hint: `Equity against ${defineTerm('risk-weighted-capital', 'risk-weighted assets')}. This is the binding constraint on lending.` })}
      ${control({ label: 'Preference for term deposits', path: 'households.termPreference', min: -0.15, max: 0.25, step: 0.01, value: c.households.termPreference, format: (v) => signed(v * 100) + 'pp' })}
      ${control({
        label: 'Deposit margin',
        path: 'deposits.margin',
        min: 0,
        max: 1.5,
        step: 0.05,
        value: c.deposits.margin,
        format: (v) => `${v.toFixed(2)}pp below market`,
        hint: `How much the bank shaves off market rates when pricing term deposits. Past about ${PARAMS.depositConvenience.toFixed(1)}pp savers move money elsewhere, and the bank replaces it with ${defineTerm('wholesale-funding', 'wholesale funding')} at <span id="hint-wholesale">${openingWholesale.toFixed(2)}%</span>.`,
      })}
    </details>

    <div class="panel-block">
      <h2>Window</h2>
      ${control({ label: 'Forecast horizon', path: 'months', min: 24, max: 120, step: 12, value: c.months, format: (v) => `${v} months (${Math.round(v / 12)} years)` })}
      <label class="switch">
        <input type="checkbox" id="ctl-compare" ${state.compareOn ? 'checked' : ''}>
        <span>Compare with another scenario</span>
      </label>
      ${
        state.compareOn
          ? `<select id="ctl-compare-scenario" class="select">
              ${SCENARIOS.filter((s) => s.id !== state.scenarioId)
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

const FORMATTERS = {
  'policy.start': (v) => `${v.toFixed(2)}%`,
  'policy.end': (v) => `${v.toFixed(2)}%`,
  'policy.convergeMonths': (v) => `${v} month${v === 1 ? '' : 's'}`,
  'govtPurchases.pace': (v) => `NZ$${v.toFixed(2)}bn / month`,
  'govtPurchases.months': (v) => `${v} month${v === 1 ? '' : 's'}`,
  'govtPurchases.nonBankShare': (v) => `${Math.round(v * 100)}%`,
  'govtSales.pace': (v) => `NZ$${v.toFixed(2)}bn / month`,
  'govtSales.startMonth': (v) => (v >= 96 ? 'not within window' : `month ${v}`),
  'bankBondPurchases.pace': (v) => `NZ$${v.toFixed(2)}bn / month`,
  'bankBondPurchases.months': (v) => `${v} month${v === 1 ? '' : 's'}`,
  'bankBondPurchases.nonBankShare': (v) => `${Math.round(v * 100)}%`,
  'flp.total': (v) => `NZ$${v.toFixed(0)}bn`,
  'flp.months': (v) => `${v} month${v === 1 ? '' : 's'}`,
  'fiscal.deficitPctGdp': (v) => `${v.toFixed(1)}% of GDP`,
  'credit.confidence': (v) => `${Math.round(v * 100)}%`,
  'credit.lvrTightness': (v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`),
  'credit.capitalTarget': (v) => `${(v * 100).toFixed(1)}%`,
  'households.termPreference': (v) => `${signed(v * 100)}pp`,
  'deposits.margin': (v) => `${v.toFixed(2)}pp below market`,
  months: (v) => `${v} months (${Math.round(v / 12)} years)`,
};

function formatFor(path, value) {
  return (FORMATTERS[path] ?? String)(value);
}

function ensureCompareDistinct() {
  if (state.compareId === state.scenarioId) {
    state.compareId = SCENARIOS.find((s) => s.id !== state.scenarioId)?.id ?? state.compareId;
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
  const compareCfg = state.compareOn ? getScenario(state.compareId).config : null;
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
      name: `${name} · ${getScenario(state.compareId).name}`,
      color,
      dashed: true,
      width: 1.6,
      points: runs.compare.history.map((r) => [r.month, accessor(r)]),
    });
  }
  return out;
}

function yoy(history) {
  return history
    .filter((r, i) => i >= 12)
    .map((r, i) => {
      const base = history[i];
      return [r.month, base && base.m2 > 0 ? (r.m2 / base.m2 - 1) * 100 : 0];
    });
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

export const METRICS = [
  {
    key: 'm2',
    label: 'M2',
    value: (c) => `NZ$${bn(c.last.m2)}bn`,
    sub: (c) => `${growthPct(c.last.m2, c.prevYear.m2).toFixed(1)}% over the past year`,
    compare: (c) => (c.cmp ? `vs NZ$${bn(c.cmp.m2)}bn in comparison` : ''),
    detail: (c) => {
      const { credit, qe, retained, term } = decomposeM2(c.h);
      const total = c.last.m2 - c.start.m2;
      const share = Math.abs(total) > 0.5 ? (Math.abs(qe) / Math.abs(total)) * 100 : 0;
      return {
        title: 'M2 — money you can spend',
        definition:
          'Currency in circulation plus transaction and on-call savings deposits: the money households and firms can spend without giving notice. Every row below is a flow that adds to or subtracts from it.',
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
              return `Currency demand ended NZ$${Math.abs(dc).toFixed(1)}bn ${dir} than it started, but a dollar moving between a deposit and a banknote is still M2. It shifts the monetary base instead.`;
            })(),
          },
        ],
        total: { label: 'Change in M2', value: flow(total) },
        reading: (() => {
          if (qe > 0.5) {
            return `Of the NZ$${total.toFixed(1)}bn created over ${c.months} months, NZ$${credit.toFixed(1)}bn came from lending and NZ$${qe.toFixed(1)}bn from the purchase programme — about ${share.toFixed(0)}% of the total. Lending remains the dominant source even during a large asset purchase programme.`;
          }
          if (qe < -0.5) {
            return `The central bank sold bonds back over these ${c.months} months, which destroyed NZ$${Math.abs(qe).toFixed(1)}bn of deposits. Lending ${credit >= 0 ? 'added' : 'removed'} NZ$${Math.abs(credit).toFixed(1)}bn, leaving M2 NZ$${Math.abs(total).toFixed(1)}bn ${total >= 0 ? 'higher' : 'lower'}.`;
          }
          return 'With no bond operations in this run, M2 moved with bank lending and deposit behaviour alone.';
        })(),
      };
    },
  },
  {
    key: 'm3',
    label: 'M3',
    value: (c) => `NZ$${bn(c.last.m3)}bn`,
    sub: (c) => `${signed(c.last.m3 - c.start.m3)}bn over the window`,
    compare: (c) => (c.cmp ? `vs NZ$${bn(c.cmp.m3)}bn in comparison` : ''),
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
        reading: `M3 − M2 is NZ$${gap.toFixed(1)}bn of term deposits, ${termShare.toFixed(0)}% of all bank deposits. Because a shift between deposit types redistributes money rather than creating it, M3 is the cleaner measure of how much the banking system actually created.`,
      };
    },
  },
  {
    key: 'base',
    label: 'Monetary base',
    value: (c) => `NZ$${bn(c.last.base)}bn`,
    sub: (c) => `${times(c.last.base / c.start.base)} the opening level`,
    compare: (c) => (c.cmp ? `vs NZ$${bn(c.cmp.base)}bn in comparison` : ''),
    detail: (c) => {
      const purchases = c.sum('qeGovt') + c.sum('qeBankBonds');
      const flp = c.sum('flpDraw');
      const advances = (c.last.rbnzAdvances ?? 0) - (c.start.rbnzAdvances ?? 0);
      const total = c.last.base - c.start.base;
      return {
        title: "Monetary base — what the central bank pays with",
        definition:
          "Currency in circulation plus the settlement cash banks keep at the Reserve Bank. It is the central bank's own liability, so only the central bank's operations can change it.",
        rows: [
          {
            label: 'Bond purchases',
            value: flow(purchases),
            kind: kindOf(purchases),
            note: 'Paid for by crediting the seller’s bank with settlement cash. The base rises by the full amount, whoever sold.',
          },
          {
            label: 'Cheap funding drawn',
            value: flow(flp),
            kind: kindOf(flp),
            note: 'Funding-for-Lending style lending also creates reserves.',
          },
          {
            label: 'Standing facility advances',
            value: flow(advances),
            kind: kindOf(advances),
            note: 'Reserves borrowed against collateral when settlement cash would otherwise go negative.',
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
          if (Math.abs(purchases) > 0.05) sources.push(`NZ$${purchases.toFixed(1)}bn of net asset purchases`);
          if (Math.abs(flp) > 0.05) sources.push(`NZ$${flp.toFixed(1)}bn drawn under the funding facility`);
          if (Math.abs(advances) > 0.05) sources.push(`NZ$${advances.toFixed(1)}bn of standing-facility advances`);
          if (!sources.length) {
            return `${head} There were no central bank operations in this window, so the base did not move.`;
          }
          const joined =
            sources.length === 1 ? sources[0] : `${sources.slice(0, -1).join(', ')} and ${sources.at(-1)}`;
          return `${head} The ${total >= 0 ? 'rise' : 'fall'} of NZ$${Math.abs(total).toFixed(1)}bn came from ${joined}.`;
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
            value: `NZ$${c.start.m2.toFixed(0)}bn → NZ$${c.last.m2.toFixed(0)}bn`,
            kind: 'level',
            note: `${pc(m2g)} over the window.`,
          },
          {
            label: 'Monetary base',
            value: `NZ$${c.start.base.toFixed(1)}bn → NZ$${c.last.base.toFixed(1)}bn`,
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
    label: 'Settlement cash',
    value: (c) => `NZ$${bn(c.last.settlementCash)}bn`,
    sub: (c) => `${times(c.last.settlementCash / c.start.settlementCash)} the opening level`,
    compare: (c) => (c.cmp ? `vs NZ$${bn(c.cmp.settlementCash)}bn in comparison` : ''),
    detail: (c) => {
      const purchases = c.sum('qeGovt') + c.sum('qeBankBonds');
      const flp = c.sum('flpDraw');
      const advances = (c.last.rbnzAdvances ?? 0) - (c.start.rbnzAdvances ?? 0);
      const currency = c.last.currency - c.start.currency;
      const total = c.last.settlementCash - c.start.settlementCash;
      return {
        title: 'Settlement cash — reserves, by another name',
        definition:
          'Reserves banks hold at the Reserve Bank to settle payments with each other and with the Crown. New Zealand has had no reserve requirement since 1985, so these balances are supplied on demand.',
        rows: [
          {
            label: 'Credited from bond purchases',
            value: flow(purchases),
            kind: kindOf(purchases),
            note: 'Every purchase lands here first, whoever the seller was.',
          },
          {
            label: 'Cheap funding drawn',
            value: flow(flp),
            kind: kindOf(flp),
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
            note: 'Banknotes are funded by draining settlement cash — the public swapping deposits for cash.',
          },
        ],
        total: { label: 'Change in settlement cash', value: flow(total) },
        reading: `Now ${times(c.last.settlementCash / c.start.settlementCash)} the opening level, earning the OCR and funding nothing. This is the money the purchase programme actually created — and it is not M2.`,
      };
    },
  },
  {
    key: 'credit',
    label: 'Bank credit',
    value: (c) => `NZ$${bn(c.last.loansTotal)}bn`,
    sub: (c) => `${signed(c.last.loansTotal - c.start.loansTotal)}bn over the window`,
    compare: (c) => (c.cmp ? `vs NZ$${bn(c.cmp.loansTotal)}bn in comparison` : ''),
    detail: (c) => {
      const dH = c.last.loansHousing - c.start.loansHousing;
      const dB = c.last.loansBusiness - c.start.loansBusiness;
      const dC = c.last.loansConsumer - c.start.loansConsumer;
      const total = dH + dB + dC;
      const ocrMoved = Math.abs(c.last.ocr - c.start.ocr) > 0.01;
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
            note: `Now NZ$${c.last.loansHousing.toFixed(0)}bn, growing ${growthPct(c.last.loansHousing, c.start.loansHousing).toFixed(1)}% over the window.`,
          },
          {
            label: 'Business',
            value: flow(dB),
            kind: kindOf(dB),
            note: `Now NZ$${c.last.loansBusiness.toFixed(0)}bn, growing ${growthPct(c.last.loansBusiness, c.start.loansBusiness).toFixed(1)}%.`,
          },
          {
            label: 'Consumer',
            value: flow(dC),
            kind: kindOf(dC),
            note: `Now NZ$${c.last.loansConsumer.toFixed(0)}bn, growing ${growthPct(c.last.loansConsumer, c.start.loansConsumer).toFixed(1)}%.`,
          },
        ],
        total: { label: 'Change in credit', value: flow(total) },
        reading:
          !ocrMoved && mortFall > 0.05
            ? `The OCR never moved, yet the mortgage rate fell ${mortFall.toFixed(2)}pp because the purchases compressed the term premium. Part of this credit growth therefore came from the purchase programme reaching the money stock through lending rates rather than directly.`
            : `Credit grew ${growthPct(c.last.loansTotal, c.start.loansTotal).toFixed(1)}% over the window, and that is what moved the money stock. The rate works by changing how much credit is worth taking on.`,
      };
    },
  },
  {
    key: 'ocr',
    label: 'OCR',
    value: (c) => `${c.last.ocr.toFixed(2)}%`,
    sub: (c) => `mortgage rate ${c.last.mortgage.toFixed(2)}%`,
    compare: () => '',
    detail: (c) => {
      const holdings = c.last.rbnzGovtBonds + c.last.rbnzBankBonds;
      const compression = Math.min(
        PARAMS.qeTermCompressionMax,
        (holdings / 100) * PARAMS.qeTermCompressionMax,
      );
      const subsidy = Math.min(
        0.8,
        (c.last.rbnzFlp / Math.max(1, bankAssets(c.last) * 0.25)) * 0.8,
      );
      return {
        title: 'OCR — the policy rate',
        definition:
          "The official cash rate: the Reserve Bank's policy rate, and the rate it pays on settlement cash balances. It reaches M2 indirectly, by changing the price of credit.",
        rows: [
          {
            label: 'OCR',
            value: `${c.start.ocr.toFixed(2)}% → ${c.last.ocr.toFixed(2)}%`,
            kind: 'level',
            note: 'Set directly, or by the Taylor rule when autopilot is on.',
          },
          {
            label: 'Wholesale funding rate',
            value: `${c.last.wholesale.toFixed(2)}%`,
            kind: 'level',
            note: `OCR plus a ${PARAMS.termPremium.toFixed(2)}pp ${defineTerm('term-premium', 'term premium')}, less ${compression.toFixed(2)}pp compressed by NZ$${holdings.toFixed(0)}bn of central bank holdings.`,
          },
          {
            label: 'Mortgage rate',
            value: `${c.last.mortgage.toFixed(2)}%`,
            kind: 'level',
            note: 'Half the OCR and half wholesale funding, plus the bank margin.',
          },
          {
            label: 'Term deposit rate',
            value: `${c.last.termRate.toFixed(2)}%`,
            kind: 'level',
            note: `What savers are offered, priced ${c.cfg.deposits.margin.toFixed(2)}pp below the funding benchmark.`,
          },
          ...(c.last.rbnzFlp > 0.05
            ? [
                {
                  label: 'Funding facility subsidy',
                  value: `−${(subsidy * 100).toFixed(0)}bp`,
                  kind: 'sub',
                  note: `NZ$${c.last.rbnzFlp.toFixed(0)}bn drawn, passed through as ${subsidy.toFixed(2)}pp off
                    business lending rates and ${(subsidy * 0.3).toFixed(2)}pp off mortgages. That rate cut is the
                    only route from the facility to M2 — the facility itself creates no deposits.`,
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
        total: { label: 'Mortgage − OCR', value: `${(c.last.mortgage - c.last.ocr).toFixed(2)}pp` },
        reading:
          Math.abs(c.last.ocr - c.start.ocr) < 0.01
            ? `The OCR never moved in this run, so the only thing that changed in the rate structure was ${compression.toFixed(2)}pp of term-premium compression from NZ$${holdings.toFixed(0)}bn of central bank holdings. That is how a purchase programme reaches lending rates without touching the policy rate.`
            : `A rate cut raises M2 only if it persuades someone to borrow. That is why the rate channel is usually larger than the purchase channel — but slower, and dependent on borrowers showing up.`,
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
            note: `Money growth above the ${PARAMS.moneyGrowthReference}% reference adds to inflation; below it subtracts.`,
          },
          {
            label: 'Expected inflation',
            value: `${c.last.expectedInflation.toFixed(2)}%`,
            kind: 'level',
            note: 'A backward-looking anchor that slowly follows realised inflation.',
          },
          {
            label: 'Target',
            value: `${PARAMS.inflationTarget.toFixed(2)}%`,
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
       NZ$<b>${bn(c.cmp.m2)}bn</b> — NZ$${Math.abs(c.last.m2 - c.cmp.m2).toFixed(1)}bn
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
  if (!charts[key]) charts[key] = factory(el(mountId), spec);
  else charts[key].update(spec);
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
      ...seriesFor((r) => r.settlementCash, 'Settlement cash', COLORS.deposit),
    ],
    yFormat: (v) => `$${v.toFixed(0)}`,
    xFormat: monthLabel,
    height: 210,
  });

  applyChart('mult', lineChart, 'chart-mult', {
    series: seriesFor((r) => r.multiplier, 'M2 ÷ base', COLORS.credit, { width: 2.2 }),
    yFormat: (v) => v.toFixed(0),
    xFormat: monthLabel,
    height: 210,
  });

  applyChart('rates', lineChart, 'chart-rates', {
    series: [
      ...seriesFor((r) => r.ocr, 'OCR', COLORS.ink, { width: 2.2 }),
      ...seriesFor((r) => r.mortgage, 'Mortgage rate', COLORS.rates),
      ...seriesFor((r) => r.termRate, 'Term deposit rate', COLORS.deposit),
    ],
    yFormat: (v) => `${v.toFixed(1)}%`,
    xFormat: monthLabel,
    height: 210,
  });

  const growthSeries = [
    { name: 'M2 growth', color: COLORS.m2, width: 2.2, points: yoy(runs.primary.history) },
    {
      name: 'Bank credit growth',
      color: COLORS.credit,
      dashed: true,
      width: 1.6,
      points: runs.primary.history
        .filter((r, i) => i >= 12)
        .map((r, i) => {
          const base = runs.primary.history[i];
          return [
            r.month,
            base && base.loansTotal > 0 ? (r.loansTotal / base.loansTotal - 1) * 100 : 0,
          ];
        }),
    },
  ];
  if (runs.compare) {
    growthSeries.push({
      name: `M2 growth · ${getScenario(state.compareId).name}`,
      color: COLORS.m2,
      dashed: true,
      width: 1.4,
      points: yoy(runs.compare.history),
    });
  }
  applyChart('growth', lineChart, 'chart-growth', {
    series: growthSeries,
    yFormat: (v) => `${v.toFixed(0)}%`,
    xFormat: monthLabel,
    annotateZero: true,
    height: 210,
  });

  applyChart('rbnz', stackedArea, 'chart-rbnz', {
    layers: [
      {
        name: 'Government bonds',
        points: runs.primary.history.map((r) => [r.month, r.rbnzGovtBonds]),
        color: COLORS.layers[0],
      },
      {
        name: 'Bank bonds',
        points: runs.primary.history.map((r) => [r.month, r.rbnzBankBonds]),
        color: COLORS.layers[1],
      },
      {
        name: 'Funding for lending',
        points: runs.primary.history.map((r) => [r.month, r.rbnzFlp]),
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
    yFormat: (v) => `NZ$${signed(v)}bn`,
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

  let note = `Over ${history.length - 1} months M2 changed by <b>NZ$${signed(total)}bn</b>. `;
  if (Math.abs(totalQe) > 0.5) {
    const dealing = totalQe >= 0 ? 'bought' : 'sold';
    note += `The central bank ${dealing} <b>NZ$${Math.abs(totalQe).toFixed(1)}bn</b> of bonds. Only
      <b>NZ$${Math.abs(qe).toFixed(1)}bn</b> (${Math.abs(effectiveNonBank).toFixed(0)}%) was
      ${totalQe >= 0 ? 'sold by non-banks and therefore created' : 'bought from non-banks and therefore destroyed'}
      deposits; the other <b>NZ$${Math.abs(unmonetised).toFixed(1)}bn</b> simply swapped bonds for settlement
      cash on bank balance sheets.`;
    if (Math.abs(effectiveNonBank) > requestedNonBank + 5) {
      note += ` That is higher than the ${requestedNonBank.toFixed(0)}% you asked for: the banking sector can
        only sell what it actually holds, so a programme this large has to be sourced from non-banks.`;
    }

    // The bank-sourced slice creates no deposit, but it is not inert: the central
    // bank now owns those bonds, which compresses the term premium.
    const last = history.at(-1);
    const holdings = last.rbnzGovtBonds + last.rbnzBankBonds;
    const compression = Math.min(
      PARAMS.qeTermCompressionMax,
      (holdings / 100) * PARAMS.qeTermCompressionMax,
    );
    if (Math.abs(unmonetised) > 1 && compression > 0.05) {
      note += ` The bank-sourced slice is not inert, though: with NZ$${holdings.toFixed(0)}bn of holdings the
        ${defineTerm('term-premium', 'term premium')} is compressed by ${compression.toFixed(2)}pp, which is why
        wholesale funding costs ${last.wholesale.toFixed(2)}% rather than
        ${(last.wholesale + compression).toFixed(2)}%. That flows into lending rates, then credit, then deposits.`;
    }
  } else {
    note += 'There were no bond purchases in this run, so M2 moved with bank credit alone.';
  }
  el('flow-note').innerHTML = note;
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
      `The monetary base rose <b>${signed(baseChange)}bn</b> — ${(last.base / start.base).toFixed(1)}× — while M2 rose only <b>${signed(m2Change)}bn</b>. Reserves are the by-product of the bond purchases, not fuel for lending: there is no reserve requirement to relax, and banks create deposits when they lend, not when they have spare settlement cash.`,
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

  parts.push(
    `Lending rates are at ${last.mortgage.toFixed(2)}% against an OCR of ${last.ocr.toFixed(2)}%, and the real mortgage rate is ${(last.mortgage - last.expectedInflation).toFixed(2)}%.`,
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
  renderAccounts(el('accounts'), snapshot);
}

/**
 * The prose quotes two figures that come from the model. Keep them in step rather
 * than restating them in HTML.
 */
/**
 * How much of the current run's M2 traces to the deficit, measured against the
 * same settings with the deficit back at baseline. Bond sales swap deposits for
 * bonds, so whatever shows up here arrives through the credit demand the deficit
 * adds, not through the financing.
 */
function fiscalCreditText() {
  if (Math.abs(state.config.fiscal.deficitPctGdp - PARAMS.fiscalBaseline) < 1e-9) return '0.0';
  const counterfactual = run({
    ...state.config,
    fiscal: { ...state.config.fiscal, deficitPctGdp: PARAMS.fiscalBaseline },
  }).history;
  const history = runs.primary.history;
  const diff = history.at(-1).m2 - counterfactual.at(-1).m2;
  const magnitude = Math.abs(diff).toFixed(1);
  if (magnitude === '0.0') return '0.0';
  return diff < 0 ? `−${magnitude}` : `+${magnitude}`;
}

function syncProseFigures() {
  const opening = runs.primary.history[0];
  const set = (id, text) => {
    const node = el(id);
    if (node && node.textContent !== text) node.textContent = text;
  };
  const wholesale = `${opening.wholesale.toFixed(2)}%`;
  set('prose-convenience', PARAMS.depositConvenience.toFixed(1));
  set('prose-wholesale', wholesale);
  set('hint-wholesale', wholesale);
  set('prose-fiscal-baseline', PARAMS.fiscalBaseline.toFixed(0));
  set('prose-fiscal-credit', fiscalCreditText());
}

function render() {
  refreshRuns();
  syncProseFigures();
  renderKpis();
  renderCharts();
  renderWaterfall();
  renderInsight();
  renderAccountsPanel();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export function boot() {
  mountGlossary();
  renderControls();

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

  el('account-slider').addEventListener('input', (e) => {
    state.accountMonth = Number(e.target.value);
    renderAccountsPanel();
  });

  render();
}
