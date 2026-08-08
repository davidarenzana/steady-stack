# Implementation plan 2 — Persistence and the network

> **For agents:** MANDATORY SUB-SKILL: use `superpowers:subagent-driven-development` (recommended)
> or `superpowers:executing-plans` to run this plan one task at a time. Steps use checkboxes
> (`- [ ]`) for tracking.

**Goal:** give the finished calculation engine a database, a price provider and an HTTP surface.
When this plan closes, the application downloads net asset values by itself, stores them, turns
contributions into purchases and serves everything the four screens of plan 3 will need. No Vue
page and no component is written here.

**Reference spec:** `docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md`, sections 4
(data model), 6 (price providers), 7 (precision), 9 (updating NAVs), 10 (structure), 11 (test
strategy) and 13 (initial data).

**Previous plan:** `docs/superpowers/plans/2026-08-06-motor-de-calculo.md`, tasks 1–8, all
completed. That plan is written in Spanish because it predates the language rule; **this one is in
English, like everything else in the repository.** Nothing it delivered is re-planned here.

**Stack:** Node 22.14 · pnpm 11.8 · Nuxt 4.5 / Nitro 2.13 · Drizzle 0.45.2 · drizzle-kit 0.31.10 ·
better-sqlite3 13.0.3 · Vitest 4.1

---

## Global constraints

These apply to every task, without exception.

- **Package manager: `pnpm`.** Never `npm` or `yarn`.
- **`core/` stays pure.** Nothing in `core/` may import Drizzle, Nuxt, h3, ofetch or
  `better-sqlite3`, do network or file access, or read the system clock. This plan adds exactly one
  file and one type to `core/` (task 1) and both respect that.
- **Persistence maps rows onto the domain, never the other way round.** `server/db/mappers.ts`
  converts database rows into the types of `core/types.ts`, `core/purchases.ts` and
  `core/valuation.ts`. Core types are never annotated with Drizzle types and never gain a column.
- **Money is integer cents in the database too.** Amounts are `INTEGER`. NAV, units and annual
  rates are `TEXT` decimal strings handled with `decimal.js`. **There is no `REAL` column anywhere
  in this schema** — not for money, not for rates. The one place a float lives is inside the
  `weights` JSON, because a weight is a proportion and `split()` in `core/money.ts` already takes
  `weight: number`.
- **No `parseFloat` over money, ever.** Decimal strings go into `Decimal`; cents go through
  `Number.isInteger` checks.
- **Monthly rate is `(1 + r)^(1/12) - 1`**, obtained by calling `monthlyRate()` from
  `core/rates.ts`. Never `r / 12`, and never re-implemented in `server/`.
- **Providers are tested against recorded responses, never against the network.** Task 7 captures
  the fixtures once, by hand, and commits them. No test in `pnpm test` may open a socket. A test
  that calls Yahoo goes red on a train with no wifi, and that says nothing about our code.
- **Integration tests run against a temporary SQLite file** created under `os.tmpdir()` and deleted
  on teardown. Never against `data/steady-stack.db`.
