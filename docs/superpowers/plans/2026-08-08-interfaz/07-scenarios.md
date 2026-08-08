# Phase 7 — Scenarios

**Goal:** screen 4 of section 8 of the spec: the theoretical rates and the horizon. Changing them
changes what the chart of phase 4 draws, which is the point — the scenarios exist to be compared
against the real portfolio.

**Prerequisite:** phases 2 to 6 closed. The dashboard chart reads `series.scenarios`, which the API
already filters by `enabled`.

**Verification of the whole phase:** `pnpm test --project app` green, and `test/routes/pages.test.ts`
asserting `/escenarios` renders the three seeded scenarios with their rates in Spanish typography.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [ ] Task 7.1 — `app/utils/rate.ts`
- [ ] Task 7.2 — `<ScenariosTable>`
- [ ] Task 7.3 — `<ScenarioForm>`
- [ ] Task 7.4 — `<HorizonForm>`
- [ ] Task 7.5 — The scenarios page
- [ ] Task 7.6 — The scenarios screen renders against a real database

---

## Context an implementer needs

**The routes**, from plan 2's table: 1 `GET /api/portfolio`, 2 `PATCH /api/portfolio`,
23 `GET /api/scenarios`, 24 `POST /api/scenarios`, 25 `PATCH /api/scenarios/:id`,
26 `DELETE /api/scenarios/:id`.

**`ScenarioRow`** is the raw database row: `{ id: string, name: string, annualRate: string, color:
string, enabled: number }`. Two traps:

1. **`annualRate` is a decimal string** — `'0.09'`, not `9` and not `0.09` as a number. `POST` and
   `PATCH` reject a JSON number: `readDecimalString` refuses to coerce, per section 7 of the spec.
2. **`enabled` comes back as `0` or `1`, and goes out as `true` or `false`.** The row holds an
   integer; `readOptionalBoolean` on the way in requires a real boolean. Sending `1` gets a 400.

**The rate conversion is exact and lives in one module.** A user types `9`; the API stores `'0.09'`.
`9 / 100` in floating point is `0.09` only by luck of printing, and `7.25 / 100` is
`0.0725000000000000...`. `app/utils/rate.ts` does it through `Decimal`, whose whole job in this
project is that this never becomes a float.

**Colours are the five theme tokens.** `TODO.md` records that the API does not restrict `color` to
`chart-1` … `chart-5`; the interface does, by only offering those five. That is a screen-level
constraint, and the finding stays open at the API.

**The horizon belongs to the portfolio, not to a scenario.** `horizonYears` is a column on
`portfolio`, changed with `PATCH /api/portfolio`, and it decides how many months
`GET /api/dashboard` returns for **every** scenario at once. Section 13 of the spec calls it
configurable, defaulted to 25 years.

---

## Task 7.1 — `app/utils/rate.ts`

**Depends on:** phase 2.

**Files:** `app/utils/rate.ts`, `app/utils/rate.test.ts`.

**Public surface.**

```ts
import Decimal from '~~/core/decimal'

/**
 * A percentage typed by a person, as the decimal string the API stores:
 * `'9'` -> `'0.09'`. `null` when the text is not a percentage. Exact through
 * `Decimal`, never `Number(input) / 100`.
 */
export function parsePercentToRate(input: string): string | null

/** The inverse, for filling an input: `'0.09'` -> `'9'`, `'0.0725'` -> `'7.25'`. */
export function formatRateForInput(annualRate: string): string
```

`parsePercentToRate`: trim; replace a single `,` with `.`; reject unless it matches
`/^\d+(\.\d{1,4})?$/` — four decimal places of a percent is a hundredth of a basis point, which is
already more precision than a projection deserves; then
`new Decimal(text).dividedBy(100).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed()`. `toFixed()`
without an argument drops trailing zeros, so `'9'` gives `'0.09'` and not `'0.090000'`.

`formatRateForInput`: `new Decimal(annualRate).times(100).toFixed()`.

**Tests**, exact:

