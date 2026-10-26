# How interest rates and bond purchases become M2

An interactive, stock-flow-consistent balance-sheet model of money creation, calibrated to
New Zealand. Move the policy rate, buy or sell government and bank bonds, add cheap bank funding,
and watch the money stock respond — and, more importantly, watch *why*.

No build step, no dependencies, and nothing fetched on load. Plain ES modules and hand-rolled SVG.
Glossary popovers are local; the only outbound links are the Wikipedia ones a reader chooses to follow.

## Running it

ES modules need to be served over HTTP (opening `index.html` from the filesystem will not work):

```bash
cd m2
npm start            # python3 -m http.server 8080
# then open http://localhost:8080
```

Any static server works. Tests need only Node 22+:

```bash
npm test             # node --test tests/*.test.js
```

164 tests: 113 cover the model (accounting identities, policy path, robustness), 38 cover the chart
helpers, and 13 cover the glossary. The chart tests import `src/charts.js` directly — it touches the DOM only inside its
render functions, so the pure maths is testable without a browser or a DOM shim.

## What the model says

The whole thing rests on two accounting identities, derived from the aggregate balance sheet of
registered banks:

```
ΔM3 = Δbank credit + Δ(central bank purchases from non-banks) − retained bank earnings
ΔM2 = ΔM3 − Δ(shift of deposits into term deposits)
```

Three consequences are visible in the app and are the point of building it:

1. **Reserves never appear in those identities.** A central bank buys NZ$100bn of bonds and the
   monetary base explodes; M2 barely moves unless the sellers were non-banks. In a system with no
   reserve requirement (New Zealand abolished compulsory reserves in 1985), settlement cash is what
   the central bank *pays with*, not fuel that a multiplier turns into money.
2. **Who sells the bond decides whether money is created.** Sell to a pension fund: the fund receives
   a deposit and M2 rises. Sell from a bank's own book: the bank swaps one asset for another and no
   deposit exists.
3. **A fiscal deficit on its own creates no money.** Tax receipts cover ordinary spending; only the
   shortfall — the deficit — has to be financed by issuing bonds. Selling those bonds to the public
   creates no deposits, so the money stock rises only to the extent the central bank buys them.
4. **Deposits do not fund lending.** Lending creates the deposit that funds it, so a shift into term
   deposits does not release lendable funds.
5. **But deposit pricing is a real decision with a real floor.** The bank can shave its term deposit
   rate below market to save interest — until savers leave. Past roughly 0.7pp of under-pricing,
   balances move to non-bank assets, and the bank replaces them with wholesale borrowing at 3.27%.
   Profits therefore peak exactly at that threshold: squeeze until balances start to leave, then
   stop. This is the only place where the funding mix is determined, and it is behavioural, not
   accounting — which is why the residual wholesale line alone could never explain it.

The rate channel works through a different door: the policy rate sets lending rates, lending rates
set how much credit is worth taking on, and bank lending creates deposits one-for-one.

## Reading the numbers

Every tile in the KPI strip is a button. Click one and it opens a breakdown of exactly what moved it
over the current window, with the flows that sum to the total — so the accounting is checkable rather
than asserted:

- **M2** — new bank lending, bond purchases sourced from non-banks, retained bank earnings, and the
  shift into term deposits. Notes and coins show as a zero row, because swapping a deposit for a
  banknote is still M2.
- **M3** — the same flows without the reshuffling between deposit types.
- **Monetary base** — purchases, cheap funding, standing-facility advances. Currency issuance is a
  zero row: it changes the mix, not the total.
- **Money multiplier** — the two growth rates that produced the ratio.
- **Settlement cash** — purchases and funding less the reserves drained by banknote issuance.
- **Bank credit** — the housing / business / consumer split of the change.
- **OCR** — the whole rate structure and the term-premium compression from holdings.
- **Inflation** — the reduced-form inputs.

Two identities these breakdowns rely on are asserted month-by-month in the test suite:

```
ΔM3               = Δbank credit + Δ(purchases from non-banks) − retained earnings − deposits lost
Δbase             = net asset purchases + funding drawn + standing advances
Δsettlement cash  = net asset purchases + funding drawn + standing advances − currency issued
wholesale funding = assets − deposits − equity − advances − facility borrowing
```

## Layout

```
index.html          page shell and prose
styles.css          all styling
src/model.js        the simulation engine — pure, no DOM, fully testable
src/scenarios.js    preset scenarios (configs)
src/charts.js       dependency-free SVG line, stacked-area and waterfall charts
src/glossary.js     inline definitions for jargon, shown in an accessible popover
src/accounts.js     sector T-account rendering
src/ui.js           controls, KPIs, chart wiring, narrative text
src/main.js         bootstrap
tests/model.test.js  accounting-identity, policy-path and robustness tests
tests/charts.test.js axis-scale, path-building and tick-label tests
tests/glossary.test.js every referenced term is defined, and every definition is used
```

`src/model.js` is the part worth reading. It exports `run(config)` returning a full monthly history,
plus the pure helper functions (`m2`, `m3`, `monetaryBase`, `bankAssets`, `balanceSheets`, …) used by
the UI and the tests.

## The accounting

Every month the engine moves flows between four sectors: the Reserve Bank, registered banks, the
private sector (households, firms and offshore holders of bank debt), and the Crown.

