# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Plan 2 is closed** — all eighteen tasks over five phases: the database and its seeded portfolio,
the Yahoo provider over recorded fixtures, idempotent NAV sync, materialisation into frozen
purchases, the read model, and all 26 Nitro routes. 362 tests passing, none of them opening a
network socket. `pnpm typecheck` and `pnpm build` both exit 0, and a real `.output` build was
started and curled — see *Findings this plan leaves for plan 3*, below, for the one gap that
uncovered.

**Plan 3 is the interface**, not written yet. There is still nothing to open in a browser except
raw JSON. Its opening phase must be route tests, not screens:

**Route tests are phase 1 of plan 3, not an afterthought.** The count is exact: **26 route files,
0 route test files.** The whole HTTP layer — every handler under `server/api/` — has no automated
coverage. Every one of them was verified by hand with `curl` while implementing plan 2, which is
what that plan's own ending condition asked for, but "verified once by a human" and "covered by a
test suite" are not the same claim, and only the second one survives a refactor. `@nuxt/test-utils`
is already a devDependency; its e2e mode resolves `h3` by running a real Nuxt server, which is
exactly the resolution problem that confined Nitro auto-imports to `server/api/` and
`server/utils/http.ts` throughout plan 2 (see *Gotchas already paid for* in `CLAUDE.md`). Write the
route tests against that real server, not against the handlers in isolation.

## Findings this plan leaves for plan 3

Deliberate gaps and deferred fixes, so plan 3 inherits them as decisions rather than rediscovering
them as surprises.

- ~~**`PATCH /api/funds/:id` cannot clear `providerSymbol` back to `null`.**~~ Fixed in task 1.5 of
  plan 3: `readClearableString` keeps absent (`undefined`, leave it alone) apart from an explicit
  `null` (clear the column), the distinction `readOptionalString` collapses. What it leaves open is
  the neighbouring case: **`providerSymbol: ''` is still accepted**, on `POST /api/funds` as well as
  on the `PATCH`, and `nav-sync.ts` skips a fund on `providerSymbol === null` only — so an empty
  string is a symbol as far as the sync is concerned and would be sent to Yahoo verbatim. A funds
  screen that clears the field with `''` instead of `null` would trip that.
- **Purchase and rule amounts still accept zero and negative values.** No validation rejects them.
- **Scenario `color` is not restricted** to the `chart-1` … `chart-5` tokens the theme declares.
- **Fund `currency` accepts an empty string.**
- **`purchases.date` is not future-bounded**, though `nav.date` is.
- **`buildFundsView` reports a fund holding units with no NAV as worth `0`**, distinguishable only
  through `latestNav: null`. If the interface ever sums `value` across funds it will silently
  under-count. (Carried over from phase 4 — see below.)
- **`@types/better-sqlite3` resolves to `9.6.0`** against the runtime `13.0.3`; no `13.x` types are
  published, so any method added since 9.6.0 is silently typed `any`.
- **`server/db/client.ts`'s `process.cwd()` migrations fallback has a real gap**, found while
  closing this plan: `node .output/server/index.mjs` works from the project root (verified with
  `curl` against `GET /api/portfolio`, HTTP 200) but throws `Can't find meta/_journal.json file` on
  every database-backed route when started from any other working directory — and
  `DATABASE_FILE` in `server/utils/database.ts` is the same kind of `cwd`-relative path, so it also
  silently creates a stray, empty database file under that directory's own `data/` before the
  migration lookup fails. Nothing in this plan pins the working directory a deployed process starts
  from, so this is live risk, not a hypothetical — whatever launches the production server must
  `cd` to the project root first, or both paths need to resolve some other way.
- **The snapshot-and-diff logic is duplicated** between `scripts/sync-nav.ts`'s `runSync` and
  `syncNavsWithPartialReport` in `server/services/nav-sync.ts`. A candidate for consolidation, not
  done here to keep this closing task to verification and documentation.

**Phases 1 to 4 were commits `0c4882e..3ffb298`.** The database and its seeded portfolio, the Yahoo
provider over recorded fixtures, idempotent NAV sync, materialisation into frozen purchases, and
the read model that produces the exact figures the dashboard renders.

