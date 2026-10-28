/**
 * Regional variation, in one place.
 *
 * Everything that differs between the two calibrations lives here: behavioural
 * parameters, the opening balance sheet, the words the interface uses, the
 * assumptions prose, and the glossary bodies that are country-specific. The model
 * and the UI take a region id and read from here, so adding a third country means
 * adding an entry rather than editing either of them.
 *
 * Parameters are a shared base plus explicit per-region overrides. That diff is
 * the clearest available statement of how the two monetary systems differ.
 */

/**
 * Behavioural parameters that are the same in both calibrations. These are
 * judgement calls, not estimates.
 */
const COMMON = {
  // Rate structure
  businessSpread: 3.0,
  consumerSpread: 4.0,
  depositMargin: 0.5, // default margin the bank shaves off to price term deposits
  depositConvenience: 0.7, // pp below wholesale that savers accept for liquidity and safety
  depositFlightElasticity: 0.6, // share of term deposits lost per year per pp of under-pricing
  maxFlightShare: 0.6, // cap on annual flight, as a share of the term deposit stock
  flightMonthlyCap: 0.2, // no more than this share of the term stock can leave in one month
  qeTermCompressionMax: 0.9, // pp of term-premium compression at the reference stock
  stressRateSpread: 1.6, // pp added to wholesale funding at maximum stress
  depositBenchmarkPolicyWeight: 0.35, // weight on the policy rate in the deposit pricing benchmark
  termDepositFloor: 0.05, // a deposit rate does not go below this
  // Central bank funding facility: subsidy strength and how far it passes into each rate
  maxFundingSubsidy: 0.8, // pp of funding-cost relief at saturation
  facilityMortgagePassThrough: 0.3, // share of the subsidy passed into mortgage rates
  securitiesYieldDiscount: 0.2, // bonds yield this much less than wholesale funding

  // Credit demand: annual % growth = base + sensitivity * (neutral real - real rate)
  sensHousing: 0.85,
  sensBusiness: 0.55,
  sensConsumer: 0.45,
  confidencePassThrough: 2.5, // pp of credit growth per 1.0 of confidence
  tightnessRateDrag: 1.8, // pp of credit growth at full macroprudential tightness
  capitalThrottleGain: 10, // how hard a capital shortfall throttles new lending
  capitalThrottleFloor: 0.15, // lending cannot be throttled below this share

  // Debt-service drag on new credit (symmetric around the opening burden)
  dsrThreshold: 8.5, // interest burden, % of private income
  dsrDragCoefficient: 0.35,
  privateIncomeShareOfGdp: 0.62,

  // Bank economics
  baseLossRate: 0.35, // % of loans p.a.
  retention: 0.45, // share of post-writeoff profit retained
  capitalTarget: 0.135, // total capital / risk-weighted assets
  riskWeightHousing: 0.35,
  riskWeightBusiness: 1.0,
  riskWeightConsumer: 1.0,
  riskWeightSecurities: 0.2,

  // Money demand
  currencyRatioSlope: 0.0015, // ratio points per 1pp of policy rate
  termShareSlope: 0.025, // share points per pp of term-vs-on-call spread
  termSharePivot: 2.875, // the spread at which savers hold the intercept share

  // Structural floors. Banks do not sell their whole bond book, and settlement
  // cash cannot go negative in a system with a standing lending facility.

  // Macro feedback (illustrative reduced form, for the autopilot only)
  inflationPersistence: 0.75,
  outputGapPersistence: 0.85,
  outputGapStancePass: 0.15,
  inflationFromGap: 0.45,
  inflationFromMoney: 0.10,

  inflationTarget: 2.0, // the midpoint the Fed targets
  moneyGrowthReference: 4.0, // money growth that adds nothing to inflation

  // The deficit treated as structurally normal. Only the part above this line is
  // demand stimulus, so a deficit at or below it leaves the output gap alone.
  // Resident population, millions. Only used to put the money stock in human terms.

  fiscalImpulseWeight: 0.4, // how much a deficit of 1% of GDP adds to the output gap

  // Fiscal feedback. Off unless fiscal.riskSensitivity is turned up: at zero the
  // term premium is a constant and interest payments are not in the deficit, which
  // is the model's original behaviour.
  debtRiskPerPoint: 0.04, // pp of yield per point above that, at the reference setting

  taylorInflationWeight: 0.5,
  taylorGapWeight: 0.5,
};

