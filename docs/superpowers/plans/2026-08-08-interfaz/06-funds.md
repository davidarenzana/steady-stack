# Phase 6 — Funds

**Goal:** screen 3 of section 8 of the spec: adding a fund by ISIN with the share class chosen by
hand, the weights, the current net asset value and its date, and the refresh button. This is the
screen where the application does the thing it exists to do — download net asset values instead of
having them typed in.

**Prerequisite:** phases 2, 3 and 5 closed. In particular **phase 1, task 1.5**, which taught
`PATCH /api/funds/:id` to clear `providerSymbol` back to `null`; the undo in task 6.5 depends on it.

**Verification of the whole phase:** `pnpm test --project app` green, `test/routes/pages.test.ts`
asserting `/fondos` renders the two seeded funds and the `Sin valoración` state.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [ ] Task 6.1 — `<FundsTable>`
- [ ] Task 6.2 — `<SymbolCandidates>`
- [ ] Task 6.3 — `<AddFundForm>`
- [ ] Task 6.4 — `<NavSyncReport>` and `<ManualNavForm>`
- [ ] Task 6.5 — The funds page
- [ ] Task 6.6 — The funds screen renders against a real database

---

## Context an implementer needs

**The routes**, from plan 2's table: 4 `GET /api/funds`, 5 `POST /api/funds`,
6 `PATCH /api/funds/:id`, 7 `DELETE /api/funds/:id` (409 when the fund has purchases),
8 `GET /api/funds/resolve?isin=`, 10 `PUT /api/nav`, 11 `POST /api/nav/sync`.

**`FundView`** (route 4), the row this screen renders:

```ts
{
  id, isin, name,
  providerSymbol: string | null,
  currency: string,
  latestNav: { date: IsoDate, value: string, source: 'yahoo' | 'manual' } | null,
  units: string,          // accumulated, decimal string
  invested: Cents,
  value: Cents,           // 0 when latestNav is null — see below
}
```

**The inherited finding that shapes this screen.** `buildFundsView` reports a fund holding units with
no NAV as **worth `0`**, distinguishable only through `latestNav: null`. A screen that adds `value`
across funds would silently under-count.

**Ruling: this screen renders no portfolio total, and never prints `0,00 €` for a fund without a
NAV.** A fund with `latestNav === null` shows the Spanish text `Sin valoración` in its value column.
The one authoritative total lives on the dashboard, where `GET /api/dashboard` refuses to under-count
by returning a 404 instead. Do not "fix" this by summing in the page.

**`SymbolCandidate`** (route 8): `{ symbol, name, exchange, currency: string | null, price: string |
null, priceDate: IsoDate | null }`.

**Resolution never picks a candidate.** The same ISIN publishes several share classes at different
prices — `0P0001CLDK.F` at 9,99 € against `IE00BYX5NX33.SG` at 14,33 €, both for
`IE00BYX5NX33` — and only the user's own statement says which one they hold. Section 6 of the spec is
explicit. The screen lists them with symbol, exchange, price and price date, and waits.

**`NavSyncResult`** (route 11):

```ts
{ funds: Array<{ fundId, status: 'synced' | 'up-to-date' | 'skipped', reason?: 'no-symbol',
                 from?, to?, received?, inserted?, updated?, skippedManual? }> }
```

A 502 from that route carries `data.funds` with the same shape: the sync can partially succeed and
then fail, and the report is still worth showing. The page reads `error.data?.funds` when the call
throws.

**Nothing in the `app` Vitest project may reach the network.** Component tests here receive
candidates and sync reports as props; the fetching lives in the page.

---

## Task 6.1 — `<FundsTable>`

**Depends on:** phase 5, task 5.1.

**Files:** `app/components/funds/FundsTable.vue`, and its test.

**Props and events.**

```ts
interface Props { funds: FundView[] }   // import type from '~~/server/services/read-model'
const emit = defineEmits<{
  clearSymbol: [fundId: string]
  remove: [fundId: string]
}>()
```

**Behaviour.** A `Table` with headers `Fondo`, `ISIN`, `Símbolo`, `Participaciones`, `Aportado`,
`Valor`, `Último VL`:

