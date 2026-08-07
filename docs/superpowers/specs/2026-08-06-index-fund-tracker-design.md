# Index-fund investment tracker — Design

**Date:** 2026-08-06
**Status:** approved, implementation plan pending

---

## 1. Goal

Replace a spreadsheet with a local application that tracks an index-fund portfolio of recurring
contributions: how much has been paid in, what it is worth today, what real return it is earning,
and how that compares against theoretical long-term return scenarios.

The concrete problem it solves: in the reference spreadsheet, the portfolio value is typed in by
hand by adding up each fund's value looked up on investing.com. That manual work is why the real
data was abandoned after six months. The application downloads net asset values automatically.

## 2. Scope

### In v1

- One portfolio with two index funds
- A recurring contribution defined by rule, with one-off exceptions (skipped months, extras)
- A record of units bought at the real net asset value
- Automatic download of net asset values by ISIN
- Current valuation, capital gain and real return (XIRR)
- Configurable theoretical scenarios and their projection
- Evolution chart: the real portfolio and the scenarios on the same axis

### Out of v1

| Dropped | Reason |
|---|---|
| Users and authentication | Personal local use. To be revisited in v2 |
| Several portfolios in the interface | Only the index portfolio for now. The schema already supports it |
| Comparison against an index (base 100) | Deferred to v2 by explicit decision |
| Importing broker statements | Needs a parser per broker; manual entry is enough |
| Deployment | To be decided later. The design does not block it |

## 3. Stack

| Layer | Choice | Verified version |
|---|---|---|
| Runtime | Node | 22.14.0 |
| Package manager | pnpm | 11.8.0 |
| Framework | Nuxt (Vue 3, SSR + Nitro) | 4.5.2 / 3.5.41 |
| Language | TypeScript | — |
| ORM | Drizzle | 0.45.2 |
| Database | SQLite, file `data/steady-stack.db` | better-sqlite3 13.0.3 |
| Components | shadcn-vue (over reka-ui) | 2.8.1 / 2.10.1 |
| Charts | Unovis | @unovis/vue 1.6.7 |
| Decimals | decimal.js | — |
| Tests | Vitest + @vue/test-utils + happy-dom | — |

**Why Nuxt and not Vue + Vite.** The Yahoo Finance API responds without an
`Access-Control-Allow-Origin` header (verified). A client in the browser cannot call it: a server
is required. Nitro provides that proxy, the `/api/*` routes and the rendering in a single project,
a single process and a single deployment.

**Why SQLite.** Zero infrastructure: `pnpm dev` and it works. Drizzle abstracts the engine, so
migrating to Postgres on deployment day is a matter of changing driver and connection string.

**Why Unovis.** shadcn-vue's `Chart` components are built on Unovis, so they inherit the theme's
CSS variables with no extra work. Adding another library would mean maintaining two styling
systems. It will be wrapped in a project-owned `<EvolutionChart>` component so that replacing it
means touching one file.

## 4. Data model

```
portfolio               id, name, currency
fund                    id, isin, name, provider_symbol, currency
contribution_rule       portfolio_id, from_month, amount, weights[], timing
contribution_override   portfolio_id, month, amount|null, timing, note
purchase                portfolio_id, fund_id, date, amount, nav, units, source
nav                     fund_id, date, value, source        -- unique per (fund_id, date)
scenario                id, name, annual_rate, color
```

### Contributions: a rule plus exceptions

The recurring contribution is defined once (`200 €/month, 80/20, from Aug 2026`) and the
application generates the months. A `contribution_override` covers whatever departs from the norm:
a skipped month (`amount = null`), an extra contribution, or a different amount.

Changing the rule does not rewrite the past: a new rule is added with its own `from_month` and the
previous one keeps governing the earlier months.

### Purchases: materialisation

Contributions are **derived** — they are computed, not stored. An executed purchase is a
**historical fact**: 107,8641 units were bought at 14,8321 €, and that does not change even if the
rule is edited tomorrow.

Hence a materialisation step: when the month arrives and the net asset value is available, the
planned contribution turns into `purchase` rows with the real NAV and units, and there they stay
frozen. Editable by hand if the broker executed at a different price.

### Contribution timing

Every contribution carries a `timing` field with values `start` (the default) or `end`. It decides
whether it earns a return in its arrival month within the scenarios. It only affects the
theoretical projection: real purchases use the effective date and NAV.

## 5. Calculation engine

`core/` imports nothing from Nuxt, Drizzle or the network. It is pure functions, and that is where
most of the tests live.

```
core/
  contributions.ts   rules + exceptions            -> monthly contributions
  purchases.ts       contribution + NAV            -> units
  valuation.ts       units + NAV                   -> value, capital gain, average cost
  returns.ts         cash flows                    -> XIRR, TWR
  scenarios.ts       contributions + rate          -> projected series
```