/** The parameters that differ, region by region. */
export const REGION_PARAMS = {
  us: {
    ...COMMON,
    neutralRealRate: 2.0,
    termPremium: 0.9,
    mortgageSpread: 1.8,
    qeCompressionReference: 6000,
    onCallPolicyRateShare: 0.25,
    facilityIntensityDenominator: 0.01,
    baseHousing: 6.0,
    baseBusiness: 5.0,
    baseConsumer: 4.0,
    costRate: 3.0,
    currencyRatioIntercept: 0.12,
    termShareIntercept: 0.07,
    securitiesFloor: 400,
    reserveFloor: 150,
    gdpNominalGrowth: 4.8,
    population: 335,
    fiscalBaseline: 3.5,
    debtThresholdPct: 120,
  },
  nz: {
    ...COMMON,
    neutralRealRate: 1.5,
    termPremium: 0.35,
    mortgageSpread: 1.6,
    qeCompressionReference: 100,
    onCallPolicyRateShare: 0.1,
    facilityIntensityDenominator: 0.25,
    baseHousing: 4.5,
    baseBusiness: 3.5,
    baseConsumer: 2.5,
    costRate: 2.1,
    currencyRatioIntercept: 0.0425,
    termShareIntercept: 0.286,
    securitiesFloor: 4,
    reserveFloor: 2,
    gdpNominalGrowth: 4.5,
    population: 5.2,
    fiscalBaseline: 1.0,
    debtThresholdPct: 40,
  },
};

/**
 * Opening balance sheets, in local currency billions. Every identity balances
 * exactly: the US sits at the end of 2024, New Zealand around 2019.
 */
export const REGION_INITIAL = {
  us: {
    reserves: 3200,
    bankSecurities: 6000,
    loansHousing: 6200,
    loansBusiness: 6000,
    loansConsumer: 2300,
    bankOtherAssets: 1800,
    depTransaction: 9600,
    depSavings: 9000,
    depTerm: 1600,
    bankDebt: 1300,
    bankBondsIssued: 2200,
    bankFundingBorrowing: 0,
    bankEquity: 1800,
    cbGovtBonds: 6600,
    cbBankBonds: 0,
    cbFunding: 0,
    cbFxReserves: 100,
    cbAdvances: 0,
    bankAdvances: 0,
    currency: 2400,
    govtDeposits: 700,
    govtDebt: 28000,
    gdp: 29200,
    policyRate: 4.4,
    inflation: 2.9,
    expectedInflation: 2.6,
    outputGap: 0,
  },
  nz: {
    reserves: 8,
    bankSecurities: 55,
    loansHousing: 350,
    loansBusiness: 130,
    loansConsumer: 18,
    bankOtherAssets: 6,
    depTransaction: 150,
    depSavings: 100,
    depTerm: 100,
    bankDebt: 117,
    bankBondsIssued: 60,
    bankFundingBorrowing: 0,
    bankEquity: 40,
    cbGovtBonds: 5,
    cbBankBonds: 0,
    cbFunding: 0,
    cbFxReserves: 22,
    cbAdvances: 0,
    bankAdvances: 0,
    currency: 10,
    govtDeposits: 9,
    govtDebt: 140,
    gdp: 400,
    policyRate: 3.5,
    inflation: 2.0,
    expectedInflation: 2.0,
    outputGap: 0,
  },
};