### Rulings already made, so they are not re-litigated

- **Nulls are dropped from a NAV series** — never thrown on, never interpolated. A day whose close
  is `null` simply has no net asset value; the application values with the latest available one and
  shows its date. The publication lag is real and visible: the last three closes of the captured
  254-point series are `14.277199745178223, null, null`.
- **The real portfolio series is `null` where unknown, never `0`.** A zero claims the portfolio was
  worth nothing; a `null` says we do not know.
- **A month is valued at its last day, except the month `asOf` falls in, which is clamped to
  `asOf`.** Otherwise a hand-entered NAV dated later in the same month — reachable through
  `PUT /api/nav` — makes today's chart point read a price that has not happened yet.
- **Yahoo's third response shape is real, not corruption.** `chart-IE00BYX5NX33.SG.json` has `meta`
  and `indicators` but **no `timestamp` key**, with `error: null`. Do not "fix" that fixture.

## Carried over from the phase 1 reviews

Five minor findings were deliberately deferred rather than fixed, and the whole-branch review at the
end of plan 2 should triage them:

- `core/dates.ts` has no test for out-of-range components (`2026-13-01`, `2026-01-32`). The code
  does reject them, through the round-trip check — it is a missing test, not a bug.
- The schema carries **no `CHECK` constraints** by design, so the four enum columns are enforced
  only by the mappers in `server/db/mappers.ts`. A raw `INSERT` from a future migration bypasses
  them silently.
- In `server/test-utils/temp-db.ts`, if `handle.close()` itself throws inside the cleanup `catch`,
  it would mask the original error.
- `openDatabase` used outside the temp helper leaves `-wal`/`-shm` sidecar files next to a real
  database. Nothing does that yet; `scripts/` might.
- `assertTiming`, `assertPurchaseSource` and `assertNavSource` are near-identical three-line
  functions and could collapse into one `assertEnum(value, field, allowed)`.

And two from phase 2:

- `scripts/capture-yahoo-fixtures.ts` calls `main()` with no `.catch()`. A DNS or offline failure
  gives an unhandled rejection with a stack trace instead of the clean exit the script implements
  for a non-2xx response.
- `server/providers/__fixtures__/README.md` does not mention the third response shape described
  above. It is the one piece of context whoever writes task 8 most needs and is least likely to
  guess.

**Task 7 was reviewed by the main session, not by a `reviewer` subagent** — the reviewer died on the
spend limit mid-task, and the role was removed afterwards. The checks were run for real (headers,
delay, exit code, URL list, fixture quirks intact, no socket in any test, `core/` untouched), but
nobody audited that work with fresh eyes.

That is now the standing arrangement rather than an exception: see *How work is done here* in
`CLAUDE.md`. Tasks 1 to 6 were reviewed independently; from task 7 onwards nothing is, so the
deferred findings above are the last list any outside reader produced for this plan.

None of the findings above were fixed while closing plan 2 — task 18 is verification and
documentation, not a cleanup pass — so they carry forward into plan 3's backlog alongside the
*Findings this plan leaves for plan 3* above.

## Deferred by decision

**Typography.** `Inter` is imported on line 1 of `app/assets/css/tailwind.css`. The design hook
flags it as an overused face, and it is: it carries no personality for a product this figure-dense.

Deferred on purpose until the dashboard exists, because a font for a financial dashboard can only be
judged against real columns of numbers, not against one `<h1>` on a scaffold. Whatever replaces it
needs decent tabular numerals so the figures line up.

The hook exception is deliberately **not** registered, so the warning fires again the next time
anyone edits that file — which is exactly when the decision should be made. To silence it instead,
the command is:

```sh
/impeccable hooks ignore-value overused-font inter --shared
```

## Housekeeping

~~`pnpm sync:nav` is specified but not written.~~ Written in task 11 and documented in the README
since task 18. Verified idempotent by running it twice in a row against the real Yahoo API: 27
NAVs for each fund, 54 rows total, before and after the second run.
