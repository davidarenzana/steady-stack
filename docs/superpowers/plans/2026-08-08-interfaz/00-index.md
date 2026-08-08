# Implementation plan 3 — The interface

> **For agents:** MANDATORY SUB-SKILL: use `superpowers:subagent-driven-development` (recommended)
> or `superpowers:executing-plans` to run this plan one task at a time. Steps use checkboxes
> (`- [ ]`) for tracking. **Each phase file stands on its own** — an implementer is given one file,
> not the set. This index is for whoever is dispatching the work.

**Goal:** cover the HTTP layer with a real test suite, and then build the four screens of section 8
of the spec — dashboard, contributions, funds, scenarios — on top of the 26 routes plan 2 delivered.
When this plan closes, `pnpm dev` opens an application a person can use: figures in Spanish
typography, an evolution chart overlaying the real portfolio and the theoretical scenarios, and no
raw JSON anywhere.

**Reference spec:** `docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md`, sections 3
(stack), 8 (screens), 11 (test strategy, the interface part), 13 (initial data) and 15 (deferred).

**Previous plans:** `docs/superpowers/plans/2026-08-06-motor-de-calculo.md` (the calculation engine,
in Spanish, tasks 1–8, closed) and `docs/superpowers/plans/2026-08-07-persistencia-y-red.md`
(persistence and the network, tasks 1–18, closed). **Nothing either of them delivered is re-planned
here.** Plan 2's *Two decisions, and why* section tabulates the 26 routes with method, path, request
and response shape; **that table is the contract this plan is written against**, and phase 1 is the
first thing that verifies it automatically.

**Stack:** Node 22.14 · pnpm 11.8 · Nuxt 4.5 / Nitro 2.13 · Vue 3.5 · shadcn-vue 2.8 (over reka-ui
2.10) · Unovis 1.6.7 · Vitest 4.1 · @vue/test-utils 2.4 · happy-dom 20 · @nuxt/test-utils 4.1

---

## Why phase 1 comes before any screen

The count is exact: **26 route files, 0 route test files.** Every route was verified once by hand
with `curl` while plan 2 was built — which is what plan 2's own ending condition asked for — but
"verified once by a human" and "covered by a suite" are different claims, and only the second
survives a refactor. Every screen in phases 3 to 7 reads those routes; if the route surface can
drift silently, every screen built on it is guesswork.

`@nuxt/test-utils` is already a devDependency and its e2e mode runs a **real Nuxt server** as a
subprocess, which resolves `h3` — precisely the resolution problem that confined Nitro auto-imports
to `server/api/**` and `server/utils/http.ts` throughout plan 2. The tests go against that real
server, not against handlers in isolation.

---

## Global constraints

These apply to every task in every phase, without exception. Each phase file repeats the ones it
needs, so an implementer reading a single file is not missing any.

- **Package manager: `pnpm`.** Never `npm`, never `yarn`. TypeScript stays pinned at **5.9.3** —
  `pnpm add -D typescript` resolves to 7.x, the native Go compiler, which no longer exports
  `typescript/lib/tsc`, and `pnpm typecheck` dies with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Language splits by audience.** Everything a developer reads is in **English**: identifiers,
  comments, JSDoc, `describe`/`it` names, `throw new Error(...)` messages, this plan. Everything an
  end user reads on screen is in **Spanish**: labels, headings, buttons, empty states, error
  notices, chart legends.
- **Figures use Spanish typography everywhere**, in interface text and in English prose alike:
  `1.090,00 €`, `14.415 €`, `9 %`, `+231,50 €`. Never `€1,090.00`, never `9%`. Comma as decimal
  separator, point as thousands separator, currency symbol after the figure with a space, space
  before `%`. **This formatting lives in exactly one module, `app/utils/format.ts`** (phase 2). No
  component builds a figure string by hand, no component calls `Intl`, `toFixed` or
  `toLocaleString` directly — phase 8 greps for it.
