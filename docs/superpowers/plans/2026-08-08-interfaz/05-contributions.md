# Phase 5 — Contributions

**Goal:** screen 2 of section 8 of the spec: the rules in force, the one-off exceptions, and the
monthly table those rules expand into — plus the actions that change them and the button that
materialises a month into purchases.

**Prerequisite:** phases 2 and 3 closed. `app/utils/format.ts`, the shell, `EmptyState`,
`ErrorNotice` and `PageHeader` all exist.

**Verification of the whole phase:** `pnpm test --project app` green, and
`test/routes/pages.test.ts` asserting that `/aportaciones` renders the seeded plan.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [x] Task 5.1 — Input parsing and weight formatting
- [x] Task 5.2 — `<ContributionMonthsTable>`
- [x] Task 5.3 — `<RulesList>`
- [x] Task 5.4 — `<RuleForm>`
- [ ] Task 5.5 — `<OverrideForm>`
- [ ] Task 5.6 — The contributions page
- [ ] Task 5.7 — The contributions screen renders against a real database

---

## Context an implementer needs

**The routes**, from plan 2's table: 12 `GET /api/contributions`, 13 `POST /api/contributions/rules`,
14 `PATCH /api/contributions/rules/:id`, 15 `DELETE /api/contributions/rules/:id`,
16 `PUT /api/contributions/overrides/:month`, 17 `DELETE /api/contributions/overrides/:month`,
22 `POST /api/purchases/materialise`.

**`GET /api/contributions?from=YYYY-MM&to=YYYY-MM` returns `ContributionsView`:**

```ts
{
  rules: ContributionRuleRow[]       // raw database rows
  overrides: ContributionOverrideRow[]
  months: Array<Contribution & { materialised: boolean }>
}
```

**Two traps in that shape, both real:**

1. **`rules[].weights` is a JSON string, not an array.** The route returns the Drizzle row, and
   `weights` is a `TEXT` column holding `JSON.stringify(Weight[])`. `months[].weights`, by contrast,
   is a proper `Weight[]` — it comes from `expandContributions`. The interface has to parse the
   first and not the second. Task 5.1 adds the parser; task 5.7 records the leak as a finding.
2. **The view gives no per-fund euro split.** A month says `amount: 20000` and
   `weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }]`, and never
   `16000 / 4000`. **The screen therefore shows the weights as percentages, not euros.** Splitting
   200 € as 160 €/40 € is `split()` in `core/money.ts` doing largest-remainder arithmetic on money,
   and the interface does not do arithmetic on money — see the global constraints. This is a finding
   about the route surface, recorded in `TODO.md` at the close of the plan, not something to work
   around here.

**Spanish for the domain terms**, used consistently across this screen:

| Concept | Spanish |
|---|---|
| Contribution rule | `Regla de aportación` |
| From month | `Desde` |
| Amount | `Importe` |
| Timing `start` / `end` | `Inicio de mes` / `Fin de mes` |
| Weights | `Reparto` |
| Override, skipped month | `Excepción`, `Mes saltado` |
| Materialised | `Materializada` |
| Pending | `Pendiente` |

**Error copy, a rule for this phase and the two after it.** API error messages are English and
developer-facing. A failed action renders an `<ErrorNotice>` with a **Spanish** sentence written by
the page (`No se ha podido guardar la regla.`) and, below it in small muted text, the API's
`statusMessage` as technical detail. Never show the raw English message as the headline.

---

## Task 5.1 — Input parsing and weight formatting

**Depends on:** phase 2.

**Files:** `app/utils/format.ts` (extend), `app/utils/format.test.ts` (extend),
`app/utils/parse.ts` (new), `app/utils/parse.test.ts` (new).

**`formatWeight(weight: number): string`** in `app/utils/format.ts`: `0.8` → `'80 %'`,
`0.2` → `'20 %'`, `0.125` → `'12,5 %'`. It reuses the `RATE` formatter `formatRate` already uses —
`Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2,
useGrouping: 'always' })` — through the same `normaliseSpaces` helper, so it is one line and no
percentage arithmetic is written here. A weight is a proportion, not money, so passing the `number`
straight in is correct; the three values above were measured on Node 22.14.

**`app/utils/parse.ts`**, the boundary where a typed string becomes a domain value:

