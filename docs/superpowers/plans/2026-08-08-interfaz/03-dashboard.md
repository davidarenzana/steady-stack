# Phase 3 — Dashboard

**Goal:** screen 1 of section 8 of the spec, designed rather than assembled. The evolution chart
arrives in phase 4; everything else on the dashboard is built here.

**Prerequisite:** phase 2 closed. `app/utils/format.ts` exists and is tested, the shell navigates,
`test/routes/pages.test.ts` exists.

**Verification of the whole phase:** `pnpm test --project app` green, and
`pnpm test --project routes test/routes/pages.test.ts` green with the dashboard assertions added —
the designed empty state on a seeded database, and the real figures once purchases are arranged.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [x] Task 3.1 — Semantic colour tokens and `<SummaryCard>`
- [ ] Task 3.2 — `<HeadlineValuation>`, the answer to "what is it worth and am I up"
- [ ] Task 3.3 — `<EmptyDashboard>`, the first screen anyone sees
- [ ] Task 3.4 — `<PortfolioSummary>`, and the three interface requirements of spec section 11
- [ ] Task 3.5 — `<FundPositionsTable>`
- [ ] Task 3.6 — The dashboard page
- [ ] Task 3.7 — The dashboard renders against a real database

---

## The screen answers four questions, in this order

One portfolio, two funds, money going in every month, a twenty-five-year horizon. Whoever opens this
screen wants to know four things, and the visual hierarchy must answer them in this order:

1. **What is it worth today?**
2. **Am I up or down?**
3. **What return am I actually earning?**
4. **How does reality compare to the theory?** — the chart, phase 4.

Everything else is secondary. Concretely, that means:

- **The headline is the current value**, at display size, with the gain immediately under it in
  **both euros and percent**. That single block answers questions 1 and 2 at a glance.
- **The valuation date sits with the headline.** Net asset values publish with about a day of lag, so
  the figure is normally *not* as of today. A financial figure with no date is untrustworthy, and
  `navDate` is in the payload for exactly this.
- **What was paid in and the XIRR are secondary**, visually lighter than the headline.
- **The positions table is last**, because it is detail, not answer.

**What not to build**, because they are the default mistakes and each one is a way of answering
nothing:

- A row of four equally weighted metric cards with nothing leading. If everything is emphasised,
  nothing is.
- Gauges, donuts or progress rings where a number would do.
- Figures that animate or count up on load. A number you cannot read while it moves is a number you
  cannot read. No `transition` and no keyframes on any element rendering a figure.
- Decoration on the chart until the two lines that matter — real against theoretical — stop being
  where the eye lands.

**Colour carries meaning sparingly.** Gain and loss are the only semantic colours on this screen;
everything else is neutral, and scenario colours belong to the chart's `chart-1` … `chart-5` tokens
and nowhere else. **Never encode gain or loss in colour alone**: the `+` or `-` sign is always
present in the formatted figure, and an icon and an accessible label carry it too, so the meaning
survives for anyone who cannot distinguish the hues.

**Figures are right-aligned and use tabular numerals.** Every element rendering a figure carries
`tabular-nums`. That is what the typeface decision in phase 2 was deferred for.

---

## Context an implementer needs

**The shape.** `GET /api/dashboard?asOf=YYYY-MM-DD` returns the `Dashboard` interface exported from
`server/services/read-model.ts`. Import it as a type and never re-declare it:

```ts
import type { Dashboard, FundPositionView, FundView } from '~~/server/services/read-model'
```