Flows recorded on each step, all NZ$bn:

| Symbol | Meaning |
| --- | --- |
| `dLoans` | new bank lending (housing, business, consumer) |
| `dQeNonBank` | central bank purchases sourced from non-banks — the only part that creates deposits |
| `retained` | post-writeoff profit banks keep, which destroys deposits |
| `dTermShift` | deposits reclassified into term deposits, which leaves M2 but stays in M3 |
| `dFlight` | term deposits lost to non-bank assets because the bank priced them too cheaply |
| `dCurrency` | currency demand, funded out of reserves — changes the base but not M2 |

Balance-sheet identities are asserted on every scenario in `tests/model.test.js`:

- bank assets = bank liabilities + equity (to ~1e-13)
- `ΔM3 = Δbank credit + Δ(purchases from non-banks) − retained`
- `ΔM3` reconciled against the actual change in the money stock each month
- settlement cash, currency and bank security holdings never go negative

Where reserves would be driven negative — when currency demand rises sharply, or under QT — the
model draws on a standing lending facility rather than allowing an impossible balance sheet. This is
how a real central bank accommodates settlement demand.

## Calibration

The opening balance sheet is illustrative, scaled to the shape of the New Zealand system around 2019:
about NZ$260bn of M2, NZ$360bn of M3, NZ$498bn of bank lending, NZ$8bn of settlement cash, and a
base of NZ$18bn. Every identity balances exactly at the opening date, so nothing is plugged.

Behavioural parameters (`PARAMS` in `src/model.js`) are judgement calls rather than estimates:

- neutral real policy rate 1.5%; neutral real lending rates derive from that plus each market's
  structural spread, so the opening configuration is genuinely neutral rather than accidentally loose
- credit demand responds to the gap between real lending rates and their neutral levels, plus a
  symmetric debt-service drag, confidence, and macroprudential settings
- banks are capital-constrained (risk-weighted, 13.5% total capital), so a capital shortfall throttles
  lending
- deposit composition responds to the term-versus-on-call spread; currency demand responds to the
  policy rate

The macro feedback (output gap, inflation, expectations) is a small illustrative reduced form used for
display and for the optional Taylor-rule autopilot. It is not a forecasting model.

## Known simplifications

- **M2 here is this model's definition**: currency plus transaction and on-call savings deposits. The
  Reserve Bank publishes several aggregates, and its own M3 is broader — it adds term deposits and
  funding from non-residents. Levels and growth rates will not match published statistics.
- Wholesale funding is treated as a funding cost, not as a flow that creates or destroys deposits.
- **Wholesale funding is the residual, and it only moves when deposits leave.** `bankDebt` is
  recomputed every month as `assets − deposits − equity − advances − facility borrowing`, so the book
  balances by construction rather than by a hard-coded constant. At the default deposit margin it sits
  at exactly 177.0 in every scenario and every month (asserted in `tests/model.test.js`) — the
  endogenous-money result: every flow that changes bank assets changes liabilities by the same amount,
  so there is no aggregate funding gap. It rises one-for-one only with deposit flight.
- **Deposit flight is aggregated.** When savers leave, the model treats them as moving into non-bank
  assets (government bonds, funds, offshore), which is what actually reduces M3. A saver simply moving
  to another bank's term deposit nets out at the aggregate level and is not modelled as flight.
  Flight is capped at 20% of the term stock per month to keep the simulation stable.
- Cheap funding is booked as a central bank liability (`bankFlpBorrowing`), not as wholesale funding.
- The banks' own bonds are a separate liability (`bankBondsIssued`, opening NZ$60bn), not folded into
  wholesale funding. The two instruments are asymmetric, and the model treats them so: a bank *holds*
  government bonds and sells from its book, but it *issues* its own bonds. Buying a bank bond from a
  bank therefore creates a new liability; buying one from a non-bank leaves it in place and gives the
  seller a deposit. Only the non-bank share creates money.
  Before the residual existed, facility draws were added to `bankDebt` and then charged at both the
  wholesale rate *and* the OCR — a double count the residual exposed and removed.
- The private-sector column aggregates households, firms and offshore holders of New Zealand bank
  debt, because non-residents cannot hold settlement cash directly.
- Bond purchases are capped by what the banking sector actually holds, so very large programmes are
  forced to source more from non-banks than the slider requests. The app says so when it happens.
- Bank operating costs are folded into a single cost rate calibrated to deliver a realistic return on
  equity, not modelled line by line.
- No fiscal reaction function, no exchange rate, no term structure beyond a single term premium.

## Presets

| Preset | What it isolates |
| --- | --- |
| Steady state | Policy at neutral. Nothing happens — the control case. |
| COVID-19 response, then tightening | The full episode: OCR to 0.25%, ~NZ$53bn of purchases, cheap funding, a 7%-of-GDP deficit, then the fast hike and QT. |
| Bond purchases only | The purchase channel with the OCR untouched. |
| Rate cuts only | The rate channel with no purchases. Compare the two: the rate cut usually moves M2 *more*. |
| Central bank buys bank bonds | The commercial-bank-bond channel. |
| Aggressive tightening + QT | Reserves drain, credit contracts, deposits shrink. |
| Credit crunch | Cheap money with no willing borrowers creates no money. |