- **The interface formats; it does not compute.** Money arrives from the API as integer cents; NAV,
  units and annual rates arrive as decimal strings; `gainRatio` and `xirr` are plain numbers. No
  component adds, subtracts, divides or compounds anything. If a screen needs a figure the API does
  not return, **that is a finding about the route surface**, to be recorded in `TODO.md`, not
  licence to do arithmetic in a component. Phase 5 hits exactly that case and handles it that way.
  The single sanctioned exception is `centsToEuros()` inside the chart mapper of phase 4, which
  converts cents to a float purely so Unovis can place a pixel, and is documented as such at its
  definition. Parsing what a person typed — `app/utils/parse.ts`, `app/utils/rate.ts` — goes through
  `Decimal`, never `Number(x) / 100`.
- **`core/` stays pure and untouched.** No file under `core/` is modified by this plan. App code may
  `import Decimal from '~~/core/decimal'` and `import type { ... } from '~~/core/types'`, and may
  call the pure date and month helpers — `core/` imports neither Nuxt nor Drizzle nor the network,
  so it is safe in the browser bundle. App code may **never** import from `server/db/`,
  `server/services/` or `server/providers/` as a value; the only permitted contact with `server/` is
  `import type` for response shapes.
- **Response types are imported, never re-declared.** `app/` gets the shapes of the API with
  type-only imports: `import type { Dashboard, FundView, ContributionsView } from
  '~~/server/services/read-model'`. Type-only imports are erased at compile time and pull nothing
  into the client bundle. A plain `import { ... }` from anywhere under `server/` is a bug.
- **Pages fetch, components render.** Data fetching (`useFetch`, `$fetch`) and Nuxt components
  (`<ClientOnly>`, `<NuxtLink>` outside the navigation) live in `app/pages/*.vue`. Every component
  under `app/components/` takes its data as props, emits events upward, and imports nothing from
  Nuxt. That is what makes them mountable under plain `@vue/test-utils` on happy-dom, per section 11
  of the spec: *given a state, the component renders the right thing*.
- **Icons come from `@lucide/vue`**, never the deprecated `lucide-vue-next`.
- **The shadcn-vue theme in `app/assets/css/tailwind.css` is hand-written.** `shadcn-vue init`
  generates `cssVars: {}` empty for the `reka-vega` style, leaving `bg-background` and
  `border-border` undeclared and breaking the Tailwind 4 build. **Never run `shadcn-vue init`, and
  never pass `--force` to the CLI.** Adding a component is `pnpm dlx shadcn-vue@latest add <name>`,
  and every task that does so verifies afterwards with `git diff --exit-code
  app/assets/css/tailwind.css`.
- **Scenario colours are theme tokens, not hex.** The database stores `chart-1` … `chart-5`; the
  interface resolves them to `var(--chart-N)`, which the theme declares for both light and dark. A
  hex value anywhere in a chart or a legend is a bug.
- **TDD, red → green.** The test is written first and **run to watch it fail** before the
  implementation exists. Phase 1 is a special case — it characterises code that already works — and
  says inside how the red step is honoured there. No task is declared done without the real output
  of its verification command pasted into the report.
- **No test opens a network socket.** The two routes that reach Yahoo are tested only on the paths
  that never get that far (see phase 1). Component tests never fetch.
- **No test touches `data/steady-stack.db`.** Plan 2's rule stands. Phase 1 makes the database file
  configurable by environment variable precisely so the route tests can point a real Nuxt server at
  a throwaway file under `os.tmpdir()`.
- **Formats:** months `YYYY-MM`, dates `YYYY-MM-DD`, units 6 decimal places in the data and 4 on
  screen, NAV 4 decimal places.

---

## The four things section 11 demands, and where they are tested

| Requirement from spec section 11 | Phase | File |
|---|---|---|
| **Formatting**: 2.200 € paid in against 2.431,50 € renders `+231,50 €` and `+10,52 %` | 2 and 3 | `app/utils/format.test.ts`, `app/components/dashboard/HeadlineValuation.test.ts`, `app/components/dashboard/PortfolioSummary.test.ts` |
| **Chart series**: `<EvolutionChart>` receives the real portfolio and the active scenarios | 4 | `app/components/chart/evolution-series.test.ts`, `app/components/chart/EvolutionChart.test.ts` |
| **Empty state**: no contributions recorded renders neither a blank chart nor a `NaN` — and says what to do next | 3 and 4 | `app/components/dashboard/EmptyDashboard.test.ts`, `app/components/dashboard/PortfolioSummary.test.ts`, `app/components/chart/evolution-series.test.ts` |
| **Valuation date**: the screen shows which day the latest available NAV corresponds to | 3 | `app/components/dashboard/HeadlineValuation.test.ts`, `app/components/dashboard/PortfolioSummary.test.ts` |