- **Nothing under `server/db/`, `server/providers/`, `server/services/` or `scripts/` may import
  `h3`, `ofetch` or `nuxt`, nor rely on Nitro auto-imports.** Those modules are loaded by Vitest and
  by `tsx` outside Nitro, where auto-imports do not exist and `h3` is not resolvable from the root
  `node_modules` (pnpm's strict layout — verified). Auto-imports are allowed only in
  `server/api/**` and `server/utils/http.ts`.
- **The clock is read in exactly one place:** `today()` in `server/utils/today.ts`. Every service
  takes the current date as an `IsoDate` parameter, so every service is deterministic and testable.
- **TDD:** the test is written first and **run to watch it fail** before the implementation exists.
  No task is declared done without the real output of its verification command.
- **Language:** English for everything a developer reads — identifiers, comments, JSDoc, test names,
  `throw new Error(...)` messages. Spanish only for text an end user reads, which in this plan means
  the seeded portfolio and scenario names. Figures in prose use Spanish typography: `14,33 €`,
  `9 %`, `1.090,00 €`.
- **Formats:** months `YYYY-MM`, dates `YYYY-MM-DD`, units 6 decimal places, NAV 4 decimal places.

### How server modules import the calculation engine

Server modules import core with the **`~~/` alias**: `import { split } from '~~/core/money'`.

`~~/*` → `./*` is already mapped in `tsconfig.json`, is generated into
`.nuxt/tsconfig.server.json` by Nuxt, is resolved natively by Nitro, and is resolved by `tsx`
through the tsconfig paths. The only place that needs configuring is Vitest, in task 3. The
`#core/*` alias that sits unused in `tsconfig.json` is deliberately left alone: it would have to be
declared in three more places, and `~~/` already works everywhere.

Inside `server/`, modules import each other with **relative paths** (`./schema`, `../db/queries`).

---

## Two decisions, and why

### 1. Where materialisation lives

`buildPurchases()` in `core/purchases.ts` is pure: it takes a `Contribution`, a date and a
`Record<fundId, navString>`, and returns `Purchase[]`. Something has to find the NAV of the day,
call it, and persist the result exactly once.

That something is **`server/services/materialisation.ts`**, with this signature:

```ts
export function materialiseContributions(
  db: AppDatabase,
  options: { portfolioId?: string, throughMonth: Month },
): MaterialisationResult
```

It sits in `server/services/` and not in `server/db/` because it is a policy, not storage: it
decides *which day of the month counts as the execution date* and *when a month is already
settled*. It is synchronous because better-sqlite3 is synchronous, and it runs its whole loop in a
single transaction so a failure halfway leaves nothing behind.

Its two invariants, both from section 11 of the spec:

- **Re-running does not duplicate.** A month that already has any purchase row for the portfolio is
  skipped with `reason: 'already-materialised'`. A partial unique index on
  `(portfolio_id, fund_id, month) WHERE source = 'auto'` backs this up at the database level, so a
  bug in the service cannot produce a duplicate silently.
- **Editing a rule does not touch an executed purchase.** The service only ever inserts. It never
  updates or deletes a purchase row. Task 10 pins this down with a test that changes the rule amount
  from 200 € to 300 €, re-runs materialisation and asserts the stored rows are unchanged.

### 2. The route surface

Listed in full below, so plan 3 can be written against it without coming back to change it.

**Conventions for every route:**

- There is one portfolio. Its id is the constant `PORTFOLIO_ID = 'index'` and it never appears in a
  path or a body. The schema still carries `portfolio_id` because the spec keeps multi-portfolio
  open for v2.
- **Every monetary field in every request and response is an integer number of cents.** `amount`,
  `value`, `invested`, `gain`, `balance`, `contributed`.
- `nav`, `units` and `annualRate` are **decimal strings**. `gainRatio` and `xirr` are plain
  `number`s (they are ratios, not money).
- Dates are `YYYY-MM-DD` strings, months are `YYYY-MM` strings.
- Errors come back as H3's standard error JSON: `{ statusCode, statusMessage, message }`. Messages
  are in English — they are developer-facing.
- Responses have no envelope. A list route returns an array, a single-resource route returns an
  object.

| # | Method | Path | Request | Response |
|---|---|---|---|---|
| 1 | GET | `/api/portfolio` | — | `{ id, name, currency, horizonYears, firstMonth: Month \| null }` |
| 2 | PATCH | `/api/portfolio` | `{ name?, horizonYears? }` | same as 1 |
| 3 | GET | `/api/dashboard` | `?asOf=YYYY-MM-DD` (optional, defaults to today) | `Dashboard`, shape below |
| 4 | GET | `/api/funds` | — | `FundView[]`, shape below |
| 5 | POST | `/api/funds` | `{ id, isin, name, providerSymbol?, currency? }` | `FundRow`, 201 |
| 6 | PATCH | `/api/funds/:id` | `{ name?, providerSymbol? }` | `FundRow` |
| 7 | DELETE | `/api/funds/:id` | — | 204; 409 if the fund has purchases |
| 8 | GET | `/api/funds/resolve` | `?isin=IE00BYX5NX33` | `SymbolCandidate[]` — hits Yahoo |
| 9 | GET | `/api/nav` | `?fundId=&from=&to=` | `{ fundId, navs: { date, value, source }[] }` |
| 10 | PUT | `/api/nav` | `{ fundId, date, value }` | `{ fundId, date, value, source: 'manual' }` |
| 11 | POST | `/api/nav/sync` | `{ fundIds?: string[] }` | `NavSyncResult`, shape below |
| 12 | GET | `/api/contributions` | `?from=YYYY-MM&to=YYYY-MM` | `{ rules, overrides, months }`, shape below |
| 13 | POST | `/api/contributions/rules` | `{ fromMonth, amount, timing, weights }` | `RuleRow`, 201; 409 if `fromMonth` is taken |
| 14 | PATCH | `/api/contributions/rules/:id` | `{ amount?, timing?, weights? }` | `RuleRow`; 400 if the body carries `fromMonth` |
| 15 | DELETE | `/api/contributions/rules/:id` | — | 204 |
| 16 | PUT | `/api/contributions/overrides/:month` | `{ amount: Cents \| null, timing?, note? }` | `OverrideRow` |
| 17 | DELETE | `/api/contributions/overrides/:month` | — | 204 |
| 18 | GET | `/api/purchases` | `?from=&to=&fundId=` | `StoredPurchase[]` |
| 19 | POST | `/api/purchases` | `{ fundId, month, date, amount, nav, units? }` | `StoredPurchase`, 201, `source: 'manual'` |
| 20 | PATCH | `/api/purchases/:id` | `{ date?, amount?, nav?, units? }` | `StoredPurchase` |
| 21 | DELETE | `/api/purchases/:id` | — | 204 |
| 22 | POST | `/api/purchases/materialise` | `{ throughMonth?: Month }` | `MaterialisationResult` |
| 23 | GET | `/api/scenarios` | — | `ScenarioRow[]` |
| 24 | POST | `/api/scenarios` | `{ id, name, annualRate, color, enabled? }` | `ScenarioRow`, 201 |
| 25 | PATCH | `/api/scenarios/:id` | `{ name?, annualRate?, color?, enabled? }` | `ScenarioRow` |
| 26 | DELETE | `/api/scenarios/:id` | — | 204 |

**Which screen needs what** (spec section 8): the dashboard needs 3; contributions needs 12, 13,
14, 15, 16, 17 and 22; funds needs 4, 5, 6, 7, 8, 10 and 11; scenarios needs 1, 2, 23, 24, 25, 26.

**`Dashboard`** (route 3):

```ts
interface Dashboard {
  asOf: IsoDate
  /** The oldest of the per-fund latest NAV dates. `null` when no fund has a NAV yet. */
  navDate: IsoDate | null
  valuation: {
    value: Cents
    invested: Cents
    gain: Cents
    gainRatio: number
    byFund: Array<{
      fundId: string
      name: string
      units: string
      nav: string
      navDate: IsoDate
      value: Cents
      invested: Cents
      gain: Cents
    }>
  }
  /** `null` when there are fewer than two cash flows or they all share a sign. */
  xirr: number | null
  series: {
    /** `horizonYears * 12 + 1` months, starting at the first contribution month. */
    months: Month[]
    /** Cumulative planned contributions across the whole horizon. */
    contributed: Cents[]
    /** Real portfolio value per month. `null` where it is unknown or still in the future. */
    portfolio: Array<Cents | null>
    scenarios: Array<{ id: string, name: string, color: string, annualRate: string, balance: Cents[] }>
  }
}
```

**`FundView`** (route 4): `{ id, isin, name, providerSymbol, currency, latestNav: { date, value,
source } | null, units: string, invested: Cents, value: Cents }`.

**`NavSyncResult`** (route 11):

```ts
interface NavSyncResult {
  funds: Array<{
    fundId: string
    status: 'synced' | 'up-to-date' | 'skipped'
    reason?: 'no-symbol'
    from?: IsoDate
    to?: IsoDate
    received?: number
    inserted?: number
    updated?: number
    skippedManual?: number
  }>
}
```

**Contributions view** (route 12): `{ rules: RuleRow[], overrides: OverrideRow[], months:
Array<Contribution & { materialised: boolean }> }`, where `Contribution` is the core type verbatim.

---

## Deliberate refinements to the spec's sketches

The spec sketches these things; this plan pins them down. None of it contradicts the spec, but it
goes beyond what section 4 and section 6 literally say, so it is listed here rather than buried.

| Spec says | This plan | Why |
|---|---|---|
| `history(symbol, from: Date, to: Date)` | `history(symbol: string, from: IsoDate, to: IsoDate)` | The whole repository speaks `YYYY-MM-DD` strings, which sort chronologically and carry no timezone. A `Date` would be the only mutable, timezone-bearing value in the data path. |
| `contribution_rule … weights[]` | `weights TEXT` holding `JSON.stringify(Weight[])` | SQLite has no array type, and a child table would make it eight tables instead of the spec's seven. |
| `purchase … date` | `purchase` also has `month TEXT` | A contribution for 2026-08 can execute on 2026-09-02. The month is the idempotency key of materialisation; the date is the execution fact. |
| `portfolio id, name, currency` | plus `horizon_years INTEGER DEFAULT 25` | Section 13 makes the 25-year horizon configurable. It belongs to the projection of the whole portfolio: on the scenario, two scenarios could disagree about the x-axis of the same chart. |
| `scenario id, name, annual_rate, color` | plus `enabled INTEGER DEFAULT 1` | Section 11 tests that the chart receives *the active scenarios*, so activity has to be storable. |
| — | `color` holds a theme token (`chart-1` … `chart-5`), not a hex value | `app/assets/css/tailwind.css` declares `--chart-1..5`. A hex in the database would fight the light/dark theme. |

Two things the spec settles that this plan obeys without re-deriving: the Yahoo flow is
`search?q=<ISIN>` → symbol → `chart?range=…`, and **resolution returns every candidate and never
picks one**, because the same ISIN yields several share classes at different prices.

---

## File structure

| File | Responsibility |
|---|---|
| `core/dates.ts` | `YYYY-MM-DD` arithmetic. Pure, no clock |
| `drizzle.config.ts` | drizzle-kit configuration |
| `server/db/schema.ts` | The seven Drizzle tables. No logic |
| `server/db/migrations/` | Generated SQL, committed |
| `server/db/client.ts` | Opens a SQLite file, applies migrations |
| `server/db/mappers.ts` | Rows ↔ the domain types of `core/` |
| `server/db/queries.ts` | Typed reads and writes. No policy |
| `server/db/seed.ts` | The initial data of spec section 13, idempotent |
| `server/providers/types.ts` | `PriceProvider`, `SymbolCandidate`, `PriceProviderError` |
| `server/providers/yahoo.ts` | Yahoo implementation and its two pure parsers |
| `server/providers/manual.ts` | In-memory provider for hand-entered NAVs |
| `server/providers/__fixtures__/` | Recorded and handmade JSON responses, committed |
| `server/services/nav-sync.ts` | Idempotent NAV synchronisation |
| `server/services/materialisation.ts` | Contributions → stored purchases, once |
| `server/services/read-model.ts` | Assembles the dashboard, funds and contributions views |
| `server/test-utils/temp-db.ts` | Temporary SQLite file for integration tests |
| `server/test-utils/fake-provider.ts` | A `PriceProvider` that records its calls |
| `server/utils/today.ts` | The only place the system clock is read |
| `server/utils/errors.ts` | `ValidationError`, `NotFoundError`, `ConflictError` |
| `server/utils/validation.ts` | Body and query parsing. No h3 |
| `server/utils/http.ts` | Domain errors → H3 errors. The only auto-import user outside `api/` |
| `server/utils/database.ts` | The Nitro singleton over `data/steady-stack.db` |
| `server/api/**` | Nitro routes, thin |
| `scripts/seed.ts` | `pnpm db:seed` |
| `scripts/sync-nav.ts` | `pnpm sync:nav` |
| `scripts/capture-yahoo-fixtures.ts` | `pnpm capture:fixtures`, run by hand, with network |

---

# Phase 1 — Schema and storage

**Ends in something checkable:** the migration applies to a fresh temporary SQLite file, an
integration test writes and reads back a purchase, and `pnpm db:seed` run twice leaves exactly the
portfolio, two funds, two rules and three scenarios of spec section 13.

## Task 1: Pure date arithmetic

**Files:**
- Create: `core/dates.ts`
- Create: `core/dates.test.ts`
- Modify: `core/types.ts` (add `NavPoint`)

**Interfaces:**
- Consumes: `IsoDate`, `Month` from `core/types.ts`
- Produces:
  - `function firstDayOfMonth(month: Month): IsoDate`
  - `function lastDayOfMonth(month: Month): IsoDate`
  - `function monthOf(date: IsoDate): Month`
  - `function addDays(date: IsoDate, count: number): IsoDate`
  - `interface NavPoint { date: IsoDate; value: string }` in `core/types.ts`

`NavPoint` goes in `core/types.ts` and not in `server/` because it is domain vocabulary — a fund's
net asset value on a date — shared by the providers, the database and the API. It is a type, not
code: putting it in core keeps one vocabulary without core importing anything.

- [ ] **Step 1: Write the failing test**

Create `core/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addDays, firstDayOfMonth, lastDayOfMonth, monthOf } from './dates'

describe('firstDayOfMonth', () => {
  it('returns the first day of the month', () => {
    expect(firstDayOfMonth('2026-08')).toBe('2026-08-01')
  })

  it('rejects an invalid month', () => {
    expect(() => firstDayOfMonth('2026-8')).toThrow('Invalid month')
  })
})

describe('lastDayOfMonth', () => {
  it('handles a 31-day month', () => {
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31')
  })

  it('handles a 30-day month', () => {
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30')
  })

  it('handles February in a common year', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28')
  })

  it('handles February in a leap year', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29')
  })

  it('handles December', () => {
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31')
  })
})

describe('monthOf', () => {
  it('takes the month of a date', () => {
    expect(monthOf('2026-08-03')).toBe('2026-08')
  })

  it('rejects a malformed date', () => {
    expect(() => monthOf('2026-8-3')).toThrow('Invalid date: "2026-8-3"')
  })

  it('rejects a date that does not exist in the calendar', () => {
    expect(() => monthOf('2026-02-30')).toThrow('Invalid date: "2026-02-30"')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('crosses a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('returns the same date when the offset is zero', () => {
    expect(addDays('2026-08-03', 0)).toBe('2026-08-03')
  })

  it('rejects a fractional offset', () => {
    expect(() => addDays('2026-08-03', 1.5)).toThrow('Day offset must be an integer, received 1.5')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test core/dates.test.ts`
Expected: FAILS because `./dates` does not resolve.

- [ ] **Step 3: Create `core/dates.ts`**

Requirements for the implementation:

- A `DATE_PATTERN` of `/^\d{4}-\d{2}-\d{2}$/` plus a **round-trip calendar check**: build the date
  with `new Date(\`${date}T00:00:00Z\`)` and require `d.toISOString().slice(0, 10) === date`. That
  is what rejects `2026-02-30`, which `Date` would silently roll over to 2026-03-02.
- Error messages, verbatim: `Invalid date: "2026-02-30". Expected the format YYYY-MM-DD` and
  `Day offset must be an integer, received 1.5`.
- Month validation reuses the same regular expression as `core/months.ts`
  (`/^(\d{4})-(0[1-9]|1[0-2])$/`) and throws `Invalid month: "2026-8". Expected the format YYYY-MM`.
  Do not export a parser from `core/months.ts` for this — duplicating six lines is cheaper than
  coupling the two modules.
- `lastDayOfMonth` uses `Date.UTC(year, monthIndex + 1, 0)`, which is day zero of the next month,
  that is the last day of this one. It gets February right in leap years with no special case.
- Everything is UTC. Never `new Date(y, m, d)`, which is local-time and would shift the date.

- [ ] **Step 4: Add `NavPoint` to `core/types.ts`**

```ts
/**
 * A fund's net asset value on a given date. `value` is a decimal string in the
 * fund's currency, never a floating point number.
 */
export interface NavPoint {
  date: IsoDate
  value: string
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm test core/dates.test.ts`
Expected: 15 tests green.

Run: `pnpm test`
Expected: 91 tests green (the 76 already there plus these 15).

- [ ] **Step 6: Commit**

```bash
git add core/dates.ts core/dates.test.ts core/types.ts
git commit -m "Date arithmetic for the persistence layer

firstDayOfMonth and lastDayOfMonth bound the window materialisation looks
for a NAV in, and addDays computes the first missing day of a sync. All
UTC and all round-tripped, so 2026-02-30 throws instead of rolling over
to March."
```

---

## Task 2: Drizzle schema and the first migration

**Files:**
- Create: `drizzle.config.ts`
- Create: `server/db/schema.ts`
- Create: `server/db/migrations/0000_*.sql` (generated, committed)
- Create: `server/db/migrations/meta/` (generated, committed)
- Modify: `package.json` (scripts `db:generate`, `db:migrate`)
- Delete: `server/db/.gitkeep`

**Interfaces:**
- Consumes: nothing
- Produces: the tables `portfolios`, `funds`, `contributionRules`, `contributionOverrides`,
  `purchases`, `navs`, `scenarios`, and the row types inferred from them.

The SQL table names are **singular**, exactly as spec section 4 writes them. The exported TypeScript
identifiers are **plural**, so that `import { navs } from './schema'` never shadows a local called
`nav`.

There are **no CHECK constraints**. SQLite cannot alter one without rebuilding the table, and the
mappers of task 4 already validate every enum and every cents field, where the error message can
actually say what went wrong.

- [ ] **Step 1: Create `server/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * The seven tables of section 4 of the spec.
 *
 * Column types are not negotiable: amounts are INTEGER cents, and net asset
 * values, units and annual rates are TEXT decimal strings handled with
 * decimal.js. There is no REAL column in this schema. When this moves to
 * Postgres the TEXT columns become NUMERIC and nothing else changes.
 */

export const portfolios = sqliteTable('portfolio', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('EUR'),
  /** Projection horizon in years. Configurable, 25 by default. */
  horizonYears: integer('horizon_years').notNull().default(25),
})

export const funds = sqliteTable('fund', {
  id: text('id').primaryKey(),
  isin: text('isin').notNull().unique(),
  name: text('name').notNull(),
  /**
   * The symbol chosen by the user among the candidates the provider returns.
   * Null until they choose: the same ISIN publishes several share classes at
   * different prices and it is never guessed.
   */
  providerSymbol: text('provider_symbol'),
  currency: text('currency').notNull().default('EUR'),
})

export const contributionRules = sqliteTable('contribution_rule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  /** `YYYY-MM`. Governs from this month until a later rule supersedes it. */
  fromMonth: text('from_month').notNull(),
  /** Integer cents. */
  amount: integer('amount').notNull(),
  timing: text('timing', { enum: ['start', 'end'] }).notNull().default('start'),
  /** `JSON.stringify(Weight[])`, e.g. `[{"fundId":"world","weight":0.8}]`. */
  weights: text('weights').notNull(),
}, (t) => [
  // core/contributions.ts throws when two rules share a start month. The database
  // makes that state unreachable rather than merely detected.
  uniqueIndex('contribution_rule_month_unique').on(t.portfolioId, t.fromMonth),
])

export const contributionOverrides = sqliteTable('contribution_override', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  /** `YYYY-MM`. */
  month: text('month').notNull(),
  /** Integer cents, or null for a skipped month. */
  amount: integer('amount'),
  timing: text('timing', { enum: ['start', 'end'] }),
  note: text('note'),
}, (t) => [
  uniqueIndex('contribution_override_month_unique').on(t.portfolioId, t.month),
])

export const purchases = sqliteTable('purchase', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  fundId: text('fund_id').notNull().references(() => funds.id),
  /** `YYYY-MM`, the contribution month this materialises. The idempotency key. */
  month: text('month').notNull(),
  /** `YYYY-MM-DD`, the day it actually executed. May fall outside `month`. */
  date: text('date').notNull(),
  /** Integer cents. */
  amount: integer('amount').notNull(),
  /** Decimal string. */
  nav: text('nav').notNull(),
  /** Decimal string with six decimal places. */
  units: text('units').notNull(),
  source: text('source', { enum: ['auto', 'manual'] }).notNull().default('auto'),
}, (t) => [
  // Partial index: materialisation can never write the same month twice, while a
  // user remains free to record several manual purchases in one month.
  uniqueIndex('purchase_auto_month_unique')
    .on(t.portfolioId, t.fundId, t.month)
    .where(sql`${t.source} = 'auto'`),
])

export const navs = sqliteTable('nav', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fundId: text('fund_id').notNull().references(() => funds.id),
  /** `YYYY-MM-DD`. */
  date: text('date').notNull(),
  /** Decimal string with four decimal places. */
  value: text('value').notNull(),
  source: text('source', { enum: ['yahoo', 'manual'] }).notNull(),
}, (t) => [
  uniqueIndex('nav_fund_date_unique').on(t.fundId, t.date),
])

export const scenarios = sqliteTable('scenario', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Decimal string as a fraction of one: `'0.09'` is 9 %. Never a REAL. */
  annualRate: text('annual_rate').notNull(),
  /** A theme token, `chart-1` … `chart-5`, resolved to `var(--chart-N)` by the interface. */
  color: text('color').notNull(),
  /** 0 or 1. Only enabled scenarios are drawn on the chart. */
  enabled: integer('enabled').notNull().default(1),
})

export type PortfolioRow = typeof portfolios.$inferSelect
export type FundRow = typeof funds.$inferSelect
export type ContributionRuleRow = typeof contributionRules.$inferSelect
export type ContributionOverrideRow = typeof contributionOverrides.$inferSelect
export type PurchaseRow = typeof purchases.$inferSelect
export type NavRow = typeof navs.$inferSelect
export type ScenarioRow = typeof scenarios.$inferSelect
```

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: 'file:./data/steady-stack.db' },
})
```

- [ ] **Step 3: Add the scripts to `package.json`**

Insert after `"typecheck"`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: it prints `7 tables` and writes `server/db/migrations/0000_<random-name>.sql` plus a
`meta/` folder. The random name is drizzle-kit's; keep whatever it produces.

- [ ] **Step 5: Verify the generated SQL**

Run these three, in order:

```sh
grep -c 'CREATE TABLE' server/db/migrations/0000_*.sql
```
Expected: `7`.

```sh
grep -iE '\breal\b' server/db/migrations/0000_*.sql
```
Expected: **no output**. A `REAL` column anywhere means an amount slipped into floating point.

```sh
rm -f /tmp/steady-stack-schema-check.db \
  && sqlite3 /tmp/steady-stack-schema-check.db < server/db/migrations/0000_*.sql \
  && sqlite3 /tmp/steady-stack-schema-check.db '.tables' \
  && sqlite3 /tmp/steady-stack-schema-check.db "select name from sqlite_master where type='index' and name like 'purchase%'" \
  && rm -f /tmp/steady-stack-schema-check.db
```
Expected: the seven table names, and `purchase_auto_month_unique` among the indexes. The SQL must
apply with exit code 0 — that is the proof the partial index is valid SQLite.

- [ ] **Step 6: Commit**

```bash
git rm --cached server/db/.gitkeep
rm -f server/db/.gitkeep
git add drizzle.config.ts server/db/schema.ts server/db/migrations package.json
git commit -m "Drizzle schema for the seven tables of the data model

Amounts are INTEGER cents and net asset values, units and rates are TEXT
decimal strings; there is no REAL column, so nothing in the schema can
round 160 € to 159,99999 €. Purchases carry the contribution month
alongside the execution date because a contribution for August can settle
in September, and a partial unique index over the auto rows makes a
duplicated materialisation unrepresentable."
```

---

## Task 3: The database client, the temp-database helper and the third Vitest project

**Files:**
- Create: `server/db/client.ts`
- Create: `server/test-utils/temp-db.ts`
- Create: `server/db/client.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `server/db/schema.ts`
- Produces:
  - `type AppDatabase = BetterSQLite3Database<typeof schema>`
  - `interface DatabaseHandle { db: AppDatabase; sqlite: Database.Database; close(): void }`
  - `function openDatabase(filePath: string): DatabaseHandle`
  - `function applyMigrations(handle: DatabaseHandle): void`
  - `const MIGRATIONS_FOLDER: string`
  - `interface TempDatabase { db: AppDatabase; path: string; close(): void }`
  - `function createTempDatabase(): TempDatabase`

- [ ] **Step 1: Add the `server` project to `vitest.config.ts`**