| Column | Cell |
|---|---|
| `Fondo` | `fund.name` |
| `ISIN` | `fund.isin`, in `font-mono` |
| `Símbolo` | `fund.providerSymbol` in `font-mono`, followed by a `Button` `size="xs"` `variant="ghost"` labelled `Quitar` emitting `clearSymbol`; when `null`, a `Badge` reading `Sin símbolo` |
| `Participaciones` | `formatUnits(fund.units)`, `tabular-nums` |
| `Aportado` | `formatEuros(fund.invested)`, `tabular-nums` |
| `Valor` | `formatEuros(fund.value)` when `latestNav` is set; otherwise the plain text `Sin valoración` |
| `Último VL` | `formatNav(latestNav.value)` and, under it in muted text, `formatIsoDate(latestNav.date)` plus `Manual` when `source === 'manual'`; `—` when `latestNav` is `null` |

Last column: a `Button` `variant="destructive"` `size="sm"` labelled `Eliminar`, emitting `remove`.

Under the table, a muted note: `Los fondos sin valor liquidativo no suman al total de la cartera; el
resumen no se puede calcular hasta que lo tengan.`

With `funds: []`, `<EmptyState title="Todavía no hay fondos" description="Añade el primero con su
ISIN." />`.

**Tests.**

1. A fund with a NAV — `{ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World Index Fund
   EUR P Acc', providerSymbol: '0P0001CLDK.F', currency: 'EUR', latestNav: { date: '2026-08-03',
   value: '11.0000', source: 'yahoo' }, units: '160.000000', invested: 160000, value: 176000 }` —
   renders `'160,0000'`, `'1.600,00 €'`, `'1.760,00 €'`, `'11,0000 €'` and `'03/08/2026'`.
2. **`shows a fund with no net asset value as unvalued, not as zero`** — the same fund with
   `latestNav: null`, `value: 0`: the row contains `'Sin valoración'` and **does not contain**
   `'0,00 €'`. This is the inherited finding, pinned down by a test.
3. `offers to clear a wrong symbol` — clicking `Quitar` emits `clearSymbol` with `'world'`.
4. `does not render a portfolio total` — with two funds, the rendered text contains no element with
   `data-testid="funds-total"`, and there is no row labelled `Total`.
5. Empty array renders the empty state.

**Verify:** `pnpm test --project app app/components/funds/FundsTable.test.ts`

---

## Task 6.2 — `<SymbolCandidates>`

**Depends on:** phase 2.

**Files:** `app/components/funds/SymbolCandidates.vue`, and its test.

**Props and events.**

```ts
interface Props {
  candidates: SymbolCandidate[]         // import type from '~~/server/providers/types'
  /** True while `GET /api/funds/resolve` is in flight. */
  loading?: boolean
}
const emit = defineEmits<{ choose: [symbol: string] }>()
```

**Behaviour.** A table listing every candidate, in the order given, with columns `Símbolo`,
`Nombre`, `Mercado`, `Precio` and an `Elegir` `Button` per row. `Precio` renders
`formatNav(candidate.price)` when `price` is set, plus `formatIsoDate(candidate.priceDate)` in muted
text below, and `Sin precio` when it is `null`. **No row is preselected and no row is highlighted as
recommended.**

Above the table, a muted line: `Un mismo ISIN puede tener varias clases con precios distintos. Elige
la que coincide con tu extracto.`

`loading` renders `Buscando…`; an empty `candidates` array with `loading === false` renders
`No se ha encontrado ningún símbolo para ese ISIN.`

**Tests.** Two candidates — `{ symbol: '0P0001CLDK.F', name: 'Fidelity …', exchange: 'FRA',
currency: 'EUR', price: '9.9900', priceDate: '2026-08-03' }` and `{ symbol: 'IE00BYX5NX33.SG', …,
price: '14.3300', priceDate: '2026-08-03' }` — render both symbols, `'9,9900 €'` and `'14,3300 €'`.
Clicking the second `Elegir` emits `choose` with `'IE00BYX5NX33.SG'`. A third `it` asserts that
neither row carries `aria-selected="true"` nor any `data-recommended` attribute — the component
must not choose.

