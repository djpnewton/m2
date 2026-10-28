# How interest rates and bond purchases become M2

An interactive, stock-flow-consistent balance-sheet model of money creation, calibrated to the
United States **and** New Zealand and switchable from the picker in the masthead. Move the policy rate, buy
or sell government and bank bonds, add cheap central bank funding, and watch the money stock respond —
and, more importantly, watch *why*.

A closing chart puts the argument in its longest context: gold, consumer prices, M2 and real GDP for
either country from 1980 to 2024, indexed to 100 in the first year of the selected window, with the
quantity-theory price level (M2 ÷ real GDP) overlaid. Two year pickers narrow the window, and dragging
across the chart selects one directly. Either way the index rebases on the new first year and every
figure in the card note is recomputed for it, so a 1990–2000 window is described in its own terms rather
than the full span's. A drag shorter than five years is widened rather than drawn, and a click without a
drag changes nothing. Money grew 13.7×, prices 3.8×, real output 3.2× and gold 3.9×. The log levels correlate at
0.98 — but both trend upward, so that number is mostly the shared trend, and the note on the page says
so. The part with content is the gap between the dashed line and the CPI line: money growth in excess of
real growth ran 4.3× against 3.8× of inflation, and the difference is velocity drift.

No build step, no dependencies, and nothing fetched on load. Plain ES modules and hand-rolled SVG.
Glossary popovers are local; the only outbound links are the Wikipedia ones a reader chooses to follow.

## Running it

ES modules need to be served over HTTP (opening `index.html` from the filesystem will not work):

```bash
cd m2
./scripts/run.sh      # or `npm start`; then open http://127.0.0.1:8080
```

[scripts/run.sh](scripts/run.sh) is five lines: it runs
[scripts/nocache-server.py](scripts/nocache-server.py). Port 8080 by default, or whatever you pass:

```bash
./scripts/run.sh 8138
PORT=8138 ./scripts/run.sh
```

Caching is handled by a **cache tag** rather than by response headers. Every module reference carries a
placeholder — `./model.js?cache-tag=1` — and [scripts/cache_tag.py](scripts/cache_tag.py) replaces the `1`
with a hash of the file being pointed at:

```js
import { run, mergeConfig } from './model.js?cache-tag=a7080618adf8';
```

A URL therefore changes exactly when its own content changes: no stale modules, and no refetching the
files you did not touch. The tag is a content hash rather than a counter or a clock because two modules
importing the same third must produce the *same* URL — two URLs would mean two module instances, and two
copies of the application's state.

The dev server rewrites responses on the way out, so the files on disk keep their `cache-tag=1`
placeholders. The deploy job runs the same module with a target directory — `python3 scripts/cache_tag.py
_site` — to bake the hashes into the uploaded files, because a static host has no way to rewrite a
response. Baking in place changes a file's own hash, so `finalize()` walks the import graph leaves-first:
a file's imports are finalised, *then* its hash is taken, and only that value is handed to its parents.

`npm start` runs the same script. Any static server works for viewing the page — but without the rewrite
you are relying on the browser's own caching.

```bash
npm test             # node --test tests/*.test.js
```

250 tests: 142 cover the model (accounting identities, policy path, fiscal feedback, robustness), 43
cover the chart helpers, 26 cover the page — control wiring, every figure the KPI breakdowns quote, a
starting hint for every preset, the document order and the cache tags — 21 cover the long-run history
tables and windows, 12 cover the regional split (keys, labels, identities in both calibrations, no
hard-coded wording), and 6 cover the glossary. The chart and history tests import their modules
directly — they touch the DOM only inside their render functions, so the pure maths is testable without
a browser or a DOM shim.

## What the model says

The whole thing rests on two accounting identities, derived from the aggregate balance sheet of
bank-like institutions:

```
ΔM3 = Δbank credit + Δ(central bank purchases from non-banks) − retained bank earnings
ΔM2 = ΔM3 − Δ(shift of deposits into term deposits)
```

Three consequences are visible in the app and are the point of building it:

1. **Reserves never appear in those identities.** A central bank buys $2.4tn of bonds from
   non-banks and the monetary base rises by the full amount while M2 rises by $1.4tn. In a system
   with no binding reserve requirement (US requirements went to zero in 2020), reserve balances are
   what the central bank *pays with*, not fuel that a multiplier turns into money.