| Field | Type | Meaning on screen |
|---|---|---|
| `asOf` | `IsoDate` | The date the figures were asked for. **Not what to show** — see `navDate` |
| `navDate` | `IsoDate \| null` | The oldest of the per-fund NAV dates actually used. **This is the date to show** |
| `valuation.value` | `Cents` | The headline |
| `valuation.invested` | `Cents` | Paid in |
| `valuation.gain` | `Cents` | Capital gain, under the headline |
| `valuation.gainRatio` | `number` | Gain as a fraction of what was paid in. **`0`, never `NaN`, when nothing is invested** |
| `valuation.byFund` | `FundPositionView[]` | One entry per fund holding units: `fundId`, `name`, `units`, `nav`, `navDate`, `value`, `invested`, `gain` |
| `xirr` | `number \| null` | **`null`, not `0`**, when there are fewer than two cash flows or they all share a sign |
| `series` | — | Belongs to phase 4. Not read by anything in this phase |

**XIRR needs a plain-Spanish label and an explanation.** Most people do not know what an internal
rate of return is, and it is not the same as "how much I have gained": it weighs *when* each
contribution went in. The label is `Rentabilidad real anualizada (TIR)` and it always carries the
one-line explanation `Tiene en cuenta cuándo entró cada aportación, no solo cuánto has aportado.`
When it is `null` the screen shows `—` and the note `Aún no hay suficientes movimientos para
calcularla.` — never `0 %`, which would be a claim rather than an absence.

**The empty state is the default experience, not an edge case.** A clean checkout seeds the portfolio
with two contribution rules, **zero purchases and zero net asset values**, and neither fund has a
`provider_symbol` yet. So `byFund` is `[]`, every figure is `0`, `xirr` is `null` and `navDate` is
`null`. Section 11 of the spec requires it render neither a blank figure nor a `NaN`; the human
partner's requirement goes further — **it must say what to do next**, in Spanish, and be a designed
state rather than a fallback. Task 3.3 builds it.

**The condition for the empty state is `dashboard.valuation.byFund.length === 0`** — nothing has been
bought yet. Not `value === 0`, which a portfolio could legitimately reach, and not `invested === 0`
alone.

**The 404 is real.** `currentValuation` throws `NotFoundError` — which the route layer turns into a
404 — when a fund holding units has no NAV at all. A valuation missing a position is wrong, not
incomplete, so the read model refuses to under-count. The page must render that as an explanation the
user can act on, not as a blank screen.

**A test fixture builder** keeps the component tests short. Create `app/test-utils/fixtures.ts`
(imported only by tests, never by a component):

```ts
/** A `Dashboard` with everything at zero, overridden shallowly per test. */
export function makeDashboard(overrides?: DeepPartial<Dashboard>): Dashboard
```

Build the zero-value object literally and merge the two levels the tests actually override
(`valuation` and `series`). Do not reach for a deep-merge dependency.

**Do not over-specify pixels.** This plan fixes the hierarchy, the states, the Spanish labels and
what each component receives. Spacing, exact type scale and the composition of the hero block are the
implementer's craft, within those constraints.

---

## Task 3.1 — Semantic colour tokens and `<SummaryCard>`

**Depends on:** phase 2.

**Files:** `app/assets/css/tailwind.css` (edit), `app/components/dashboard/SummaryCard.vue`,
`app/components/dashboard/SummaryCard.test.ts`.

**The tokens.** Gain has no colour in the theme today, and **borrowing `chart-2` would collide with a
scenario line in the chart's legend** — the same hue would mean "Escenario 1" in one place and "you
are up" in another. Add one token by hand, in the same style as the rest of the file, changing
nothing else:

- in `:root`: `--positive: oklch(0.52 0.13 155);`
- in `.dark`: `--positive: oklch(0.72 0.14 155);`
- in the `@theme` block, next to the other colour mappings: `--color-positive: var(--positive);`

Loss reuses the existing `--destructive`. Two semantic colours, no more.

**`<SummaryCard>`** is the **secondary** metric block — deliberately not what the headline uses.

```ts
interface Props {
  /** Spanish label, e.g. `Aportado`. */
  label: string
  /** The figure, already formatted by `app/utils/format.ts`. */
  value: string
  /** One line of plain-Spanish explanation under the figure. */
  hint?: string
  /** Default `'neutral'`. */
  tone?: 'neutral' | 'positive' | 'negative'
}
```