Replace the file with:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // The calculation engine is pure functions: it needs neither the DOM nor
        // the Nuxt environment, and starting them would only make it slower.
        test: {
          name: 'core',
          include: ['core/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // The persistence layer and the price providers. Node, because they talk
        // to better-sqlite3 and to the file system. `~~/` is mapped by hand: Nitro
        // and tsx resolve it on their own, Vitest does not.
        resolve: {
          alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
        },
        test: {
          name: 'server',
          include: ['server/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Component tests. To be filled in by plan 3.
        test: {
          name: 'app',
          include: ['app/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
})
```

That alias has been verified to work: a test under `server/` importing `~~/core/money` resolves.

- [ ] **Step 2: Write the failing test**

Create `server/db/client.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { purchases, funds, portfolios } from './schema'
import { createTempDatabase } from '../test-utils/temp-db'

describe('createTempDatabase', () => {
  it('creates a migrated database outside the repository', () => {
    const temp = createTempDatabase()
    try {
      expect(existsSync(temp.path)).toBe(true)
      expect(temp.path).not.toContain('steady-stack/data')
    }
    finally {
      temp.close()
    }
  })

  it('removes the file on close', () => {
    const temp = createTempDatabase()
    const { path } = temp
    temp.close()

    expect(existsSync(path)).toBe(false)
  })

  it('hands out an isolated database on every call', () => {
    const a = createTempDatabase()
    const b = createTempDatabase()
    try {
      expect(a.path).not.toBe(b.path)
    }
    finally {
      a.close()
      b.close()
    }
  })
})

describe('the migrated schema', () => {
  it('writes and reads back a purchase without touching the numbers', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({
        id: 'world',
        isin: 'IE00BYX5NX33',
        name: 'Fidelity MSCI World Index Fund EUR P Acc',
      }).run()

      temp.db.insert(purchases).values({
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }).run()

      const rows = temp.db.select().from(purchases).where(eq(purchases.fundId, 'world')).all()

      expect(rows).toEqual([{
        id: 1,
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }])
    }
    finally {
      temp.close()
    }
  })

  it('refuses a second auto purchase for the same fund and month', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity' }).run()

      const row = {
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto' as const,
      }
      temp.db.insert(purchases).values(row).run()

      expect(() => temp.db.insert(purchases).values(row).run()).toThrow(/UNIQUE/)
    }
    finally {
      temp.close()
    }
  })

  it('allows two manual purchases for the same fund and month', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity' }).run()

      const row = {
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'manual' as const,
      }
      temp.db.insert(purchases).values(row).run()
      temp.db.insert(purchases).values(row).run()

      expect(temp.db.select().from(purchases).all()).toHaveLength(2)
    }
    finally {
      temp.close()
    }
  })

  it('rejects a purchase pointing at a fund that does not exist', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()

      expect(() => temp.db.insert(purchases).values({
        portfolioId: 'index',
        fundId: 'ghost',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }).run()).toThrow(/FOREIGN KEY/)
    }
    finally {
      temp.close()
    }
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm test --project server`
Expected: FAILS because `../test-utils/temp-db` does not resolve.

- [ ] **Step 4: Create `server/db/client.ts`**

Requirements:

- `MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))`. Not
  `path.join(process.cwd(), ...)`: the tests and `tsx` run from different working directories.
- `openDatabase(filePath)`: `mkdirSync(dirname(filePath), { recursive: true })`, then
  `new Database(filePath)`, then `sqlite.pragma('journal_mode = WAL')` and
  `sqlite.pragma('foreign_keys = ON')` — **the foreign-key pragma is off by default in SQLite and
  has to be set on every connection**, otherwise the last test of step 2 passes for the wrong
  reason. Then `drizzle(sqlite, { schema })`.
- `applyMigrations(handle)`: `migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER })` from
  `drizzle-orm/better-sqlite3/migrator`.
- `close()` calls `sqlite.close()`.

- [ ] **Step 5: Create `server/test-utils/temp-db.ts`**

Requirements:

- `mkdtempSync(join(tmpdir(), 'steady-stack-test-'))`, database file `test.db` inside it.
- Call `openDatabase` then `applyMigrations`.
- **Guard:** if the resolved directory is not under `os.tmpdir()`, throw
  `Refusing to create a test database outside the system temp directory: <path>`. This is the
  mechanical guarantee that no test ever writes to `data/steady-stack.db`.
- `close()`: `handle.close()` and then `rmSync(dir, { recursive: true, force: true })`.

- [ ] **Step 6: Run it and watch it pass**

Run: `pnpm test --project server`
Expected: 7 tests green.

Run: `pnpm test`
Expected: 98 tests green across three projects — `core`, `server`, `app` (the last one empty).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts server/db/client.ts server/test-utils/temp-db.ts server/db/client.test.ts
git commit -m "SQLite client and a temporary database for the integration tests

A third Vitest project on the node environment covers server/. Every
integration test gets its own file under the system temp directory and
deletes it on teardown; the helper throws if the path ever lands outside
os.tmpdir(), so data/steady-stack.db cannot be reached from a test.

foreign_keys is set per connection because SQLite defaults it off, which
would have let a purchase reference a fund that does not exist."
```

---

## Task 4: Mappers and queries

**Files:**
- Create: `server/db/mappers.ts`
- Create: `server/db/mappers.test.ts`
- Create: `server/db/queries.ts`
- Create: `server/db/queries.test.ts`

**Interfaces:**
- Consumes: `ContributionRule`, `ContributionOverride`, `Weight`, `Cents`, `NavPoint` from
  `~~/core/types`, `Purchase` from `~~/core/purchases`, the rows of `./schema`
- Produces, in `mappers.ts`:
  - `interface StoredPurchase extends Purchase { id: number; portfolioId: string; month: Month; source: 'auto' | 'manual' }`
  - `function parseWeights(json: string): Weight[]`
  - `function serialiseWeights(weights: Weight[]): string`
  - `function toContributionRule(row: ContributionRuleRow): ContributionRule`
  - `function toContributionOverride(row: ContributionOverrideRow): ContributionOverride`
  - `function toPurchase(row: PurchaseRow): StoredPurchase`
  - `function toNavPoint(row: NavRow): NavPoint`
  - `function assertCents(value: unknown, field: string): Cents`
- Produces, in `queries.ts`:
  - `const PORTFOLIO_ID = 'index'`
  - `function getPortfolio(db: AppDatabase, id?: string): PortfolioRow | undefined`
  - `function listFunds(db: AppDatabase): FundRow[]`
  - `function getFund(db: AppDatabase, id: string): FundRow | undefined`
  - `function listRules(db: AppDatabase, portfolioId?: string): ContributionRuleRow[]`
  - `function listOverrides(db: AppDatabase, portfolioId?: string): ContributionOverrideRow[]`
  - `function listPurchases(db: AppDatabase, portfolioId?: string): PurchaseRow[]`
  - `function listNavs(db: AppDatabase, fundId: string, from?: IsoDate, to?: IsoDate): NavRow[]`
  - `function latestNavDate(db: AppDatabase, fundId: string): IsoDate | undefined`
  - `function latestNavOnOrBefore(db: AppDatabase, fundId: string, date: IsoDate): NavRow | undefined`
  - `function navDatesInRange(db: AppDatabase, fundId: string, from: IsoDate, to: IsoDate): IsoDate[]`
  - `function listScenarios(db: AppDatabase): ScenarioRow[]`

The mappers are the boundary. They are where a corrupt row becomes a clear error instead of a wrong
number three layers later.

- [ ] **Step 1: Write the failing mapper test**

Create `server/db/mappers.test.ts` covering, at minimum:

- `parseWeights('[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]')` returns
  `[{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }]`.
- `serialiseWeights` round-trips through `parseWeights` unchanged.
- `parseWeights('[]')` throws `Stored weights must add up to 1, they add up to 0`.
- `parseWeights('[{"fundId":"a","weight":0.8},{"fundId":"b","weight":0.1}]')` throws
  `Stored weights must add up to 1, they add up to 0.9000000000000001`. Use `toThrow('must add up to 1')`
  rather than the full string, so the floating point tail does not make the test brittle.
- `parseWeights('not json')` throws `Stored weights are not valid JSON`.
- `parseWeights('{"fundId":"a"}')` throws `Stored weights must be an array`.
- `toContributionRule({ id: 1, portfolioId: 'index', fromMonth: '2026-08', amount: 20_000, timing:
  'start', weights: '[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]' })`
  returns exactly `{ fromMonth: '2026-08', amount: 20_000, timing: 'start', weights: [...] }` — the
  core type, with **no `id` and no `portfolioId`**. That is the point: core never sees a row.
- `toContributionOverride` with `amount: null` returns `{ month, amount: null }` and omits `timing`
  and `note` when the columns are null (`toEqual({ month: '2026-10', amount: null })`).
- `toPurchase` returns `{ id, portfolioId, month, source, fundId, date, amount, nav, units }` and
  the `fundId`/`date`/`amount`/`nav`/`units` five are byte-identical to the row.
- `assertCents(16_000, 'amount')` returns `16000`; `assertCents(160.5, 'amount')` throws
  `Column "amount" must be an integer number of cents, found 160.5`; `assertCents(null, 'amount')`
  throws the same shape with `found null`.
- `toPurchase` on a row with `amount: 160.5` throws through `assertCents`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test server/db/mappers.test.ts`
Expected: FAILS because `./mappers` does not resolve.

- [ ] **Step 3: Create `server/db/mappers.ts`**

Notes for the implementation:

- Weight validation reuses the same tolerance as `core/money.ts`: `Math.abs(total - 1) > 1e-9`.
- `toContributionOverride` must **omit** optional keys rather than set them to `undefined`, so
  `toEqual` comparisons in the tests are honest. Build the object conditionally.
- `assertCents` checks `typeof value === 'number' && Number.isInteger(value)`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test server/db/mappers.test.ts`
Expected: all green.

- [ ] **Step 5: Write the failing query test**

Create `server/db/queries.test.ts`. Use `createTempDatabase()` and insert fixtures by hand. Cover:

- `getPortfolio(db)` with no argument reads the portfolio whose id is `PORTFOLIO_ID`.
- `listFunds` returns funds ordered by `id` ascending, deterministically.
- `listNavs(db, 'world', '2026-08-01', '2026-08-31')` returns only the rows in the window, ordered
  by date ascending.
- `latestNavDate(db, 'world')` with rows for 2026-08-03, 2026-08-04 and 2026-08-05 returns
  `'2026-08-05'`; with no rows it returns `undefined`.
- `latestNavOnOrBefore(db, 'world', '2026-08-04')` returns the 2026-08-04 row; asked for
  `'2026-08-10'` with the latest row at 2026-08-05 it returns the 2026-08-05 row; asked for
  `'2026-07-01'` with nothing earlier it returns `undefined`.
- `navDatesInRange(db, 'world', '2026-08-01', '2026-08-31')` returns `['2026-08-03', '2026-08-04',
  '2026-08-05']`.
- `listPurchases` orders by `date` then `id`, so the XIRR cash-flow order is stable.

- [ ] **Step 6: Run it, watch it fail, then create `server/db/queries.ts`**

Run: `pnpm test server/db/queries.test.ts` — FAILS, then implement, then green.

Notes: use `and`, `eq`, `gte`, `lte`, `desc`, `asc` from `drizzle-orm`. Every list query has an
explicit `orderBy`; an unordered read is a flaky test waiting to happen.

- [ ] **Step 7: Commit**

```bash
git add server/db/mappers.ts server/db/mappers.test.ts server/db/queries.ts server/db/queries.test.ts
git commit -m "Map database rows onto the domain types

The mappers strip id and portfolio_id: what reaches core/ is a
ContributionRule, not a row, so the engine stays unaware there is a
database at all. assertCents turns a corrupt amount into an error at the
boundary instead of a wrong figure three layers up."
```

---

## Task 5: The initial data, seeded idempotently

**Files:**
- Create: `server/db/seed.ts`
- Create: `server/db/seed.test.ts`
- Create: `scripts/seed.ts`
- Modify: `package.json` (add `tsx`, script `db:seed`)

**Interfaces:**
- Consumes: `AppDatabase`, the tables, `serialiseWeights`
- Produces:
  - `const PORTFOLIO_ID = 'index'` (re-exported from `queries.ts`)
  - `const WORLD_FUND_ID = 'world'`
  - `const EMERGING_FUND_ID = 'emerging'`
  - `function seedInitialData(db: AppDatabase): void`

**Install check.** `tsx` is needed to run `.ts` scripts: Node 22.14 does not strip types without a
flag, and with the flag it refuses extensionless relative imports, which is how every module in
`server/` imports its neighbours. `pnpm list tsx` shows it is not a direct dependency, so it is
genuinely missing. Its only build-script dependency is `esbuild`, already allow-listed in
`pnpm-workspace.yaml`. **It has been verified that `tsx` resolves `~~/core/money` through the
tsconfig paths.**

Run: `pnpm add -D tsx`

Then add to `package.json` scripts: `"db:seed": "tsx scripts/seed.ts"`.

The data is spec section 13, verbatim. The two funds are seeded with **`providerSymbol: null`**:
section 6 is explicit that the symbol is chosen by the user among the candidates, never guessed,
because the same ISIN publishes share classes at different prices — `0P0001CLDK.F` against
`IE00BYX5NX33.SG`. `pnpm sync:nav` reports `skipped: 'no-symbol'` for a fund without one, and the
funds screen of plan 3 is where the user picks.

- [ ] **Step 1: Write the failing test**

Create `server/db/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createTempDatabase } from '../test-utils/temp-db'
import { seedInitialData } from './seed'
import { contributionRules, funds, portfolios, scenarios } from './schema'
import { toContributionRule } from './mappers'

describe('seedInitialData', () => {
  it('writes the portfolio of section 13 of the spec', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)

      expect(temp.db.select().from(portfolios).all()).toEqual([
        { id: 'index', name: 'Cartera indexada', currency: 'EUR', horizonYears: 25 },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the two funds by ISIN, with no symbol chosen', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const rows = temp.db.select().from(funds).all()

      expect(rows).toEqual([
        {
          id: 'emerging',
          isin: 'IE0031786696',
          name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
          providerSymbol: null,
          currency: 'EUR',
        },
        {
          id: 'world',
          isin: 'IE00BYX5NX33',
          name: 'Fidelity MSCI World Index Fund EUR P Acc',
          providerSymbol: null,
          currency: 'EUR',
        },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the initial 2.000 € and the recurring 200 €/month, both at 80/20', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const rules = temp.db.select().from(contributionRules).all().map(toContributionRule)

      expect(rules).toEqual([
        {
          fromMonth: '2026-07',
          amount: 200_000,
          timing: 'start',
          weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
        },
        {
          fromMonth: '2026-08',
          amount: 20_000,
          timing: 'start',
          weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
        },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the three scenarios at 0 %, 5 % and 9 %', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)

      expect(temp.db.select().from(scenarios).all()).toEqual([
        { id: 'flat', name: 'Sin interés', annualRate: '0', color: 'chart-3', enabled: 1 },
        { id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color: 'chart-2', enabled: 1 },
        { id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color: 'chart-1', enabled: 1 },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('is idempotent: seeding twice changes nothing', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const before = {
        portfolios: temp.db.select().from(portfolios).all(),
        funds: temp.db.select().from(funds).all(),
        rules: temp.db.select().from(contributionRules).all(),
        scenarios: temp.db.select().from(scenarios).all(),
      }

      seedInitialData(temp.db)

      expect({
        portfolios: temp.db.select().from(portfolios).all(),
        funds: temp.db.select().from(funds).all(),
        rules: temp.db.select().from(contributionRules).all(),
        scenarios: temp.db.select().from(scenarios).all(),
      }).toEqual(before)
    }
    finally {
      temp.close()
    }
  })

  it('does not overwrite a symbol the user has already chosen', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      temp.db.update(funds).set({ providerSymbol: '0P0001CLDK.F' }).run()

      seedInitialData(temp.db)

      const world = temp.db.select().from(funds).all().find((f) => f.id === 'world')
      expect(world?.providerSymbol).toBe('0P0001CLDK.F')
    }
    finally {
      temp.close()
    }
  })
})
```

