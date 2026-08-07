# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Task 5 of the plan: scenario projection.** `core/scenarios.ts`, turning contributions plus an
annual rate into a projected series. See
[the plan](docs/superpowers/plans/2026-08-06-motor-de-calculo.md), section "Tarea 5". Tasks 6 to 8
(unit purchases, valuation, XIRR) follow, and that closes the calculation engine.

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

**Plan checkboxes for tasks 3 and 4 are unticked**, though both are implemented and committed
(`core/rates.ts`, `core/months.ts`, `core/contributions.ts`, plus the audit fixes in `894ae4d`).
Tasks 1 and 2 are marked `COMPLETADA`. Anyone reading the plan would conclude the rate conversion
and the month arithmetic are still missing.

**The local directory is still `~/Sites/my-stonks`.** The repository, the package and the interface
are all Steady Stack now; only the path on disk lags. It is a `mv` with no sessions open, so it
cannot be done from inside a worktree.

**`pnpm sync:nav` is specified but not written.** Section 9 of the spec describes it; the README
deliberately omits it. It arrives with the persistence layer, not with the calculation engine.