2. **Who sells the bond decides whether money is created.** Sell to a pension fund: the fund receives
   a deposit and M2 rises. Sell from a bank's own book: the bank swaps one asset for another and no
   deposit exists.
3. **A fiscal deficit creates no deposits directly, though it does change how much is borrowed.**
   Tax receipts cover ordinary spending; only the shortfall — the deficit — has to be financed by
   issuing bonds. Selling those bonds to the public swaps deposits for bonds rather than creating any,
   so on the financing leg the money stock rises only to the extent the central bank buys them. The
   model then adds a slower second link: a deficit above its 3.5%-of-GDP baseline lifts demand, firms
   and households borrow against that demand, and bank lending creates deposits one-for-one. An
   8%-of-GDP deficit with no bond purchases ends five years about $305bn higher on M2, and every
   dollar of it arrives through credit — the budget line itself creates nothing.
4. **Deposits do not fund lending.** Lending creates the deposit that funds it, so a shift into term
   deposits does not release lendable funds.
5. **But deposit pricing is a real decision with a real floor.** The bank can shave its term deposit
   rate below market to save interest — until savers leave. Past roughly 0.7pp of under-pricing,
   balances move to non-bank assets, and the bank replaces them with wholesale borrowing at 3.81%.
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
- **Reserve balances** — purchases and funding less the reserves drained by banknote issuance.
- **Bank credit** — the housing / business / consumer split of the change.
- **Fed funds rate** — the whole rate structure and the term-premium compression from holdings.
- **Inflation** — the reduced-form inputs.

Two identities these breakdowns rely on are asserted month-by-month in the test suite:

```
ΔM3               = Δbank credit + Δ(purchases from non-banks) − retained earnings − deposits lost
Δbase             = net asset purchases + funding drawn + standing advances
Δreserve balances = net asset purchases + funding drawn + standing advances − currency issued
wholesale funding = assets − deposits − equity − advances − facility borrowing
```

## Layout

```
index.html          page shell and prose
styles.css          all styling
src/model.js        the simulation engine — pure, no DOM, fully testable
src/regions.js      everything country-specific: parameters, opening balance sheets,
                    terminology, prose, glossary overrides
src/scenarios.js    preset scenarios, dispatching to the per-region lists
src/scenarios-us.js US presets
src/scenarios-nz.js New Zealand presets
src/charts.js       dependency-free SVG line, stacked-area and waterfall charts
src/glossary.js     inline definitions for jargon, shown in an accessible popover
src/history.js      US gold, CPI, M2 and real GDP, 1980–2024, and the index helpers
src/accounts.js     sector T-account rendering
src/ui.js           controls, KPIs, chart wiring, narrative text
src/main.js         bootstrap, and the stale-cache banner
scripts/run.sh      start the dev server, port as $1 or $PORT
scripts/cache_tag.py    fills cache-tag placeholders with content hashes
scripts/nocache-server.py  http.server that applies cache_tag.py per response
tests/model.test.js  accounting-identity, policy-path and robustness tests
tests/charts.test.js axis-scale, path-building and tick-label tests
tests/glossary.test.js every referenced term is defined, and every definition is used
tests/ui.test.js     control wiring, and the figures each KPI breakdown quotes
tests/history.test.js the long-run table: no gaps, index base and the published multiples
```

`src/model.js` is the part worth reading. It exports `run(config)` returning a full monthly history,
plus the pure helper functions (`m2`, `m3`, `monetaryBase`, `bankAssets`, `balanceSheets`, …) used by
the UI and the tests.

## The accounting

Every month the engine moves flows between four sectors: the Federal Reserve, the bank-like sector,
the private sector (households, firms and offshore holders of bank debt), and the Treasury.

Flows recorded on each step, all US$bn:

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
- reserve balances, currency and bank security holdings never go negative

Where reserves would be driven negative — when currency demand rises sharply, or under QT — the
model draws on a standing lending facility rather than allowing an impossible balance sheet. This is
how a real central bank accommodates settlement demand.

## Calibration

Both calibrations live in `src/regions.js` and share one parameter block, with an explicit list of the
eighteen parameters that differ. The opening balance sheets are illustrative but internally exact:

- **United States**, end-2024: about $21.0tn of M2, $22.6tn of M3, $14.5tn of bank lending, $3.2tn of
  reserve balances, and a base of $5.6tn — an M2 multiplier of 3.75, close to the published one. Policy
  rate 4.4%, deficit baseline 3.5% of GDP, debt-premium threshold 120%.
