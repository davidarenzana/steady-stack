# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Plan 3, the interface, is closed** — all eight phases. Route tests over a real Nuxt server, the
formatting module and the application shell, the dashboard, the evolution chart, and the
contributions, funds and scenarios screens. 679 tests over 58 files across the four Vitest projects,
none of them opening a network socket. `pnpm typecheck` and `pnpm build` exit 0, and a production
`.output` server was started and exercised from the project root and from elsewhere.

**Section 8 of the spec is fully implemented**: four screens, and each does what the spec says it
does. What plan 4 is has not been decided — **section 15 of the spec lists what v2 holds**, and that
is the place to choose from rather than inventing a scope here.

## What has no automated coverage

Worth stating plainly, because the test count above looks like more than it is.

**The pages are exercised only through their server-rendered HTML**, in `test/routes/pages.test.ts`.
Nothing clicks a button: end-to-end browser tests are out of v1 by section 15 of the spec. The forms
are covered as components — the payload each one emits — and the routes those payloads go to are
covered by the route tests, but **the wiring between the two is verified by a person, not by a
machine**. A page that emits the right payload to the wrong URL would pass everything in this
repository.

That is the gap to close first if plan 4 wants more confidence rather than more features.

## Open findings

### The interface refuses what the API still accepts

These four are unchanged at the API. The screens now refuse them, which narrows the exposure without
closing it — the interface being stricter than the route it talks to is the wrong way round for a
rule the database should be enforcing.

- **Purchase and rule amounts still accept zero and negative values.** No validation rejects them.
  `RuleForm` and `OverrideForm` refuse a zero on the client.
- **Scenario `color` is not restricted** to the `chart-1` … `chart-5` tokens the theme declares.
  `ScenarioForm` offers only those five, and a token outside them resolves to no colour at all, so
  the scenario's line silently vanishes from the chart.
- **Fund `currency` accepts an empty string.** `AddFundForm` refuses one.
- **`providerSymbol: ''` is accepted**, on `POST /api/funds` as well as on the `PATCH`, and
  `nav-sync.ts` skips a fund on `providerSymbol === null` only — so an empty string is a symbol as
  far as the sync is concerned and would be sent to Yahoo verbatim. `AddFundForm` omits the field
  rather than sending an empty string, and the table's `Quitar` sends an explicit `null`.
- **`purchases.date` is not future-bounded**, though `nav.date` is. `ManualNavForm` refuses a future
  date for a NAV; nothing refuses one for a purchase.

### The read model and the routes

- **`buildFundsView` reports a fund holding units with no NAV as worth `0`**, distinguishable only
  through `latestNav: null`. ~~If the interface ever sums `value` across funds it will silently
  under-count.~~ Handled at the screen since plan 3, phase 6: **the funds table renders no portfolio
  total and shows `Sin valoración` instead of `0,00 €`**, and the one authoritative total lives on
  the dashboard, where `GET /api/dashboard` answers 404 rather than under-count. The read model
  itself is unchanged, so the trap is still there for the next caller.
- **`GET /api/contributions` returns `rules[].weights` as a serialised JSON string, not a
  `Weight[]`.** The route hands back the Drizzle row and `weights` is a `TEXT` column holding
  `JSON.stringify(Weight[])`. The `months[].weights` of the very same response *is* a real array,
  because it comes from `expandContributions` — so the interface parses one and not the other, which
  is why `parseWeights` exists in `app/utils/parse.ts`. Two shapes for one concept in one payload.
  The fix is for the route to map the row through `toContributionRule`.
- **`GET /api/contributions` gives no per-fund euro split.** A month reports `amount: 20000` and
  `weights: [80 %, 20 %]`, never `16000 / 4000`. Splitting 200 € into 160 € and 40 € is `split()`'s
  largest-remainder arithmetic in `core/money.ts`, and the interface does no arithmetic on money — so
  **the contributions screen shows percentages where a user would rather read euros.** The fix is for
  the read model to return the result of `split()` per month, since that is the canonical split.
- **The snapshot-and-diff logic is duplicated** between `scripts/sync-nav.ts`'s `runSync` and
  `syncNavsWithPartialReport` in `server/services/nav-sync.ts`. A candidate for consolidation.

### Deployment and tooling

- **A `.output` server started outside the project root still fails without two environment
  variables.** Measured for real while closing plan 3: with `STEADY_STACK_DATABASE_FILE` and
  `STEADY_STACK_MIGRATIONS_DIR` set it works from anywhere — `GET /api/portfolio` answering 404 on a
  migrated-but-unseeded database, which is the correct answer — and creates no stray files. Without
  them it answers 500 `Can't find meta/_journal.json file` on every database-backed route and writes
  an empty `data/steady-stack.db` under whatever directory it started from. Plan 3 moved this from
  unavoidable to avoidable, which is a smaller claim than fixing it. The `README.md` documents the
  two variables; nothing enforces them.
