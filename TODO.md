# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**Task 6 of the plan: unit purchases.** `core/purchases.ts`, turning a contribution plus the NAV of
the day into the units bought. See
[the plan](docs/superpowers/plans/2026-08-06-motor-de-calculo.md), section "Tarea 6". Tasks 7 and 8
(valuation, XIRR) follow, and that closes the calculation engine.

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
deliberately omits it. It arrives with the persistence layer, not with the calculation engine.