| Call | Expected |
|---|---|
| `parsePercentToRate('9')` | `'0.09'` |
| `parsePercentToRate('0')` | `'0'` |
| `parsePercentToRate('5')` | `'0.05'` |
| `parsePercentToRate('7.25')` | `'0.0725'` |
| `parsePercentToRate('7,25')` | `'0.0725'` |
| `parsePercentToRate('')` | `null` |
| `parsePercentToRate('-3')` | `null` |
| `parsePercentToRate('abc')` | `null` |
| `formatRateForInput('0.09')` | `'9'` |
| `formatRateForInput('0')` | `'0'` |
| `formatRateForInput('0.0725')` | `'7.25'` |

Plus one round-trip `it`: for each of `'0'`, `'0.05'`, `'0.09'`, `'0.0725'`,
`parsePercentToRate(formatRateForInput(rate))` returns the same string it started from.

**Verify:** `pnpm test --project app app/utils/rate.test.ts`

---

## Task 7.2 — `<ScenariosTable>`

**Depends on:** 7.1.

**Files:** `app/components/scenarios/ScenariosTable.vue`, and its test.

**Props and events.**

```ts
interface Props { scenarios: ScenarioRow[] }   // import type from '~~/server/db/schema'
const emit = defineEmits<{
  toggle: [payload: { id: string, enabled: boolean }]
  remove: [id: string]
}>()
```

**Behaviour.** A `Table` with headers `Escenario`, `Rentabilidad anual`, `Color`, `Activo`:

| Column | Cell |
|---|---|
| `Escenario` | `scenario.name` |
| `Rentabilidad anual` | `formatRate(scenario.annualRate)` — `'9 %'` — `tabular-nums` |
| `Color` | a `<span>` swatch with `:style="{ backgroundColor: 'var(--' + scenario.color + ')' }"` and the token name in muted `font-mono` text |
| `Activo` | a native `<input type="checkbox">` with `:checked="scenario.enabled === 1"`, emitting `toggle` with `{ id, enabled: target.checked }` |

A native checkbox, not a reka-ui `Switch`: this component is unit-tested under happy-dom, and a
native input needs no DOM API happy-dom lacks.

Last column: `Eliminar` button emitting `remove`.

Under the table, a muted line: `Solo los escenarios activos se dibujan en el gráfico del resumen.`

**Tests.** The three seeded scenarios — `{ id: 'flat', name: 'Sin interés', annualRate: '0', color:
'chart-3', enabled: 1 }`, `{ id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color:
'chart-2', enabled: 1 }`, `{ id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color:
'chart-1', enabled: 0 }` — render `'0 %'`, `'5 %'` and `'9 %'`; the third row's checkbox is
unchecked. Unchecking the first emits `toggle` with `{ id: 'flat', enabled: false }` — **a boolean,
not a `0`**. A swatch's inline style contains `var(--chart-1)` and no `#`.

**Verify:** `pnpm test --project app app/components/scenarios/ScenariosTable.test.ts`

---

## Task 7.3 — `<ScenarioForm>`

**Depends on:** 7.1.

**Files:** `app/components/scenarios/ScenarioForm.vue`, and its test.

**Props and events.**

```ts
const emit = defineEmits<{
  submit: [payload: { id: string, name: string, annualRate: string, color: string, enabled: boolean }]
}>()
```

**Behaviour.** Fields: `Identificador` (text), `Nombre` (text), `Rentabilidad anual (%)`
(`<input type="number" step="0.01" min="0">`, typed as a percentage), a colour choice as five radio
inputs — values `chart-1` … `chart-5`, each labelled with a swatch and the token name — and a
checkbox `Activo`, ticked by default. Submit button: `Añadir escenario`.

`annualRate` is emitted as `parsePercentToRate(input)`, so typing `9` sends `'0.09'`.

Validation, Spanish, no emission on failure:

- `Indica un identificador.`
- `Indica un nombre.`
- `Indica una rentabilidad anual válida.` when `parsePercentToRate` returns `null`.
- `Elige un color.` when none of the five is selected.