/** The words the interface uses. Nothing else in the UI should name a country. */
export const TERMS = {
  us: {
    name: 'United States',
    adjective: 'US',
    currency: 'US$',
    centralBank: 'Fed',
    centralBankFull: 'Federal Reserve',
    policyRate: 'fed funds rate',
    policyRateLabel: 'Fed funds rate',
    reserves: 'reserve balances',
    reservesLabel: 'Reserve balances',
    government: 'Treasury',
    banksLabel: 'Bank-like sector',
    fundingFacility: 'Bank Term Funding Program',
    liquidityRule: 'liquidity coverage ratio',
    macroRule: 'LTV / DTI',
    citizen: 'American',
    reserveHistory: 'US reserve requirements have been zero since March 2020',
    goldUnit: 'US$ an ounce',
  },
  nz: {
    name: 'New Zealand',
    adjective: 'NZ',
    currency: 'NZ$',
    centralBank: 'Reserve Bank',
    centralBankFull: 'Reserve Bank of New Zealand',
    policyRate: 'official cash rate',
    policyRateLabel: 'Official cash rate',
    reserves: 'settlement cash',
    reservesLabel: 'Settlement cash',
    government: 'Crown',
    banksLabel: 'Registered banks',
    fundingFacility: 'Funding for Lending Programme',
    liquidityRule: 'core funding ratio',
    macroRule: 'LVR / DTI',
    citizen: 'New Zealander',
    reserveHistory: 'New Zealand abolished compulsory reserves in 1985',
    goldUnit: 'NZ$ an ounce',
  },
};