Note the ordering in the funds and scenarios assertions: `select()` with no `orderBy` on SQLite
returns rows in rowid order for these tables, but the test must not depend on that. Add
`.orderBy(funds.id)` and `.orderBy(scenarios.annualRate)` inside `seedInitialData`'s tests if the
raw order turns out different from the one written above — adjust the expectation to match the
explicit order, never remove the ordering.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test server/db/seed.test.ts`
Expected: FAILS because `./seed` does not resolve.

- [ ] **Step 3: Create `server/db/seed.ts`**

Implementation: one `db.transaction(...)`, each insert with `.onConflictDoNothing()`. The rules
conflict on the `contribution_rule_month_unique` index, the funds on the primary key, and that is
what makes a second run a no-op — including leaving a chosen `providerSymbol` alone, because
`onConflictDoNothing` never updates.

Weights are written with `serialiseWeights([{ fundId: WORLD_FUND_ID, weight: 0.8 }, { fundId:
EMERGING_FUND_ID, weight: 0.2 }])`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test server/db/seed.test.ts`
Expected: 6 tests green.

- [ ] **Step 5: Create `scripts/seed.ts`**

```ts
import { applyMigrations, openDatabase } from '../server/db/client'
import { seedInitialData } from '../server/db/seed'

const DATABASE_FILE = 'data/steady-stack.db'

const handle = openDatabase(DATABASE_FILE)
applyMigrations(handle)
seedInitialData(handle.db)
handle.close()

console.log(`Seeded the initial data into ${DATABASE_FILE}`)
```

- [ ] **Step 6: Verify the script end to end**

```sh
rm -f data/steady-stack.db* \
  && pnpm db:seed \
  && pnpm db:seed \
  && sqlite3 data/steady-stack.db "select 'portfolio', count(*) from portfolio union all select 'fund', count(*) from fund union all select 'rule', count(*) from contribution_rule union all select 'scenario', count(*) from scenario"
```

Expected, exactly:

```
portfolio|1
fund|2
rule|2
scenario|3
```

Two runs, the same counts. That is the idempotency proof at the file level, not just in a temp
database.

- [ ] **Step 7: Commit**

```bash
git add server/db/seed.ts server/db/seed.test.ts scripts/seed.ts package.json pnpm-lock.yaml
git commit -m "Seed the initial portfolio of section 13 of the spec

Two funds at 80/20, 2.000 € in July 2026 and 200 €/month from August, and
scenarios at 0 %, 5 % and 9 %. Every insert is onConflictDoNothing, so
running it twice is a no-op and a provider symbol the user has already
chosen survives a reseed.

The funds are seeded without a symbol on purpose: the same ISIN publishes
several share classes at different prices, and section 6 of the spec says
the choice is the user's."
```

---

# Phase 2 — Price providers

**Ends in something checkable:** `pnpm test --project server` is green with the provider tests
reading committed JSON fixtures, and unplugging the network changes nothing.

## Task 6: The `PriceProvider` interface and manual entry

**Files:**
- Create: `server/providers/types.ts`
- Create: `server/providers/manual.ts`
- Create: `server/providers/manual.test.ts`
- Delete: `server/providers/.gitkeep`

**Interfaces:**
- Consumes: `IsoDate`, `NavPoint` from `~~/core/types`
- Produces:

```ts
/** One of the symbols a provider offers for an ISIN. Never chosen automatically. */
export interface SymbolCandidate {
  symbol: string
  name: string
  exchange: string
  currency: string | null
  /** Latest published price as a decimal string, or null when unavailable. */
  price: string | null
  /** The date `price` corresponds to. NAVs publish with about a day of lag. */
  priceDate: IsoDate | null
}

export interface PriceProvider {
  /** Stored in `nav.source`. */
  readonly id: 'yahoo' | 'manual'
  /** Every candidate the provider offers, in the order it offers them. */
  resolve(isin: string): Promise<SymbolCandidate[]>
  /** Net asset values in `[from, to]`, ascending by date, with no gaps and no nulls. */
  history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]>
}

export class PriceProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown })
}

export function createManualProvider(entriesBySymbol: Record<string, NavPoint[]>): PriceProvider
```

`ManualEntry` is an in-memory provider rather than one that reads the database, so
`server/providers/` never imports Drizzle. Its two jobs: let a fund with no Yahoo symbol be synced
from a hand-maintained list, and make the precedence rule of spec section 6 — a NAV entered by hand
always prevails — testable in task 9 by running a manual provider against a Yahoo one.

- [ ] **Step 1: Write the failing test**

Create `server/providers/manual.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createManualProvider } from './manual'

const ENTRIES = {
  world: [
    { date: '2026-08-03', value: '14.8321' },
    { date: '2026-08-04', value: '14.9100' },
    { date: '2026-08-05', value: '15.0000' },
  ],
}

describe('createManualProvider', () => {
  it('identifies itself as manual', () => {
    expect(createManualProvider({}).id).toBe('manual')
  })

  it('returns the entries inside the window, both ends included', async () => {
    const provider = createManualProvider(ENTRIES)

    await expect(provider.history('world', '2026-08-04', '2026-08-05')).resolves.toEqual([
      { date: '2026-08-04', value: '14.9100' },
      { date: '2026-08-05', value: '15.0000' },
    ])
  })

  it('returns an empty series for an unknown symbol', async () => {
    const provider = createManualProvider(ENTRIES)

    await expect(provider.history('ghost', '2026-08-01', '2026-08-31')).resolves.toEqual([])
  })

  it('sorts the entries by date even when they arrive shuffled', async () => {
    const provider = createManualProvider({
      world: [
        { date: '2026-08-05', value: '15.0000' },
        { date: '2026-08-03', value: '14.8321' },
      ],
    })

    await expect(provider.history('world', '2026-08-01', '2026-08-31')).resolves.toEqual([
      { date: '2026-08-03', value: '14.8321' },
      { date: '2026-08-05', value: '15.0000' },
    ])
  })

  it('resolves nothing: a hand-kept list has no catalogue to search', async () => {
    await expect(createManualProvider(ENTRIES).resolve('IE00BYX5NX33')).resolves.toEqual([])
  })
})
```

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `pnpm test server/providers/manual.test.ts`
Expected: FAILS, then 5 tests green.

- [ ] **Step 3: Commit**

```bash
git rm --cached server/providers/.gitkeep
rm -f server/providers/.gitkeep
git add server/providers/types.ts server/providers/manual.ts server/providers/manual.test.ts
git commit -m "PriceProvider interface and hand-entered net asset values

history() takes YYYY-MM-DD strings rather than Date objects: they sort
chronologically, carry no timezone and match the rest of the codebase.
The manual provider holds its entries in memory so server/providers/
never imports Drizzle."
```

---

## Task 7: Capture the Yahoo fixtures, once, by hand

**Files:**
- Create: `scripts/capture-yahoo-fixtures.ts`
- Create: `server/providers/__fixtures__/recorded/*.json` (captured, committed)
- Create: `server/providers/__fixtures__/handmade/*.json` (written by hand, committed)
- Create: `server/providers/__fixtures__/README.md`
- Modify: `package.json` (script `capture:fixtures`)

**This is the task that keeps the network out of the test suite.** It runs once, by hand, on a
machine with a connection. Its output is committed. Task 8's tests read those files and never open a
socket.

Two kinds of fixture, on purpose:

- **`recorded/`** — captured verbatim from the live API. Used for *structural* assertions: the
  candidate list, the currency, the ordering, the shape. Their exact figures change with the day
  they were captured, so no test asserts a specific price against them.
- **`handmade/`** — small files written by hand, with values chosen to pin down exactly the
  behaviours that matter: trailing `null`s, an inner gap, the float noise Yahoo sends, an error
  payload. Every precise numeric assertion in task 8 goes against these.

- [ ] **Step 1: Write `server/providers/__fixtures__/README.md`**

```md
# Yahoo fixtures

`recorded/` was captured from the live API with `pnpm capture:fixtures` and is committed as is.
Recapture it only if the API shape changes; the figures inside it are whatever the market did on
the day of capture, and no test asserts a specific one.

`handmade/` is written by hand. Every exact numeric assertion in `../yahoo.test.ts` reads from
here, so those tests stay deterministic no matter when the recorded files were refreshed.

No test in this repository calls the network. A test that hits Yahoo goes red on a train with no
wifi, and that proves nothing about our code.
```

- [ ] **Step 2: Write `scripts/capture-yahoo-fixtures.ts`**

It fetches and writes, with `JSON.stringify(payload, null, 2)`:

| Request | Output file |
|---|---|
| `https://query2.finance.yahoo.com/v1/finance/search?q=IE00BYX5NX33&quotesCount=10&newsCount=0` | `recorded/search-IE00BYX5NX33.json` |
| `https://query2.finance.yahoo.com/v1/finance/search?q=IE0031786696&quotesCount=10&newsCount=0` | `recorded/search-IE0031786696.json` |
| `https://query2.finance.yahoo.com/v8/finance/chart/0P0001CLDK.F?range=1y&interval=1d` | `recorded/chart-0P0001CLDK.F.json` |
| `https://query2.finance.yahoo.com/v8/finance/chart/IE00BYX5NX33.SG?range=1y&interval=1d` | `recorded/chart-IE00BYX5NX33.SG.json` |
| `https://query2.finance.yahoo.com/v8/finance/chart/0P00012I6A.F?range=1y&interval=1d` | `recorded/chart-0P00012I6A.F.json` |

Requirements:

- Send `User-Agent: Mozilla/5.0` — Yahoo answers 429 to the default Node agent.
- Use the global `fetch` of Node 22. Do not import `ofetch`: it is not a direct dependency.
- Wait 500 ms between requests. Five requests in a burst is how you get rate-limited.
- Non-2xx: print the status and exit with code 1. A truncated fixture is worse than none.
- Print one line per file written, with its size.

Add to `package.json` scripts: `"capture:fixtures": "tsx scripts/capture-yahoo-fixtures.ts"`.

- [ ] **Step 3: Run the capture**

Run: `pnpm capture:fixtures`
Expected: five files under `server/providers/__fixtures__/recorded/`, each over 10 kB.

Then sanity-check them, without asserting any figure:

```sh
jq '[.quotes[].symbol]' server/providers/__fixtures__/recorded/search-IE00BYX5NX33.json
```
Expected: at least two symbols, among them `0P0001CLDK.F` and `IE00BYX5NX33.SG`. **If it comes back
with only one, stop and report it** — the whole point of `resolve()` returning a list is that this
ISIN has several share classes, and task 8's tests depend on it.

```sh
jq '.chart.result[0] | {currency: .meta.currency, points: (.timestamp | length), lastCloses: (.indicators.quote[0].close[-3:])}' \
  server/providers/__fixtures__/recorded/chart-0P0001CLDK.F.json
```
Expected: `currency` is `EUR`, `points` is over 200, and the last closes are likely to include one
or two `null`s. That is the publication lag of section 6 of the spec showing up in the data.

- [ ] **Step 4: Write the handmade fixtures**

`server/providers/__fixtures__/handmade/chart-trailing-nulls.json`:

```json
{
  "chart": {
    "result": [
      {
        "meta": {
          "currency": "EUR",
          "symbol": "0P0001CLDK.F",
          "instrumentType": "MUTUALFUND",
          "regularMarketPrice": 14.2772,
          "gmtoffset": 7200
        },
        "timestamp": [1785823200, 1785909600, 1785996000, 1786082400],
        "indicators": {
          "quote": [
            {
              "close": [14.10420036315918, 14.277199745178223, null, null]
            }
          ]
        }
      }
    ],
    "error": null
  }
}
```

Those four timestamps are 2026-08-04, 2026-08-05, 2026-08-06 and 2026-08-07 at the Frankfurt open.
The two closes are real values as Yahoo sends them: IEEE doubles carrying representation noise for
14,1042 € and 14,2772 €.

`server/providers/__fixtures__/handmade/chart-inner-gap.json`: same `meta`, `timestamp`
`[1785823200, 1785909600, 1785996000]`, `close` `[14.1042, null, 14.33]`.

`server/providers/__fixtures__/handmade/chart-error.json`:

```json
{
  "chart": {
    "result": null,
    "error": { "code": "Not Found", "description": "No data found, symbol may be delisted" }
  }
}
```

`server/providers/__fixtures__/handmade/search-two-candidates.json`:

```json
{
  "count": 2,
  "quotes": [
    {
      "exchange": "STU",
      "shortname": "Fidelity MSCI World Index Fund ",
      "quoteType": "MUTUALFUND",
      "symbol": "IE00BYX5NX33.SG",
      "longname": null,
      "exchDisp": "Stuttgart",
      "typeDisp": "Fund",
      "isYahooFinance": true
    },
    {
      "exchange": "FRA",
      "shortname": "0P0001CLDK.F",
      "quoteType": "MUTUALFUND",
      "symbol": "0P0001CLDK.F",
      "longname": "Fidelity MSCI World Index Fund",
      "exchDisp": "Frankfurt",
      "typeDisp": "Fund",
      "isYahooFinance": true
    }
  ],
  "news": []
}
```

That is the real response, trimmed. Note the trailing space in `shortname` and the `null`
`longname`: both are real, and both are why the parser trims and falls back.

