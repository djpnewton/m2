/**
 * Stock-flow-consistent model of money creation for a modern
 * "no binding reserve requirement" monetary system, calibrated to the United
 * States and New Zealand.
 *
 * DESIGN NOTES
 * ------------
 * The model is deliberately *mechanical*: every flow is an accounting entry
 * that moves between a small set of sector balance sheets. Nothing here is a
 * regression, so the model cannot "predict" history -- it shows the plumbing
 * that any prediction would have to respect.
 *
 * The identities the whole model is built around, derived from the aggregate
 * balance sheet of bank-like institutions:
 *
 *     dM3 = dBankCredit + d(CB purchases from non-banks) - retained earnings - flight
 *     dM2 = dM3 - d(shift of deposits into term deposits)
 *
 * "Flight" is term deposits taken out of the banking system because the bank
 * underpriced them; it leaves M3 but never was M2, so it drops out of the second
 * identity.
 *
 * Reserves appear in neither identity. That is the point: in a system without
 * a binding reserve requirement (the Fed's requirements went to zero in 2020,
 * and it has paid interest on reserves since 2008), reserve balances are a
 * by-product of central bank operations, not a constraint on lending.
 *
 * All stocks are in the region's local currency, billions. All rates are percent
 * per annum.
 */

import { initialFor, paramsFor, regionOf, termsFor } from './regions.js';

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

/*
 * Both calibrations live in regions.js. The model reads the one the config asks
 * for; these two exports are the US defaults, kept for the tests and for callers
 * that do not care which country they are simulating.
 */

/**
 * Illustrative opening balance sheet, roughly the shape and scale of the US
 * system at the end of 2024. Magnitudes are order-of-magnitude accurate rather
 * than official statistics, but every internal identity balances exactly.
 */
export const INITIAL = initialFor('us');

export const PARAMS = paramsFor('us');

