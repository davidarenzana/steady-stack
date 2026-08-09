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
The engine, persistence, the network and the interface are all done.

| | |
|---|---|
| Contribution splitting by weights | done |
| Annual → monthly rate conversion | done |
| Month arithmetic and contribution expansion | done |
| Scenario projection | done |
| Unit purchases, valuation, XIRR | done |
| SQLite schema, mappers and seeded initial data | done |
| NAV download from Yahoo | done |
| Idempotent sync and materialisation into purchases | done |
| Valuation, XIRR and scenario projection off the database | done |
| Nitro API routes | done |
| Route tests over a real Nuxt server | done |
| Formatting and Spanish typography | done |
| Dashboard | done |
| Evolution chart | done |
| Contributions screen | done |
| Funds screen | done |
| Scenarios screen | done |

679 tests passing, none of which opens a network socket — the rule is structural rather than a
convention: the test setup refuses an outbound connection outright. All 26 Nitro routes are
exercised by 100 tests under `test/routes/`, each booting a real Nuxt server against a throwaway
SQLite file, so "verified once by hand with `curl`" is no longer the only claim the HTTP layer has.

Four screens, in Spanish:

- **Resumen** — what the portfolio is worth, what was paid in, the capital gain in euros and
  percent, the XIRR, and a chart of the real portfolio against the enabled scenarios. A fund holding
  units with no net asset value makes the total unanswerable, and the route says so with a 404
  rather than under-counting.
- **Aportaciones** — the rules in force, the exceptions, and the month-by-month calendar the rules
  expand into, with a button that turns due months into stored purchases. Editing a rule never
  rewrites the past: a new rule is added with its own starting month.
- **Fondos** — the funds with their ISINs, symbols, units and latest prices; ISIN resolution listing
  every share class the provider publishes with its price, so the one matching the statement can be
  chosen; a refresh button; and manual entry for a value no provider quotes. A fund without a price
  reads `Sin valoración`, never `0,00 €`.
- **Escenarios** — the theoretical annual rates, their colours, which are drawn, and the projection
  horizon in years.

## Getting started

Requires Node 22.14 and pnpm 11.8.

```sh
pnpm install
pnpm dev            # Nuxt dev server
```

```sh
pnpm test           # one pass with Vitest, all four projects
pnpm test:fast      # core, server and app — the inner loop, about eleven seconds
pnpm test:routes    # the route tests alone
pnpm test:watch     # watch mode
pnpm typecheck      # vue-tsc over the whole project
pnpm build          # production build
```

The `routes` project builds and starts a real Nuxt server once per test file: 100 tests over eight
files, about three and a half minutes, against eleven seconds for the other 579 tests together. That
is why the inner loop has its own script — `pnpm test:fast` skips it — and why `pnpm test` is what
runs before a commit rather than on every save.

```sh
pnpm db:generate    # generate a migration from the Drizzle schema
pnpm db:migrate     # apply pending migrations
pnpm db:seed        # write the initial portfolio; idempotent, run it as often as you like
pnpm sync:nav       # download the missing NAVs from Yahoo; --materialise turns due months into purchases
pnpm capture:fixtures  # record fresh Yahoo responses under server/providers/__fixtures__/recorded
```

The database is a single file, `data/steady-stack.db`, and it is created on first run — `pnpm dev`
or any of the commands above apply pending migrations automatically, so no manual migration step
sits between a clean checkout and a working server. The file is git-ignored; delete it and reseed
whenever you want to start over.

Both paths are relative to the working directory, so **a deployed process that does not start from
the project root has to say where they are**:

```sh
STEADY_STACK_DATABASE_FILE=/srv/steady-stack/data/steady-stack.db \
STEADY_STACK_MIGRATIONS_DIR=/srv/steady-stack/server/db/migrations \
  node /srv/steady-stack/.output/server/index.mjs
```

Without them, a `.output` server started from anywhere but the project root answers 500 on every
database-backed route — `Can't find meta/_journal.json file` — and writes a stray empty database
under whatever directory it was started from. Started from the project root, neither variable is
needed.

`pnpm db:generate` reads the Drizzle schema in `server/db/schema.ts` and writes a new migration
file under `server/db/migrations/` when it has changed; `pnpm db:migrate` applies whatever is
pending. `pnpm db:seed` writes the initial portfolio and fills in its two funds, the contribution
rules and the scenarios; it is idempotent, so running it again changes nothing.

`pnpm sync:nav` asks Yahoo Finance only for the days missing since the last run, so it is safe to run
as often as wanted: a same-day rerun asks the provider for nothing and changes nothing. A fund with no
`provider_symbol` set is reported as skipped rather than queried. Add `--materialise` to also turn
every contribution month that has arrived into stored purchases, once its funds have a NAV to buy at.

`pnpm capture:fixtures` re-downloads the real Yahoo responses the provider's tests replay offline,
under `server/providers/__fixtures__/recorded/`. Only needed when adding a fund with a new provider
symbol or when Yahoo's response shape changes; the test suite never touches the network itself.

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
  — the implementation plan for persistence and the network, complete
- [`docs/superpowers/plans/2026-08-08-interfaz/`](docs/superpowers/plans/2026-08-08-interfaz/)
  — the implementation plan for the interface, eight phases, complete
- [`TODO.md`](TODO.md) — what is still open, and the rulings already made so they are not
  re-litigated

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