```ts
/**
 * An amount typed by a person, as an exact number of cents. `null` when the
 * text is not an amount. A cent is the smallest unit there is, so more than
 * two decimal places is rejected rather than quietly rounded.
 */
export function parseEurosToCents(input: string): number | null

/** The inverse, for filling an `<input type="number">`: `20000` -> `'200.00'`. */
export function formatCentsForInput(cents: number): string

/** The `weights` column of a rule row, which the API returns as a JSON string. */
export function parseWeights(raw: string): Weight[]
```

`parseEurosToCents`: trim; replace a single `,` with `.`; reject unless the result matches
`/^\d+(\.\d{1,2})?$/`; otherwise `new Decimal(text).times(100).toDecimalPlaces(0,
Decimal.ROUND_HALF_UP).toNumber()`. Negative input is rejected — a contribution of minus 200 € is not
a contribution.

`parseWeights`: `JSON.parse`, then verify it is a non-empty array of objects with a string `fundId`
and a finite `weight`; throw an `Error` with an English message otherwise.

**Tests** (`app/utils/parse.test.ts`), exact:

| Call | Expected |
|---|---|
| `parseEurosToCents('200')` | `20000` |
| `parseEurosToCents('200.5')` | `20050` |
| `parseEurosToCents('200,50')` | `20050` |
| `parseEurosToCents('0')` | `0` |
| `parseEurosToCents('')` | `null` |
| `parseEurosToCents('abc')` | `null` |
| `parseEurosToCents('200.555')` | `null` |
| `parseEurosToCents('-200')` | `null` |
| `formatCentsForInput(20000)` | `'200.00'` |
| `formatCentsForInput(5)` | `'0.05'` |
| `parseWeights('[{"fundId":"world","weight":0.8}]')` | `[{ fundId: 'world', weight: 0.8 }]` |
| `parseWeights('[]')` | throws |
| `parseWeights('nope')` | throws |

Plus `formatWeight` rows added to `app/utils/format.test.ts`: `0.8` → `'80 %'`, `0.125` → `'12,5 %'`.

**Verify:** `pnpm test --project app app/utils/parse.test.ts app/utils/format.test.ts`

---

## Task 5.2 — `<ContributionMonthsTable>`

**Depends on:** 5.1.

**Files:** `app/components/contributions/ContributionMonthsTable.vue`, and its test.

**Props.**

```ts
interface Props {
  months: ContributionsViewMonth[]        // import type from '~~/server/services/read-model'
  /** Fund id -> display name, for the `Reparto` column. */
  fundNames: Record<string, string>
}
```

**Behaviour.** A `Table` with headers `Mes`, `Importe`, `Momento`, `Reparto`, `Estado`:

| Column | Cell |
|---|---|
| `Mes` | `formatMonth(month.month)` — `'ago 2026'` |
| `Importe` | `formatEuros(month.amount)`, right-aligned, `tabular-nums` |
| `Momento` | `Inicio de mes` for `'start'`, `Fin de mes` for `'end'` |
| `Reparto` | one entry per weight: `` `${formatWeight(w.weight)} ${fundNames[w.fundId] ?? w.fundId}` ``, joined with ` · ` |
| `Estado` | `Badge` reading `Materializada` when `month.materialised`, `Pendiente` otherwise |

With `months: []`, render `<EmptyState title="No hay aportaciones en este periodo" />`.

**Tests.** One month — `{ month: '2026-08', amount: 20000, timing: 'start', weights: [{ fundId:
'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }], materialised: false }` with
`fundNames: { world: 'Fidelity', emerging: 'Vanguard' }` — renders `'ago 2026'`, `'200,00 €'`,
`'Inicio de mes'`, `'80 % Fidelity · 20 % Vanguard'` and `'Pendiente'`. A second `it` with
`materialised: true` renders `'Materializada'`. A third with `months: []` renders the empty state and
no `<table>`.

**Verify:** `pnpm test --project app app/components/contributions/ContributionMonthsTable.test.ts`

---

## Task 5.3 — `<RulesList>`

**Depends on:** 5.1.

**Files:** `app/components/contributions/RulesList.vue`, and its test.

**Props and events.**

```ts
interface Props {
  rules: ContributionRuleRow[]           // import type from '~~/server/db/schema'
  fundNames: Record<string, string>
}
const emit = defineEmits<{ delete: [id: number] }>()
```

**Behaviour.** A `Table` with headers `Desde`, `Importe`, `Momento`, `Reparto`, and a last column of
actions holding a `Button` with `variant="destructive"`, `size="sm"`, labelled `Eliminar`, emitting
`delete` with the rule's `id`. `weights` goes through `parseWeights` before being formatted.