### Compounding convention

The monthly rate is derived from the annual one with **`(1 + r)^(1/12) - 1`**, not with `r / 12`.

The `r / 12` shortcut does not produce the stated annual return. At a nominal 9 %, `0,75 %` monthly
compounded twelve times gives `1.093,81 €` on `1.000 €`, that is a real 9,381 %. The correct rate is
`0,7207 %`, which gives exactly `1.090,00 €`. It is the distinction between a nominal rate and an APR.

The error is systematic and compounds across the whole horizon. Over this portfolio's real plan, at
25 years and 9 %, the shortcut overstates the result by **14.415 €** (+6,26 %).

The reference spreadsheet uses `r / 12`. It is dropped deliberately: the user asked for the
calculations to be improved where appropriate.

### Projection formula

```
balance(n) = (balance(n-1) + start_contributions(n)) * (1 + monthly_rate) + end_contributions(n)
```

## 6. Price providers

```
interface PriceProvider {
  resolve(isin: string): Promise<SymbolCandidate[]>
  history(symbol: string, from: Date, to: Date): Promise<Nav[]>
}
```

| Implementation | Role |
|---|---|
| `YahooProvider` | The default. Verified against both of the portfolio's ISINs |
| `ManualEntry` | Override. A NAV entered by hand always prevails |

**Verification carried out.** The flow `search?q=<ISIN>` → symbol → `chart?range=…` returns daily
series in euros for both funds:

| Fund | ISIN | Symbol | Checked |
|---|---|---|---|
| Fidelity MSCI World Index | `IE00BYX5NX33` | `0P0001CLDK.F` / `IE00BYX5NX33.SG` | 507 daily NAVs in EUR |
| Vanguard Emerging Markets | `IE0031786696` | `0P00012I6A.F` | 507 daily NAVs in EUR |

**Share classes.** The same ISIN returns several symbols with different prices (`0P0001CLDK.F` at
9,99 € against `IE00BYX5NX33.SG` at 14,33 €). Adding a fund shows the candidates with their current
price so the user picks the one matching their statement. It is not guessed.

**Accepted risk.** The Yahoo API is not official and may break without notice. Mitigation: the
downloaded NAVs are persisted in the local database, so the history already obtained is not lost,
and manual entry allows carrying on. The `PriceProvider` interface allows adding another provider
without touching the rest of the system.

**Alpha Vantage, evaluated and dropped as the initial provider.** The free limit of 25 requests a
day is enough at this scale. The problem is coverage: its universe is listed tickers, and these two
products are unlisted funds that publish a NAV. Its documentation mentions neither ISIN nor UCITS,
and without a key it could not be verified. It remains a candidate second implementation if it is
ever confirmed to cover these funds.

**Publication lag.** NAVs are published with roughly a one-day lag; the last days of the series
arrive as `null`. The application values using the latest available NAV and shows on screen which
date it corresponds to.

## 7. Numerical precision

No floating point for money.

| Quantity | Representation |
|---|---|
| Amounts | Integers in cents |
| Net asset values | Decimal string, arithmetic with `decimal.js` |
| Units | Decimal string, six or more decimal places |

It prevents 200 € split 80/20 from ending up as 159,99999 €, and maps cleanly to Postgres `NUMERIC`.

## 8. Screens

1. **Dashboard** — current value, paid in, capital gain in euros and percent, XIRR, and the
   evolution chart overlaying the real portfolio and the scenarios
2. **Contributions** — rules in force, exceptions, monthly table
3. **Funds** — adding by ISIN with symbol selection, weights, current NAV, refresh button
4. **Scenarios** — configurable rates and horizon

## 9. Updating net asset values

A button in the interface and a `pnpm sync:nav` script. No scheduler locally. The `/api/nav/sync`
route requests only the missing days and upserts: it is idempotent and can be invoked as many times
as wanted.

## 10. Project structure

```
core/           calculation engine, pure functions, no I/O
server/
  api/          Nitro routes
  providers/    yahoo.ts, manual.ts
  db/           Drizzle schema and migrations
app/            Vue pages and components
```

## 11. Test strategy

Vitest across the four layers. The bulk of the coverage lives in `core/`, which is tested by
calling functions without standing anything up.

### `core/` — calculation engine

Where the real risk is: a misrounded cent compounds across 300 months of projection.

- **Compounding**: `(1+0,09)^(1/12)-1` applied twelve times to 1.000 € gives exactly 1.090,00 €
- **Contribution expansion**: a rule plus a skipped month plus an extra produces the right series
- **Rule change**: raising the contribution does not alter the earlier months
- **Units**: amount divided by NAV, with the expected rounding
- **Split**: 200 € at 80/20 gives 160 € and 40 €, and adds up to exactly 200 €
- **Contribution timing**: `start` earns in the arrival month, `end` does not
- **XIRR**: against a known cash-flow case

