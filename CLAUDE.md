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

Vitest runs three projects (`vitest.config.ts`): `core` and `server` on the `node` environment,
`app` on `happy-dom`. `pnpm test --project core` restricts a run to the engine, `--project server`
to the integration tests over a temporary SQLite file.

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
task under TDD, `committer` writes the message for an already-staged commit.

**There is no `reviewer` subagent any more, and this supersedes section 12 of the spec.** It was
removed on 2026-08-08 on cost grounds: over plan 2's first seven tasks the review pass was about a
third of the token spend, and the organisation hit its monthly limit mid-phase. What it bought was
real — an independent reviewer caught a temporary-database handle leaking on every setup failure,
and a `nav.source` enum that no code validated after the schema deliberately dropped its `CHECK`
constraints — so removing it is a deliberate trade, not a cleanup. Two things partly cover the gap:

- The `implementer` makes an **adversarial pass over its own work** before reporting, trying to
  break what it just wrote rather than confirming it works.
- The main session verifies each task's claims itself — running the command, reading the artefact —
  instead of accepting the report.

**Pick the cheapest model that can do the task.** Most tasks in a well-written plan are
transcription plus testing, because the plan already carries the code: those go to a cheap tier.
Reserve a stronger model for tasks needing design judgement or spanning several files.

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
- **`foreign_keys` has to be turned on per SQLite connection.** It defaults to off; `openDatabase`
  in `server/db/client.ts` runs `PRAGMA foreign_keys = ON` right after opening, or a purchase could
  reference a fund that does not exist.
- **`h3` is not resolvable from the root `node_modules` under pnpm** — pnpm's strict, non-flat
  layout means a file outside Nitro's own dependency tree cannot `import` it directly, only through
  Nitro's auto-imports. That is why `defineEventHandler`, `createError` and the rest are used only
  under `server/api/` and in `server/utils/http.ts`, and why every other `server/` module — the
  database client, the providers, the services — takes plain values in and returns plain values or
  throws plain `Error` subclasses, leaving the H3 translation to the one file that touches it.
- **`server/db/client.ts`'s `process.cwd()` migrations fallback works for `nuxt dev` and for a
  `.output` build started from the project root, but not from anywhere else.** Verified while
  closing plan 2: `node .output/server/index.mjs` served `GET /api/portfolio` with HTTP 200 from
  the project root, and failed with `Can't find meta/_journal.json file` — plus a stray empty
  database file written under the wrong `data/` — when started from an unrelated directory. Nothing
  yet pins the working directory a deployed process starts from.

## Current state

The calculation engine is complete: tasks 1–8 of
[plan 1](docs/superpowers/plans/2026-08-06-motor-de-calculo.md) — domain types, exact splitting,
rate conversion, month arithmetic, contribution expansion, scenario projection, unit purchases,
valuation and XIRR.

[Plan 2](docs/superpowers/plans/2026-08-07-persistencia-y-red.md), persistence and the network, is
**complete: all 18 tasks over 5 phases.** The Drizzle schema for the seven tables, the SQLite
client, the row↔domain mappers and typed queries, the seeded initial data of section 13 of the
spec, the `PriceProvider` interface and the Yahoo implementation over recorded fixtures, idempotent
NAV sync and materialisation into frozen purchases, the read model that produces the exact figures
a dashboard would render, and all 26 Nitro routes. 362 tests passing across three Vitest projects,
none of them opening a network socket. `pnpm typecheck` and `pnpm build` both exit 0, and the built
`.output` was started and curled for real against `GET /api/portfolio`.

The HTTP layer itself has no automated coverage — 26 route files, 0 route test files, every one
verified by hand with `curl` while implementing plan 2. Route tests with `@nuxt/test-utils` are
phase 1 of plan 3, not an afterthought; see `TODO.md`.

No Vue page exists — the interface is plan 3, still unwritten. `TODO.md` holds the open threads,
including the gap task 18 found in the `process.cwd()` migrations fallback under a production
build started from outside the project root.

Four commands exist for the database: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed` and
`pnpm sync:nav`. The seed is idempotent, and so is a sync rerun — verified by running it twice in a
row against the real Yahoo API with no change in row count. `pnpm test --project server` runs the
integration tests alone; they use a temporary SQLite file under `os.tmpdir()` and never touch
`data/steady-stack.db`.
