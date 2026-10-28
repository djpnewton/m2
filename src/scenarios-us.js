/**
 * Preset scenarios. Every preset is a full config for the model, so a preset
 * can be loaded into the controls and then edited.
 *
 * Months are 0-indexed; all monetary values are US$ billions. United States only.
 */

/** Total central bank purchases a preset implies, in $bn. */
const purchaseTotal = (c) =>
  c.govtPurchases.pace * c.govtPurchases.months + c.bankBondPurchases.pace * c.bankBondPurchases.months;

/** Billions to a readable dollar figure: $85bn, $1.8tn. */
const dollars = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}tn` : `$${Math.round(v)}bn`);

// A preset's purchases are a fixed flow, so the headline figure is exact when the
// pace is a whole number of billions and approximate when it is not.
const money = (v) => (Number.isInteger(v) ? dollars(v) : `~${dollars(v)}`);

const base = {
  months: 60,
  region: 'us',
  autopilot: false,
  fiscal: { deficitPctGdp: 3.5 },
  credit: { confidence: 1.0, creditTightness: 0, capitalTarget: null },
  households: { termPreference: 0 },
};

export const SCENARIOS = [
  {
    id: 'neutral',
    name: 'Steady state',
    blurb:
      'The control case: policy at neutral, no purchases, a deficit at its structural baseline. Nothing moves — which is the point. Every other preset is measured against this one.',
    config: {
      ...base,
      policy: { start: 4.4, end: 4.4, convergeMonths: 1 },
    },
  },
  {
    id: 'covid',
    name: '2020: pandemic QE, then tightening',
    blurb: (c) =>
      `Rates to zero, ${money(c.govtPurchases.pace * c.govtPurchases.months)} of Treasury purchases,
       a ${c.fiscal.deficitPctGdp}%-of-GDP deficit — then the fastest tightening cycle since Volcker,
       and a balance-sheet run-off.`,
    config: {
      ...base,
      policy: {
        keyframes: [
          { month: 0, value: 4.4 },
          { month: 1, value: 0.25 },
          { month: 22, value: 0.25 },
          { month: 36, value: 5.5 },
          { month: 48, value: 5.5 },
          { month: 54, value: 4.4 },
        ],
      },
      govtPurchases: { pace: 80, months: 15, startMonth: 1, nonBankShare: 0.6 },
      govtSales: { pace: 60, startMonth: 42 },
      fundingFacility: { total: 200, months: 6, startMonth: 36 },
      fiscal: { deficitPctGdp: 15 },
      credit: { confidence: 0.85, creditTightness: 0, capitalTarget: null },
    },
  },
  {
    id: 'qe-only',
    name: 'Bond purchases only',
    blurb: (c) =>
      `${money(purchaseTotal(c))} of purchases with the fed funds rate left at neutral. Isolates the
       asset-purchase channel from the rate channel.`,
    config: {
      ...base,
      policy: { start: 4.4, end: 4.4, convergeMonths: 1 },
      govtPurchases: { pace: 100, months: 24, startMonth: 1, nonBankShare: 0.6 },
    },
  },
  {
    id: 'rates-only',
    name: 'Rate cuts only',
    blurb: (c) =>
      `The fed funds rate cut to ${c.policy.end}% with no asset purchases. Compare with bond purchases:
       the money stock moves for entirely different reasons.`,
    config: {
      ...base,
      policy: { start: 4.4, end: 0.25, convergeMonths: 3 },
    },
  },
  {
    id: 'bank-bonds',
    name: 'Central bank buys bank bonds',
    blurb: (c) =>
      `${money(purchaseTotal(c))} of bank bonds bought by the central bank — a lever the Fed has never
       pulled, kept here because it shows what changes when the central bank buys a bank's own liability
       rather than an asset somebody else holds. Watch reserves versus M2.`,
    config: {
      ...base,
      policy: { start: 4.4, end: 4.4, convergeMonths: 1 },
      bankBondPurchases: { pace: 100, months: 24, startMonth: 1, nonBankShare: 0.3 },
    },
  },
  {
    id: 'tightening',
    name: 'Aggressive tightening + QT',
    blurb: (c) =>
      `The fed funds rate to ${c.policy.end}% and the central bank sells bonds back into the market.
       Reserves drain, credit contracts, and deposits shrink.`,
    config: {
      ...base,
      policy: { start: 4.4, end: 6.5, convergeMonths: 12 },
      govtSales: { pace: 95, startMonth: 12 },
      credit: { confidence: 0.85, creditTightness: 0, capitalTarget: null },
    },
  },
  {
    id: 'credit-crunch',
    name: 'Credit crunch',
    blurb:
      'Rates on hold but confidence collapses and banks hit their capital constraint. Cheap money with no willing borrowers creates no money.',
    config: {
      ...base,
      policy: { start: 4.4, end: 2.0, convergeMonths: 6 },
      credit: { confidence: 0.35, creditTightness: 0.8, capitalTarget: 0.155 },
    },
  },
  {
    id: 'fiscal-dominance',
    name: 'High debt and fiscal dominance',
    blurb: (c) =>
      `A ${c.fiscal.deficitPctGdp}%-of-GDP primary deficit while lenders charge
       ${(c.fiscal.riskSensitivity * 100).toFixed(0)}bp of extra yield per point of debt. The long rate climbs,
       and the central bank buys ${money(purchaseTotal(c))} of bonds to hold it down — purchases that land in
       the money stock.`,
    config: {
      ...base,
      policy: { start: 4.4, end: 4.4, convergeMonths: 1 },
      fiscal: { deficitPctGdp: 8, riskSensitivity: 0.04 },
      govtPurchases: { pace: 150, months: 60, startMonth: 0, nonBankShare: 0.6 },
    },
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