Renders a `Card`: the label in muted small text, the value below it at a size clearly under the
headline's, carrying `tabular-nums` and `data-testid="summary-value"`; the hint in muted small text
with `data-testid="summary-hint"`. `tone` maps to `text-foreground`, `text-positive`,
`text-destructive`. **The component formats nothing** — it receives strings — and it animates
nothing.

**Tests.** Label, value and hint appear; the value element carries `tabular-nums`;
`tone: 'negative'` puts `text-destructive` on the value element and `tone: 'positive'` puts
`text-positive`; the hint element is absent when `hint` is not given.

**Verify:** `pnpm test --project app app/components/dashboard/SummaryCard.test.ts`, then
`pnpm build` exits 0 (the theme file changed).

---

## Task 3.2 — `<HeadlineValuation>`, the answer to "what is it worth and am I up"

**Depends on:** 3.1.

**Files:** `app/components/dashboard/HeadlineValuation.vue`, and its test.

**Props.**

```ts
interface Props {
  value: Cents
  gain: Cents
  gainRatio: number
  /** The date the net asset values behind `value` were published. */
  navDate: IsoDate | null
}
```

**Behaviour.** One block, four lines, in this order:

1. `Valor actual`, small and muted, `data-testid="headline-label"`.
2. `formatEuros(value)` at display size — the largest thing on the page — `tabular-nums`,
   `data-testid="headline-value"`.
3. The gain, `data-testid="headline-gain"`, reading `formatSignedEuros(gain)` then a separator then
   `formatSignedPercent(gainRatio)`, preceded by a `TrendingUp` / `TrendingDown` / `Minus` icon from
   `@lucide/vue` according to the sign of `gain`, coloured `text-positive` / `text-destructive` /
   `text-muted-foreground`, and carrying an `aria-label` of `Ganancia`, `Pérdida` or
   `Sin variación`. **The `+` or `-` in the formatted figure is what carries the meaning; the colour
   and the icon repeat it.**
4. `data-testid="valuation-date"`: `Valorado con datos del {formatIsoDate(navDate)}` when `navDate`
   is a date, and `Sin valor liquidativo disponible todavía` when it is `null`. Muted, small, and
   never omitted.

No animation, no transition, no count-up.

**Tests.**

1. `renders the value as the headline` — `value: 243150` renders `'2.431,50 €'` in
   `[data-testid="headline-value"]`.
2. `renders the gain in euros and percent together` — `gain: 23150`, `gainRatio: 23150 / 220000`
   renders a gain element containing both `'+231,50 €'` and `'+10,52 %'`.
3. `carries the sign in the text, not only in the colour` — with `gain: -23150`, the gain element's
   text contains `'-231,50 €'` **and** its `aria-label` is `Pérdida`. Assert both, so a future
   refactor cannot reduce the meaning to a hue.
4. `shows which day the net asset values come from` — `navDate: '2026-08-06'` renders
   `'Valorado con datos del 06/08/2026'`.
5. `says so when there is no net asset value yet` — `navDate: null` renders
   `'Sin valor liquidativo disponible todavía'` and no date.

**Verify:** `pnpm test --project app app/components/dashboard/HeadlineValuation.test.ts`

---

## Task 3.3 — `<EmptyDashboard>`, the first screen anyone sees

**Depends on:** phase 2.

**Files:** `app/components/dashboard/EmptyDashboard.vue`, and its test.

**Why it deserves its own component.** On a clean checkout this *is* the dashboard. "No hay datos"
would be an accurate and useless thing to say: the portfolio has a plan, it just has no history yet,
and there are three concrete steps between the user and a working screen. This state names them and
says which are already done.

**Props.**

```ts
interface Props {
  /** Every fund the portfolio holds, with what is still missing on each. */
  funds: Array<{ id: string, name: string, providerSymbol: string | null, hasNav: boolean }>
}
```

