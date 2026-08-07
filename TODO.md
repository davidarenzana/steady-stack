# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Plan 2, phase 2 — the price providers.** Tasks 6, 7 and 8 of
[the plan](docs/superpowers/plans/2026-08-07-persistencia-y-red.md): the `PriceProvider` interface
with manual entry, a one-off capture of the Yahoo fixtures, and the Yahoo implementation tested
only against those recorded responses.

Task 7 is the one that needs a network and a human: it runs `pnpm capture:fixtures` by hand, once,
and commits what comes back. Every other test in the project must keep passing with the wifi off.

**Phase 1 is done** — commits `0c4882e..32ac819`. The Drizzle schema for the seven tables, the
SQLite client, a temp-database helper, the row↔domain mappers and typed queries, and the seeded
initial data. 140 tests green, `pnpm db:seed` idempotent.

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