Under the table, a muted note, because this is the rule of section 4 of the spec and the screen
should say it: `Editar una regla nunca reescribe el pasado: añade una regla nueva con su propio mes
de inicio y la anterior sigue gobernando los meses anteriores.`

With `rules: []`, `<EmptyState title="Todavía no hay reglas de aportación" />`.

**Tests.** One rule — `{ id: 1, portfolioId: 'index', fromMonth: '2026-07', amount: 200000, timing:
'start', weights: '[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]' }` —
renders `'jul 2026'`, `'2.000,00 €'`, `'Inicio de mes'` and `'80 % Fidelity · 20 % Vanguard'`.
Clicking `Eliminar` emits `delete` with `1`
(`wrapper.emitted('delete')` is `[[1]]`).

**Verify:** `pnpm test --project app app/components/contributions/RulesList.test.ts`

---

## Task 5.4 — `<RuleForm>`

**Depends on:** 5.1.

**Files:** `app/components/contributions/RuleForm.vue`, and its test.

**Props and events.**

```ts
interface Props {
  /** For the weight rows. `{ id, name }` is all this component needs. */
  funds: Array<{ id: string, name: string }>
  /** Prefilled month, normally the month after the last rule. */
  defaultMonth?: Month
}
const emit = defineEmits<{
  submit: [payload: { fromMonth: Month, amount: Cents, timing: Timing, weights: Weight[] }]
}>()
```

**Behaviour.** A form with, in order:

- `<input type="month">` labelled `Desde`, which yields `YYYY-MM` natively.
- `<input type="number" step="0.01" min="0">` labelled `Importe (€)`, parsed with
  `parseEurosToCents`.
- A `Momento` choice between `Inicio de mes` (value `start`, default) and `Fin de mes` (value
  `end`). Use two radio inputs, not a reka-ui `Select`: this component is unit-tested, and native
  inputs need no DOM APIs happy-dom lacks.
- One `<input type="number" step="1" min="0" max="100">` per fund, labelled with the fund's name,
  holding its weight **as a percentage** — `80` and `20`, not `0.8` and `0.2`. Percentages are what a
  person types.
- A submit `Button` labelled `Añadir regla`.

**Validation, before emitting.** Show a Spanish message under the offending field and emit nothing:

- `Indica el mes desde el que se aplica.` when the month is empty.
- `El importe debe ser mayor que 0.` when `parseEurosToCents` returns `null` or `0`.
- `Los pesos deben sumar 100 %.` when the percentages do not add to exactly 100.

The last one keeps the interface from sending what `readWeights` would reject with an English 400,
and it is also where the API is more permissive than the screen: **amounts of zero are accepted by
the API today** — noted in `TODO.md` — and refused here.

On submit, emit `weights` as fractions: `Number(percentage) / 100`. That division is on a weight, not
on money; `split()` on the server is what turns weights into exact cents.

**Tests.** Fill month `2027-01`, amount `300`, leave timing at `start`, weights `80`/`20`, submit →
one `submit` emission whose payload deep-equals `{ fromMonth: '2027-01', amount: 30000, timing:
'start', weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }] }`. Then
three failure `it`s: weights `70`/`20` emits nothing and shows `Los pesos deben sumar 100 %.`; an
amount of `0` emits nothing and shows `El importe debe ser mayor que 0.`; an empty month emits
nothing.

**Verify:** `pnpm test --project app app/components/contributions/RuleForm.test.ts`

---

## Task 5.5 — `<OverrideForm>`

**Depends on:** 5.1.

**Files:** `app/components/contributions/OverrideForm.vue`, and its test.

**Props and events.**

```ts
const emit = defineEmits<{
  submit: [payload: { month: Month, amount: Cents | null, note?: string }]
}>()
```

**Behaviour.** A compact form: `<input type="month">` labelled `Mes`, a checkbox labelled
`Saltar este mes`, an `<input type="number">` labelled `Importe (€)` disabled while the checkbox is
ticked, an optional `<input type="text">` labelled `Nota`, and a `Button` labelled `Guardar
excepción`.

- Checkbox ticked → emit `amount: null`. That is what the API means by a skipped month.
- Checkbox clear → emit the parsed cents; refuse to emit with the message
  `El importe debe ser mayor que 0.` when it is `null` or `0`.
- `note` is emitted only when non-empty.

**Tests.** Ticked with month `2026-09` emits `{ month: '2026-09', amount: null }`. Unticked with
`500` emits `{ month: '2026-09', amount: 50000 }`. Unticked with an empty amount emits nothing and
shows the message. A note of `Paga extra` reaches the payload.