**Behaviour.** A `Card` with:

- Title: `Todavía no hay nada que valorar`.
- One paragraph: `La cartera ya tiene su plan de aportaciones, pero aún no se ha comprado nada.
  Estos son los tres pasos que faltan.`
- An ordered list of three steps, each with a state marker that is **text plus an icon, never colour
  alone** — `Hecho` with a `Check` icon, or `Pendiente` with a `Circle` icon:

  | Step | Spanish | Done when |
  |---|---|---|
  | 1 | `Elige el símbolo de cada fondo en Fondos` | every fund has a `providerSymbol` |
  | 2 | `Descarga los valores liquidativos desde Fondos` | every fund has `hasNav` |
  | 3 | `Materializa las aportaciones en Aportaciones` | never, in this state |

  Steps 1 and 2 link to `/fondos` and step 3 to `/aportaciones`, with a plain `<a href>`: this
  component is mounted outside Nuxt in its test, and a full page load on a local application is an
  acceptable price for a component that needs no framework.
- When a fund is missing its symbol, name it: `Falta el símbolo de: Fidelity MSCI World Index Fund
  EUR P Acc`, so the step is actionable rather than abstract.
- With `funds: []`, the first step becomes `Añade tus fondos en Fondos`.

**Tests.**

1. Two funds, neither with a symbol nor a NAV: the three steps render, all marked `Pendiente`, and
   both fund names appear in the missing-symbol line.
2. Both funds with a symbol but no NAV: step 1 is marked `Hecho`, steps 2 and 3 `Pendiente`.
3. `does not render a figure` — the rendered text contains neither `'0,00 €'` nor `'NaN'` nor
   `'0,00 %'`.
4. The links point at `/fondos` and `/aportaciones`.

**Verify:** `pnpm test --project app app/components/dashboard/EmptyDashboard.test.ts`

---

## Task 3.4 — `<PortfolioSummary>`, and the three interface requirements of spec section 11

**Depends on:** 3.1, 3.2, 3.3.

**Files:** `app/components/dashboard/PortfolioSummary.vue`, its test, and
`app/test-utils/fixtures.ts`.

**Props.** No fetching, no Nuxt import:

```ts
interface Props {
  dashboard: Dashboard
  /** For the empty state's next steps. An empty array is fine. */
  funds: Array<{ id: string, name: string, providerSymbol: string | null, hasNav: boolean }>
}
```

**Behaviour.**

When `dashboard.valuation.byFund.length === 0`, render **only** `<EmptyDashboard :funds="funds" />`.
No cards, no zeroes, no percentages.

Otherwise, in this order:

1. `<HeadlineValuation :value="valuation.value" :gain="valuation.gain"
   :gain-ratio="valuation.gainRatio" :nav-date="dashboard.navDate" />`.
2. A secondary row of exactly two `<SummaryCard>`s, visually lighter than the headline:

| Label | Value | Hint | Tone |
|---|---|---|---|
| `Aportado` | `formatEuros(valuation.invested)` | `Suma de todas las compras ejecutadas.` | `neutral` |
| `Rentabilidad real anualizada (TIR)` | `formatXirr(xirr)` | `Tiene en cuenta cuándo entró cada aportación, no solo cuánto has aportado.` when `xirr` is a number; `Aún no hay suficientes movimientos para calcularla.` when it is `null` | `positive` when `xirr > 0`, `negative` when `xirr < 0`, `neutral` when `null` |

**Tests.** Four `it`s, three of them named after the spec:

1. **`renders the gain of section 11 of the spec`** — `makeDashboard` with `invested: 220000`,
   `value: 243150`, `gain: 23150`, `gainRatio: 23150 / 220000`, and one entry in `byFund`. Assert the
   rendered text contains `'+231,50 €'` and `'+10,52 %'`.