/** The assumptions prose. Country-specific throughout; the heading lives in index.html. */
export const PROSE = {
  us: `
<ul>
  <li>
    <b>There is no binding <button type="button" class="term" data-term="reserve-requirement" aria-expanded="false">reserve requirement</button>.</b> US requirements went to zero in March 2020.
    Banks hold reserve balances to settle payments with each other and with the Treasury, and the
    Fed supplies whatever is demanded at its target rate. So reserves are an outcome of policy
    operations, not a constraint that forces lending to multiply.
  </li>
  <li>
    <b>Loans create deposits.</b> Bank lending adds to deposits one-for-one; nothing is
    "lent out" of existing deposits. Repaying a loan destroys the deposit again.
  </li>
  <li>
    <b>Who sells matters.</b> When the central bank buys a bond from a pension fund, the seller
    ends up with a deposit and M2 rises. When it buys from a bank's own book, the bank swaps a
    bond for reserve balances and no deposit is created.
  </li>
  <li>
    <b>Term deposits do not fund loans — but banks still compete for them.</b> The intuition
    that a bank gathers deposits and lends them out has the arrow backwards: lending creates
    the deposit that funds it, and a term deposit is a liability the bank owes, not a pile of
    money waiting to be deployed. Banks pay up for term deposits because the alternative is
    dearer. Wholesale funding costs more than a term deposit, and a balance the bank fails to
    retain has to be replaced in that market. The premium over an on-call balance buys
    duration — funding that cannot leave tomorrow — which is why the <button type="button" class="term" data-term="liquidity-coverage-ratio" aria-expanded="false">liquidity coverage ratio</button> rewards stable deposits and makes a bank hold liquid assets against the
    balances that can leave. The <em>deposit margin</em> control is where this bites:
    the bank can shave its term deposit rate below market to save interest, but past roughly
    <span id="prose-convenience">0.7</span> percentage points savers move their money to non-bank
    assets and it has to replace those balances with wholesale borrowing at
    <span id="prose-wholesale">4.40%</span>. Push the margin up and watch M3 fall
    while M2 barely moves — the money was never in M2, and the cost lands on the bank's
    profits. Wholesale funding is the residual here, so it rises one-for-one with what leaves.
  </li>
  <li>
    <b>A deficit creates no deposits directly, but it does change how much gets borrowed.</b>
    Ordinary spending is covered by tax receipts; only the shortfall — the deficit — has to
    be financed by issuing bonds. Selling those bonds to the public swaps deposits for bonds,
    so the financing leg creates no money: on its own, the money stock rises only as far as
    the central bank buys the bonds. The model adds a slower second link. A deficit above the
    <span id="prose-fiscal-baseline">3.5</span>%-of-GDP baseline lifts demand, firms and
    households borrow against that demand, and lending creates deposits — so the deficit is
    worth <span id="prose-fiscal-credit">+0.0</span>bn of M2 in the current run, all of it
    arriving as bank credit rather than through the budget line itself.
  </li>
  <li>
    <b>M2 here is this model's definition</b> — currency plus transaction and on-call savings
    deposits. The Fed publishes several aggregates, and M2 itself is broader than the deposits
    drawn here — it counts retail money-market funds and small time deposits held outside the
    bank-like sector. Levels and growth rates will not match published statistics exactly, and
    are not meant to.
  </li>
  <li>
    <b>Numbers are illustrative.</b> The opening balance sheet is calibrated to the shape and
    scale of the US system at the end of 2024, with every internal identity balancing exactly.
    The behavioural parameters are judgement calls, not estimates.
  </li>
</ul>
    `,
  nz: `
<ul>
  <li>
    <b>There is no <button type="button" class="term" data-term="reserve-requirement" aria-expanded="false">reserve requirement</button>.</b> New Zealand abolished compulsory reserves in 1985.
    Banks hold settlement cash to settle payments with each other, and the central bank supplies
    whatever is needed. So reserves are an outcome of policy operations, not a constraint that
    forces lending to multiply.
  </li>
  <li>
    <b>Loans create deposits.</b> Bank lending adds to deposits one-for-one; nothing is
    "lent out" of existing deposits. Repaying a loan destroys the deposit again.
  </li>
  <li>
    <b>Who sells matters.</b> When the central bank buys a bond from a pension fund, the seller
    ends up with a deposit and M2 rises. When it buys from a bank's own book, the bank swaps a
    bond for settlement cash and no deposit is created.
  </li>
  <li>
    <b>Term deposits do not fund loans — but banks still compete for them.</b> The intuition
    that a bank gathers deposits and lends them out has the arrow backwards: lending creates
    the deposit that funds it, and a term deposit is a liability the bank owes, not a pile of
    money waiting to be deployed. Banks pay up for term deposits because the alternative is
    dearer. Wholesale funding costs more than a term deposit, and a balance the bank fails to
    retain has to be replaced in that market. The premium over an on-call balance buys
    duration — funding that cannot leave tomorrow — which is why New Zealand's <button type="button" class="term" data-term="liquidity-coverage-ratio" aria-expanded="false">core funding ratio</button> counts longer-dated retail deposits as core funding and requires a minimum share of
    lending to be funded that way. The <em>deposit margin</em> control is where this bites:
    the bank can shave its term deposit rate below market to save interest, but past roughly
    <span id="prose-convenience">0.7</span> percentage points savers move their money to non-bank
    assets and it has to replace those balances with wholesale borrowing at
    <span id="prose-wholesale">3.81%</span>. Push the margin up and watch M3 fall
    while M2 barely moves — the money was never in M2, and the cost lands on the bank's
    profits. Wholesale funding is the residual here, so it rises one-for-one with what leaves.
  </li>
  <li>
    <b>A deficit creates no deposits directly, but it does change how much gets borrowed.</b>
    Ordinary spending is covered by tax receipts; only the shortfall — the deficit — has to
    be financed by issuing bonds. Selling those bonds to the public swaps deposits for bonds,
    so the financing leg creates no money: on its own, the money stock rises only as far as
    the central bank buys the bonds. The model adds a slower second link. A deficit above the
    <span id="prose-fiscal-baseline">1</span>%-of-GDP baseline lifts demand, firms and
    households borrow against that demand, and lending creates deposits — so the deficit is
    worth <span id="prose-fiscal-credit">+0.0</span>bn of M2 in the current run, all of it
    arriving as bank credit rather than through the budget line itself.
  </li>
  <li>
    <b>M2 here is this model's definition</b> — currency plus transaction and on-call savings
    deposits. The Reserve Bank publishes several aggregates and its own M3 is broader, adding term
    deposits and funding from non-residents. Levels and growth rates will not match published
    statistics exactly, and are not meant to.
  </li>
  <li>
    <b>Numbers are illustrative.</b> The opening balance sheet is calibrated to the shape and
    scale of the New Zealand system around 2019, with every internal identity balancing exactly.
    The behavioural parameters are judgement calls, not estimates.
  </li>
</ul>
    `,
};