`server/providers/__fixtures__/handmade/search-empty.json`: `{ "count": 0, "quotes": [], "news": [] }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-yahoo-fixtures.ts server/providers/__fixtures__ package.json
git commit -m "Record the Yahoo responses so the tests never call it

pnpm capture:fixtures runs once, by hand, and commits what it downloads.
The recorded files carry whatever the market did that day, so they only
back structural assertions; the handmade ones carry chosen values and
back every exact figure, including the 14.10420036315918 that Yahoo sends
for a fund published at 14,1042 €.

A test that calls Yahoo goes red on a train with no wifi, and that says
nothing about our code."
```

---

## Task 8: The Yahoo provider

**Files:**
- Create: `server/providers/yahoo.ts`
- Create: `server/providers/yahoo.test.ts`

**Interfaces:**
- Consumes: `PriceProvider`, `SymbolCandidate`, `PriceProviderError` from `./types`, `NavPoint` and
  `IsoDate` from `~~/core/types`, `Decimal` from `~~/core/decimal`
- Produces:
  - `const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'`
  - `const YAHOO_CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart'`
  - `const NAV_DECIMALS = 4`
  - `interface YahooQuote { symbol: string; name: string; exchange: string }`
  - `function parseSearchResponse(payload: unknown, isin: string): YahooQuote[]`
  - `function parseChartResponse(payload: unknown, symbol: string): { symbol: string; currency: string | null; points: NavPoint[] }`
  - `function createYahooProvider(options?: { fetchJson?: (url: string) => Promise<unknown> }): PriceProvider`

The two parsers are exported as pure functions. That is what makes them testable against a JSON file
with no HTTP client anywhere in the test path; `createYahooProvider` only wires them to a fetcher.

**Four things the parser has to get right:**

1. **Yahoo sends IEEE doubles.** A fund published at 14,1042 € arrives as `14.10420036315918`.
   Feeding that into `new Decimal(...)` unchanged would store the noise. Round to `NAV_DECIMALS = 4`
   with `ROUND_HALF_UP` and emit `.toString()`, so `14.10420036315918` becomes `'14.1042'` and
   `14.33` stays `'14.33'`. Four places is what these funds publish.
2. **Trailing and inner `null`s are dropped**, not zero-filled. A `null` close means no NAV was
   published that day.
3. **Dates come from the timestamp plus `meta.gmtoffset`**, so the date is the exchange's, not
   UTC's: `new Date((timestamp + gmtoffset) * 1000).toISOString().slice(0, 10)`. Treat a missing
   `gmtoffset` as `0`.
4. **`resolve()` returns every candidate**, in the order Yahoo gives them, and never picks. It
   enriches each with its current price by calling the chart endpoint once per candidate with
   `range=1mo&interval=1d` and taking the last non-`null` point. A candidate whose chart call fails
   comes back with `price: null` and `priceDate: null` rather than sinking the whole resolution.

- [ ] **Step 1: Write the failing test**