**Verify:** `pnpm test --project app app/components/funds/SymbolCandidates.test.ts`

---

## Task 6.3 — `<AddFundForm>`

**Depends on:** 6.2.

**Files:** `app/components/funds/AddFundForm.vue`, and its test.

**Props and events.**

```ts
interface Props {
  candidates: SymbolCandidate[]
  resolving?: boolean
}
const emit = defineEmits<{
  resolve: [isin: string]
  submit: [payload: { id: string, isin: string, name: string, providerSymbol?: string, currency: string }]
}>()
```

**Behaviour.** Fields, all native inputs: `ISIN`, `Identificador` (`id`, the short key such as
`world`), `Nombre`, `Divisa` (a text input defaulting to `EUR`). A `Buscar símbolos` button emits
`resolve` with the ISIN. `<SymbolCandidates>` renders below, and a chosen symbol is shown as
`Símbolo elegido: <symbol>` with a `Cambiar` button that clears it.

Validation before emitting `submit`, in Spanish, no emission when it fails:

- `Indica el ISIN.` when empty.
- `Indica un identificador.` when empty.
- `Indica el nombre del fondo.` when empty.
- `Indica la divisa.` when empty — the API accepts an empty `currency` today, a finding recorded in
  `TODO.md`; the screen does not.

`providerSymbol` is included only when one was chosen; a fund can be added without one and given a
symbol later.

**Tests.** Typing an ISIN and clicking `Buscar símbolos` emits `resolve` with it. Choosing a
candidate then filling the other fields and submitting emits `submit` with the full payload,
including `providerSymbol`. Submitting with an empty `Divisa` emits nothing and shows
`Indica la divisa.`.

**Verify:** `pnpm test --project app app/components/funds/AddFundForm.test.ts`

---

## Task 6.4 — `<NavSyncReport>` and `<ManualNavForm>`

**Depends on:** phase 5, task 5.1.

**Files:** `app/components/funds/NavSyncReport.vue`, `app/components/funds/ManualNavForm.vue`, and a
test each.

**`<NavSyncReport>`.** Props `{ report: NavSyncResult | null, fundNames: Record<string, string> }`.
One line per fund, in Spanish:

| `status` | Line |
|---|---|
| `synced` | `{nombre}: {formatInteger(inserted ?? 0)} valores nuevos, {formatInteger(updated ?? 0)} actualizados, hasta el {formatIsoDate(to)}` |
| `up-to-date` | `{nombre}: ya estaba al día` |
| `skipped` with `reason: 'no-symbol'` | `{nombre}: sin símbolo asignado, no se ha podido sincronizar` |

Also, when `skippedManual` is greater than zero: ` ({n} manuales respetados)` appended — a NAV
entered by hand always prevails, per section 6 of the spec, and the report should say so.
`report: null` renders nothing.

**Tests.** A report with one `synced` fund (`inserted: 27, updated: 0, to: '2026-08-03'`) and one
`skipped` / `no-symbol` renders both lines with the fund names, `'27 valores nuevos'` and
`'sin símbolo asignado'`.

**`<ManualNavForm>`.** Props `{ funds: Array<{ id: string, name: string }> }`, emits
`submit: [{ fundId: string, date: IsoDate, value: string }]`. Fields: a `<select>` of funds, an
`<input type="date">` labelled `Fecha`, and an `<input type="number" step="0.0001">` labelled
`Valor liquidativo`. The value is emitted **as the typed string**, never as a number:
`PUT /api/nav` rejects a JSON number by design. Validation: `Indica una fecha.`,
`El valor liquidativo debe ser mayor que 0.` — check with `new Decimal(value).greaterThan(0)`, and
refuse a date later than today with `La fecha no puede ser futura.`, which is what the API's
`readIsoDateNotAfter` enforces anyway.

**Tests.** A valid entry emits `{ fundId: 'world', date: '2026-08-03', value: '11.5' }` with `value`
a string. A value of `0` emits nothing and shows the message. A date of `2099-01-01` emits nothing
and shows `La fecha no puede ser futura.`

