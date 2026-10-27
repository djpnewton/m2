/**
 * Stock-flow-consistent model of money creation for a modern
 * "no reserve requirement" monetary system, calibrated to New Zealand.
 *
 * DESIGN NOTES
 * ------------
 * The model is deliberately *mechanical*: every flow is an accounting entry
 * that moves between a small set of sector balance sheets. Nothing here is a
 * regression, so the model cannot "predict" history -- it shows the plumbing
 * that any prediction would have to respect.
 *
 * The identities the whole model is built around, derived from the aggregate
 * balance sheet of registered banks:
 *
 *     dM3 = dBankCredit + d(CB purchases from non-banks) - retained earnings - flight
 *     dM2 = dM3 - d(shift of deposits into term deposits)
 *
 * "Flight" is term deposits taken out of the banking system because the bank
 * underpriced them; it leaves M3 but never was M2, so it drops out of the second
 * identity.
 *
 * Reserves appear in neither identity. That is the point: in a system without
 * reserve requirements (NZ abolished them in 1985), settlement cash is a
 * by-product of central bank operations, not a constraint on lending.
 *
 * All stocks are NZ$ billions. All rates are percent per annum.
 */

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

/**
 * Illustrative opening balance sheet, roughly the shape and scale of the NZ
 * system around 2019. Magnitudes are order-of-magnitude accurate rather than
 * official statistics, but every internal identity balances exactly.
 */
export const INITIAL = {
  // Registered banks (aggregate)
  settlementCash: 8, // reserves held in ESAS accounts at RBNZ
  bankSecurities: 55, // NZGB / LGFA held by banks
  loansHousing: 350,
  loansBusiness: 130,
  loansConsumer: 18,
  bankOtherAssets: 6,
  depTransaction: 150,
  depSavings: 100,
  depTerm: 100,
  bankDebt: 117, // wholesale / offshore funding — recomputed monthly as the residual
  bankBondsIssued: 60, // the banks' own bonds outstanding (liability, not a holding)
  bankFlpBorrowing: 0, // borrowing under the cheap funding facility (owed to the central bank)
  bankEquity: 40,

  // Reserve Bank
  rbnzGovtBonds: 5,
  rbnzBankBonds: 0,
  rbnzFlp: 0,
  rbnzFxReserves: 22,
  rbnzAdvances: 0, // overnight facility lending to banks
  bankAdvances: 0, // banks' borrowing under that facility
  currency: 10, // notes and coins held by the public
  crownDeposits: 9,

  // Government / private sector
  crownDebt: 140,

  // Macro
  gdp: 400, // nominal, annualised
  ocr: 3.5,
  inflation: 2.0,
  expectedInflation: 2.0,
  outputGap: 0,
};

/**
 * Behavioural parameters. These are judgement calls, not estimates. The ones
 * that matter politically are exposed as sliders; the rest live here so the
 * model's assumptions stay inspectable in one place.
 */
