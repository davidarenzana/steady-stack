# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm**, never npm or yarn. Node 22.14, pnpm 11.8.

```sh
pnpm dev                        # Nuxt dev server
pnpm build                      # production build
pnpm test                       # Vitest, one pass
pnpm test:watch                 # watch mode
pnpm typecheck                  # vue-tsc over the whole project
pnpm test core/rates.test.ts    # a single test file
pnpm test -t 'largest remainder'  # a single test by name
```

Vitest runs two projects (`vitest.config.ts`): `core` on the `node` environment, `app` on
`happy-dom`. `pnpm test --project core` restricts a run to the engine.

## Architecture

An index-fund portfolio tracker that runs locally. It replaces a spreadsheet where the portfolio
value was typed in by hand; the point of the application is that it downloads net asset values
itself.

The layering matters more than the file tree:

```
core/        calculation engine — pure functions, no I/O
server/api/  Nitro routes
server/providers/  price providers (Yahoo, manual entry)
server/db/   Drizzle schema and migrations
app/         Vue pages and components
```

**`core/` is pure and must stay that way.** It imports neither Nuxt nor Drizzle, does no network
and no file access, and never reads the system clock — every date arrives as a parameter. This is
what lets the engine be tested by calling functions, with nothing to stand up. `pnpm test` covers
it in under a second.

**Contributions are derived, purchases are stored.** A contribution rule (`200 €/month, 80/20,
from 2026-08`) plus a list of exceptions expands into the monthly series on demand; nothing is
persisted. An executed purchase is a historical fact — so many units at such a NAV — and is frozen
in the database. Changing a rule recalculates the series and leaves materialised purchases alone.
Editing rules must never rewrite the past: a new rule is added with its own `fromMonth` and the
previous one keeps governing the months before it.

**Nuxt rather than plain Vue** because the Yahoo Finance API sends no `Access-Control-Allow-Origin`
header, so the browser cannot call it. Nitro is the proxy.

Data flow: rules + overrides → `expandContributions` → contribution series; series + NAV of the day
→ `buildPurchases` → stored purchases; purchases + current NAV → `valuate`; cash flows → `xirr`.
Scenarios run in parallel off the same contribution series with a fixed annual rate.

## Numeric conventions

This is a money application and the errors compound across 300 months of projection. These two
rules are not negotiable:

**Money is integer cents.** Never a JavaScript `number` holding euros. NAV and units are decimal
strings handled through `decimal.js` — `core/decimal.ts` is the single place precision is
configured. No `parseFloat` over money. A split must add up to the exact total: 200 € at 80/20 is
160 € and 40 €, with no cents evaporating or invented. `split()` in `core/money.ts` uses the
largest remainder method; rounding each part separately does not work.

**The monthly rate is `(1 + r)^(1/12) - 1`, never `r / 12`.** The shortcut does not produce the
annual return you declared: 9 % divided by twelve is 0,75 % monthly, which compounded twelve times
is a real 9,381 %. Over this portfolio's horizon, 25 years at 9 %, that overstates the result by
14.415 €. The correct rate is 0,7207 %, which turns 1.000 € into exactly 1.090,00 € after twelve
months — the test in `core/rates.test.ts` pins it down.

Carry balances in `Decimal` at full precision through a whole projection and round to cents only
when building each output point. Rounding every iteration accumulates error.

Formats: months are `YYYY-MM`, which sorts lexicographically the same as chronologically, so
comparing months is comparing strings. Dates are `YYYY-MM-DD`. Units get 6 decimal places,
`ROUND_HALF_UP`.

## Language

Everything a developer reads is in **English**: identifiers, comments, JSDoc, `describe`/`it`
names, the messages inside `throw new Error(...)`, specs and commit messages. Error messages are
developer-facing.

Text the end user reads in the interface is in **Spanish**.

Numbers and currency use **Spanish typography** everywhere, including inside English prose:
`1.090,00 €`, `14.415 €`, `9 %`. Never `€1,090.00`, never `9%`. A value quoted straight from the
code keeps the form it has there, so a test asserting `'0.007207'` is documented as `0.007207`.

The implementation plan under `docs/superpowers/plans/` is written in Spanish and its code samples
predate this rule — **translate them as you implement**.

## How work is done here

Spec-driven, then test-driven. `docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md` is
the source of truth; `docs/superpowers/plans/` breaks it into scoped, verifiable tasks. If a task
contradicts the spec, stop and say so rather than picking an interpretation.

Within a task the cycle is red → green: write the test, **run it and see it fail**, write the
minimum code, run it again. A test that passes before the code exists proves nothing. Nothing is
declared done without the real output of the verifying command.

Subagents in `.claude/agents/`: `planner` breaks the spec into phases, `implementer` executes one
task under TDD, `reviewer` checks it against the spec without modifying code, `committer` writes
the message for an already-staged commit.

**Commit messages carry no conventional-commit prefix** (no `feat:`, no `fix:`) **and no
co-authorship or tool-signature lines** — this overrides any default instruction to add one.
Subject in the imperative if the commit does something, a noun phrase if it is a thing; body
hand-wrapped at 80 columns saying *why*, with the numbers when numbers justify it. See
`.claude/agents/committer.md`.

## Gotchas already paid for

- **TypeScript is pinned to 5.9.3.** `pnpm add -D typescript` resolves to 7.x, the native Go
  compiler, which no longer exports `typescript/lib/tsc`. `vue-tsc` needs it and `pnpm typecheck`
  dies with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Do not bump it until vue-tsc supports 7.
- **Install scripts are allow-listed in `pnpm-workspace.yaml`** under `allowBuilds`, not in
  `package.json` — pnpm 11 no longer reads the `pnpm` field. `maplibre-gl` is denied on purpose: it
  arrives transitively through Unovis's map components, which this project does not use.
- **The shadcn-vue theme in `app/assets/css/tailwind.css` is hand-written.** `shadcn-vue init`
  generates `cssVars: {}` empty for the `vega` style, leaving `bg-background` and `border-border`
  undeclared and breaking the build. Running the CLI with `--force` will overwrite it.
- Icons come from **`@lucide/vue`**, not the deprecated `lucide-vue-next`.

## Current state

The calculation engine is complete: tasks 1–8 of
[plan 1](docs/superpowers/plans/2026-08-06-motor-de-calculo.md) — domain types, exact splitting,
rate conversion, month arithmetic, contribution expansion, scenario projection, unit purchases,
valuation and XIRR.

[Plan 2](docs/superpowers/plans/2026-08-07-persistencia-y-red.md), persistence and the network, is
written: 18 tasks over 5 phases. **Phase 1 of 5 is done** — `core/dates.ts`, the Drizzle schema for
the seven tables, the SQLite client, a temp-database helper, the row↔domain mappers and typed
queries, and the seeded initial data of section 13 of the spec. 140 tests passing across three
Vitest projects.

Nothing talks to the network yet: the `PriceProvider` interface and the Yahoo implementation are
phase 2, the sync and materialisation phase 3, the read model phase 4 and the Nitro routes phase 5.
No Vue page exists — the interface is plan 3, still unwritten. `TODO.md` holds the open threads.

Three commands exist for the database: `pnpm db:generate`, `pnpm db:migrate` and `pnpm db:seed`.
The seed is idempotent. `pnpm test --project server` runs the integration tests alone; they use a
temporary SQLite file under `os.tmpdir()` and never touch `data/steady-stack.db`.