**Verify:** `pnpm test --project app app/components/funds/NavSyncReport.test.ts
app/components/funds/ManualNavForm.test.ts`

---

## Task 6.5 — The funds page

**Depends on:** 6.1, 6.2, 6.3, 6.4.

**File:** `app/pages/fondos.vue` (rewrite).

**Data.** `const { data, error, refresh } = await useFetch<FundView[]>('/api/funds')`.

**Layout.**

1. `<PageHeader title="Fondos" subtitle="Los fondos de la cartera y sus valores liquidativos">` with
   an actions slot holding a `Button` labelled `Actualizar valores liquidativos`, carrying a
   `RefreshCw` icon from `@lucide/vue`, disabled while a sync is running (label changes to
   `Actualizando…`).
2. `<ErrorNotice>` on a failed load, with `Reintentar`.
3. `<FundsTable>`.
4. `<NavSyncReport>` under a heading `Última sincronización`.
5. A `Añadir fondo` section with `<AddFundForm>`.
6. An `Introducir un valor liquidativo a mano` section with `<ManualNavForm>`.

**Actions**, all through the same `run(action, failureMessage)` helper as phase 5, each followed by
`await refresh()`:

| Trigger | Call | Failure message |
|---|---|---|
| `AddFundForm` `resolve` | `GET /api/funds/resolve?isin=…`, result into a `candidates` ref | `No se han podido buscar los símbolos de ese ISIN.` |
| `AddFundForm` `submit` | `POST /api/funds` | `No se ha podido añadir el fondo.` |
| `FundsTable` `clearSymbol` | `PATCH /api/funds/${id}` with body **`{ providerSymbol: null }`** | `No se ha podido quitar el símbolo.` |
| `FundsTable` `remove` | `DELETE /api/funds/${id}` | `No se ha podido eliminar el fondo.` A 409 gets its own text: `Ese fondo tiene compras registradas y no se puede eliminar.` |
| `SymbolCandidates` `choose` (on an existing fund) | `PATCH /api/funds/${id}` with `{ providerSymbol }` | `No se ha podido asignar el símbolo.` |
| Sync button | `POST /api/nav/sync` with `{}` | `No se han podido actualizar los valores liquidativos.` — on failure, still render `error.data?.funds` through `<NavSyncReport>` |
| `ManualNavForm` `submit` | `PUT /api/nav` | `No se ha podido guardar el valor liquidativo.` |

**The clear-symbol body is `{ providerSymbol: null }` and it only works because of phase 1, task
1.5.** Before that change the route silently ignored it.

**Verify:** `pnpm typecheck` and `pnpm build` exit 0.

---

## Task 6.6 — The funds screen renders against a real database

**Depends on:** 6.5.

**File:** `test/routes/pages.test.ts` (extend).

**Tests to add**, in a `describe('/fondos')` block. **These must not trigger a sync**: the page only
syncs on a click, and an HTTP `GET` of the page never does, so no socket opens.

1. `lists the seeded funds` — `GET /fondos`, the HTML contains
   `Fidelity MSCI World Index Fund EUR P Acc`, `IE00BYX5NX33`,
   `Vanguard Emerging Markets Stock Index Fund Inv EUR Acc` and `IE0031786696`.
2. **`shows a fund with no net asset value as unvalued`** — on the seeded database neither fund has
   a NAV, so the HTML contains `Sin valoración` and `Sin símbolo`, and contains no `0,00 €` in the
   funds table region. Assert also that it contains no `NaN`.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 6

- `pnpm test --project app` green, including `shows a fund with no net asset value as unvalued, not
  as zero`.
- `pnpm test --project routes` green.
- `pnpm typecheck` and `pnpm build` exit 0.
- The human partner, with a network connection, opens `/fondos`, resolves `IE00BYX5NX33`, sees both
  share classes with their prices, picks one, presses `Actualizar valores liquidativos`, and watches
  the dashboard come alive. Then presses `Quitar` on the symbol and confirms it goes back to
  `Sin símbolo` — the undo that did not exist before this plan.
