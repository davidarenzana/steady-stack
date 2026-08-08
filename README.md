# Steady Stack

An index-fund portfolio tracker that runs on your own machine: monthly contributions, real return
(XIRR), and 25-year projections against configurable scenarios.

## Why it exists

It replaces a spreadsheet. In that spreadsheet the portfolio value was typed in by hand, adding up
each fund's value looked up on investing.com one at a time. That manual work is the reason the real
data was abandoned after six months.

This application downloads the net asset values itself, so the only thing left to enter is what
actually changes: an extra contribution, a month skipped, a purchase the broker executed at a
different price.

## Status

The calculation engine was built first and tested in isolation, before any database or interface
existed. That is where the risk lives: a misrounded cent compounds across 300 months of projection.
The persistence layer is going in underneath it now.

| | |
|---|---|
| Contribution splitting by weights | done |
| Annual → monthly rate conversion | done |
| Month arithmetic and contribution expansion | done |
| Scenario projection | done |
| Unit purchases, valuation, XIRR | done |
| SQLite schema, mappers and seeded initial data | done |
| NAV download from Yahoo | pending |
| Nitro API routes | pending |
| Interface | pending |

140 tests passing. There is a database and it holds the portfolio; nothing talks to the network yet.

## Getting started

Requires Node 22.14 and pnpm 11.8.

```sh
pnpm install
pnpm dev            # Nuxt dev server
```

```sh
pnpm test           # one pass with Vitest
pnpm test:watch     # watch mode
pnpm typecheck      # vue-tsc over the whole project
pnpm build          # production build
```

```sh
pnpm db:generate    # generate a migration from the Drizzle schema
pnpm db:migrate     # apply pending migrations
pnpm db:seed        # write the initial portfolio; idempotent, run it as often as you like
pnpm sync:nav       # download the missing NAVs from Yahoo; --materialise turns due months into purchases
```

The database is a single file, `data/steady-stack.db`, and it is git-ignored. `pnpm db:seed` creates
it and fills in the portfolio, its two funds, the contribution rules and the scenarios.

`pnpm sync:nav` asks Yahoo Finance only for the days missing since the last run, so it is safe to run
as often as wanted: a same-day rerun asks the provider for nothing and changes nothing. A fund with no
`provider_symbol` set is reported as skipped rather than queried. Add `--materialise` to also turn
every contribution month that has arrived into stored purchases, once its funds have a NAV to buy at.

## Project structure

```
core/           calculation engine — pure functions, no I/O
server/
  api/          Nitro routes
  providers/    price providers (Yahoo, manual entry)
  db/           Drizzle schema and migrations
app/            Vue pages and components
docs/           design spec and implementation plans
.claude/agents/ the subagents this project is built with
```

`core/` imports neither Nuxt nor Drizzle, and it does no network and no file access. It is called
directly from the tests, with nothing to stand up.

## The two conventions that matter

**Money is integer cents.** Never a JavaScript `number`. Net asset values and units are decimal
strings handled with `decimal.js`. A split has to add up to the exact total: 200 € at 80/20 is
160 € and 40 €, with no cents evaporating or being invented.

**The monthly rate is `(1 + r)^(1/12) - 1`, never `r / 12`.** The shortcut does not produce the
annual return you declared. A 9 % annual rate divided by twelve gives 0,75 % monthly, which
compounded twelve times is a real 9,381 % — over this portfolio's horizon, 25 years at 9 %, that
overstates the result by 14.415 €. The correct rate is 0,7207 %, which turns 1.000 € into exactly
1.090,00 € after twelve months.

## Documentation

- [`docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md`](docs/superpowers/specs/2026-08-06-index-fund-tracker-design.md)
  — the design spec, and the source of truth
- [`docs/superpowers/plans/2026-08-06-motor-de-calculo.md`](docs/superpowers/plans/2026-08-06-motor-de-calculo.md)
  — the implementation plan for the calculation engine, complete
- [`docs/superpowers/plans/2026-08-07-persistencia-y-red.md`](docs/superpowers/plans/2026-08-07-persistencia-y-red.md)
  — the implementation plan for persistence and the network, phase 1 of 5 complete

## Conventions

Everything a developer reads is in **English**: code, comments, JSDoc, test names, the messages
inside `throw new Error(...)`, specs and commit messages.

Numbers and currency use **Spanish typography** everywhere, including inside English prose:
`1.090,00 €`, `14.415 €`, `9 %`. The figures are the domain, and they should look the same in a
comment, in the spec and on screen. The exception is a value quoted straight from the code, which
keeps the form it has there, so a test asserting `'0.007207'` is documented as `0.007207`.

Text the end user reads in the interface is in **Spanish**.

Commit messages carry no conventional-commit prefix and no co-authorship line. Section 12 of the
spec has the rest.

## Personal project

Built for one portfolio, running locally, with no users and no authentication. SQLite in a file, no
cloud. Drizzle abstracts the engine, so moving to Postgres later is a driver and a connection
string.