/**
 * Glossary bodies that differ by country. Anything not listed keeps the shared
 * definition in glossary.js.
 */
export const GLOSSARY_OVERRIDES = {
  us: {
      'reserve-balances': 'Balances banks hold in their accounts at the Fed to settle payments with each other, with the Treasury and with the Fed itself. Reserve requirements have been zero since March 2020 and the Fed pays interest on these balances, so they are supplied on demand: an outcome of policy operations, not a limit on lending.',
      'reserve-requirement': 'A rule requiring banks to hold a minimum share of their deposits as reserves. US requirements went to zero in March 2020, which is why reserves here are an outcome of central bank operations rather than a limit on lending.',
      'liquidity-coverage-ratio': 'A post-2008 rule requiring large banks to hold enough high-quality liquid assets — reserves and Treasuries — to survive thirty days of stressed outflows. It makes liquid assets worth holding, which is why a bank competes for stable deposits rather than treating them as a pile of money waiting to be lent.',
      'funding-facility': 'The Fed lending cheaply to banks against collateral — the discount window, and the Bank Term Funding Program in 2023. It creates reserves at once but deposits only later: cheaper funding lets banks cut lending rates, which raises credit demand, and lending is what creates deposits. The chain works, but weakly — a large facility moves M2 far less than an equivalent bond purchase.',
      'lvr': 'How much a bank will lend relative to the value of the property securing it. Caps on high-LTV lending, and the qualified-mortgage rules that cap debt-to-income, are macroprudential tools: they slow credit without moving the policy rate.',
  },
  nz: {
      'reserve-balances': 'Balances banks hold in their accounts at the Reserve Bank to settle payments with each other and with the Crown. New Zealand has had no reserve requirement since 1985, so the Reserve Bank supplies whatever is demanded.',
      'reserve-requirement': 'A rule requiring banks to hold a minimum share of their deposits as reserves. New Zealand removed compulsory reserves in 1985, which is why reserves here are an outcome of central bank operations rather than a limit on lending.',
      'liquidity-coverage-ratio': 'A Reserve Bank liquidity requirement: a minimum share of a bank lending must be funded by core funding, meaning equity, long-dated wholesale funding, and retail term deposits with a year or more still to run.',
      'funding-facility': 'The Reserve Bank lending cheaply to banks against collateral in order to lower their funding costs. It creates settlement cash at once but deposits only later: cheaper funding lets banks cut lending rates, which raises credit demand, and lending is what creates deposits. The chain works, but weakly — a large facility moves M2 far less than an equivalent bond purchase.',
      'lvr': 'How much a bank will lend relative to the value of the property securing it. Reserve Bank restrictions on high-LVR lending are a macroprudential tool: they slow credit without moving the policy rate.',
  },
};

/** Glossary titles that differ by country. */
export const GLOSSARY_TITLES = {
  us: {
    'reserve-balances': 'Reserve balances',
    'reserve-requirement': 'Reserve requirement',
    'liquidity-coverage-ratio': 'Liquidity coverage ratio',
    'funding-facility': 'Central bank funding facility',
    lvr: 'Loan-to-value ratio',
  },
  nz: {
    'reserve-balances': 'Settlement cash',
    'reserve-requirement': 'Reserve requirement',
    'liquidity-coverage-ratio': 'Core funding ratio',
    'funding-facility': 'Funding for Lending Programme',
    lvr: 'Loan-to-value ratio',
  },
};

export const REGION_IDS = Object.keys(REGION_PARAMS);

export function regionOf(id) {
  return REGION_PARAMS[id] ? id : 'us';
}

export const paramsFor = (id) => REGION_PARAMS[regionOf(id)];
export const initialFor = (id) => REGION_INITIAL[regionOf(id)];
export const termsFor = (id) => TERMS[regionOf(id)];
export const proseFor = (id) => PROSE[regionOf(id)];
export const glossaryOverridesFor = (id) => GLOSSARY_OVERRIDES[regionOf(id)];
export const glossaryTitlesFor = (id) => GLOSSARY_TITLES[regionOf(id)];
