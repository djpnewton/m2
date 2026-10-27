/**
 * Preset scenarios. Every preset is a full config for the model, so a preset
 * can be loaded into the controls and then edited.
 *
 * Months are 0-indexed; all monetary values are NZ$ billions.
 */

import { PARAMS } from './model.js';

/** Total central bank purchases a preset implies, in NZ$bn. */
const purchaseTotal = (c) =>
  c.govtPurchases.pace * c.govtPurchases.months + c.bankBondPurchases.pace * c.bankBondPurchases.months;

const money = (v) => (Number.isInteger(v) ? `NZ$${v}bn` : `~NZ$${Math.round(v)}bn`);

const base = {
  months: 60,
  autopilot: false,
  fiscal: { deficitPctGdp: PARAMS.fiscalBaseline },
  credit: { confidence: 1.0, lvrTightness: 0, capitalTarget: null },
  households: { termPreference: 0 },
};

export const SCENARIOS = [
  {
    id: 'neutral',
    name: 'Steady state',
    blurb:
      'The control case: policy at neutral, no purchases, a small deficit. Nothing moves — which is the point. Every other preset is measured against this one.',
    config: {
      ...base,
      policy: { start: 3.5, end: 3.5, convergeMonths: 1 },
    },
  },
  {
    id: 'covid',
    name: 'COVID-19 response, then tightening',
    blurb: (c) =>
      `Deep rate cuts, ${money(c.govtPurchases.pace * c.govtPurchases.months)} of government bond purchases,
       cheap bank funding, a ${c.fiscal.deficitPctGdp}%-of-GDP deficit — then the fastest tightening cycle
       since the OCR began.`,
    config: {
      ...base,
      policy: {
        keyframes: [
          { month: 0, value: 3.5 },
          { month: 3, value: 0.25 },
          { month: 30, value: 0.25 },
          { month: 42, value: 5.5 },
        ],
      },
      govtPurchases: { pace: 1.75, months: 30, startMonth: 3, nonBankShare: 0.3 },
      govtSales: { pace: 0.5, startMonth: 40 },
      flp: { total: 12, months: 12, startMonth: 6 },
      fiscal: { deficitPctGdp: 7 },
      credit: { confidence: 0.85, lvrTightness: 0, capitalTarget: null },
    },
  },
  {
    id: 'qe-only',
    name: 'Bond purchases only',
    blurb: (c) =>
      `${money(purchaseTotal(c))} of purchases with the OCR left at neutral. Isolates the asset-purchase
       channel from the rate channel.`,
    config: {
      ...base,
      policy: { start: 3.5, end: 3.5, convergeMonths: 1 },
      govtPurchases: { pace: 3.3, months: 30, startMonth: 3, nonBankShare: 0.3 },
    },
  },
  {
    id: 'rates-only',
    name: 'Rate cuts only',
    blurb: (c) =>
      `OCR cut to ${c.policy.end}% with no asset purchases. Compare with bond purchases: the money stock
       moves for entirely different reasons.`,
    config: {
      ...base,
      policy: { start: 3.5, end: 0.25, convergeMonths: 3 },
    },
  },
  {
    id: 'bank-bonds',
    name: 'Central bank buys bank bonds',
    blurb: (c) =>
      `${money(purchaseTotal(c))} of registered bank bonds bought by the central bank. Watch what it does
       to reserves versus what it does to M2.`,
    config: {
      ...base,
      policy: { start: 3.5, end: 3.5, convergeMonths: 1 },
      bankBondPurchases: { pace: 2, months: 30, startMonth: 3, nonBankShare: 0.3 },
    },
  },
  {
    id: 'tightening',
    name: 'Aggressive tightening + QT',
    blurb: (c) =>
      `OCR to ${c.policy.end}% and the central bank sells bonds back into the market. Reserves drain,
       credit contracts, and deposits shrink.`,
    config: {
      ...base,
      policy: { start: 3.5, end: 6.5, convergeMonths: 12 },
      govtSales: { pace: 0.8, startMonth: 12 },
      credit: { confidence: 0.85, lvrTightness: 0, capitalTarget: null },
    },
  },
  {
    id: 'credit-crunch',
    name: 'Credit crunch',
    blurb:
      'Rates on hold but confidence collapses and banks hit their capital constraint. Cheap money with no willing borrowers creates no money.',
    config: {
      ...base,
      policy: { start: 3.5, end: 2.0, convergeMonths: 6 },
      credit: { confidence: 0.35, lvrTightness: 0.8, capitalTarget: 0.155 },
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
      policy: { start: 3.5, end: 3.5, convergeMonths: 1 },
      fiscal: { deficitPctGdp: 7, riskSensitivity: 0.04 },
      govtPurchases: { pace: 1.5, months: 60, startMonth: 0, nonBankShare: 0.6 },
    },
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