export const PARAMS = {
  neutralRealRate: 1.5, // neutral real policy rate (autopilot anchor)



  // Rate structure
  termPremium: 0.35,
  mortgageSpread: 1.6,
  businessSpread: 3.0,
  consumerSpread: 4.0,
  depositMargin: 0.5, // default margin the bank shaves off to price term deposits
  depositConvenience: 0.7, // pp below wholesale that savers accept for liquidity and safety
  depositFlightElasticity: 0.6, // share of term deposits lost per year per pp of under-pricing
  maxFlightShare: 0.6, // cap on annual flight, as a share of the term deposit stock
  flightMonthlyCap: 0.2, // no more than this share of the term stock can leave in one month
  qeTermCompressionMax: 0.9, // pp of term-premium compression at $100bn of holdings
  stressRateSpread: 1.6, // pp added to wholesale funding at maximum stress
  depositBenchmarkOcrWeight: 0.35, // weight on the OCR in the deposit pricing benchmark
  termDepositFloor: 0.05, // a deposit rate does not go below this
  onCallOcrShare: 0.1, // on-call deposit rate as a share of the OCR
  // Cheap funding facility: subsidy strength and how far it passes into each rate
  flpIntensityDenominator: 0.25, // facility size, as a share of bank assets, that saturates the subsidy
  maxFundingSubsidy: 0.8, // pp of funding-cost relief at saturation
  flpMortgagePassThrough: 0.3, // share of the subsidy passed into mortgage rates
  securitiesYieldDiscount: 0.2, // bonds yield this much less than wholesale funding

  // Credit demand: annual % growth = base + sensitivity * (neutral real - real rate)
  baseHousing: 4.5,
  baseBusiness: 3.5,
  baseConsumer: 2.5,
  sensHousing: 0.85,
  sensBusiness: 0.55,
  sensConsumer: 0.45,
  confidencePassThrough: 2.5, // pp of credit growth per 1.0 of confidence
  lvrRateDrag: 1.8, // pp of credit growth at full macroprudential tightness
  capitalThrottleGain: 10, // how hard a capital shortfall throttles new lending
  capitalThrottleFloor: 0.15, // lending cannot be throttled below this share

  // Debt-service drag on new credit (symmetric around the opening burden)
  dsrThreshold: 8.5, // interest burden, % of private income
  dsrDragCoefficient: 0.35,
  privateIncomeShareOfGdp: 0.62,

  // Bank economics
  costRate: 2.1, // non-interest cost, % of assets p.a. (calibrated for a realistic ROE)
  baseLossRate: 0.35, // % of loans p.a.
  retention: 0.45, // share of post-writeoff profit retained
  capitalTarget: 0.135, // total capital / risk-weighted assets
  riskWeightHousing: 0.35,
  riskWeightBusiness: 1.0,
  riskWeightConsumer: 1.0,
  riskWeightSecurities: 0.2,

  // Money demand
  currencyRatioIntercept: 0.0425,
  currencyRatioSlope: 0.0015, // ratio points per 1pp of policy rate
  termShareIntercept: 0.286,
  termShareSlope: 0.025, // share points per pp of term-vs-on-call spread
  termSharePivot: 2.875, // the spread at which savers hold the intercept share

  // Structural floors. Banks do not sell their whole bond book, and settlement
  // cash cannot go negative in a system with a standing lending facility.
  securitiesFloor: 4,
  reserveFloor: 2,

  // Macro feedback (illustrative reduced form, for the autopilot only)
  inflationPersistence: 0.75,
  outputGapPersistence: 0.85,
  outputGapStancePass: 0.15,
  inflationFromGap: 0.45,
  inflationFromMoney: 0.10,
  gdpNominalGrowth: 4.5,

  inflationTarget: 2.0, // the midpoint the Reserve Bank targets
  moneyGrowthReference: 4.0, // money growth that adds nothing to inflation

  // The deficit treated as structurally normal. Only the part above this line is
  // demand stimulus, so a deficit at or below it leaves the output gap alone.
  // Resident population, millions. Only used to put the money stock in human terms.
  population: 5.2,

  fiscalBaseline: 1.0,
  fiscalImpulseWeight: 0.4, // how much a deficit of 1% of GDP adds to the output gap

  // Fiscal feedback. Off unless fiscal.riskSensitivity is turned up: at zero the
  // term premium is a constant and interest payments are not in the deficit, which
  // is the model's original behaviour.
  debtThresholdPct: 40, // debt/GDP above which lenders charge a premium
  debtRiskPerPoint: 0.04, // pp of yield per point above that, at the reference setting

  taylorInflationWeight: 0.5,
  taylorGapWeight: 0.5,
};