The empty state is not hypothetical: the seeded database ships with two contribution rules and
**zero purchases**, so it is the *first* thing anyone sees on a clean checkout.

---

## Two inherited findings, and what this plan does about them

Both come from `TODO.md`, *Findings this plan leaves for plan 3*.

**1. `PATCH /api/funds/:id` cannot clear `providerSymbol` back to `null`.** `readOptionalString`
treats an explicit `null` exactly like an absent field, so the funds screen has no way to undo a
wrong share-class choice. **This plan fixes the route** — phase 1, task 1.5 — by adding
`readClearableString` to `server/utils/validation.ts`, which distinguishes absent (`undefined`, leave
alone) from explicit `null` (clear it). `updateFund` in `server/db/queries.ts` already accepts
`providerSymbol: string | null`, so no query change is needed. The funds screen of phase 6 offers
the undo.

**2. `buildFundsView` reports a fund holding units with no NAV as worth `0`**, distinguishable only
through `latestNav: null`. **Ruling: the funds screen never sums `value` across funds and renders no
portfolio total at all.** A fund without a NAV renders the Spanish text `Sin valoración` in its value
cell, not `0,00 €`. The one authoritative total is `GET /api/dashboard`'s `valuation.value`, which
refuses to under-count: `currentValuation` throws `NotFoundError` — a 404 — when a fund holding units
has no NAV, and the dashboard page of phase 3 renders that as an explanation rather than a crash.
The read model is left as it is; this is a screen-level decision, recorded again in `TODO.md` at the
close.

---

## Out of scope

Per section 15 of the spec, and not to be smuggled in: users and authentication, several portfolios
in the interface, comparison against an index at base 100, importing broker statements, deployment.
**End-to-end tests driving a browser are out of v1** — note that the route tests of phase 1 are
server tests over HTTP, not browser tests, so they are in; nothing in this plan installs or uses
`playwright`.

The other findings in `TODO.md` (purchase and rule amounts accepting zero or negative values,
scenario `color` unrestricted at the API, fund `currency` accepting an empty string,
`purchases.date` not future-bounded, the `@types/better-sqlite3` version drift, the duplicated
snapshot-and-diff logic) are **not** fixed here. Phases 5, 6 and 7 constrain what the *interface* can
send — a colour picker offering only the five tokens, an amount input refusing zero, a currency field
refusing empty — and phase 8 records that the API itself is still permissive.

---

## File responsibilities

New files this plan creates, and what each is for. Nothing else gets invented.

