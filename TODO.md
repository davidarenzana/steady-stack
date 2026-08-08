# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Plan 2, phase 5 — the Nitro routes.** Tasks 14 to 18 of
[the plan](docs/superpowers/plans/2026-08-07-persistencia-y-red.md), the last five of eighteen: the
HTTP plumbing that turns domain errors into H3 errors, then the read, write and action routes, then
the closing verification. The 26 routes are already tabulated in the plan with their request and
response shapes, and phase 3 of plan 3 will be written against that table, so it is not to be
changed casually.

**Phases 1 to 4 are done** — commits `0c4882e..3ffb298`, 219 tests green, none of them opening a
network socket. The database and its seeded portfolio, the Yahoo provider over recorded fixtures,
idempotent NAV sync, materialisation into frozen purchases, and the read model that produces the
exact figures the dashboard will render.

Then plan 3, the interface, which is not written yet. There is still nothing to open in a browser.

### Carry these into task 14

- **`NotFoundError` is defined inside `server/services/read-model.ts`.** The plan puts it in
  `server/utils/errors.ts` beside `ValidationError` and `ConflictError`. Task 14 must **move** it,
  not define a second one.
- **`syncNavs` can partially succeed and then throw.** Task 9 made it finish its loop after a
  provider failure so the funds ordered after the failing one still commit, then throw. The sync
  route must report what did land rather than treating the throw as nothing having happened.
- **`buildFundsView` returns `value: 0` for a fund that holds units but has no NAV**, rather than
  throwing the way `currentValuation` does for the same situation. It is deliberate — one unrated
  fund should not 404 the whole funds screen — and the consumer distinguishes the cases through
  `latestNav: null`. Only the no-purchases case is tested. If the interface ever sums `value`
  across funds it will silently under-count, so plan 3 needs to know.

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