### Price providers

Against recorded responses, never against the network. A test that calls Yahoo goes red when there
is no connection, and that says nothing about our own code.

- **ISIN resolution**: a response with several candidates returns them all, without choosing
- **Gaps in the series**: the `null`s of the last days do not break the valuation
- **Manual override**: a NAV entered by hand prevails over the provider's

### Data layer

Integration against a temporary SQLite file.

- **Sync idempotency**: two consecutive runs do not duplicate `nav` rows
- **Materialisation**: a purchase already executed does not change when the rule is edited

### Interface

Components with `@vue/test-utils` over `happy-dom`. No browser: it checks that, given a state, the
component renders the right thing.

- **Formatting**: 2.200 € paid in and a value of 2.431,50 € are displayed as `+231,50 €` and
  `+10,52 %`
- **Chart series**: `<EvolutionChart>` receives the real portfolio and the active scenarios
- **Empty state**: with no contributions recorded it renders neither a blank chart nor a NaN
- **Valuation date**: it shows which day the latest available NAV corresponds to

End-to-end tests with a browser are out of v1.

## 12. Implementation method

**SDD + TDD.** The plan is broken down into scoped tasks; each one is carried out by an
`implementer` subagent and checked by a `reviewer` subagent before being called closed.

Within each task, the cycle is red → green:

1. Write the test that describes the behaviour
2. Run it and **see it fail**. A test that passes before the code exists proves nothing
3. Write the minimum code that makes it pass
4. Run it again and confirm

No task is declared done without the real output of the verification command.

Agents defined in `.claude/agents/`:

| Agent | Model | Role |
|---|---|---|
| `planner` | opus | Breaks the spec down into phases and verifiable tasks |
| `implementer` | sonnet | Carries out one task following TDD |
| `reviewer` | sonnet | Checks against the spec; modifies no code |
| `committer` | haiku | Writes the message for an already-staged commit and commits it |

The main agent decides what goes into each commit and leaves it in the index; the `committer` only
writes the text. The split is that way because the **why** of a change cannot be derived from the
diff: whoever asked for it knows, and passes it along. What can be delegated is applying the
history's style — English, no conventional prefixes, body at 80 columns, Spanish number typography —
which is mechanical work and does not deserve the main model's context.

Messages carry no co-authorship line.

### Language

Everything written in this repository is in **English**: code, comments, JSDoc, test names, the
messages inside `throw new Error(...)`, specs, plans and commit messages.

The one exception is text the end user reads in the application's interface, which is in **Spanish**.
The rule divides by audience, not by file: English for whoever reads the code, Spanish for whoever
uses the app.

**Numbers and currency always use Spanish typography**, in interface text and in English prose
alike: comma as the decimal separator, point as the thousands separator, the currency symbol after
the figure with a space, and a space before `%`. So `1.090,00 €`, `14.415 €` and `9 %`, never
`€1,090.00` or `9%`. The reason is that the figures are the domain — a portfolio in euros read by a
Spanish speaker — and they should look the same in a comment, in a spec and on screen.

Values quoted straight from the code are the exception to the exception: they keep the form they
have there, so a test asserting `'0.007207'` is documented as `0.007207`. Otherwise a comment would
contradict the line below it.

Two things predate this rule and stay in Spanish: the plan
`docs/superpowers/plans/2026-08-06-motor-de-calculo.md`, which gets consumed and discarded, and the
commits up to `894ae4d`. The history is not rewritten.

## 13. Initial data

```
Portfolio: index, EUR

Funds
  80 %   Fidelity MSCI World Index Fund EUR P Acc              IE00BYX5NX33
  20 %   Vanguard Emerging Markets Stock Index Fund Inv EUR Acc IE0031786696

Contributions
  Jul 2026   2.000 €   initial, 80/20  ->  1.600 € / 400 €
  Aug 2026     200 €   recurring monthly rule, 80/20  ->  160 € / 40 €
             + one-off extras as they come up

Scenarios
  No interest    0 %
  Scenario 1     5 %
  Scenario 2     9 %
  Horizon        25 years (configurable)
```

## 14. Notes on the reference spreadsheet

The spreadsheet that started the project belongs to a third party and served as a reference, not as
a specification. Two things were taken from it and one was dropped:

- **Taken**: the structure of comparing cumulative contributions, the real portfolio and the
  scenarios on one chart
- **Taken**: the units model, which its "Cartera del canal" sheet already used (ISIN, purchase
  date, price, units, current value)
- **Dropped**: the `r / 12` convention, for the reasons in section 5

## 15. Deferred to v2

- Users and authentication
- Several portfolios in the interface
- Comparison against an index at base 100
- Importing broker statements
- Deployment and migration to Postgres