export const DEFAULT_CONFIG = {
  months: 72,
  region: 'us',
  autopilot: false,

  policy: { start: 4.4, end: 4.4, convergeMonths: 12 },

  // Central bank purchases of government bonds (NZGB / LGFA), NZ$bn per month.
  govtPurchases: { pace: 0, months: 0, startMonth: 0, nonBankShare: 0.6 },
  govtSales: { pace: 0, startMonth: 96 },

  // Central bank purchases of bank bonds, US$bn per month.
  bankBondPurchases: { pace: 0, months: 0, startMonth: 0, nonBankShare: 0.3 },
  bankBondSales: { pace: 0, startMonth: 96 },

  // Funding-for-Lending style cheap funding facility, total NZ$bn.
  fundingFacility: { total: 0, months: 0, startMonth: 0 },

  // riskSensitivity is pp of yield per point of debt/GDP above the threshold, and
  // switches on interest payments inside the deficit. Zero leaves debt unpriced.
  fiscal: { deficitPctGdp: PARAMS.fiscalBaseline, riskSensitivity: 0 },
  credit: { confidence: 1.0, creditTightness: 0, capitalTarget: null },
  households: { termPreference: 0 },
  deposits: { margin: 0.5 },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = (o) => JSON.parse(JSON.stringify(o));

export function mergeConfig(config = {}) {
  const out = clone(DEFAULT_CONFIG);
  for (const [k, v] of Object.entries(config)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = { ...out[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function createInitialState(region = 'us') {
  const s = clone(initialFor(region));
  s.stress = 0;
  return s;
}

/* ------------------------------------------------------------------ */
/* Derived quantities                                                  */
/* ------------------------------------------------------------------ */

export function riskWeightedAssets(s, P = PARAMS) {
  return (
    P.riskWeightHousing * s.loansHousing +
    P.riskWeightBusiness * s.loansBusiness +
    P.riskWeightConsumer * s.loansConsumer +
    P.riskWeightSecurities * s.bankSecurities
  );
}

export function capitalRatio(s, P = PARAMS) {
  return s.bankEquity / riskWeightedAssets(s, P);
}

export function depositsTotal(s) {
  return s.depTransaction + s.depSavings + s.depTerm;
}

/** M2 as defined by this model: currency + transaction + on-call savings. */
export function m2(s) {
  return s.currency + s.depTransaction + s.depSavings;
}

/** M3 adds term deposits. (Official NZ M3 is broader still -- see README.) */
export function m3(s) {
  return m2(s) + s.depTerm;
}

/** Monetary base: currency in circulation plus reserve balances. */
export function monetaryBase(s) {
  return s.currency + s.reserves;
}

export function bankAssets(s) {
  return (
    s.reserves +
    s.bankSecurities +
    s.loansHousing +
    s.loansBusiness +
    s.loansConsumer +
    s.bankOtherAssets
  );
}

export function bankLiabilities(s) {
  return (
    depositsTotal(s) +
    s.bankDebt +
    s.bankBondsIssued +
    s.bankFundingBorrowing +
    s.bankAdvances +
    s.bankEquity
  );
}

export function centralBankAssets(s) {
  return s.cbGovtBonds + s.cbBankBonds + s.cbFunding + s.cbFxReserves + s.cbAdvances;
}

export function centralBankLiabilities(s) {
  return s.currency + s.reserves + s.govtDeposits;
}

export function centralBankEquity(s) {
  return centralBankAssets(s) - centralBankLiabilities(s);
}

/* ------------------------------------------------------------------ */
/* Policy path                                                         */
/* ------------------------------------------------------------------ */

function policyRateAt(cfg, month) {
  const { start, end, convergeMonths, keyframes } = cfg.policy;
  if (Array.isArray(keyframes) && keyframes.length > 0) {
    if (month <= keyframes[0].month) return keyframes[0].value;
    for (let i = 1; i < keyframes.length; i++) {
      const a = keyframes[i - 1];
      const b = keyframes[i];
      if (month <= b.month) {
        const span = b.month - a.month;
        if (span <= 0) return b.value;
        return a.value + ((b.value - a.value) * (month - a.month)) / span;
      }
    }
    return keyframes[keyframes.length - 1].value;
  }
  if (convergeMonths <= 0) return end;
  return start + (end - start) * clamp(month / convergeMonths, 0, 1);
}

function paceIn(item, month) {
  if (month < item.startMonth) return 0;
  if (month >= item.startMonth + item.months) return 0;
  return item.pace;
}

/* ------------------------------------------------------------------ */
/* Rate structure (shared by step() and the opening record)             */
/* ------------------------------------------------------------------ */

/**
 * The benchmark a bank prices term deposits against. Deposits compete with the
 * policy rate and with wholesale funding, so the benchmark blends the two.
 */
function fundingBenchmark(policyRate, wholesale, P = PARAMS) {
  const w = P.depositBenchmarkPolicyWeight;
  return w * policyRate + (1 - w) * wholesale;
}

/**
 * Lending rates from the two rates they are built out of. Defining them once means
 * the neutral benchmark used for credit demand cannot drift from the rates the
 * model actually charges.
 */
function lendingRates(policyRate, wholesale, fundingSubsidy, P = PARAMS) {
  const mortgage = 0.5 * policyRate + 0.5 * wholesale + P.mortgageSpread - fundingSubsidy * P.facilityMortgagePassThrough;
  return {
    mortgage,
    businessRate: wholesale + P.businessSpread - fundingSubsidy,
    consumerRate: mortgage + P.consumerSpread,
  };
}

function rateStructure(s, P = PARAMS) {
  const qeStock = s.cbGovtBonds + s.cbBankBonds;
  const qeCompression = Math.min(
    P.qeTermCompressionMax,
    (qeStock / P.qeCompressionReference) * P.qeTermCompressionMax,
  );
  const stressSpread = s.stress * P.stressRateSpread;

  // The debt stock prices into the long rate, which is the rate banks fund at and
  // the rate the Treasury pays.
  const debtRatio = (s.govtDebt / s.gdp) * 100;
  const riskPremium = Math.max(0, debtRatio - P.debtThresholdPct) * (s.debtRisk ?? 0);
  const wholesale = Math.max(
    0,
    s.policyRate + P.termPremium + riskPremium + stressSpread - qeCompression,
  );
  const flpIntensity = s.cbFunding / Math.max(1, bankAssets(s) * P.facilityIntensityDenominator);
  const fundingSubsidy = Math.min(P.maxFundingSubsidy, flpIntensity * P.maxFundingSubsidy);

  return {
    qeCompression,
    fundingSubsidy,
    riskPremium,
    debtRatio,
    wholesale,
    ...lendingRates(s.policyRate, wholesale, fundingSubsidy, P),
    termRate: Math.max(
      P.termDepositFloor,
      fundingBenchmark(s.policyRate, wholesale, P) - (s.depositMargin ?? P.depositMargin),
    ),
    onCallRate: Math.max(0, P.onCallPolicyRateShare * s.policyRate),
  };
}

/* ------------------------------------------------------------------ */
/* The step function                                                   */
/* ------------------------------------------------------------------ */

function step(s, cfg, month, prev, P = PARAMS) {

  /* -- 1. Policy rate ---------------------------------------------- */
  if (cfg.autopilot) {
    const rStar = P.neutralRealRate + s.expectedInflation;
    const target =
      rStar +
      s.inflation +
      P.taylorInflationWeight * (s.inflation - P.inflationTarget) +
      P.taylorGapWeight * s.outputGap;
    s.policyRate = clamp(target, 0.25, 9);
  } else {
    s.policyRate = policyRateAt(cfg, month + 1);
  }

  /* -- 2. Interest rate structure ---------------------------------- */
  const {
    wholesale,
    mortgage,
    businessRate,
    consumerRate,
    termRate,
    onCallRate,
    qeCompression,
    fundingSubsidy,
    riskPremium,
  } = rateStructure(s, P);

  /* -- 3. Credit demand -------------------------------------------- */
  // The neutral real rate expressed on the same basis as each lending rate, by
  // evaluating the rate formula with the policy rate at zero.
  const structural = lendingRates(0, P.termPremium, 0, P);
  const neutralReal = {
    mortgage: P.neutralRealRate + structural.mortgage,
    business: P.neutralRealRate + structural.businessRate,
    consumer: P.neutralRealRate + structural.consumerRate,
  };

  const realMortgage = mortgage - s.expectedInflation;
  const realBusiness = businessRate - s.expectedInflation;
  const realConsumer = consumerRate - s.expectedInflation;

  const interestBurden =
    ((s.loansHousing * mortgage + s.loansBusiness * businessRate + s.loansConsumer * consumerRate) /
      100 /
      (P.privateIncomeShareOfGdp * s.gdp)) *
    100;
  const dsrDrag = (interestBurden - P.dsrThreshold) * P.dsrDragCoefficient;

  const confidenceTerm = (cfg.credit.confidence - 1) * P.confidencePassThrough; // 1.0 = neutral
  const lvrDrag = cfg.credit.creditTightness * P.tightnessRateDrag;

  const growthHousing =
    P.baseHousing +
    P.sensHousing * (neutralReal.mortgage - realMortgage) +
    confidenceTerm -
    dsrDrag -
    lvrDrag;
  const growthBusiness =
    P.baseBusiness +
    P.sensBusiness * (neutralReal.business - realBusiness) +
    confidenceTerm * 1.2 -
    dsrDrag * 0.7;
  const growthConsumer =
    P.baseConsumer +
    P.sensConsumer * (neutralReal.consumer - realConsumer) +
    confidenceTerm -
    dsrDrag * 1.2;

  const monthly = 1 / 100 / 12;
  let dHousing = s.loansHousing * growthHousing * monthly;
  let dBusiness = s.loansBusiness * growthBusiness * monthly;
  let dConsumer = s.loansConsumer * growthConsumer * monthly;

  /* -- 4. Capital constraint on credit supply ---------------------- */
  const targetCar = cfg.credit.capitalTarget ?? P.capitalTarget;
  const carNow = capitalRatio(s, P);
  let creditScale = 1;
  if (carNow < targetCar) {
    creditScale = clamp(
      1 - (targetCar - carNow) * P.capitalThrottleGain,
      P.capitalThrottleFloor,
      1,
    );
  }
  dHousing *= creditScale;
  dBusiness *= creditScale;
  dConsumer *= creditScale;
  const dLoans = dHousing + dBusiness + dConsumer;

  /* -- 5. Central bank asset purchases ----------------------------- */
  const govtBuy = paceIn(cfg.govtPurchases, month);
  const govtSell = month >= cfg.govtSales.startMonth ? cfg.govtSales.pace : 0;
  const govtNet = govtBuy - govtSell;

  const bankBondBuy = paceIn(cfg.bankBondPurchases, month);
  const bankBondSell = month >= cfg.bankBondSales.startMonth ? cfg.bankBondSales.pace : 0;
  const bankBondNet = bankBondBuy - bankBondSell;

  // The banking sector holds part of the government debt and will not sell below
  // a floor, so the central bank can never end up holding more of the stock than
  // exists. Two bounds apply, and the tighter one wins:
  //   - banks do not sell (all purchases from non-banks): only the free float
  //     can be bought, or the bank holdings would exceed the debt outstanding;
  //   - banks sell down to their floor: the bank's holdings can reach debt − floor.
  const nonBankGovtShare = cfg.govtPurchases.nonBankShare;
  const freeFloat = s.govtDebt - s.cbGovtBonds - s.bankSecurities;
  const byFreeFloat = nonBankGovtShare > 1e-9 ? freeFloat / nonBankGovtShare : Infinity;
  const byBankFloor = s.govtDebt - s.cbGovtBonds - P.securitiesFloor;
  const availableGovtBonds = Math.max(0, Math.min(byFreeFloat, byBankFloor));

  const qeGovt = clamp(govtNet, -s.cbGovtBonds, availableGovtBonds);
  const qeBankBonds = clamp(bankBondNet, -s.cbBankBonds, bankBondBuy);
  const qeTotal = qeGovt + qeBankBonds;

  // Who sold decides whether a deposit exists. The two instruments are not
  // symmetric: a bank *holds* government bonds and can sell from its book, but it
  // *issues* its own bonds — so buying one from a bank creates a new liability
  // rather than depleting a holding. Either way no deposit is created.
  const bankGovtSold = Math.min(
    qeGovt * (1 - cfg.govtPurchases.nonBankShare),
    Math.max(0, s.bankSecurities - P.securitiesFloor),
  );
  const bankBondsPlaced = qeBankBonds * (1 - cfg.bankBondPurchases.nonBankShare);
  const bankShareUsed = bankGovtSold + bankBondsPlaced;
  const dQeNonBank = qeTotal - bankShareUsed;
  const dSecuritiesSold = -bankGovtSold;

  /* -- 6. Funding for Lending -------------------------------------- */
  const facilityPace = cfg.fundingFacility.months > 0 ? cfg.fundingFacility.total / cfg.fundingFacility.months : 0;
  const fundingDraw = month >= cfg.fundingFacility.startMonth && month < cfg.fundingFacility.startMonth + cfg.fundingFacility.months ? facilityPace : 0;

  /* -- 7. Fiscal --------------------------------------------------- */
  // Only the deficit is modelled. Gross spending and taxation net to it: tax
  // receipts cover ordinary spending, and just the shortfall has to be financed
  // by issuing bonds. Bonds sold to the public create no deposits; only the
  // share the central bank buys does (via dQeNonBank above).
  // With debt priced, the deficit control is a *primary* deficit and the interest
  // bill is added on top — which is what makes the debt stock feed back into itself.
  const primaryDeficit = (cfg.fiscal.deficitPctGdp / 100) * s.gdp / 12; // NZ$bn per month
  const govtInterest = (s.govtDebt * wholesale) / 100 / 12;
  const debtServiceInDeficit = (s.debtRisk ?? 0) > 0 ? 1 : 0;
  const deficit = primaryDeficit + debtServiceInDeficit * govtInterest;

  /* -- 8. Bank profit, write-offs, equity -------------------------- */
  const assetIncome =
    (s.loansHousing * mortgage +
      s.loansBusiness * businessRate +
      s.loansConsumer * consumerRate +
      s.bankSecurities * Math.max(0, wholesale - P.securitiesYieldDiscount) +
      s.reserves * s.policyRate) /
    100 /
    12;
  const interestCost =
    (s.depTerm * termRate +
      (s.depSavings + s.depTransaction) * onCallRate +
      (s.bankDebt + s.bankBondsIssued) * wholesale +
      s.cbFunding * s.policyRate) /
    100 /
    12;
  const opex = (P.costRate / 100) * bankAssets(s) / 12;
  const loansOutstanding = s.loansHousing + s.loansBusiness + s.loansConsumer;
  const lossRate = P.baseLossRate * (1 + s.stress * 6);
  const writeoffs = ((lossRate / 100) * loansOutstanding) / 12;

  const netInterestIncome = assetIncome - interestCost;
  const profit = netInterestIncome - opex - writeoffs;
  const retained = Math.max(0, profit) * P.retention;

  /* -- 9. Money stock ---------------------------------------------- */
  // Savers can take their money elsewhere. If the bank shaves too much off
  // market rates when pricing term deposits, term balances leave the banking
  // system and have to be replaced by wholesale borrowing.
  const outsideRate = Math.max(0, fundingBenchmark(s.policyRate, wholesale) - P.depositConvenience);
  const underpricing = Math.max(0, outsideRate - termRate);
  const annualFlightShare = Math.min(P.maxFlightShare, P.depositFlightElasticity * underpricing);
  const flight = Math.min(s.depTerm * P.flightMonthlyCap, (annualFlightShare / 12) * s.depTerm);

  const depositCreation = dLoans + dQeNonBank - retained;
  const oldDeposits = depositsTotal(s);
  const oldOnCall = s.depTransaction + s.depSavings;

  const spread = termRate - onCallRate;
  const targetTermShare = clamp(
    P.termShareIntercept + P.termShareSlope * (spread - P.termSharePivot) + cfg.households.termPreference,
    0.03,
    0.35,
  );

  // Track the two stocks as levels, not as a share of a total. Otherwise flight
  // out of term deposits shrinks the base and drains on-call balances with it.
  // Composition moves through the flow split only: an active rebalancing rule
  // would keep topping term deposits back up and convert on-call money into
  // whatever is flying out the door.
  const nextTerm = s.depTerm + targetTermShare * depositCreation;
  const onCallPre = oldOnCall + (1 - targetTermShare) * depositCreation;

  // Flight lands only on the balances whose price moved.
  const newTerm = Math.max(0, nextTerm - flight);
  const depositsAfter = onCallPre + newTerm;
  const dM3 = depositsAfter - oldDeposits;
  const dTermShift = newTerm - s.depTerm;
  const dM2 = dM3 - dTermShift;

  // Currency demand: lower rates and higher stress raise the cash ratio.
  const targetCurrencyRatio = clamp(
    P.currencyRatioIntercept - P.currencyRatioSlope * s.policyRate + s.stress * 0.012,
    0.05,
    0.18,
  );
  const dCurrency = clamp(
    0.25 * (targetCurrencyRatio * (m2(s) + dM2) - s.currency),
    -s.currency * 0.5,
    onCallPre * 0.5,
  );

  /* -- 10. Apply to balance sheets -------------------------------- */
  const writeoffShare = {
    housing: s.loansHousing / loansOutstanding,
    business: s.loansBusiness / loansOutstanding,
    consumer: s.loansConsumer / loansOutstanding,
  };
  s.loansHousing += dHousing - writeoffs * writeoffShare.housing;
  s.loansBusiness += dBusiness - writeoffs * writeoffShare.business;
  s.loansConsumer += dConsumer - writeoffs * writeoffShare.consumer;

  s.cbGovtBonds += qeGovt;
  s.cbBankBonds += qeBankBonds;
  s.bankSecurities += dSecuritiesSold;
  s.bankBondsIssued += bankBondsPlaced;
  s.cbFunding += fundingDraw;
  s.bankFundingBorrowing += fundingDraw;
  s.cbFxReserves += dCurrency; // note issuance backed by foreign assets

  // Reserves are the residual supply of reserve balances.
  s.reserves += qeTotal - dCurrency + fundingDraw;

  s.currency += dCurrency;
  s.depTerm = newTerm;
  const onCallPost = onCallPre - dCurrency;
  const savingsShare = s.depSavings / (s.depTransaction + s.depSavings);
  s.depSavings = onCallPost * savingsShare;
  s.depTransaction = onCallPost - s.depSavings;

  s.bankEquity += retained - writeoffs;
  s.govtDebt += deficit;

  // Wholesale funding is whatever the deposit base and equity do not cover:
  // it is the marginal funding source, not a fixed constant.
  s.bankDebt =
    bankAssets(s) -
    depositsTotal(s) -
    s.bankEquity -
    s.bankAdvances -
    s.bankFundingBorrowing -
    s.bankBondsIssued;

  // Settlement cash cannot go negative. In a system with no reserve
  // requirement the central bank stands ready to lend reserves against
  // collateral, so draw on that facility instead.
  if (s.reserves < P.reserveFloor) {
    const advance = P.reserveFloor - s.reserves;
    s.cbAdvances += advance;
    s.bankAdvances += advance;
    s.reserves += advance;
  }

  /* -- 11. Macro feedback ----------------------------------------- */
  const moneyGrowthYoY = prev ? (dM2 * 12) / Math.max(1, prev.m2) : 0.045;

  // Simple IS relation: the stance is the gap between the neutral nominal
  // policy rate and the *effective* rate, where asset purchases loosen
  // conditions a little beyond the policy rate itself.
  const neutralNominal = P.neutralRealRate + P.inflationTarget;
  const effectiveRate = s.policyRate - qeCompression * 0.5;
  const rateStance = neutralNominal - effectiveRate;
  const fiscalImpulse = cfg.fiscal.deficitPctGdp - P.fiscalBaseline;
  s.outputGap = clamp(
    P.outputGapPersistence * s.outputGap +
      P.outputGapStancePass * (rateStance + fiscalImpulse * P.fiscalImpulseWeight),
    -8,
    8,
  );

  const targetInflation =
    P.inflationTarget +
    P.inflationFromGap * s.outputGap +
    P.inflationFromMoney * (moneyGrowthYoY * 100 - P.moneyGrowthReference);
  s.inflation = P.inflationPersistence * s.inflation + (1 - P.inflationPersistence) * targetInflation;
  s.expectedInflation =
    0.75 * s.expectedInflation + 0.2 * s.inflation + 0.05 * P.inflationTarget;
  s.stress = clamp(s.stress * 0.9 + (1 - cfg.credit.confidence) * 0.12, 0, 1);
  s.gdp *= 1 + P.gdpNominalGrowth / 100 / 12;

  /* -- 12. Record -------------------------------------------------- */
  const rwa = riskWeightedAssets(s);
  return {
    month: month + 1,
    policyRate: s.policyRate,
    wholesale,
    mortgage,
    businessRate,
    consumerRate,
    termRate,
    onCallRate,
    currency: s.currency,
    depTransaction: s.depTransaction,
    depSavings: s.depSavings,
    depTerm: s.depTerm,
    depositsTotal: depositsTotal(s),
    m2: m2(s),
    m3: m3(s),
    base: monetaryBase(s),
    multiplier: monetaryBase(s) > 0 ? m2(s) / monetaryBase(s) : 0,
    loansHousing: s.loansHousing,
    loansBusiness: s.loansBusiness,
    loansConsumer: s.loansConsumer,
    loansTotal: s.loansHousing + s.loansBusiness + s.loansConsumer,
    cbGovtBonds: s.cbGovtBonds,
    cbBankBonds: s.cbBankBonds,
    cbFunding: s.cbFunding,
    centralBankAssets: centralBankAssets(s),
    cbFxReserves: s.cbFxReserves,
    reserves: s.reserves,
    cbAdvances: s.cbAdvances,
    govtDeposits: s.govtDeposits,
    govtDebt: s.govtDebt,
    bankEquity: s.bankEquity,
    bankDebt: s.bankDebt,
    bankFundingBorrowing: s.bankFundingBorrowing,
    bankBondsIssued: s.bankBondsIssued,
    bankAdvances: s.bankAdvances,
    bankOtherAssets: s.bankOtherAssets,
    bankSecurities: s.bankSecurities,
    capitalRatio: s.bankEquity / rwa,
    gdp: s.gdp,
    inflation: s.inflation,
    expectedInflation: s.expectedInflation,
    outputGap: s.outputGap,
    dM2,
    dM3,
    dCredit: dLoans,
    dQeNonBank,
    dFlight: flight,
    outsideRate,
    underpricing,
    dRetained: retained,
    dTermShift,
    dCurrency,
    qeGovt,
    qeBankBonds,
    fundingDraw,
    qeCompression,
    fundingSubsidy,
    riskPremium,
    debtRatio: (s.govtDebt / s.gdp) * 100,
    // The part of the interest bill actually charged to the deficit: zero unless
    // debt is priced, which is what keeps the default behaviour unchanged.
    govtInterest: debtServiceInDeficit * govtInterest,
    primaryDeficit,
    deficit,
    writeoffs,
    profit,
    netInterestIncome,
    nim: (netInterestIncome / bankAssets(s)) * 12 * 100,
    roe: (profit / Math.max(1, s.bankEquity)) * 12 * 100,
    interestBurden,
  };
}

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

export function run(config = {}, monthsOverride) {
  const cfg = mergeConfig(config);
  const months = monthsOverride ?? cfg.months;
  const region = regionOf(cfg.region);
  const P = paramsFor(region);
  const s = createInitialState(region);
  // Region-dependent defaults: the policy path and the structural deficit start
  // where that country's balance sheet starts, unless the caller says otherwise.
  if (!config.policy) {
    cfg.policy = { start: s.policyRate, end: s.policyRate, convergeMonths: 12 };
  }
  if (!config.fiscal) cfg.fiscal = { ...cfg.fiscal, deficitPctGdp: P.fiscalBaseline };
  s.depositMargin = cfg.deposits?.margin ?? P.depositMargin;
  s.debtRisk = cfg.fiscal?.riskSensitivity ?? 0;
  s.policyRate = policyRateAt(cfg, 0);
  const opening = rateStructure(s, P);
  const history = [
    {
      month: 0,
      m2: m2(s),
      m3: m3(s),
      base: monetaryBase(s),
      multiplier: m2(s) / monetaryBase(s),
      loansTotal: s.loansHousing + s.loansBusiness + s.loansConsumer,
      loansHousing: s.loansHousing,
      loansBusiness: s.loansBusiness,
      loansConsumer: s.loansConsumer,
      policyRate: s.policyRate,
      wholesale: opening.wholesale,
      reserves: s.reserves,
      cbAdvances: s.cbAdvances,
      centralBankAssets: centralBankAssets(s),
      cbFxReserves: s.cbFxReserves,
      cbGovtBonds: s.cbGovtBonds,
      cbBankBonds: s.cbBankBonds,
      cbFunding: s.cbFunding,
      currency: s.currency,
      depTerm: s.depTerm,
      depTransaction: s.depTransaction,
      depSavings: s.depSavings,
      depositsTotal: depositsTotal(s),
      mortgage: opening.mortgage,
      businessRate: opening.businessRate,
      consumerRate: opening.consumerRate,
      termRate: opening.termRate,
      onCallRate: opening.onCallRate,
      inflation: s.inflation,
      outputGap: s.outputGap,
      capitalRatio: capitalRatio(s, P),
      govtDebt: s.govtDebt,
      bankEquity: s.bankEquity,
      bankDebt: s.bankDebt,
      bankFundingBorrowing: s.bankFundingBorrowing,
      bankBondsIssued: s.bankBondsIssued,
      bankAdvances: s.bankAdvances,
      bankOtherAssets: s.bankOtherAssets,
      bankSecurities: s.bankSecurities,
      gdp: s.gdp,
      dM2: 0,
      dM3: 0,
      dCredit: 0,
      dQeNonBank: 0,
      dFlight: 0,
      outsideRate: Math.max(0, fundingBenchmark(s.policyRate, opening.wholesale, P) - P.depositConvenience),
      underpricing: 0,
      dRetained: 0,
      dTermShift: 0,
      dCurrency: 0,
      qeGovt: 0,
      qeBankBonds: 0,
      fundingDraw: 0,
      qeCompression: opening.qeCompression,
      fundingSubsidy: opening.fundingSubsidy,
      riskPremium: opening.riskPremium,
      debtRatio: opening.debtRatio,
      govtInterest: 0,
      primaryDeficit: 0,
      interestBurden: 0,
    },
  ];

  for (let m = 0; m < months; m++) {
    history.push(step(s, cfg, m, history[history.length - 1], P));
  }

  return { config: cfg, region, history, final: s, months };
}

/** Balance-sheet snapshot for the T-account view. */
export function balanceSheets(s, region = 'us') {
  const terms = termsFor(region);
  const govtBondsHeldByBanks = s.bankSecurities;
  const govtBondsHeldByNonBanks = Math.max(0, s.govtDebt - s.cbGovtBonds - govtBondsHeldByBanks);
  const bankBondsHeldByNonBanks = Math.max(0, s.bankBondsIssued - s.cbBankBonds);

  const privateAssets =
    s.currency + depositsTotal(s) + govtBondsHeldByNonBanks + bankBondsHeldByNonBanks;
  const privateLiabilities = s.loansHousing + s.loansBusiness + s.loansConsumer;

  return {
    centralBank: {
      title: terms.centralBankFull,
      assets: [
        { label: 'Government bonds', value: s.cbGovtBonds },
        { label: 'Bank bonds', value: s.cbBankBonds },
        { label: `${terms.centralBank} funding`, value: s.cbFunding },
        { label: 'Foreign reserves', value: s.cbFxReserves },
      ],
      liabilities: [
        { label: 'Currency in circulation', value: s.currency },
        { label: terms.reservesLabel, value: s.reserves },
        { label: `${terms.government} deposits`, value: s.govtDeposits },
      ],
      netWorth: centralBankEquity(s),
    },
    banks: {
      title: terms.banksLabel,
      assets: [
        { label: terms.reservesLabel, value: s.reserves },
        { label: 'Government securities', value: s.bankSecurities },
        { label: 'Mortgages', value: s.loansHousing },
        { label: 'Business lending', value: s.loansBusiness },
        { label: 'Consumer lending', value: s.loansConsumer },
        { label: 'Other assets', value: s.bankOtherAssets },
      ],
      liabilities: [
        { label: 'Transaction deposits', value: s.depTransaction },
        { label: 'Savings deposits', value: s.depSavings },
        { label: 'Term deposits', value: s.depTerm },
        { label: 'Wholesale funding', value: s.bankDebt },
        { label: 'Bank bonds issued', value: s.bankBondsIssued },
        { label: 'Central bank funding', value: s.bankFundingBorrowing },
        { label: 'Equity', value: s.bankEquity },
      ],
      netWorth: null,
    },
    private: {
      title: 'Households, firms & offshore',
      assets: [
        { label: 'Currency', value: s.currency },
        { label: 'Deposits (M3)', value: depositsTotal(s) },
        { label: 'Government bonds', value: govtBondsHeldByNonBanks },
        { label: 'Bank bonds', value: bankBondsHeldByNonBanks },
      ],
      liabilities: [
        { label: 'Mortgages', value: s.loansHousing },
        { label: 'Business loans', value: s.loansBusiness },
        { label: 'Consumer loans', value: s.loansConsumer },
      ],
      netWorth: privateAssets - privateLiabilities,
    },
  };
}