export const DEFAULT_CONFIG = {
  months: 72,
  autopilot: false,

  policy: { start: 3.5, end: 3.5, convergeMonths: 12 },

  // Central bank purchases of government bonds (NZGB / LGFA), NZ$bn per month.
  govtPurchases: { pace: 0, months: 0, startMonth: 0, nonBankShare: 0.6 },
  govtSales: { pace: 0, startMonth: 96 },

  // Central bank purchases of registered bank bonds, NZ$bn per month.
  bankBondPurchases: { pace: 0, months: 0, startMonth: 0, nonBankShare: 0.3 },
  bankBondSales: { pace: 0, startMonth: 96 },

  // Funding-for-Lending style cheap funding facility, total NZ$bn.
  flp: { total: 0, months: 0, startMonth: 0 },

  // riskSensitivity is pp of yield per point of debt/GDP above the threshold, and
  // switches on interest payments inside the deficit. Zero leaves debt unpriced.
  fiscal: { deficitPctGdp: PARAMS.fiscalBaseline, riskSensitivity: 0 },
  credit: { confidence: 1.0, lvrTightness: 0, capitalTarget: null },
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

export function createInitialState() {
  const s = clone(INITIAL);
  s.stress = 0;
  return s;
}

/* ------------------------------------------------------------------ */
/* Derived quantities                                                  */
/* ------------------------------------------------------------------ */

export function riskWeightedAssets(s) {
  return (
    PARAMS.riskWeightHousing * s.loansHousing +
    PARAMS.riskWeightBusiness * s.loansBusiness +
    PARAMS.riskWeightConsumer * s.loansConsumer +
    PARAMS.riskWeightSecurities * s.bankSecurities
  );
}

export function capitalRatio(s) {
  return s.bankEquity / riskWeightedAssets(s);
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

/** Monetary base: currency in circulation plus settlement cash balances. */
export function monetaryBase(s) {
  return s.currency + s.settlementCash;
}

export function bankAssets(s) {
  return (
    s.settlementCash +
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
    s.bankFlpBorrowing +
    s.bankAdvances +
    s.bankEquity
  );
}

export function rbnzAssets(s) {
  return s.rbnzGovtBonds + s.rbnzBankBonds + s.rbnzFlp + s.rbnzFxReserves + s.rbnzAdvances;
}

export function rbnzLiabilities(s) {
  return s.currency + s.settlementCash + s.crownDeposits;
}

export function rbnzEquity(s) {
  return rbnzAssets(s) - rbnzLiabilities(s);
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
function fundingBenchmark(ocr, wholesale) {
  const w = PARAMS.depositBenchmarkOcrWeight;
  return w * ocr + (1 - w) * wholesale;
}

/**
 * Lending rates from the two rates they are built out of. Defining them once means
 * the neutral benchmark used for credit demand cannot drift from the rates the
 * model actually charges.
 */
function lendingRates(ocr, wholesale, fundingSubsidy) {
  const P = PARAMS;
  const mortgage = 0.5 * ocr + 0.5 * wholesale + P.mortgageSpread - fundingSubsidy * P.flpMortgagePassThrough;
  return {
    mortgage,
    businessRate: wholesale + P.businessSpread - fundingSubsidy,
    consumerRate: mortgage + P.consumerSpread,
  };
}

function rateStructure(s) {
  const P = PARAMS;
  const qeStock = s.rbnzGovtBonds + s.rbnzBankBonds;
  const qeCompression = Math.min(P.qeTermCompressionMax, (qeStock / 100) * P.qeTermCompressionMax);
  const stressSpread = s.stress * P.stressRateSpread;

  // The debt stock prices into the long rate, which is the rate banks fund at and
  // the rate the Crown pays.
  const debtRatio = (s.crownDebt / s.gdp) * 100;
  const riskPremium = Math.max(0, debtRatio - P.debtThresholdPct) * (s.debtRisk ?? 0);
  const wholesale = Math.max(
    0,
    s.ocr + P.termPremium + riskPremium + stressSpread - qeCompression,
  );
  const flpIntensity = s.rbnzFlp / Math.max(1, bankAssets(s) * P.flpIntensityDenominator);
  const fundingSubsidy = Math.min(P.maxFundingSubsidy, flpIntensity * P.maxFundingSubsidy);

  return {
    qeCompression,
    fundingSubsidy,
    riskPremium,
    debtRatio,
    wholesale,
    ...lendingRates(s.ocr, wholesale, fundingSubsidy),
    termRate: Math.max(
      P.termDepositFloor,
      fundingBenchmark(s.ocr, wholesale) - (s.depositMargin ?? P.depositMargin),
    ),
    onCallRate: Math.max(0, P.onCallOcrShare * s.ocr),
  };
}

/* ------------------------------------------------------------------ */
/* The step function                                                   */
/* ------------------------------------------------------------------ */

function step(s, cfg, month, prev) {
  const P = PARAMS;

  /* -- 1. Policy rate ---------------------------------------------- */
  if (cfg.autopilot) {
    const rStar = P.neutralRealRate + s.expectedInflation;
    const target =
      rStar +
      s.inflation +
      P.taylorInflationWeight * (s.inflation - P.inflationTarget) +
      P.taylorGapWeight * s.outputGap;
    s.ocr = clamp(target, 0.25, 9);
  } else {
    s.ocr = policyRateAt(cfg, month + 1);
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
  } = rateStructure(s);

  /* -- 3. Credit demand -------------------------------------------- */
  // The neutral real rate expressed on the same basis as each lending rate, by
  // evaluating the rate formula with the policy rate at zero.
  const structural = lendingRates(0, P.termPremium, 0);
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
  const lvrDrag = cfg.credit.lvrTightness * P.lvrRateDrag;

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
  const carNow = capitalRatio(s);
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
  const freeFloat = s.crownDebt - s.rbnzGovtBonds - s.bankSecurities;
  const byFreeFloat = nonBankGovtShare > 1e-9 ? freeFloat / nonBankGovtShare : Infinity;
  const byBankFloor = s.crownDebt - s.rbnzGovtBonds - P.securitiesFloor;
  const availableGovtBonds = Math.max(0, Math.min(byFreeFloat, byBankFloor));

  const qeGovt = clamp(govtNet, -s.rbnzGovtBonds, availableGovtBonds);
  const qeBankBonds = clamp(bankBondNet, -s.rbnzBankBonds, bankBondBuy);
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
  const flpPace = cfg.flp.months > 0 ? cfg.flp.total / cfg.flp.months : 0;
  const flpDraw = month >= cfg.flp.startMonth && month < cfg.flp.startMonth + cfg.flp.months ? flpPace : 0;

  /* -- 7. Fiscal --------------------------------------------------- */
  // Only the deficit is modelled. Gross spending and taxation net to it: tax
  // receipts cover ordinary spending, and just the shortfall has to be financed
  // by issuing bonds. Bonds sold to the public create no deposits; only the
  // share the central bank buys does (via dQeNonBank above).
  // With debt priced, the deficit control is a *primary* deficit and the interest
  // bill is added on top — which is what makes the debt stock feed back into itself.
  const primaryDeficit = (cfg.fiscal.deficitPctGdp / 100) * s.gdp / 12; // NZ$bn per month
  const govtInterest = (s.crownDebt * wholesale) / 100 / 12;
  const debtServiceInDeficit = (s.debtRisk ?? 0) > 0 ? 1 : 0;
  const deficit = primaryDeficit + debtServiceInDeficit * govtInterest;

  /* -- 8. Bank profit, write-offs, equity -------------------------- */
  const assetIncome =
    (s.loansHousing * mortgage +
      s.loansBusiness * businessRate +
      s.loansConsumer * consumerRate +
      s.bankSecurities * Math.max(0, wholesale - P.securitiesYieldDiscount) +
      s.settlementCash * s.ocr) /
    100 /
    12;
  const interestCost =
    (s.depTerm * termRate +
      (s.depSavings + s.depTransaction) * onCallRate +
      (s.bankDebt + s.bankBondsIssued) * wholesale +
      s.rbnzFlp * s.ocr) /
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
  const outsideRate = Math.max(0, fundingBenchmark(s.ocr, wholesale) - P.depositConvenience);
  const underpricing = Math.max(0, outsideRate - termRate);
  const annualFlightShare = Math.min(P.maxFlightShare, P.depositFlightElasticity * underpricing);
  const flight = Math.min(s.depTerm * P.flightMonthlyCap, (annualFlightShare / 12) * s.depTerm);

  const depositCreation = dLoans + dQeNonBank - retained;
  const oldDeposits = depositsTotal(s);
  const oldOnCall = s.depTransaction + s.depSavings;

  const spread = termRate - onCallRate;
  const targetTermShare = clamp(
    P.termShareIntercept + P.termShareSlope * (spread - P.termSharePivot) + cfg.households.termPreference,
    0.15,
    0.6,
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
    P.currencyRatioIntercept - P.currencyRatioSlope * s.ocr + s.stress * 0.012,
    0.015,
    0.09,
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

  s.rbnzGovtBonds += qeGovt;
  s.rbnzBankBonds += qeBankBonds;
  s.bankSecurities += dSecuritiesSold;
  s.bankBondsIssued += bankBondsPlaced;
  s.rbnzFlp += flpDraw;
  s.bankFlpBorrowing += flpDraw;
  s.rbnzFxReserves += dCurrency; // note issuance backed by foreign assets

  // Reserves are the residual supply of settlement cash.
  s.settlementCash += qeTotal - dCurrency + flpDraw;

  s.currency += dCurrency;
  s.depTerm = newTerm;
  const onCallPost = onCallPre - dCurrency;
  const savingsShare = s.depSavings / (s.depTransaction + s.depSavings);
  s.depSavings = onCallPost * savingsShare;
  s.depTransaction = onCallPost - s.depSavings;

  s.bankEquity += retained - writeoffs;
  s.crownDebt += deficit;

  // Wholesale funding is whatever the deposit base and equity do not cover:
  // it is the marginal funding source, not a fixed constant.
  s.bankDebt =
    bankAssets(s) -
    depositsTotal(s) -
    s.bankEquity -
    s.bankAdvances -
    s.bankFlpBorrowing -
    s.bankBondsIssued;

  // Settlement cash cannot go negative. In a system with no reserve
  // requirement the central bank stands ready to lend reserves against
  // collateral, so draw on that facility instead.
  if (s.settlementCash < P.reserveFloor) {
    const advance = P.reserveFloor - s.settlementCash;
    s.rbnzAdvances += advance;
    s.bankAdvances += advance;
    s.settlementCash += advance;
  }

  /* -- 11. Macro feedback ----------------------------------------- */
  const moneyGrowthYoY = prev ? (dM2 * 12) / Math.max(1, prev.m2) : 0.045;

  // Simple IS relation: the stance is the gap between the neutral nominal
  // policy rate and the *effective* rate, where asset purchases loosen
  // conditions a little beyond the OCR itself.
  const neutralNominal = P.neutralRealRate + P.inflationTarget;
  const effectiveRate = s.ocr - qeCompression * 0.5;
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
    ocr: s.ocr,
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
    rbnzGovtBonds: s.rbnzGovtBonds,
    rbnzBankBonds: s.rbnzBankBonds,
    rbnzFlp: s.rbnzFlp,
    rbnzAssets: rbnzAssets(s),
    rbnzFxReserves: s.rbnzFxReserves,
    settlementCash: s.settlementCash,
    rbnzAdvances: s.rbnzAdvances,
    crownDeposits: s.crownDeposits,
    crownDebt: s.crownDebt,
    bankEquity: s.bankEquity,
    bankDebt: s.bankDebt,
    bankFlpBorrowing: s.bankFlpBorrowing,
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
    flpDraw,
    qeCompression,
    fundingSubsidy,
    riskPremium,
    debtRatio: (s.crownDebt / s.gdp) * 100,
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
  const s = createInitialState();
  s.depositMargin = cfg.deposits?.margin ?? PARAMS.depositMargin;
  s.debtRisk = cfg.fiscal?.riskSensitivity ?? 0;
  s.ocr = policyRateAt(cfg, 0);
  const opening = rateStructure(s);
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
      ocr: s.ocr,
      wholesale: opening.wholesale,
      settlementCash: s.settlementCash,
      rbnzAdvances: s.rbnzAdvances,
      rbnzAssets: rbnzAssets(s),
      rbnzFxReserves: s.rbnzFxReserves,
      rbnzGovtBonds: s.rbnzGovtBonds,
      rbnzBankBonds: s.rbnzBankBonds,
      rbnzFlp: s.rbnzFlp,
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
      capitalRatio: capitalRatio(s),
      crownDebt: s.crownDebt,
      bankEquity: s.bankEquity,
      bankDebt: s.bankDebt,
      bankFlpBorrowing: s.bankFlpBorrowing,
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
      outsideRate: Math.max(0, fundingBenchmark(s.ocr, opening.wholesale) - PARAMS.depositConvenience),
      underpricing: 0,
      dRetained: 0,
      dTermShift: 0,
      dCurrency: 0,
      qeGovt: 0,
      qeBankBonds: 0,
      flpDraw: 0,
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
    history.push(step(s, cfg, m, history[history.length - 1]));
  }

  return { config: cfg, history, final: s, months };
}

/** Balance-sheet snapshot for the T-account view. */
export function balanceSheets(s) {
  const govtBondsHeldByBanks = s.bankSecurities;
  const govtBondsHeldByNonBanks = Math.max(0, s.crownDebt - s.rbnzGovtBonds - govtBondsHeldByBanks);
  const bankBondsHeldByNonBanks = Math.max(0, s.bankBondsIssued - s.rbnzBankBonds);

  const privateAssets =
    s.currency + depositsTotal(s) + govtBondsHeldByNonBanks + bankBondsHeldByNonBanks;
  const privateLiabilities = s.loansHousing + s.loansBusiness + s.loansConsumer;

  return {
    rbnz: {
      title: 'Reserve Bank',
      assets: [
        { label: 'Government bonds', value: s.rbnzGovtBonds },
        { label: 'Bank bonds', value: s.rbnzBankBonds },
        { label: 'Funding for lending', value: s.rbnzFlp },
        { label: 'Foreign reserves', value: s.rbnzFxReserves },
      ],
      liabilities: [
        { label: 'Currency in circulation', value: s.currency },
        { label: 'Settlement cash', value: s.settlementCash },
        { label: 'Crown deposits', value: s.crownDeposits },
      ],
      netWorth: rbnzEquity(s),
    },
    banks: {
      title: 'Registered banks',
      assets: [
        { label: 'Settlement cash', value: s.settlementCash },
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
        { label: 'Central bank funding', value: s.bankFlpBorrowing },
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