2. **`shows which day the valuation's net asset values come from`** — `navDate: '2026-08-06'` and
   `asOf: '2026-08-08'`, one entry in `byFund`. Assert `[data-testid="valuation-date"]` reads
   `'Valorado con datos del 06/08/2026'` **and** that the rendered text does not contain
   `'08/08/2026'`. NAVs publish with a lag, and conflating the two dates is the mistake this test
   exists to catch.
3. **`renders neither a figure nor a NaN with nothing bought yet`** — the zero fixture with
   `byFund: []` and `xirr: null`. Assert the text contains `'Todavía no hay nada que valorar'`, and
   that it contains neither `'NaN'` nor `'0,00 €'`.
4. `renders the absence of an XIRR rather than a zero` — `xirr: null` with a non-empty `byFund`: the
   text contains `'—'` and `'Aún no hay suficientes movimientos para calcularla.'`, and does **not**
   contain `'0,00 %'`.

**Verify:** `pnpm test --project app app/components/dashboard/PortfolioSummary.test.ts`

---

## Task 3.5 — `<FundPositionsTable>`

**Depends on:** 3.1.

**Files:** `app/components/dashboard/FundPositionsTable.vue`, and its test.

**Props.** `{ positions: FundPositionView[] }`.

**Behaviour.** A `Table` from `~/components/ui/table` with these Spanish headers, in this order:

| Header | Cell |
|---|---|
| `Fondo` | `position.name` |
| `Participaciones` | `formatUnits(position.units)` |
| `Valor liquidativo` | `formatNav(position.nav)` |
| `Fecha` | `formatIsoDate(position.navDate)` |
| `Aportado` | `formatEuros(position.invested)` |
| `Valor` | `formatEuros(position.value)` |
| `Plusvalía` | `formatSignedEuros(position.gain)`, `text-positive` or `text-destructive` by sign |

**Every numeric cell is right-aligned and carries `tabular-nums`** — this table is the column of
figures the typeface was chosen for. Rows keep the order the API gave them: `valuate` already sorts
by value, descending, and the interface does not re-sort. With `positions: []` the component renders
nothing at all; the parent shows the empty state.

**Tests.** One position — `{ fundId: 'world', name: 'Fidelity MSCI World Index Fund EUR P Acc',
units: '160.000000', nav: '11.0000', navDate: '2026-08-03', value: 176000, invested: 160000,
gain: 16000 }` — renders `'160,0000'`, `'11,0000 €'`, `'03/08/2026'`, `'1.760,00 €'`,
`'1.600,00 €'` and `'+160,00 €'`. A second `it` asserts a numeric cell carries both `tabular-nums`
and a right-alignment class. A third asserts an empty `positions` array renders no `<table>`.

**Verify:** `pnpm test --project app app/components/dashboard/FundPositionsTable.test.ts`

---

## Task 3.6 — The dashboard page

**Depends on:** 3.4, 3.5.

**File:** `app/pages/index.vue` (rewrite).

**Behaviour.**

```ts
const { data, error, refresh, status } = await useFetch<Dashboard>('/api/dashboard')
const { data: fundRows } = await useFetch<FundView[]>('/api/funds')
useHead({ title: 'Resumen · Steady Stack' })

const funds = computed(() => (fundRows.value ?? []).map(fund => ({
  id: fund.id,
  name: fund.name,
  providerSymbol: fund.providerSymbol,
  hasNav: fund.latestNav !== null,
})))
```

`/api/funds` is fetched because the `Dashboard` payload cannot say whether a fund has a provider
symbol, and the empty state's next steps need it. It is cheap and it is the honest source.

Render, in order:

1. `<PageHeader title="Resumen" />`.
2. When `error` is set, an `<ErrorNotice>` and nothing else:
   - if `error.statusCode === 404`: title `No se puede valorar la cartera`, detail
     `Falta el valor liquidativo de algún fondo con participaciones. Actualízalos desde la pantalla de Fondos.`
     — this is the read model refusing to under-count, and the wording says where to go.
   - otherwise: title `No se ha podido cargar el resumen`, detail `error.statusMessage ?? ''`.
   - The notice's slot holds a `Button` labelled `Reintentar` calling `refresh()`.
3. When `data` is set: `<PortfolioSummary :dashboard="data" :funds="funds" />`, then the chart region
   (phase 4), then, when `data.valuation.byFund.length > 0`,
   `<FundPositionsTable :positions="data.valuation.byFund" />` under a heading `Posiciones`.
4. When `status === 'pending'` and there is no data yet, a muted line `Cargando…`. The page is
   server-rendered, so this only shows on client-side navigation.

**No arithmetic in this file**, and no animation on any figure. Everything it renders comes from a
response or from `app/utils/format.ts`.

**Verify:** `pnpm build` exits 0 and `pnpm typecheck` exits 0. The behaviour is verified over HTTP in
task 3.7; this page is not unit-tested, per the ruling in phase 2, task 2.1.

---

## Task 3.7 — The dashboard renders against a real database

**Depends on:** 3.6, phase 1.

**File:** `test/routes/pages.test.ts` (extend).

**Order matters inside this file.** The `it`s share one server and one database, and Vitest runs them
in declaration order. **The empty-state assertions must come before the ones that arrange
purchases.** Say so in a comment at the top of the block.

**Tests to add.**

1. `it('shows the designed empty state on a database with no purchases')` — `GET /` and read the
   HTML: it contains `Todavía no hay nada que valorar`, `Elige el símbolo de cada fondo`,
   `Descarga los valores liquidativos` and `Materializa las aportaciones`, and it contains neither
   `NaN` nor `0,00 €`.
2. `it('shows the portfolio figures once there are purchases')` — arrange directly through
   `database.db`, with `upsertNav` and `insertPurchase` from `server/db/queries`:

   | Row | Values |
   |---|---|
   | NAV | `world`, `2026-07-01`, `'10'`, `manual` |
   | NAV | `emerging`, `2026-07-01`, `'20'`, `manual` |
   | NAV | `world`, `2026-08-03`, `'11'`, `manual` |
   | NAV | `emerging`, `2026-08-03`, `'22'`, `manual` |
   | Purchase | `world`, month `2026-07`, date `2026-07-01`, `amount: 160000`, `nav: '10'`, `units: '160.000000'`, `source: 'manual'` |
   | Purchase | `emerging`, month `2026-07`, date `2026-07-01`, `amount: 40000`, `nav: '20'`, `units: '20.000000'`, `source: 'manual'` |

   The arithmetic those rows produce, which the assertions pin down: 160 units at 11 € is 1.760 €,
   20 units at 22 € is 440 €, so the portfolio is worth **2.200,00 €** against **2.000,00 €** paid
   in, a gain of **+200,00 €** and **+10,00 %**, valued with data from **03/08/2026**.

   Assert the HTML contains `2.200,00 €`, `2.000,00 €`, `+200,00 €`, `+10,00 %` and
   `Valorado con datos del 03/08/2026`, and that it contains no `NaN`.

   All four dates are in the past relative to the machine clock, which is what lets the page ask for
   today's valuation without a query parameter.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 3

- `pnpm test --project app` green, including the three tests named after section 11 of the spec.
- `pnpm test --project routes test/routes/pages.test.ts` green, both the empty state and the arranged
  figures.
- `pnpm typecheck` and `pnpm build` exit 0.
- The current value is unmistakably the largest figure on the screen, with the gain in euros and
  percent directly under it and the valuation date beside them; the XIRR is labelled in plain Spanish
  and explains itself; no figure animates; and nothing on the screen is coloured except a gain, a
  loss, and later the chart's scenario lines.
- The human partner opens `/` on a seeded database and is told what to do next, not that there is no
  data.