**Tests.** Filling `pesimista` / `Escenario pesimista` / `2` / `chart-4` and submitting emits exactly
`{ id: 'pesimista', name: 'Escenario pesimista', annualRate: '0.02', color: 'chart-4', enabled: true }`.
A rate of `-1` emits nothing and shows the message. **One `it` asserts the emitted `annualRate` is a
string**, `expect(typeof payload.annualRate).toBe('string')`: the API rejects a JSON number, and this
is the test that stops that regression.

**Verify:** `pnpm test --project app app/components/scenarios/ScenarioForm.test.ts`

---

## Task 7.4 — `<HorizonForm>`

**Depends on:** phase 2.

**Files:** `app/components/scenarios/HorizonForm.vue`, and its test.

**Props and events.** `{ horizonYears: number }`, emits `submit: [years: number]`.

**Behaviour.** An `<input type="number" step="1" min="1" max="100">` labelled `Horizonte (años)`,
prefilled from the prop, and a `Guardar` button. Under it, a muted line:
`El horizonte decide cuántos meses proyecta el gráfico del resumen para todos los escenarios.`
Validation: `El horizonte debe ser un número entero de años mayor que 0.` for anything not a positive
integer — which is exactly what `readOptionalPositiveInteger` enforces on the way in.

**Tests.** Prefilled with `25`. Changing to `30` and submitting emits `30` as a `number`. Submitting
`0` emits nothing and shows the message; so does `1.5`.

**Verify:** `pnpm test --project app app/components/scenarios/HorizonForm.test.ts`

---

## Task 7.5 — The scenarios page

**Depends on:** 7.2, 7.3, 7.4.

**File:** `app/pages/escenarios.vue` (rewrite).

**Data.**

```ts
const { data: scenarios, error, refresh } = await useFetch<ScenarioRow[]>('/api/scenarios')
const { data: portfolio, refresh: refreshPortfolio } = await useFetch<PortfolioView>('/api/portfolio')
```

**Layout.**

1. `<PageHeader title="Escenarios" subtitle="Rentabilidades teóricas y horizonte de la proyección" />`.
2. `<ErrorNotice>` on failure, with `Reintentar`.
3. `<ScenariosTable>`.
4. A `Nuevo escenario` section with `<ScenarioForm>`.
5. A `Horizonte` section with `<HorizonForm :horizon-years="portfolio?.horizonYears ?? 25" />`.

**Actions**, through the same `run(action, failureMessage)` helper as phases 5 and 6:

| Trigger | Call | Failure message |
|---|---|---|
| `ScenariosTable` `toggle` | `PATCH /api/scenarios/${id}` with `{ enabled }` | `No se ha podido cambiar el escenario.` |
| `ScenariosTable` `remove` | `DELETE /api/scenarios/${id}` | `No se ha podido eliminar el escenario.` |
| `ScenarioForm` `submit` | `POST /api/scenarios` | `No se ha podido crear el escenario.` A 409 gets `Ya existe un escenario con ese identificador.` |
| `HorizonForm` `submit` | `PATCH /api/portfolio` with `{ horizonYears }`, then `refreshPortfolio()` | `No se ha podido guardar el horizonte.` |

**Verify:** `pnpm typecheck` and `pnpm build` exit 0.

---

## Task 7.6 — The scenarios screen renders against a real database

**Depends on:** 7.5.

**File:** `test/routes/pages.test.ts` (extend).

**Tests to add**, in a `describe('/escenarios')` block:

1. `lists the seeded scenarios` — `GET /escenarios`, the HTML contains `Sin interés`, `Escenario 1`,
   `Escenario 2`, and the rates `0 %`, `5 %` and `9 %` in Spanish typography. Assert it contains no
   `0.09` and no `9%` — the rate must be rendered, not dumped.
2. `shows the horizon` — the HTML contains `Horizonte` and the value `25`.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 7

- `pnpm test --project app` green, including the test asserting `annualRate` leaves the form as a
  string.
- `pnpm test --project routes` green.
- `pnpm typecheck` and `pnpm build` exit 0.
- The human partner opens `/escenarios`, disables `Escenario 2`, returns to `/` and sees that line
  gone from the chart; changes the horizon from 25 to 30 years and sees the chart's x-axis stretch.