| File | Responsibility | Phase |
|---|---|---|
| `server/utils/database.ts` | *(edited)* database file location comes from `STEADY_STACK_DATABASE_FILE` | 1 |
| `server/db/client.ts` | *(edited)* migrations folder overridable with `STEADY_STACK_MIGRATIONS_DIR` | 1 |
| `server/utils/validation.ts` | *(edited)* `readClearableString`, for clearing a field back to `null` | 1 |
| `server/api/funds/[id].patch.ts` | *(edited)* accepts `providerSymbol: null` | 1 |
| `server/test-utils/route-server.ts` | Boots a real Nuxt server with a throwaway database, returns its handle | 1 |
| `test/routes/portfolio.test.ts` … `scenarios.test.ts` | Six files covering all 26 routes | 1 |
| `test/routes/pages.test.ts` | The four screens answer 200 with the right Spanish text, over HTTP | 2, 3, 4, 5, 6, 7 |
| `vitest.config.ts` | *(edited)* the `routes` project; the `app` project given a Vue plugin and aliases | 1, 2 |
| `app/utils/format.ts` | **The only place a figure becomes a string.** Spanish typography | 2, 5 |
| `app/utils/parse.ts` | The boundary where a typed amount becomes exact cents | 5 |
| `app/utils/rate.ts` | `9` ↔ `'0.09'` through `Decimal`, never a float divide | 7 |
| `app/test-utils/fixtures.ts` | `makeDashboard()` for the component tests. Imported by tests only | 3 |
| `app/assets/css/tailwind.css` | *(edited)* the typeface decision in phase 2, the `--positive` semantic token in phase 3 | 2, 3 |
| `app/layouts/default.vue` | Page frame: header, Spanish navigation, content slot | 2 |
| `app/components/AppNav.vue` | The four links: Resumen, Aportaciones, Fondos, Escenarios | 2 |
| `app/components/EmptyState.vue` | Shared empty state: title, description, optional action slot | 2 |
| `app/components/ErrorNotice.vue` | Shared failure notice, in Spanish, with a retry slot | 2 |
| `app/components/PageHeader.vue` | Screen title plus optional actions slot | 2 |
| `app/pages/index.vue` | Dashboard screen, `GET /api/dashboard` | 3, 4 |
| `app/components/dashboard/SummaryCard.vue` | One secondary figure with a label, a hint and a tone | 3 |
| `app/components/dashboard/HeadlineValuation.vue` | The headline: value, gain in € and %, valuation date | 3 |
| `app/components/dashboard/EmptyDashboard.vue` | The designed empty state: the three steps that are missing | 3 |
| `app/components/dashboard/PortfolioSummary.vue` | Value, paid in, gain, XIRR, valuation date, empty state | 3 |
| `app/components/dashboard/FundPositionsTable.vue` | Per-fund units, NAV, value, gain | 3 |
| `app/components/chart/evolution-series.ts` | Pure mapper: `Dashboard` → chart points and series | 4 |
| `app/components/chart/evolution-range.ts` | Pure windowing: which months the chart shows, and the default | 4 |
| `app/components/chart/EvolutionChart.vue` | **The only file that imports Unovis** | 4 |
| `app/pages/aportaciones.vue` | Contributions screen, `GET /api/contributions` | 5 |
| `app/components/contributions/ContributionMonthsTable.vue` | Monthly table with split and materialised badge | 5 |
| `app/components/contributions/RulesList.vue` | Rules in force, with delete | 5 |
| `app/components/contributions/RuleForm.vue` | New rule: month, amount, timing, weights | 5 |
| `app/components/contributions/OverrideForm.vue` | Skip a month, or override its amount | 5 |
| `app/pages/fondos.vue` | Funds screen, `GET /api/funds` | 6 |
| `app/components/funds/FundsTable.vue` | Per-fund identity, symbol, units, value, latest NAV | 6 |
| `app/components/funds/SymbolCandidates.vue` | The share classes an ISIN resolves to. Never picks one | 6 |
| `app/components/funds/AddFundForm.vue` | ISIN, id, name, currency, chosen symbol | 6 |
| `app/components/funds/NavSyncReport.vue` | What the last sync did, per fund, in Spanish | 6 |
| `app/components/funds/ManualNavForm.vue` | Hand-entered NAV for one fund | 6 |
| `app/pages/escenarios.vue` | Scenarios screen, `GET /api/scenarios` + `GET/PATCH /api/portfolio` | 7 |
| `app/components/scenarios/ScenariosTable.vue` | Rate, colour, enabled | 7 |
| `app/components/scenarios/ScenarioForm.vue` | New scenario, colour from the five tokens | 7 |
| `app/components/scenarios/HorizonForm.vue` | Horizon in years | 7 |

---

## The phases

**Phase 1 — [Route tests](01-route-tests.md) (9 tasks).** Makes the database file and the migrations
folder configurable by environment variable, builds a harness that boots a real Nuxt server against
a throwaway SQLite file under `os.tmpdir()`, and writes six route test files covering all 26 routes:
status codes, response shapes, validation failures, conflicts, idempotency, and the invariant that
editing a rule never rewrites an executed purchase. Fixes the inherited `providerSymbol` clearing gap
along the way. Ends with `pnpm test --project routes` green and the route contract of plan 2 asserted
rather than remembered.