- **New Zealand**, around 2019: NZ$260bn of M2, NZ$360bn of M3, NZ$498bn of bank lending, NZ$8bn of
  settlement cash, and a base of NZ$18bn. Official cash rate 3.5%, deficit baseline 1% of GDP,
  debt-premium threshold 40%.

Every identity balances exactly at the opening date in both, so nothing is plugged. `run(config)` reads
`config.region` and takes that country's parameters and opening state; the terminology, the assumptions
prose and the glossary bodies follow the same switch.

Behavioural parameters are judgement calls rather than estimates:

- neutral real policy rate 2.0%, pinned so that the opening configuration is neutral: the 4.4%
  fed funds rate sits 0.4pp above neutral, and the Fed's bond holdings loosen effective conditions
  by roughly the same amount. Neutral real lending rates derive from that plus each market's
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
  Fed publishes several aggregates, and published M2 is broader than the deposits drawn here — it adds
  retail money-market funds and small time deposits held outside the bank-like sector. Levels and
  growth rates will not match published statistics.
- Wholesale funding is treated as a funding cost, not as a flow that creates or destroys deposits.
- **Wholesale funding is the residual, and it only moves when deposits leave.** `bankDebt` is
  recomputed every month as `assets − deposits − equity − advances − facility borrowing`, so the book
  balances by construction rather than by a hard-coded constant. At the default deposit margin it sits
  at exactly 1,300.0 in every scenario and every month (asserted in `tests/model.test.js`) — the
  endogenous-money result: every flow that changes bank assets changes liabilities by the same amount,
  so there is no aggregate funding gap. It rises one-for-one only with deposit flight.
- **Deposit flight is aggregated.** When savers leave, the model treats them as moving into non-bank
  assets (government bonds, funds, offshore), which is what actually reduces M3. A saver simply moving
  to another bank's term deposit nets out at the aggregate level and is not modelled as flight.
  Flight is capped at 20% of the term stock per month to keep the simulation stable.
- Cheap funding is booked as a central bank liability (`bankFundingBorrowing`), not as wholesale funding.
- The banks' own bonds are a separate liability (`bankBondsIssued`, opening $2.2tn), not folded into
  wholesale funding. The two instruments are asymmetric, and the model treats them so: a bank *holds*
  government bonds and sells from its book, but it *issues* its own bonds. Buying a bank bond from a
  bank therefore creates a new liability; buying one from a non-bank leaves it in place and gives the
  seller a deposit. Only the non-bank share creates money.
  Before the residual existed, facility draws were added to `bankDebt` and then charged at both the
  wholesale rate *and* the policy rate — a double count the residual exposed and removed.
- The private-sector column aggregates households, firms and offshore holders of US bank debt,
  because non-residents cannot hold reserve balances directly.
- Bond purchases are capped by what the banking sector actually holds, so very large programmes are
  forced to source more from non-banks than the slider requests. The app says so when it happens.
- Bank operating costs are folded into a single cost rate calibrated to deliver a realistic return on
  equity, not modelled line by line.
- The fiscal feedback loop — debt/GDP pricing into the long rate, and the interest bill sitting inside
  the deficit — is off by default and turned on with the **Debt risk premium** control. Switching it on
  reinterprets the deficit control as a *primary* deficit. Once the resulting rate exceeds nominal GDP
  growth the debt ratio compounds without limit; the model has no stabiliser to stop it.
- No fiscal reaction function, no exchange rate, no term structure beyond a single term premium.

## Presets

Each region has its own set, and month 0 is the start of that country's episode. The US list:

| Preset | What it isolates |
| --- | --- |
| Steady state | Policy at neutral. Nothing happens — the control case. |
| 2020: pandemic QE, then tightening | The full episode: rates to 0.25%, $1.2tn of purchases, cheap funding, a 15%-of-GDP deficit, then the fast hike and QT. |
| Bond purchases only | The purchase channel with the policy rate untouched. |
| Rate cuts only | The rate channel with no purchases. Compare the two: the rate cut usually moves M2 *more*. |
| Central bank buys bank bonds | The commercial-bank-bond channel. |
| Aggressive tightening + QT | Reserves drain, credit contracts, deposits shrink. |
| Credit crunch | Cheap money with no willing borrowers creates no money. |
| High debt and fiscal dominance | An 8% primary deficit at 4bp per point of debt. The premium pushes the long rate up, and the central bank buys $9.0tn of bonds to hold it down — which lands in M2. |