- **`@types/better-sqlite3` resolves to `9.6.0`** against the runtime `13.0.3`; no `13.x` types are
  published, so any method added since 9.6.0 is silently typed `any`.

### Carried over from plan 2's phase reviews

Five findings deferred rather than fixed, and still deferred:

- `core/dates.ts` has no test for out-of-range components (`2026-13-01`, `2026-01-32`). The code
  does reject them, through the round-trip check — it is a missing test, not a bug.
- The schema carries **no `CHECK` constraints** by design, so the four enum columns are enforced
  only by the mappers in `server/db/mappers.ts`. A raw `INSERT` from a future migration bypasses
  them silently.
- In `server/test-utils/temp-db.ts`, if `handle.close()` itself throws inside the cleanup `catch`,
  it would mask the original error.
- `openDatabase` used outside the temp helper leaves `-wal`/`-shm` sidecar files next to a real
  database.
- `assertTiming`, `assertPurchaseSource` and `assertNavSource` are near-identical three-line
  functions and could collapse into one `assertEnum(value, field, allowed)`.

And two from its phase 2:

- `scripts/capture-yahoo-fixtures.ts` calls `main()` with no `.catch()`. A DNS or offline failure
  gives an unhandled rejection with a stack trace instead of the clean exit the script implements
  for a non-2xx response.
- `server/providers/__fixtures__/README.md` does not mention Yahoo's third response shape described
  under the rulings below. It is the one piece of context whoever touches those fixtures next most
  needs and is least likely to guess.

## Closed by plan 3

- ~~**`PATCH /api/funds/:id` cannot clear `providerSymbol` back to `null`.**~~ Fixed in task 1.5:
  `readClearableString` keeps absent (`undefined`, leave it alone) apart from an explicit `null`
  (clear the column), the distinction `readOptionalString` collapsed. The funds table's `Quitar`
  button is the undo that depends on it.
- ~~**Route tests are phase 1 of plan 3, not an afterthought. The count is exact: 26 route files, 0
  route test files.**~~ All 26 handlers are exercised by 100 tests across eight files under
  `test/routes/`, each booting a real Nuxt server through `@nuxt/test-utils` against a throwaway
  SQLite file — which is also the only way `h3` resolves from outside Nitro's own dependency tree
  (see *Gotchas already paid for* in `CLAUDE.md`). They are the slow suite: about three and a half
  minutes against eleven seconds for the other three projects together, which is what `pnpm
  test:fast` exists to skip.
- ~~**Typography: `Inter` is imported on line 1 of `app/assets/css/tailwind.css`.** The design hook
  flags it as an overused face, and it is. Deferred until the dashboard exists, because a font for a
  financial dashboard can only be judged against real columns of numbers.~~ Replaced with **IBM Plex
  Sans**, chosen in phase 2 against the real tables of figures the dashboard renders, for its
  tabular numerals. The hook exception was never registered: the decision was made rather than
  silenced.

## Rulings already made, so they are not re-litigated

- **Nulls are dropped from a NAV series** — never thrown on, never interpolated. A day whose close
  is `null` simply has no net asset value; the application values with the latest available one and
  shows its date. The publication lag is real and visible: the last three closes of the captured
  254-point series are `14.277199745178223, null, null`.
- **The real portfolio series is `null` where unknown, never `0`.** A zero claims the portfolio was
  worth nothing; a `null` says we do not know. Unovis breaks its line on `undefined` and plots
  `null` as zero, which is why `evolution-series.ts` maps one to the other.
- **A month is valued at its last day, except the month `asOf` falls in, which is clamped to
  `asOf`.** Otherwise a hand-entered NAV dated later in the same month — reachable through
  `PUT /api/nav` — makes today's chart point read a price that has not happened yet.
- **Yahoo's third response shape is real, not corruption.** `chart-IE00BYX5NX33.SG.json` has `meta`
  and `indicators` but **no `timestamp` key**, with `error: null`. Do not "fix" that fixture.
- **Resolution never picks a share class.** The same ISIN publishes several at different prices —
  `0P0001CLDK.F` at 9,99 € against `IE00BYX5NX33.SG` at 14,33 € — and only the user's own statement
  says which one they hold. The screen lists them and waits; no row is preselected or recommended.
- **A net asset value entered by hand always prevails.** The sync never overwrites a `manual` row,
  and reports how many it left alone, because silence about that looks like values went missing.
- **There is no `reviewer` subagent.** Removed on cost grounds on 2026-08-08; the `implementer` makes
  an adversarial pass over its own work and the main session verifies each task's claims by running
  the command and reading the artefact. See *How work is done here* in `CLAUDE.md`.

## Housekeeping

`pnpm sync:nav` is written and documented. Verified idempotent by running it twice in a row against
the real Yahoo API: 27 NAVs for each fund, 54 rows total, before and after the second run.
