# TODO

Open threads, so none of this has to be reconstructed from memory.

## Next up

**The calculation engine is finished.** Tasks 1–8 of
[the plan](docs/superpowers/plans/2026-08-06-motor-de-calculo.md) are done and its closing checks
pass: 76 tests green, `core/` still imports nothing from Nuxt, Drizzle, h3 or ofetch.

What comes next is plan 2 — the persistence layer and the network: Drizzle schema and migrations,
`PriceProvider` with the Yahoo implementation, idempotent NAV synchronisation, and the Nitro routes.
That plan is not written yet.

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