**Phase 2 — [Formatting, typography and the shell](02-formatting-and-shell.md) (7 tasks).** Fills
the empty `app` Vitest project with a real Vue setup, writes `app/utils/format.ts` — the single place
a figure becomes a string, built from integers because `Intl.NumberFormat('es-ES')` renders `1090` as
`1090,00` and the spec wants `1.090,00` — and settles the typeface deferred in `TODO.md`, choosing
IBM Plex Sans for its tabular figures. Then the frame: a layout, Spanish navigation across the four
screens, the shared empty and error states, and an HTTP test proving all four routes render. Ends
with an application you can open and navigate.

**Phase 3 — [Dashboard](03-dashboard.md) (7 tasks).** Screen 1 of spec section 8, designed rather
than assembled. The screen answers four questions in order — what is it worth, am I up or down, what
return am I earning, how does reality compare to the theory — so the hierarchy leads with the current
value at display size, the gain in euros and percent directly under it, and the valuation date beside
them; what was paid in and the XIRR are secondary, and the XIRR carries a plain-Spanish label and an
explanation because most people do not know what an internal rate of return is. Two semantic colours
only, gain and loss, never carried by colour alone. The empty state gets its own component and its own
task: a clean checkout has zero purchases and zero net asset values, so it is the *default*
experience, and it tells the user the three steps that are missing instead of saying "no data". Ends
with `/` showing the real figures against a seeded database, asserted over HTTP: 2.200,00 € against
2.000,00 € paid in is `+200,00 €` and `+10,00 %`, valued with data from 03/08/2026.

**Phase 4 — [Evolution chart](04-evolution-chart.md) (5 tasks).** A pure mapper turning a
`Dashboard` into chart points and series descriptors, a pure windowing function, and
`<EvolutionChart>` — the one file in the project allowed to import Unovis, so replacing the charting
library later means touching one file, as section 3 of the spec requires. **The chart does not plot
the whole horizon by default**: 301 months of which two are real is a chart about the projections, so
the default range is reality plus twelve months, with `5 años`, `10 años` and `Todo` one click away —
the reasoning is argued at the top of the phase file. The real line breaks where the data stops and
never falls to the axis, which would read as a total loss. Ends with the chart on the dashboard.

**Phase 5 — [Contributions](05-contributions.md) (7 tasks).** Screen 2: the rules in force, the
one-off exceptions, and the monthly table each rule expands into, with a badge for the months already
materialised into purchases. Adding a rule, deleting one, skipping a month, overriding an amount, and
the materialise button. Two findings about the route surface come out of this phase rather than
being worked around. Ends with `/aportaciones` able to change the plan and see the months change,
while the earlier months stay exactly as they were.

**Phase 6 — [Funds](06-funds.md) (6 tasks).** Screen 3: adding a fund by ISIN with the share-class
candidates listed and never auto-picked, the units and value held, the latest NAV with its date,
`Sin valoración` where there is none, the sync button and its per-fund report, hand-entered NAVs, and
the undo that phase 1 made possible — clearing a wrong `providerSymbol` back to `null`. Ends with
`/fondos` able to download net asset values, which is the point of the whole application.

**Phase 7 — [Scenarios](07-scenarios.md) (6 tasks).** Screen 4: the theoretical rates and the
horizon. A rate typed as `9` becomes the decimal string `'0.09'` through `Decimal`, never a float
divide; colours come from the five theme tokens; enabling and disabling a scenario changes what the
dashboard chart draws. Ends with `/escenarios` steering the chart of phase 4.

**Phase 8 — [Closing](08-closing.md) (3 tasks).** An audit of the invariants this plan claimed — one
Unovis import, no value imports from `server/`, no `Intl` in a component, no hex in a chart — then
the whole suite, `pnpm typecheck`, `pnpm build`, the production server started and exercised from two
different working directories, and `README.md` and `TODO.md` brought up to date with the findings
this plan leaves behind.

**Total: 50 tasks across 8 phases.**