Create `server/providers/yahoo.test.ts`. Load fixtures with a helper:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function fixture(relativePath: string): unknown {
  const path = fileURLToPath(new URL(`./__fixtures__/${relativePath}`, import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8'))
}
```

Cases against the **handmade** fixtures, with exact expectations:

```ts
describe('parseChartResponse', () => {
  it('drops the trailing nulls of the publication lag', () => {
    const result = parseChartResponse(fixture('handmade/chart-trailing-nulls.json'), '0P0001CLDK.F')

    expect(result).toEqual({
      symbol: '0P0001CLDK.F',
      currency: 'EUR',
      points: [
        { date: '2026-08-04', value: '14.1042' },
        { date: '2026-08-05', value: '14.2772' },
      ],
    })
  })

  it('strips the floating point noise Yahoo sends', () => {
    // Yahoo answers 14.10420036315918 for a fund published at 14,1042 €.
    const result = parseChartResponse(fixture('handmade/chart-trailing-nulls.json'), '0P0001CLDK.F')

    expect(result.points[0]!.value).toBe('14.1042')
    expect(result.points[0]!.value).not.toContain('0036315918')
  })

  it('skips a gap in the middle without shifting the dates', () => {
    const result = parseChartResponse(fixture('handmade/chart-inner-gap.json'), '0P0001CLDK.F')

    expect(result.points).toEqual([
      { date: '2026-08-04', value: '14.1042' },
      { date: '2026-08-06', value: '14.33' },
    ])
  })

  it('turns a Yahoo error payload into a PriceProviderError', () => {
    expect(() => parseChartResponse(fixture('handmade/chart-error.json'), 'BOGUS'))
      .toThrow('Yahoo returned no chart data for "BOGUS": No data found, symbol may be delisted')
  })

  it('rejects a payload that is not a chart response', () => {
    expect(() => parseChartResponse({ nope: true }, 'BOGUS'))
      .toThrow('Yahoo returned no chart data for "BOGUS"')
  })
})

describe('parseSearchResponse', () => {
  it('returns every candidate and picks none', () => {
    const result = parseSearchResponse(fixture('handmade/search-two-candidates.json'), 'IE00BYX5NX33')

    expect(result).toEqual([
      { symbol: 'IE00BYX5NX33.SG', name: 'Fidelity MSCI World Index Fund', exchange: 'Stuttgart' },
      { symbol: '0P0001CLDK.F', name: 'Fidelity MSCI World Index Fund', exchange: 'Frankfurt' },
    ])
  })

  it('returns an empty list when the ISIN matches nothing', () => {
    expect(parseSearchResponse(fixture('handmade/search-empty.json'), 'XX0000000000')).toEqual([])
  })
})
```

Cases against the **recorded** fixtures, structural only:

```ts
describe('the recorded responses', () => {
  it('offers several share classes for the same ISIN', () => {
    const result = parseSearchResponse(fixture('recorded/search-IE00BYX5NX33.json'), 'IE00BYX5NX33')
    const symbols = result.map((c) => c.symbol)

    expect(symbols.length).toBeGreaterThanOrEqual(2)
    expect(symbols).toContain('0P0001CLDK.F')
    expect(symbols).toContain('IE00BYX5NX33.SG')
  })

  it('finds the emerging markets fund', () => {
    const result = parseSearchResponse(fixture('recorded/search-IE0031786696.json'), 'IE0031786696')

    expect(result.map((c) => c.symbol)).toContain('0P00012I6A.F')
  })

  it('reads a daily series in euros with no gaps left in it', () => {
    const result = parseChartResponse(fixture('recorded/chart-0P0001CLDK.F.json'), '0P0001CLDK.F')

    expect(result.currency).toBe('EUR')
    expect(result.points.length).toBeGreaterThan(200)
    expect(result.points.every((p) => /^\d+(\.\d{1,4})?$/.test(p.value))).toBe(true)
    expect(result.points.map((p) => p.date)).toEqual([...result.points.map((p) => p.date)].sort())
    expect(new Set(result.points.map((p) => p.date)).size).toBe(result.points.length)
  })

  it('prices the two share classes of one ISIN differently, which is why nothing is guessed', () => {
    const frankfurt = parseChartResponse(fixture('recorded/chart-0P0001CLDK.F.json'), '0P0001CLDK.F')
    const stuttgart = parseChartResponse(fixture('recorded/chart-IE00BYX5NX33.SG.json'), 'IE00BYX5NX33.SG')

    expect(frankfurt.points.at(-1)!.value).not.toBe(stuttgart.points.at(-1)!.value)
  })
})
```

And the wiring, with an injected fetcher:

```ts
describe('createYahooProvider', () => {
  it('never touches the network when a fetcher is injected', async () => {
    const urls: string[] = []
    const provider = createYahooProvider({
      fetchJson: async (url) => {
        urls.push(url)
        return url.includes('/search')
          ? fixture('handmade/search-two-candidates.json')
          : fixture('handmade/chart-trailing-nulls.json')
      },
    })

    const candidates = await provider.resolve('IE00BYX5NX33')

    expect(candidates).toHaveLength(2)
    expect(candidates[0]).toEqual({
      symbol: 'IE00BYX5NX33.SG',
      name: 'Fidelity MSCI World Index Fund',
      exchange: 'Stuttgart',
      currency: 'EUR',
      price: '14.2772',
      priceDate: '2026-08-05',
    })
    expect(urls[0]).toContain('q=IE00BYX5NX33')
  })

  it('clips the history to the requested window', async () => {
    const provider = createYahooProvider({
      fetchJson: async () => fixture('handmade/chart-trailing-nulls.json'),
    })

    await expect(provider.history('0P0001CLDK.F', '2026-08-05', '2026-08-31')).resolves.toEqual([
      { date: '2026-08-05', value: '14.2772' },
    ])
  })

  it('identifies itself as yahoo, which is what lands in nav.source', () => {
    expect(createYahooProvider().id).toBe('yahoo')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test server/providers/yahoo.test.ts`
Expected: FAILS because `./yahoo` does not resolve.

- [ ] **Step 3: Create `server/providers/yahoo.ts`**

Further notes:

- The default `fetchJson` uses the global `fetch` with `headers: { 'User-Agent': 'Mozilla/5.0' }`
  and throws `PriceProviderError` on a non-2xx, with the status in the message. Do not import
  `ofetch`.
- `history(symbol, from, to)` picks a `range` wide enough to cover `from`: the number of days
  between `from` and `to` decides between `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `10y`, `max`.
  Round up, never down; then clip the parsed points to `[from, to]` in code. Yahoo has no
  from/to parameter pair worth trusting, and over-fetching costs one request.
- Name resolution: `longname` if it is a non-empty string, else `shortname`, else the symbol, always
  `.trim()`ed. Exchange: `exchDisp` if present, else `exchange`, else `''`.
- Keep only quotes with a string `symbol` and a `quoteType`. That is what drops the news and
  industry entries Yahoo mixes into `quotes`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test server/providers/yahoo.test.ts`
Expected: all green.

- [ ] **Step 5: Prove no test opens a socket**

```sh
grep -rnE "https?://" server/providers/*.test.ts
```
Expected: **no output**. Every URL lives in `yahoo.ts` or in the capture script, never in a test.

- [ ] **Step 6: Commit**

```bash
git add server/providers/yahoo.ts server/providers/yahoo.test.ts
git commit -m "Yahoo price provider over the recorded responses

resolve() returns every candidate and picks none: the same ISIN publishes
several share classes at different prices, and only the user's statement
says which one they hold. The parser rounds the close to four decimal
places because Yahoo sends 14.10420036315918 for a fund published at
14,1042 €, and drops the null closes of the last days rather than
zero-filling them — those are the publication lag, not a NAV of zero."
```

---

# Phase 3 — Synchronisation and materialisation

**Ends in something checkable:** two consecutive syncs leave the `nav` table with the same number of
rows, and a purchase already executed survives an edit of the rule that produced it. Those are the
two invariants section 11 of the spec names for the data layer.

## Task 9: Idempotent NAV synchronisation

**Files:**
- Create: `server/services/nav-sync.ts`
- Create: `server/services/nav-sync.test.ts`
- Create: `server/test-utils/fake-provider.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `navs`/`funds` from `../db/schema`, `latestNavDate`/`listFunds`/`listRules`
  from `../db/queries`, `PriceProvider` from `../providers/types`, `addDays`/`firstDayOfMonth` from
  `~~/core/dates`
- Produces:

```ts
export interface NavSyncOptions {
  /** The current date. Injected, never read from the clock in here. */
  today: IsoDate
  /** Restrict the run to these funds. All of them when omitted. */
  fundIds?: string[]
  /** Where to start for a fund with no NAV yet. Defaults to the first contribution month. */
  fallbackFrom?: IsoDate
}

export interface NavSyncFundResult {
  fundId: string
  status: 'synced' | 'up-to-date' | 'skipped'
  reason?: 'no-symbol'
  from?: IsoDate
  to?: IsoDate
  received?: number
  inserted?: number
  updated?: number
  skippedManual?: number
}

export interface NavSyncResult { funds: NavSyncFundResult[] }

export async function syncNavs(
  db: AppDatabase,
  provider: PriceProvider,
  options: NavSyncOptions,
): Promise<NavSyncResult>
```

**The algorithm, exactly:**

For each fund, ordered by id:

1. No `providerSymbol` → `{ status: 'skipped', reason: 'no-symbol' }`, next fund.
2. `from` = `addDays(latestNavDate(db, fund.id), 1)` if there is one; otherwise
   `options.fallbackFrom`, otherwise `firstDayOfMonth(earliest rule fromMonth)`, otherwise
   `options.today`. **This is what "requests only the missing days" means**: never re-download what
   is already stored.
3. `to` = `options.today`.
4. `from > to` → `{ status: 'up-to-date', from, to, received: 0, inserted: 0, updated: 0,
   skippedManual: 0 }`, next fund.
5. `points = await provider.history(symbol, from, to)`.
6. Read the existing rows for that fund in `[from, to]` once, into a `Map<IsoDate, source>`. That
   map is what tells `inserted` from `updated` and counts `skippedManual`.
7. In one transaction, upsert each point:

```ts
db.insert(navs)
  .values({ fundId, date: point.date, value: point.value, source: provider.id })
  .onConflictDoUpdate({
    target: [navs.fundId, navs.date],
    set: { value: point.value, source: provider.id },
    // A net asset value entered by hand always prevails over the provider's.
    setWhere: sql`${navs.source} <> 'manual'`,
  })
  .run()
```

`setWhere` has been verified to produce
`... on conflict ("nav"."fund_id", "nav"."date") do update set ... where nav.source <> 'manual'`.

- [ ] **Step 1: Create `server/test-utils/fake-provider.ts`**

```ts
export interface FakeProvider extends PriceProvider {
  /** Every history() call, in order. This is how "only the missing days" is asserted. */
  readonly calls: Array<{ symbol: string, from: IsoDate, to: IsoDate }>
}

export function createFakeProvider(
  id: 'yahoo' | 'manual',
  historyBySymbol: Record<string, NavPoint[]>,
): FakeProvider
```

`history` records the call and returns the points of that symbol clipped to `[from, to]`. `resolve`
returns `[]`.

- [ ] **Step 2: Write the failing test**

Create `server/services/nav-sync.test.ts`. Every case seeds a temp database with the portfolio, the
two funds **with symbols set** (`0P0001CLDK.F` and `0P00012I6A.F`) and the two rules, then runs
`syncNavs`.

Fixed series for the tests:

```ts
const WORLD = [
  { date: '2026-08-03', value: '14.8321' },
  { date: '2026-08-04', value: '14.9100' },
  { date: '2026-08-05', value: '15.0000' },
]
const EMERGING = [
  { date: '2026-08-03', value: '9.9900' },
  { date: '2026-08-04', value: '10.0100' },
  { date: '2026-08-05', value: '10.1000' },
]
```

Cases:

1. **First run stores everything.** `today: '2026-08-05'`. `nav` ends with 6 rows; the result for
   `world` is `{ fundId: 'world', status: 'synced', from: '2026-07-01', to: '2026-08-05',
   received: 3, inserted: 3, updated: 0, skippedManual: 0 }`. `from` is 2026-07-01 because the
   earliest rule starts in 2026-07 and the fund has no NAV yet.
2. **A second run duplicates nothing.** Run twice with the same `today`. `select count(*) from nav`
   is 6 both times, and the second result has `inserted: 0`. This is the idempotency invariant of
   spec section 11.
3. **A second run asks only for the missing days.** After the first run,
   `provider.calls.at(-1)` for `world` has `from: '2026-08-06'` — the day after the last stored NAV
   — and not `'2026-07-01'`.
4. **A NAV entered by hand prevails.** Insert `{ fundId: 'world', date: '2026-08-04', value:
   '99.0000', source: 'manual' }` by hand, then sync with `today: '2026-08-05'` after clearing the
   other rows. The 2026-08-04 row is still `'99.0000'` with `source: 'manual'`, and the result
   reports `skippedManual: 1`.
5. **A fund with no symbol is skipped, not failed.** Set `providerSymbol` to null for `emerging`.
   The result has `{ fundId: 'emerging', status: 'skipped', reason: 'no-symbol' }` and `world` still
   syncs.
6. **Nothing to ask for.** Sync once with `today: '2026-08-05'`, then again with the same `today`.
   `from` would be 2026-08-06, which is after `to`, so the status is `'up-to-date'` and the provider
   is not called again — assert `provider.calls` did not grow.
7. **`fundIds` restricts the run.** `syncNavs(db, provider, { today, fundIds: ['world'] })` returns
   one entry and leaves `emerging` with no NAV rows.
8. **A provider that throws does not poison the other funds.** Make `history` reject for `emerging`;
   `world` still ends up synced and the error propagates as a `PriceProviderError` naming the fund.
   Decide the behaviour first and write the assertion that matches: this plan chooses **propagate**,
   with the message `Failed to sync fund "emerging": <cause message>`, after the successful funds
   have already been committed. Partial progress is correct here — the NAVs already downloaded are
   worth keeping, which is the mitigation section 6 of the spec names for an unofficial API.

- [ ] **Step 3: Run it, watch it fail, implement, watch it pass**

Run: `pnpm test server/services/nav-sync.test.ts`
Expected: FAILS, then 8 tests green.

- [ ] **Step 4: Commit**

```bash
git add server/services/nav-sync.ts server/services/nav-sync.test.ts server/test-utils/fake-provider.ts
git commit -m "Idempotent synchronisation of net asset values

A sync starts at the day after the last one stored, so a second run in
the same afternoon downloads nothing and the nav table keeps exactly the
rows it had. The upsert carries a setWhere that refuses to overwrite a
row whose source is manual: a value entered by hand always prevails, as
section 6 of the spec requires.

today arrives as a parameter. The service reads no clock, so its tests
are the same in August as in December."
```

---

## Task 10: Materialising contributions into purchases

**Files:**
- Create: `server/services/materialisation.ts`
- Create: `server/services/materialisation.test.ts`

**Interfaces:**
- Consumes: `expandContributions` from `~~/core/contributions`, `buildPurchases` from
  `~~/core/purchases`, `firstDayOfMonth`/`lastDayOfMonth` from `~~/core/dates`, the queries and
  mappers of `../db/`
- Produces:

```ts
export interface MaterialisationOptions {
  portfolioId?: string
  /** Materialise every contribution month up to and including this one. */
  throughMonth: Month
}

export interface MaterialisationResult {
  created: StoredPurchase[]
  skipped: Array<{ month: Month, reason: 'already-materialised' | 'no-nav' }>
}

export function materialiseContributions(
  db: AppDatabase,
  options: MaterialisationOptions,
): MaterialisationResult
```

**The algorithm, exactly:**

1. Load the rules. None → `{ created: [], skipped: [] }`.
2. `firstMonth` = the smallest `fromMonth` among them.
3. `contributions = expandContributions(rules.map(toContributionRule),
   overrides.map(toContributionOverride), firstMonth, options.throughMonth)`.
4. `settled` = the set of months that already have **any** purchase row for the portfolio. Any, not
   just automatic ones: if the user recorded the August purchase by hand, materialising it again
   would double the position.
5. For each contribution, in month order:
   - `settled.has(month)` → `skipped.push({ month, reason: 'already-materialised' })`, next.
   - **Execution date:** the earliest date in `[firstDayOfMonth(month), lastDayOfMonth(month)]` for
     which *every* fund in `contribution.weights` has a `nav` row. Compute it by intersecting the
     per-fund date sets from `navDatesInRange`. None → `skipped.push({ month, reason: 'no-nav' })`,
     next.
   - `buildPurchases(contribution, date, navByFund)` where `navByFund` maps each fund to the value
     of its NAV row on that exact date.
   - Insert every returned purchase with `{ portfolioId, month, source: 'auto' }`.
6. The whole loop runs inside one `db.transaction(...)`, so a failure in month five leaves months one
   to four unwritten too. Half a materialisation is worse than none: the user would have to work out
   which months went in.

- [ ] **Step 1: Write the failing test**

Create `server/services/materialisation.test.ts`. Set-up helper: temp database, `seedInitialData`,
and NAV rows inserted by hand.

Cases, with exact expected figures:

1. **One month turns into two purchases.** NAVs for both funds on 2026-08-03 (`world` at `14.8321`,
   `emerging` at `9.9900`), rule 200 € at 80/20, `throughMonth: '2026-08'`, and no July NAVs. The
   `created` array has two entries:
   - `{ fundId: 'world', date: '2026-08-03', amount: 16_000, nav: '14.8321', units: '10.787414', month: '2026-08', portfolioId: 'index', source: 'auto' }` (plus its `id`)
   - `{ fundId: 'emerging', date: '2026-08-03', amount: 4_000, nav: '9.9900', units: '4.004004', month: '2026-08', portfolioId: 'index', source: 'auto' }`

   Check the units: 160 ÷ 14,8321 = 10,787414… and 40 ÷ 9,99 = 4,004004…, both to six places with
   `ROUND_HALF_UP`, which is exactly what `buildPurchases` produces. The amounts add up to 20.000
   cents, not 19.999.
   July is reported as `skipped: [{ month: '2026-07', reason: 'no-nav' }]`.
2. **Running twice creates nothing new.** Second call returns `created: []` and
   `skipped: [{ month: '2026-07', reason: 'no-nav' }, { month: '2026-08', reason: 'already-materialised' }]`,
   and `select count(*) from purchase` is still 2.
3. **Editing the rule does not rewrite an executed purchase.** After case 1, update the rule to
   `amount: 30_000` and re-run. The two stored rows are byte-identical to what they were — assert
   with `toEqual` on the full rows read back, not just on the count. This is the invariant of spec
   section 4: *107,8641 units bought at 14,8321 € does not change even if the rule is edited
   tomorrow.*
4. **A month with only half the NAVs is not half-materialised.** NAV for `world` on 2026-09-01 and
   nothing for `emerging` in September. September comes back as `{ month: '2026-09', reason:
   'no-nav' }` and no purchase row is written for `world` either.
5. **The earliest common date wins.** `world` has NAVs on 2026-08-03 and 2026-08-04; `emerging` only
   on 2026-08-04. The purchase date is `'2026-08-04'`.
6. **A manual purchase blocks the month.** Insert a manual purchase for `world` in 2026-08 by hand,
   then materialise. The month is skipped as `'already-materialised'` and no automatic row appears.
7. **A skipped month produces nothing.** Add an override `{ month: '2026-08', amount: null }` with
   NAVs available. `created` is empty and 2026-08 appears in neither list — `expandContributions`
   already dropped it.
8. **An extra contribution materialises at its own amount.** Override `{ month: '2026-08', amount:
   150_000 }` gives purchases of 120.000 and 30.000 cents.
9. **Nothing to do with no rules.** A database with a portfolio but no rules returns
   `{ created: [], skipped: [] }`.

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `pnpm test server/services/materialisation.test.ts`
Expected: FAILS, then 9 tests green.

- [ ] **Step 3: Commit**

```bash
git add server/services/materialisation.ts server/services/materialisation.test.ts
git commit -m "Materialise contributions into stored purchases, once

The service only ever inserts. A month that already has a purchase row,
automatic or manual, is skipped, so raising the contribution from 200 €
to 300 € recalculates the future series and leaves August's 10,787414
units bought at 14,8321 € exactly where they are.

The execution date is the earliest day of the month on which every fund
has a NAV, so a month is never half materialised: 160 € of world without
the matching 40 € of emerging would misstate the 80/20 split."
```

---

## Task 11: The `pnpm sync:nav` script

**Files:**
- Create: `scripts/sync-nav.ts`
- Modify: `package.json` (script `sync:nav`)
- Modify: `README.md` (document the command)

Section 9 of the spec asks for a button and a script. `TODO.md` records that the script arrives with
this layer. This is where it does.

**Interfaces:**
- Consumes: `openDatabase`/`applyMigrations` from `../server/db/client`, `syncNavs` from
  `../server/services/nav-sync`, `createYahooProvider` from `../server/providers/yahoo`,
  `materialiseContributions` from `../server/services/materialisation`, `today` from
  `../server/utils/today` — create that one-line module here if task 14 has not run yet
- Produces: no export. A script.

Behaviour:

1. Open `data/steady-stack.db`, apply migrations.
2. `await syncNavs(db, createYahooProvider(), { today: today() })`.
3. Print one line per fund. Figures in Spanish typography, and this output is developer-facing so
   its words are English:
   - `world      synced      2026-08-06 → 2026-08-07   3 received, 3 new, 0 updated`
   - `emerging   skipped     no provider symbol — choose one on the funds screen`
4. `--materialise` as an optional argument: after syncing, run
   `materialiseContributions(db, { throughMonth: monthOf(today()) })` and print how many purchases
   were created and which months were skipped, with the reason.
5. Close the database. Exit 1 if any fund ended in an error.

- [ ] **Step 1: Write the script and the package.json entry**

Add `"sync:nav": "tsx scripts/sync-nav.ts"`.

- [ ] **Step 2: Verify it against a fund with no symbol**

```sh
rm -f data/steady-stack.db* && pnpm db:seed && pnpm sync:nav
```
Expected: both funds report `skipped … no provider symbol`, exit code 0, and **no network request is
made** — there is no symbol to ask about. That is the one end-to-end run of this script that works
offline, which is why it is the one in the plan.

- [ ] **Step 3: Verify it against the real API, by hand, once**

```sh
sqlite3 data/steady-stack.db "update fund set provider_symbol = '0P0001CLDK.F' where id = 'world'"
sqlite3 data/steady-stack.db "update fund set provider_symbol = '0P00012I6A.F' where id = 'emerging'"
pnpm sync:nav
pnpm sync:nav
sqlite3 data/steady-stack.db "select fund_id, count(*), min(date), max(date) from nav group by fund_id"
```
Expected: the first run reports hundreds of NAVs received, the second reports 0 new, and the counts
after both runs are identical. **Paste the real output into the task record** — this is the
idempotency of spec section 9 demonstrated against the live API, not against a fixture.

If there is no network, say so and leave this step unchecked; step 2 and task 9's tests already
cover the logic.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-nav.ts package.json README.md
git commit -m "pnpm sync:nav

Section 9 of the spec asks for a button and a script; this is the script.
It syncs only the missing days and can be run as often as wanted, and
with --materialise it also turns the contributions whose month has
arrived into purchases."
```

---

# Phase 4 — The read model

**Ends in something checkable:** given a seeded database with known NAVs, the services return the
exact figures the dashboard will render — value, gain, XIRR, and a 301-month series per scenario.

## Task 12: Real valuation, the portfolio series and XIRR

**Files:**
- Create: `server/services/read-model.ts`
- Create: `server/services/read-model.test.ts`

**Interfaces:**
- Consumes: `valuate` from `~~/core/valuation`, `xirr` from `~~/core/returns`, `monthRange` from
  `~~/core/months`, `lastDayOfMonth`/`monthOf` from `~~/core/dates`, the queries of `../db/`
- Produces:
  - `interface FundPositionView extends FundPosition { name: string; navDate: IsoDate }`
  - `function currentValuation(db: AppDatabase, asOf: IsoDate, portfolioId?: string): { valuation: Valuation; byFund: FundPositionView[]; navDate: IsoDate | null }`
  - `function portfolioSeries(db: AppDatabase, months: Month[], asOf: IsoDate, portfolioId?: string): Array<Cents | null>`
  - `function portfolioXirr(db: AppDatabase, valueNow: Cents, asOf: IsoDate, portfolioId?: string): number | null`

Rules:

- `currentValuation` values each fund at **its own latest NAV**, found with
  `latestNavOnOrBefore(db, fundId, asOf)`. The returned `navDate` is the **oldest** of those
  per-fund dates: it is the date at which the whole figure is honest, and the dashboard shows it
  (spec section 6, publication lag). Per-fund dates come back in `byFund` so the funds screen can
  show each one.
- A fund holding units with no NAV at all makes `valuate` throw. Catch it here and rethrow as
  `NotFoundError` with `No NAV available for fund "<id>" on or before <asOf>` — the route turns that
  into a 404 the interface can explain.
- `portfolioSeries` returns, per month, the value of every purchase up to and including
  `lastDayOfMonth(month)` valued at each fund's latest NAV on or before that same day. `null` for a
  month with no purchases yet, and `null` for a month after `monthOf(asOf)`. The chart draws a line
  that stops at today rather than a line that falls to zero.
- `portfolioXirr` builds the flows: one `{ date: purchase.date, amount: -purchase.amount }` per
  purchase, plus `{ date: asOf, amount: valueNow }`. It **returns `null` instead of throwing** when
  `xirr` rejects the input — fewer than two flows, or all of one sign. A brand-new portfolio has no
  rate of return, and that is not an error.

- [ ] **Step 1: Write the failing test**

Create `server/services/read-model.test.ts`. Fixed scenario for the arithmetic, chosen so every
figure can be checked by hand:

```
purchases   world      2026-08-03   160,00 €   NAV 10   16 units
            emerging   2026-08-03    40,00 €   NAV 10    4 units
NAVs today  world  11,00 €   emerging  12,00 €   both on 2026-09-01
```

Expected: `value` 22.400 cents (16 × 11 = 176 € and 4 × 12 = 48 €), `invested` 20.000,
`gain` 2.400, `gainRatio` 0,12. These are the same figures `core/valuation.test.ts` already pins
down, on purpose: if they differ, the mapping between rows and `Purchase` is what broke.

Cases:

1. The valuation above, asserted field by field.
2. `navDate` is the oldest per-fund latest date: give `world` a NAV on 2026-09-01 and `emerging` one
   on 2026-08-29, and expect `'2026-08-29'`.
3. `byFund` carries the fund's `name` and its own `navDate`.
4. An empty portfolio: `{ value: 0, invested: 0, gain: 0, gainRatio: 0, byFund: [] }` and
   `navDate: null`.
5. `portfolioSeries(db, monthRange('2026-07', '2026-10'), '2026-09-15')` returns
   `[null, <august value>, <september value>, null]` — nothing before the first purchase, nothing
   after the month of `asOf`.
6. `portfolioXirr` on a purchase of 100.000 cents on 2021-01-01 valued at 110.000 on 2022-01-01
   returns approximately 0,10 (`toBeCloseTo(0.1, 6)`).
7. `portfolioXirr` with no purchases returns `null`, not a thrown error.
8. `portfolioXirr` with purchases but a current value of 0 returns `null` — every flow is negative.
9. A fund with units but no NAV throws `No NAV available for fund "world" on or before 2026-09-01`.

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `pnpm test server/services/read-model.test.ts`
Expected: FAILS, then 9 tests green.

- [ ] **Step 3: Commit**

```bash
git add server/services/read-model.ts server/services/read-model.test.ts
git commit -m "Value the real portfolio out of the database

Each fund is valued at its own latest net asset value and the dashboard
is told the oldest of those dates, because the figure is only honest as
far back as its stalest input. NAVs publish with about a day of lag, so
that date is almost never today.

An empty portfolio has no rate of return, so portfolioXirr answers null
rather than throwing: nothing to compute is not a failure."
```

---

## Task 13: Scenarios, the dashboard and the remaining views

**Files:**
- Modify: `server/services/read-model.ts`
- Modify: `server/services/read-model.test.ts`

**Interfaces:**
- Consumes: `projectScenario` from `~~/core/scenarios`, `expandContributions` from
  `~~/core/contributions`, `addMonths`/`monthRange` from `~~/core/months`, plus task 12
- Produces:
  - `function horizonMonths(db: AppDatabase, portfolioId?: string): Month[]`
  - `function buildDashboard(db: AppDatabase, asOf: IsoDate, portfolioId?: string): Dashboard`
  - `function buildFundsView(db: AppDatabase, asOf: IsoDate, portfolioId?: string): FundView[]`
  - `function buildContributionsView(db: AppDatabase, from: Month, to: Month, portfolioId?: string): ContributionsView`

Rules:

- `horizonMonths` = `monthRange(firstMonth, addMonths(firstMonth, horizonYears * 12))`. With the
  seeded data that is 2026-07 to 2051-07: **301 months**, the same length
  `core/scenarios.test.ts` already asserts for the 25-year horizon. No rules → `[]`.
- The scenario series come from `projectScenario(contributions, Number(scenario.annualRate),
  months)`. `Number()` and not `parseFloat`: the column is a rate, not money, and `monthlyRate` takes
  a `number`. Only scenarios with `enabled = 1` are projected.
- `series.contributed` is taken from the `contributed` field of the points, which every scenario
  computes identically. Compute it once from the first projected scenario, and when no scenario is
  enabled, from `projectScenario(contributions, 0, months)`.
- Every array in `series` has the same length as `series.months`. Assert it.

- [ ] **Step 1: Write the failing test**

Add to `server/services/read-model.test.ts`:

1. **The horizon is 301 months** on the seeded database: `horizonMonths(db)` has length 301, starts
   at `'2026-07'` and ends at `'2051-07'`.
2. **A shorter horizon shortens the series.** Set `horizonYears` to 10 and get 121 months.
3. **The scenarios come out in the shape the chart wants.** With the three seeded scenarios,
   `buildDashboard(db, '2026-08-31').series.scenarios` has three entries, each with `balance` of
   length 301, and the `optimistic` entry has `annualRate: '0.09'` and `color: 'chart-1'`.
4. **9 % is compounded, not divided.** With a single contribution of 100.000 cents in 2026-07 and
   nothing else, the 9 % scenario's balance twelve months later is `109_000`, and specifically **not**
   `109_381`, which is what `r / 12` would give. Set this up by deleting the seeded 200 €/month rule
   and leaving only a 1.000 € rule for 2026-07 with a `null` override on every later month — or more
   simply, insert a single rule for 2026-07 into an otherwise empty portfolio and add a second rule
   for 2026-08 with amount 0. Whichever is cleaner; the assertion is what matters:
   `series.scenarios.find((s) => s.id === 'optimistic')!.balance[11]` is `109_000`.
5. **A disabled scenario is not projected.** Set `enabled = 0` on `flat` and get two entries.
6. **Every series lines up.** `contributed`, `portfolio` and every `balance` all have
   `series.months.length` entries.
7. **`buildFundsView`** returns both funds with `latestNav`, `units`, `invested` and `value`, and
   `latestNav: null` for a fund with no NAV.
8. **`buildContributionsView('2026-07', '2026-09')`** returns the two seeded rules, no overrides, and
   three months, with `materialised: true` only on months that have a purchase row.
9. **An empty database** returns a dashboard with `value: 0`, `xirr: null`, `navDate: null` and
   `series.months: []` rather than throwing.

- [ ] **Step 2: Run it, watch it fail, implement, watch it pass**

Run: `pnpm test server/services/read-model.test.ts`
Expected: FAILS on the new cases, then all green.

Run: `pnpm test`
Expected: everything green across the three projects.

- [ ] **Step 3: Commit**

```bash
git add server/services/read-model.ts server/services/read-model.test.ts
git commit -m "Assemble the dashboard: real series and theoretical scenarios

The horizon is 301 months, from the first contribution to twenty-five
years later, and every array in the payload has that same length so the
chart can index them side by side.

A test pins the compounding down through the whole read model, not just
in core: 1.000 € at 9 % is 1.090,00 € after twelve months, never the
1.093,81 € that r/12 would produce."
```

---

# Phase 5 — The Nitro routes

**Ends in something checkable:** `pnpm dev` is up and every one of the 26 routes answers the
documented shape to a `curl`, and `pnpm build` completes.

## Task 14: HTTP plumbing

**Files:**
- Create: `server/utils/today.ts`
- Create: `server/utils/errors.ts`
- Create: `server/utils/validation.ts`
- Create: `server/utils/validation.test.ts`
- Create: `server/utils/http.ts`
- Create: `server/utils/database.ts`

**Interfaces:**

`server/utils/today.ts` — the only place in the codebase that reads the clock:

```ts
/** The current date as `YYYY-MM-DD`, in UTC. The one place the clock is read. */
export function today(): IsoDate
```

`server/utils/errors.ts`:

```ts
export class ValidationError extends Error { readonly statusCode = 400 }
export class NotFoundError extends Error { readonly statusCode = 404 }
export class ConflictError extends Error { readonly statusCode = 409 }
```

`server/utils/validation.ts` — hand-rolled, importing nothing but `./errors` and the core types.
There is no schema library in this project and none is added: the checks that matter here are
`Number.isInteger` over cents and a regular expression over a decimal string, which no generic
validator does better, and adding a dependency for eight functions is not worth the install.

```ts
export function readString(body: unknown, field: string): string
export function readOptionalString(body: unknown, field: string): string | undefined
export function readCents(body: unknown, field: string): Cents
export function readNullableCents(body: unknown, field: string): Cents | null
export function readMonth(body: unknown, field: string): Month
export function readIsoDate(body: unknown, field: string): IsoDate
export function readDecimalString(body: unknown, field: string): string
export function readTiming(body: unknown, field: string): Timing
export function readWeights(body: unknown, field: string): Weight[]
export function readBoolean(body: unknown, field: string): boolean
```

Each throws `ValidationError`. Message shapes, fixed:

- `Field "amount" is required`
- `Field "amount" must be an integer number of cents, received 160.5`
- `Field "fromMonth" must be a month in the format YYYY-MM, received "2026-8"`
- `Field "date" must be a date in the format YYYY-MM-DD, received "03/08/2026"`
- `Field "nav" must be a decimal string, received 14.8321` — a JSON **number** in a NAV field is
  rejected, not coerced. That is the rule of section 7 of the spec enforced at the door.
- `Field "timing" must be "start" or "end", received "middle"`
- `Field "weights" must add up to 1, they add up to 0.9`

`readDecimalString` accepts `/^-?\d+(\.\d+)?$/` and nothing else. No `parseFloat`, ever.

`server/utils/http.ts` — the only module outside `server/api/` allowed to use a Nitro auto-import:

```ts
/** Runs `fn` and turns a domain error into the H3 error with the right status. */
export async function handle<T>(fn: () => T | Promise<T>): Promise<T>
```

It catches `ValidationError`, `NotFoundError`, `ConflictError` and `PriceProviderError` (502) and
rethrows through the auto-imported `createError`. Anything else goes up untouched and becomes a 500.

`server/utils/database.ts`:

```ts
/** The process-wide database. Opens data/steady-stack.db and migrates it on first use. */
export function useDatabase(): AppDatabase
```

A module-level singleton. It calls `applyMigrations` once, so `pnpm dev` on a clean checkout works
with no manual step.

- [ ] **Step 1: Write the failing validation test**

Create `server/utils/validation.test.ts`. At minimum, one accepting case and one rejecting case per
function, with the exact messages above. Do not test `http.ts` or `database.ts`: the first depends on
a Nitro auto-import and the second on the real database file. Both are covered by the curl checks of
task 17.

- [ ] **Step 2: Run it, watch it fail, implement all six files, watch it pass**

Run: `pnpm test server/utils/validation.test.ts`
Expected: FAILS, then green.

- [ ] **Step 3: Verify nothing outside `api/` and `http.ts` leans on Nitro**

```sh
grep -rnE "from '(h3|ofetch|nuxt|#imports)'" server/db server/providers server/services server/utils scripts core
```
Expected: **no output**.

```sh
grep -rn "createError" server/db server/providers server/services scripts core
```
Expected: **no output**. Auto-imports do not exist in Vitest or under `tsx`, and this is what keeps
those modules loadable there.

- [ ] **Step 4: Commit**

```bash
git add server/utils scripts
git commit -m "HTTP plumbing: clock, errors, validation and the database singleton

Validation is hand-rolled rather than pulled from a schema library: the
checks that matter are Number.isInteger over cents and a regular
expression over a decimal string, and a NAV arriving as a JSON number is
rejected instead of coerced.

Only server/api/ and server/utils/http.ts touch Nitro auto-imports.
Everything under db/, providers/ and services/ is loaded unchanged by
Vitest and by tsx, where those auto-imports do not exist."
```

---

## Task 15: Read routes

**Files:**
- Create: `server/api/portfolio.get.ts`
- Create: `server/api/dashboard.get.ts`
- Create: `server/api/funds/index.get.ts`
- Create: `server/api/nav/index.get.ts`
- Create: `server/api/contributions/index.get.ts`
- Create: `server/api/purchases/index.get.ts`
- Create: `server/api/scenarios/index.get.ts`
- Delete: `server/api/.gitkeep`

Routes 1, 3, 4, 9, 12, 18 and 23 of the surface table.

Every handler is the same four lines: read the query with the validators, call one function from
`read-model.ts` or `queries.ts`, return it, all wrapped in `handle()`. No logic in a handler — if a
handler needs an `if` about the domain, it belongs in a service.

```ts
export default defineEventHandler(async (event) => handle(async () => {
  const asOf = getQuery(event).asOf ? readIsoDate(getQuery(event), 'asOf') : today()
  return buildDashboard(useDatabase(), asOf)
}))
```

- [ ] **Step 1: Write the seven handlers**

- [ ] **Step 2: Verify with a real request**

Prepare a database with data:

```sh
rm -f data/steady-stack.db* && pnpm db:seed
sqlite3 data/steady-stack.db "insert into nav (fund_id, date, value, source) values ('world','2026-08-03','10','manual'),('emerging','2026-08-03','10','manual'),('world','2026-09-01','11','manual'),('emerging','2026-09-01','12','manual')"
```

Start the server in another terminal with `pnpm dev`, then:

```sh
curl -sS --fail-with-body http://localhost:3000/api/portfolio | jq -c
```
Expected: `{"id":"index","name":"Cartera indexada","currency":"EUR","horizonYears":25,"firstMonth":"2026-07"}`

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/purchases' | jq -c
```
Expected: `[]` — nothing has been materialised yet.

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/dashboard?asOf=2026-09-01' \
  | jq -c '{navDate, value: .valuation.value, xirr, months: (.series.months | length), scenarios: [.series.scenarios[].id]}'
```
Expected: `{"navDate":"2026-09-01","value":0,"xirr":null,"months":301,"scenarios":["flat","moderate","optimistic"]}`

The value is 0 because there are still no purchases; the 301 months and the three scenarios are the
point of this check.

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/contributions?from=2026-07&to=2026-09' | jq -c '{rules: (.rules|length), months: [.months[] | [.month, .amount]]}'
```
Expected: `{"rules":2,"months":[["2026-07",200000],["2026-08",20000],["2026-09",20000]]}`

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/nav?fundId=world&from=2026-08-01&to=2026-08-31' | jq -c
```
Expected: `{"fundId":"world","navs":[{"date":"2026-08-03","value":"10","source":"manual"}]}`

```sh
curl -sS --fail-with-body http://localhost:3000/api/funds | jq -c '[.[] | {id, latestNav: .latestNav.date, units}]'
```
Expected: `[{"id":"emerging","latestNav":"2026-09-01","units":"0.000000"},{"id":"world","latestNav":"2026-09-01","units":"0.000000"}]`

```sh
curl -sS --fail-with-body http://localhost:3000/api/scenarios | jq -c '[.[].id]'
```
Expected: `["flat","moderate","optimistic"]`

```sh
curl -sS -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/dashboard?asOf=nonsense'
```
Expected: `400`.

- [ ] **Step 3: Commit**

```bash
git rm --cached server/api/.gitkeep
rm -f server/api/.gitkeep
git add server/api
git commit -m "Read routes for the four screens

Every handler reads the query, calls one service and returns it. The
domain logic stays in server/services, where it is tested against a
temporary SQLite file instead of over HTTP."
```

---

## Task 16: Write routes

**Files:**
- Create: `server/api/portfolio.patch.ts`
- Create: `server/api/funds/index.post.ts`, `server/api/funds/[id].patch.ts`, `server/api/funds/[id].delete.ts`
- Create: `server/api/nav/index.put.ts`
- Create: `server/api/contributions/rules/index.post.ts`, `.../rules/[id].patch.ts`, `.../rules/[id].delete.ts`
- Create: `server/api/contributions/overrides/[month].put.ts`, `.../overrides/[month].delete.ts`
- Create: `server/api/purchases/index.post.ts`, `server/api/purchases/[id].patch.ts`, `server/api/purchases/[id].delete.ts`
- Create: `server/api/scenarios/index.post.ts`, `server/api/scenarios/[id].patch.ts`, `server/api/scenarios/[id].delete.ts`

Routes 2, 5, 6, 7, 10, 13, 14, 15, 16, 17, 19, 20, 21, 24, 25 and 26.

Rules that are not obvious from the table:

- **`PATCH /api/contributions/rules/:id` refuses a body carrying `fromMonth`**, with 400 and the
  message `A rule's start month cannot be changed. Add a new rule with its own fromMonth instead`.
  Section 4 of the spec: editing a rule must never rewrite the past.
- **`POST /api/contributions/rules` answers 409** when the month is taken, catching the unique index
  violation and rethrowing as `ConflictError`: `A contribution rule already governs "2026-08"`.
- **`DELETE /api/funds/:id` answers 409** when the fund has purchases:
  `Fund "world" has 12 purchases and cannot be deleted`. Deleting it would orphan a historical fact.
- **`PUT /api/nav`** always writes `source: 'manual'` and always overwrites. That is the override
  channel of spec section 6, and the next sync will not undo it.
- **`POST /api/purchases`** computes `units` from `amount` and `nav` when the body omits it, using
  the same six-place `ROUND_HALF_UP` as `buildPurchases`. Extract that division into a small exported
  helper in `core/purchases.ts` — `unitsFor(amountCents: Cents, nav: string): string` — and have
  `buildPurchases` call it, so the two paths cannot drift. Add a test for it in
  `core/purchases.test.ts`: `unitsFor(16_000, '14.8321')` is `'10.787414'`.
- **Every write answers with the row it wrote**, so the interface never has to refetch to learn an
  id.

- [ ] **Step 1: Add `unitsFor` to `core/purchases.ts` under TDD**

Run: `pnpm test core/purchases.test.ts` — red on the new case first, then green. `buildPurchases`
must keep its seven existing tests passing unchanged.

- [ ] **Step 2: Write the sixteen handlers**

- [ ] **Step 3: Verify with real requests**

With `pnpm dev` running against the database from task 15:

```sh
curl -sS --fail-with-body -X PATCH http://localhost:3000/api/portfolio \
  -H 'content-type: application/json' -d '{"horizonYears":10}' | jq -c
```
Expected: `{"id":"index","name":"Cartera indexada","currency":"EUR","horizonYears":10,"firstMonth":"2026-07"}`

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/dashboard?asOf=2026-09-01' | jq '.series.months | length'
```
Expected: `121`. Then set it back to 25.

```sh
curl -sS --fail-with-body -X PATCH http://localhost:3000/api/funds/world \
  -H 'content-type: application/json' -d '{"providerSymbol":"0P0001CLDK.F"}' | jq -c .providerSymbol
```
Expected: `"0P0001CLDK.F"`

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X PATCH http://localhost:3000/api/contributions/rules/1 \
  -H 'content-type: application/json' -d '{"fromMonth":"2026-01"}'
```
Expected: `400`.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/contributions/rules \
  -H 'content-type: application/json' \
  -d '{"fromMonth":"2026-08","amount":30000,"timing":"start","weights":[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]}'
```
Expected: `409` — 2026-08 is already governed by a seeded rule.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/contributions/rules \
  -H 'content-type: application/json' \
  -d '{"fromMonth":"2027-01","amount":30000.5,"timing":"start","weights":[{"fundId":"world","weight":1}]}'
```
Expected: `400` — 30000,5 is not an integer number of cents.

```sh
curl -sS --fail-with-body -X PUT http://localhost:3000/api/contributions/overrides/2026-10 \
  -H 'content-type: application/json' -d '{"amount":null,"note":"mes sin liquidez"}' | jq -c
curl -sS --fail-with-body 'http://localhost:3000/api/contributions?from=2026-09&to=2026-11' | jq -c '[.months[].month]'
```
Expected: `["2026-09","2026-11"]` — October is gone from the series.

```sh
curl -sS --fail-with-body -X POST http://localhost:3000/api/purchases \
  -H 'content-type: application/json' \
  -d '{"fundId":"world","month":"2026-08","date":"2026-08-03","amount":16000,"nav":"14.8321"}' | jq -c
```
Expected: `units` is `"10.787414"` and `source` is `"manual"`.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/purchases \
  -H 'content-type: application/json' \
  -d '{"fundId":"world","month":"2026-08","date":"2026-08-03","amount":16000,"nav":14.8321}'
```
Expected: `400` — a NAV as a JSON number is rejected, not coerced.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3000/api/funds/world
```
Expected: `409` — the fund now has a purchase.

- [ ] **Step 4: Commit**

```bash
git add core/purchases.ts core/purchases.test.ts server/api
git commit -m "Write routes for funds, contributions, purchases and scenarios

Changing a rule's start month is a 400: a new rule is added with its own
fromMonth and the previous one keeps governing the months before it. A
NAV arriving as a JSON number is a 400 too, rather than being coerced
into a float.

unitsFor moves out of buildPurchases so a purchase recorded by hand
divides by the net asset value exactly the way a materialised one does."
```

---

## Task 17: Action routes — resolve, sync, materialise

**Files:**
- Create: `server/api/funds/resolve.get.ts`
- Create: `server/api/nav/sync.post.ts`
- Create: `server/api/purchases/materialise.post.ts`

Routes 8, 11 and 22. These three are the ones that reach outside the process, and they are why the
project is Nuxt and not plain Vue: the Yahoo API sends no `Access-Control-Allow-Origin` header, so
the browser cannot call it and Nitro is the proxy.

- `GET /api/funds/resolve?isin=` calls `createYahooProvider().resolve(isin)` and returns the
  candidates untouched, in order. It never picks one and it never writes to the database. A
  `PriceProviderError` becomes a 502 through `handle()`, so a Yahoo outage is legible as somebody
  else's failure.
- `POST /api/nav/sync` calls `syncNavs(useDatabase(), createYahooProvider(), { today: today(),
  fundIds })`. This is the button of spec section 9. Idempotent, because the service is.
- `POST /api/purchases/materialise` calls `materialiseContributions(useDatabase(), { throughMonth:
  body.throughMonth ?? monthOf(today()) })`.

- [ ] **Step 1: Write the three handlers**

- [ ] **Step 2: Verify the two offline ones**

```sh
curl -sS --fail-with-body -X POST http://localhost:3000/api/purchases/materialise \
  -H 'content-type: application/json' -d '{"throughMonth":"2026-08"}' | jq -c
```
With the NAVs of task 15 in place at 10 € for both funds on 2026-08-03, expected: two purchases
created, `world` with `amount: 16000` and `units: "16.000000"`, `emerging` with `amount: 4000` and
`units: "4.000000"`. Run it again and expect `created: []` with 2026-08 skipped as
`already-materialised`.

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/dashboard?asOf=2026-09-01' \
  | jq -c '{value: .valuation.value, invested: .valuation.invested, gain: .valuation.gain, gainRatio: .valuation.gainRatio}'
```
Expected: `{"value":22400,"invested":20000,"gain":2400,"gainRatio":0.12}` — 176 € of world plus 48 €
of emerging against 200 € paid in, that is +24,00 € and +12 %. The same figures as
`core/valuation.test.ts`, now travelling through the database and over HTTP.

```sh
curl -sS --fail-with-body -X POST http://localhost:3000/api/nav/sync \
  -H 'content-type: application/json' -d '{"fundIds":["emerging"]}' | jq -c
```
With `emerging` still lacking a symbol, expected:
`{"funds":[{"fundId":"emerging","status":"skipped","reason":"no-symbol"}]}` — and no network call.

- [ ] **Step 3: Verify the two online ones, by hand, once**

```sh
curl -sS --fail-with-body 'http://localhost:3000/api/funds/resolve?isin=IE00BYX5NX33' | jq -c '[.[] | {symbol, price}]'
```
Expected: at least two candidates with different prices. Paste the real output into the task record:
it is the live demonstration of why resolution never picks.

```sh
curl -sS --fail-with-body -X POST http://localhost:3000/api/nav/sync -H 'content-type: application/json' -d '{}' | jq -c
curl -sS --fail-with-body -X POST http://localhost:3000/api/nav/sync -H 'content-type: application/json' -d '{}' | jq -c
```
Expected: the first reports hundreds inserted, the second reports 0 inserted. If there is no
network, leave this step unchecked and say so.

- [ ] **Step 4: Commit**

```bash
git add server/api/funds/resolve.get.ts server/api/nav/sync.post.ts server/api/purchases/materialise.post.ts
git commit -m "Routes for resolving an ISIN, syncing and materialising

These three are why the project runs on Nitro: the Yahoo API answers
without an Access-Control-Allow-Origin header, so the browser cannot call
it and the server has to. A provider failure comes back as a 502, so an
outage at Yahoo reads as somebody else's problem rather than ours."
```

---

## Task 18: Closing verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `CLAUDE.md` (the *Current state* section, and any new gotcha this plan paid for)
- Modify: `docs/superpowers/plans/2026-08-07-persistencia-y-red.md` (tick the boxes)

- [x] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: green across `core`, `server` and `app`. Record the real count.

362 tests passing across 22 files.

- [x] **Step 2: Typecheck and build**

Run: `pnpm typecheck`
Expected: exit 0.

Run: `pnpm build`
Expected: exit 0. **If it fails on `better-sqlite3`**, it is the native module being bundled instead
of externalised; the fix is `nitro: { externals: { external: ['better-sqlite3'] } }` in
`nuxt.config.ts`. Add it only if the build actually fails, and write the reason next to it.

`pnpm typecheck` and `pnpm build` both exited 0, unmodified — `better-sqlite3` was already
externalised (it appears in `.output/server/package.json` and `.output/server/node_modules`, not
bundled into a chunk), so the `nuxt.config.ts` fallback above was not needed.

Starting the built output uncovered a real gap in the `process.cwd()` migrations fallback from
task 15: `node .output/server/index.mjs` from the project root serves `GET /api/portfolio` with
HTTP 200, but the same binary started from an unrelated working directory throws
`Can't find meta/_journal.json file` on every database-backed route and, worse, creates a stray
empty database file under that directory's own `data/`, because `DATABASE_FILE` in
`server/utils/database.ts` is the same kind of `cwd`-relative path. See `TODO.md`.

- [x] **Step 3: Run the purity and precision checks**

```sh
grep -rE "from '(nuxt|drizzle|h3|ofetch|better-sqlite3)" core/
```
Expected: no output. `core/` is still pure.

```sh
grep -rn "parseFloat" core/ server/ scripts/
```
Expected: no output.

```sh
grep -rniE '\breal\b' server/db/migrations/*.sql
```
Expected: no output.

```sh
grep -rn "/ 12" server/ scripts/
```
Expected: no output. The monthly rate is only ever obtained by calling `monthlyRate`.

```sh
grep -rnE "https?://" server/**/*.test.ts
```
Expected: no output. No test reaches the network.

```sh
grep -rnE "from '(h3|ofetch|nuxt|#imports)'" server/db server/providers server/services scripts core
```
Expected: no output.

All six checks ran with no output.

- [x] **Step 4: Verify a clean checkout comes up**

```sh
rm -f data/steady-stack.db* && pnpm db:seed && pnpm dev
```
Then `curl -sS http://localhost:3000/api/portfolio`. Expected: HTTP 200 with the seeded portfolio,
with no manual migration step in between.

Confirmed — HTTP 200 with `{"id":"index","name":"Cartera indexada", ...}` off a database wiped and
reseeded moments earlier, dev server on port 3001 (3000 was held by an unrelated process on this
machine).

- [x] **Step 5: Update the documentation**

- `README.md`: document `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm sync:nav` and
  `pnpm capture:fixtures`, and say that `data/steady-stack.db` is created on first run and is
  gitignored.
- `TODO.md`: strike the *`pnpm sync:nav` is specified but not written* item, and replace the *Next
  up* section with what plan 3 will cover.
- `CLAUDE.md`, *Current state*: the persistence layer and the network are done, with the real test
  count. Add to *Gotchas already paid for* anything this plan discovered — at minimum, that
  `foreign_keys` has to be set per connection in SQLite, and that `h3` is not resolvable from the
  root `node_modules` under pnpm, which is why only `server/api/` and `server/utils/http.ts` use
  Nitro auto-imports.

- [x] **Step 6: Commit**

```bash
git add README.md TODO.md CLAUDE.md docs/superpowers/plans/2026-08-07-persistencia-y-red.md
git commit -m "Close the persistence and network plan"
```

---

## Closing verification

When the eighteen tasks are done, all of this must hold:

- [x] `pnpm test` green across the three projects — 362 passing, 22 files
- [x] `pnpm typecheck` exits 0
- [x] `pnpm build` exits 0
- [x] `pnpm db:seed` twice leaves 1 portfolio, 2 funds, 2 rules and 3 scenarios
- [x] `pnpm sync:nav` twice leaves the `nav` table with the same number of rows — 27 + 27 = 54
      both times, against real Yahoo data
- [x] `POST /api/purchases/materialise` twice creates the purchases once — 4 created on the first
      call, 0 on the second, both months reported `already-materialised`
- [x] No test opens a network socket
- [x] No test writes to `data/steady-stack.db`
- [x] `core/` imports nothing from Nuxt, Drizzle, h3, ofetch or better-sqlite3
- [x] No `REAL` column in the migrations, no `parseFloat` in `core/`, `server/` or `scripts/`

## What this plan leaves out

| Pending | Plan |
|---|---|
| The four screens of section 8 of the spec | 3 |
| `<EvolutionChart>` over Unovis | 3 |
| Component tests with `@vue/test-utils` on happy-dom | 3 |
| Spanish formatting of figures in the interface (`1.090,00 €`, `9 %`) | 3 |
| Choosing the symbol from the candidate list, in the interface | 3 |
| The NAV refresh button | 3 |
| The typography decision deferred in `TODO.md` | 3 |