**Verify:** `pnpm test --project app app/components/contributions/OverrideForm.test.ts`

---

## Task 5.6 — The contributions page

**Depends on:** 5.2, 5.3, 5.4, 5.5.

**File:** `app/pages/aportaciones.vue` (rewrite).

**Data.** Three fetches:

```ts
const { data: portfolio } = await useFetch<PortfolioView>('/api/portfolio')
const { data: funds } = await useFetch<FundView[]>('/api/funds')
const from = portfolio.value?.firstMonth ?? monthOf(new Date().toISOString().slice(0, 10))
const to = addMonths(monthOf(new Date().toISOString().slice(0, 10)), 11)
const { data, error, refresh } = await useFetch<ContributionsView>('/api/contributions', {
  query: { from, to },
})
```

`monthOf` comes from `~~/core/dates` and `addMonths` from `~~/core/months` — both pure, both already
tested. The window is **from the first month the portfolio has ever governed to eleven months
ahead**, so the table shows the whole history plus the coming year. Reading the clock in a page is
fine; `core/` is what may never do it.

`fundNames` is `Object.fromEntries((funds.value ?? []).map(f => [f.id, f.name]))`.

**Layout.**

1. `<PageHeader title="Aportaciones" subtitle="Reglas en vigor, excepciones y el calendario mensual" />`
   with an actions slot holding the materialise button (below).
2. `<ErrorNotice>` when the main fetch failed, with `Reintentar`.
3. Section `Reglas en vigor`: `<RulesList>` plus `<RuleForm>` under a `Nueva regla` heading.
4. Section `Excepciones`: a small table of `data.overrides` (`Mes`, `Importe` — `Mes saltado` when
   `amount === null` — `Nota`, and an `Eliminar` button) plus `<OverrideForm>`.
5. Section `Calendario`: `<ContributionMonthsTable>`.

**Actions**, each followed by `await refresh()`:

| Trigger | Call |
|---|---|
| `RuleForm` `submit` | `POST /api/contributions/rules` with the payload |
| `RulesList` `delete` | `DELETE /api/contributions/rules/${id}` |
| `OverrideForm` `submit` | `PUT /api/contributions/overrides/${month}` with `{ amount, note }` |
| Override `Eliminar` | `DELETE /api/contributions/overrides/${month}` |
| `Materializar aportaciones` button | `POST /api/purchases/materialise` with an empty body |

The materialise button's result is rendered as a Spanish summary, from `MaterialisationResult`:
`Se han creado {formatInteger(created.length)} compras.` and, when `skipped` is non-empty,
`{n} meses sin materializar: {m} por falta de valor liquidativo, {k} ya materializados.` — group by
`reason`, using `'no-nav'` and `'already-materialised'`.

Every call goes through one helper defined in the page:

```ts
async function run(action: () => Promise<unknown>, failureMessage: string): Promise<void>
```

which catches, sets a `failure` ref to `{ message: failureMessage, detail: error.statusMessage }`,
and clears it on the next success. The Spanish messages: `No se ha podido guardar la regla.`,
`No se ha podido eliminar la regla.`, `No se ha podido guardar la excepción.`,
`No se ha podido eliminar la excepción.`, `No se han podido materializar las aportaciones.`

**Verify:** `pnpm typecheck` and `pnpm build` exit 0.

---

## Task 5.7 — The contributions screen renders against a real database

**Depends on:** 5.6.

**File:** `test/routes/pages.test.ts` (extend).

**Tests to add**, in a `describe('/aportaciones')` block placed **after** the dashboard block:

1. `renders the seeded plan` — `GET /aportaciones`, assert the HTML contains `Aportaciones`,
   `2.000,00 €` (the July 2026 initial contribution), `200,00 €` (the recurring one),
   `80 % Fidelity MSCI World Index Fund EUR P Acc` and `Pendiente`. Assert it contains no `NaN`.
2. `states that editing a rule never rewrites the past` — the HTML contains
   `Editar una regla nunca reescribe el pasado`.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 5

- `pnpm test --project app` green.
- `pnpm test --project routes` green.
- `pnpm typecheck` and `pnpm build` exit 0.
- The human partner opens `/aportaciones`, adds a rule from a future month, sees the calendar change
  from that month on and the earlier months unchanged, skips a month, and materialises.
- Two findings are written down for task 8.2: `GET /api/contributions` returns `rules[].weights` as a
  serialised JSON string rather than a `Weight[]`, and it returns no per-fund euro split, which is
  why the screen shows percentages.
