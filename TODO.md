# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Plan 2, task 8 — the Yahoo provider.** The only task left in phase 2 of
[the plan](docs/superpowers/plans/2026-08-07-persistencia-y-red.md). Everything it needs is already
committed: the `PriceProvider` interface it implements, and the recorded and handmade fixtures its
tests read. It was not started because the org hit its monthly spend limit and the subagents this
project is built with stopped running.

**Three response shapes its `history()` has to survive**, all three now on disk under
`server/providers/__fixtures__/`:

1. A full daily series — `chart-0P0001CLDK.F.json`, 254 points, `currency: EUR`.
2. An error payload — `chart.result` is `null` and `chart.error` carries a code.
3. **A result with no data** — `chart-IE00BYX5NX33.SG.json` came back with `meta` and `indicators`
   only, **no `timestamp` key at all**, and `error: null`. This is real, unaltered Yahoo output, not
   a corrupt fixture. Do not "fix" it. A parser doing `result[0].timestamp.length` throws a
   `TypeError` on it.

**A ruling already made, so it does not have to be re-decided:** the interface's *"no gaps and no
nulls"* means nulls are **dropped** from the series — never thrown on, never interpolated. A day
whose close is `null` simply has no NAV, and the application values with the latest available one
and shows its date. The publication lag is real and visible: the last three closes of the captured
254-point series are `14.277199745178223, null, null`.

**Phase 1 is done** — commits `0c4882e..32ac819`. The Drizzle schema for the seven tables, the
SQLite client, a temp-database helper, the row↔domain mappers and typed queries, and the seeded
initial data. `pnpm db:seed` idempotent.

**Phase 2 is two thirds done** — commits `bdc5450` and `9b11607`. 145 tests green.

Phases 3 to 5 after that: idempotent NAV sync and materialisation, the read model, and the 26 Nitro
routes. Then plan 3, the interface, which is not written yet.

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

**`pnpm sync:nav` is specified but not written.** Section 9 of the spec describes it; the README
deliberately omits it. It is task 11, in phase 3 of plan 2 — it needs the Yahoo provider of phase 2
to exist first.
