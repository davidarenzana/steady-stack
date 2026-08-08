# Phase 4 — `<EvolutionChart>`

**Goal:** the chart of section 8 of the spec — the real portfolio, the cumulative contributions and
the active scenarios on one axis — as a **project-owned component**, so that replacing Unovis later
means touching one file. Section 3 of the spec asks for exactly that, in those words.

**Prerequisite:** phase 3 closed. The dashboard page fetches `Dashboard` and renders its figures.

**Verification of the whole phase:** `pnpm test --project app` green, including the test named after
section 11 of the spec (*the chart receives the real portfolio and the active scenarios*), and the
chart visible on `/` with the real line legible.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [x] Task 4.1 — The mapper, `buildEvolutionSeries`
- [x] Task 4.2 — The visible range, and why it is not the whole horizon
- [ ] Task 4.3 — `<EvolutionChart>` over Unovis
- [ ] Task 4.4 — The chart on the dashboard
- [ ] Task 4.5 — The chart is on the page, over HTTP

---

## The most important decision on this screen: what the chart shows by default

`series.months` is `horizonYears * 12 + 1` months. On the seeded portfolio that is **301 points**, of
which **two** currently have a real value. A chart that plots the full horizon by default is 99 %
imagined future and a speck of reality: the real portfolio line — the only line that is a fact — is
about half a percent of the width, invisible against three projections sweeping up to the top right.
That is a chart about the scenarios, and the screen is supposed to be about the portfolio.

**The default range is therefore "reality plus a year of context", not the whole horizon.** Formally,
from the first month to twelve months past the last month that has a real value; when nothing has
been bought yet, the first twenty-four months. With two real points the default window is fourteen
months, so the real line occupies roughly a seventh of the width instead of a five-hundredth, and
each new month of history widens it. Twelve months of projection ahead is enough to show where the
scenarios diverge without letting them take over.

**The full horizon is reachable deliberately**, through a range control offering, in Spanish:

| Control | Meaning |
|---|---|
| `Reciente` (default) | reality plus twelve months |
| `5 años` | the first 61 months |
| `10 años` | the first 121 months |
| `Todo` | all 301 |

The alternative — defaulting to `Todo` and letting the user zoom in — was considered and rejected:
it makes the first impression of the screen a projection rather than a position, and it requires an
action before the screen answers the question it exists to answer. The twenty-five-year view is the
*answer to a different question* ("where does this end up?"), and it is one click away.

The windowing is a pure function over the mapper's output, tested on its own (task 4.2). The chart
component receives already-windowed points; it does not slice anything itself.

---

## Context an implementer needs

**One file imports Unovis: `app/components/chart/EvolutionChart.vue`.** No page, no other component,
no utility. If a second file ever imports `@unovis/vue`, the wrapper has failed at its only job.

**The data comes from `dashboard.series`**, which plan 2 defined as:

```ts
series: {
  /** `horizonYears * 12 + 1` months, starting at the first contribution month. `[]` with no rules. */
  months: Month[]
  /** Cumulative planned contributions across the whole horizon. */
  contributed: Cents[]
  /** Real portfolio value per month. `null` where it is unknown or still in the future. */
  portfolio: Array<Cents | null>
  /** Only scenarios with `enabled = 1`. */
  scenarios: Array<{ id: string, name: string, color: string, annualRate: string, balance: Cents[] }>
}
```

All four arrays are the same length as `months`.

**`null` in `portfolio` means "we do not know", never zero.** That ruling is in `TODO.md`, and it is
why the real line must **stop or break** where the data stops. A line that drops to the axis reads as
a total loss, which would be a lie. Unovis's `Line` breaks on a missing value when `fallbackValue` is
left at its default of `undefined`, and treats `null` as numerical zero when `fallbackValue` is set
to `null` — so **the accessor handed to Unovis returns `undefined`, never `null`**, and
`interpolateMissingData` is left `false`. Task 4.1 pins that down with a test.

**Colours are the five theme tokens.** A scenario's `color` is `chart-1` … `chart-5`, and
`app/assets/css/tailwind.css` declares `--chart-1` … `--chart-5` for both light and dark. The mapper
turns `chart-1` into the CSS string `var(--chart-1)`. **A hex value anywhere here is a bug**: it
would fight the dark theme. The gain and loss colours of phase 3 (`--positive`, `--destructive`)
never appear in the chart, and the chart's colours never appear outside it.

**Money becomes a float in exactly one function, and only here.** Unovis places pixels, and a pixel
cannot be an integer number of cents. `centsToEuros()` in the mapper is the single sanctioned
conversion in the whole interface, and carries a comment saying so.

**Keep the chart quiet.** Two lines matter — real against theoretical — and everything else is
context: no gradients, no area fills competing with them, no point markers on 301 months, no
animation on load. The real portfolio line is the visually strongest thing in the plot.

---

## Task 4.1 — The mapper, `buildEvolutionSeries`

**Depends on:** phase 3.

**Files:** `app/components/chart/evolution-series.ts`,
`app/components/chart/evolution-series.test.ts`.

**Public surface.**

```ts
import type { Dashboard } from '~~/server/services/read-model'
import type { Month } from '~~/core/types'

/** One month on the x-axis, with every line's value for it. */
export interface EvolutionPoint {
  /** Position on the x-axis. Unovis needs a number, and a month is a string. */
  index: number
  month: Month
  /** Cumulative planned contributions, in euros. */
  contributed: number
  /** The real portfolio, in euros. `null` where it is unknown or still in the future. */
  portfolio: number | null
  /** Projected balance in euros, keyed by scenario id. */
  scenarios: Record<string, number>
}

/** One line, described independently of the charting library that draws it. */
export interface EvolutionSeries {
  /** `'contributed'`, `'portfolio'`, or `` `scenario:${id}` ``. */
  key: string
  /** Spanish, for the legend. */
  label: string
  /** A CSS colour, always a theme token: `'var(--chart-1)'`. */
  color: string
  /** `undefined` — never `null` — where there is no value, so the line breaks instead of falling to zero. */
  accessor: (point: EvolutionPoint) => number | undefined
}

export interface EvolutionChartData {
  points: EvolutionPoint[]
  series: EvolutionSeries[]
}

export function buildEvolutionSeries(dashboard: Dashboard): EvolutionChartData
```

**Rules, all of them testable.**

1. One `EvolutionPoint` per entry of `series.months`, with `index` being its position.
2. `centsToEuros(cents: Cents): number` is `cents / 100`, defined once, with this comment: *the only
   place in the interface where money becomes a floating-point number. A chart places pixels, and no
   arithmetic happens downstream of this call.*
3. `point.portfolio` keeps `null` where the API sent `null` — the data model stays as honest as the
   API. The **accessor** is what converts it: `point => point.portfolio ?? undefined`.
4. The series list, in this order:
   - `{ key: 'contributed', label: 'Aportado', color: 'var(--muted-foreground)' }`
   - `{ key: 'portfolio', label: 'Cartera real', color: 'var(--foreground)' }` — **omitted entirely
     when every entry of `series.portfolio` is `null`**, so a portfolio with nothing bought yet does
     not get a phantom flat line.
   - one per entry of `series.scenarios`, in the order the API returned them:
     `{ key: 'scenario:' + id, label: name, color: 'var(--' + color + ')' }`.
5. `dashboard.series.months.length === 0` returns `{ points: [], series: [] }`.

**Tests.** Build a small `Dashboard` fixture with `makeDashboard` from `app/test-utils/fixtures.ts`,
overriding `series` with two months:

```
months:      ['2026-07', '2026-08']
contributed: [200000, 220000]
portfolio:   [200000, null]
scenarios:   [
  { id: 'flat',       name: 'Sin interés',  color: 'chart-3', annualRate: '0',    balance: [200000, 220000] },
  { id: 'optimistic', name: 'Escenario 2',  color: 'chart-1', annualRate: '0.09', balance: [201441, 222892] },
]
```

1. `maps each month into a point in euros` — `points` has length 2; `points[0]` deep-equals
   `{ index: 0, month: '2026-07', contributed: 2000, portfolio: 2000,
   scenarios: { flat: 2000, optimistic: 2014.41 } }`; `points[1].portfolio` is `null`.
2. **`gives the chart the real portfolio and the active scenarios`** — the spec's test.
   `series.map(s => s.key)` equals
   `['contributed', 'portfolio', 'scenario:flat', 'scenario:optimistic']` and
   `series.map(s => s.label)` equals `['Aportado', 'Cartera real', 'Sin interés', 'Escenario 2']`.
   A second assertion: a dashboard whose `series.scenarios` holds only `optimistic` — which is what
   the API sends when the other two are disabled — produces exactly one `scenario:` series. The API
   already filters by `enabled`; the mapper must not re-filter and must not invent.
3. **`breaks the real line where the value is unknown instead of dropping it to zero`** — the
   `portfolio` accessor over `points[1]` returns `undefined`. Assert
   `toBeUndefined()`, and assert explicitly that it is neither `0` nor `null`. A `0` would draw a
   plunge to the axis and read as a total loss.
4. `resolves scenario colours to theme tokens` — the `scenario:optimistic` series has
   `color: 'var(--chart-1)'`, and no series colour contains `'#'`.
5. `omits the real portfolio line when nothing has been bought` — with `portfolio: [null, null]`,
   `series.map(s => s.key)` does not contain `'portfolio'` but still contains `'contributed'` and
   both scenarios. **This is half of the spec's empty-state requirement: not a blank chart, and no
   `NaN`.**
6. `returns nothing to draw when there is no horizon` — `months: []` gives
   `{ points: [], series: [] }`.
7. `each accessor reads its own value` —
   `series.find(s => s.key === 'scenario:optimistic')!.accessor(points[0])` is `2014.41`.

**Verify:** `pnpm test --project app app/components/chart/evolution-series.test.ts`

---

## Task 4.2 — The visible range, and why it is not the whole horizon

**Depends on:** 4.1.

**Files:** `app/components/chart/evolution-range.ts`, `app/components/chart/evolution-range.test.ts`.

**Read the section at the top of this file before writing anything here.** The whole point is that
301 months with two real values is a chart about nothing.

**Public surface.**

```ts
import type { EvolutionPoint } from './evolution-series'

/** The ranges the chart offers, in the order the control lists them. */
export type EvolutionRange = 'recent' | '5y' | '10y' | 'all'

/** Spanish labels for the range control. */
export const EVOLUTION_RANGE_LABELS: Record<EvolutionRange, string> = {
  recent: 'Reciente',
  '5y': '5 años',
  '10y': '10 años',
  all: 'Todo',
}

export const DEFAULT_EVOLUTION_RANGE: EvolutionRange = 'recent'

/**
 * The points a range shows. `'recent'` is reality plus twelve months: from the
 * first month to twelve past the last one with a real value, or the first
 * twenty-four months when nothing has been bought yet. Anything else would
 * hand the eye 301 months of which two are facts.
 */
export function pointsInRange(points: EvolutionPoint[], range: EvolutionRange): EvolutionPoint[]
```

**Rules.**

- `'recent'`: let `lastReal` be the highest index whose `portfolio` is not `null`. When there is one,
  return `points.slice(0, Math.min(lastReal + 13, points.length))`; when there is none, return
  `points.slice(0, Math.min(24, points.length))`.
- `'5y'` → the first 61 points, `'10y'` → the first 121, `'all'` → all of them, each capped at
  `points.length`.
- An empty input returns an empty array for every range.

**Tests.** Build 301 points with a helper in the test file, real values at indices 0 and 1 only:

1. `defaults to reality plus a year` — `pointsInRange(points, 'recent')` has length 14, its last
   entry's `index` is 13.
2. `widens as history accumulates` — with real values through index 11, `'recent'` has length 24.
3. `falls back to two years when nothing has been bought` — every `portfolio` `null`, `'recent'`
   has length 24.
4. `never runs past the horizon` — with only 6 points and real values at 0 and 1, `'recent'` returns
   all 6, not 14.
5. `5y`, `10y` and `all` return 61, 121 and 301.
6. An empty array returns an empty array for each of the four ranges.

**Verify:** `pnpm test --project app app/components/chart/evolution-range.test.ts`

---

## Task 4.3 — `<EvolutionChart>` over Unovis

**Depends on:** 4.1, 4.2.

**Files:** `app/components/chart/EvolutionChart.vue`,
`app/components/chart/EvolutionChart.test.ts`.

**Props.**

```ts
interface Props {
  /** Every point of the horizon. The component windows them itself with `pointsInRange`. */
  points: EvolutionPoint[]
  series: EvolutionSeries[]
  /** Pixel height of the plot. Default 320. */
  height?: number
}
```

The visible range is internal state, initialised to `DEFAULT_EVOLUTION_RANGE`, so the page does not
have to own it.

**Behaviour.**

- When `series.length === 0`, render only
  `<p data-testid="chart-empty">Todavía no hay datos para el gráfico</p>` and no Unovis component at
  all. A chart with no lines is a blank box, and section 11 forbids exactly that.
- Otherwise render, in this order:
  1. A range control: four `<button>`s, `data-testid="chart-range"`, labelled from
     `EVOLUTION_RANGE_LABELS`, the current one marked `aria-pressed="true"`. Native buttons, not a
     reka-ui widget: this component is unit-tested under happy-dom.
  2. A legend: `<ul data-testid="chart-legend">` with one `<li data-testid="chart-legend-item">` per
     series, each carrying a swatch `<span :style="{ backgroundColor: item.color }">` and the Spanish
     `label`. Plain HTML — the legend must be readable without the charting library.
  3. `<VisXYContainer :data="visiblePoints" :height="height">` containing:
     - one `<VisLine>` per series, with `:x="(point) => point.index"`, `:y="item.accessor"`,
       `:color="item.color"` and `:interpolate-missing-data="false"`. **Do not set
       `fallback-value`**: its default of `undefined` is what makes the line break rather than fall
       to zero;
     - `<VisAxis type="x" :tickFormat="..." />` rendering the year of the month at that index
       (`visiblePoints[value]?.month.slice(0, 4) ?? ''`) — 301 months would otherwise print 301
       labels;
     - `<VisAxis type="y" :tickFormat="..." />` rendering `formatInteger(value) + ' €'` from
       `~/utils/format`;
     - `<VisCrosshair>` and `<VisTooltip>`, the crosshair's template showing the month with
       `formatMonth` and each series' value with `formatEuros(Math.round(value * 100))`.
  4. Under the plot, a muted caption when the range is not `'all'`:
     `Mostrando {n} meses de {total}. Cambia el rango para ver todo el horizonte.`

`visiblePoints` is `computed(() => pointsInRange(props.points, range.value))`. No gradients, no area
fills, no point markers, no load animation.

Imports: `VisXYContainer`, `VisLine`, `VisAxis`, `VisCrosshair`, `VisTooltip` from `@unovis/vue`.
Nothing from Nuxt — the page owns the `<ClientOnly>` wrapper (task 4.4).

**Test.** Unovis measures the DOM on mount and happy-dom lays out no SVG, so the component test
replaces the library with recording stubs. That is not a workaround: section 11 asks whether the
chart *receives* the right series, which is exactly what a stub can answer and a real renderer
cannot.

```ts
vi.mock('@unovis/vue', () => ({
  VisXYContainer: { name: 'VisXYContainer', props: ['data', 'height'], template: '<div><slot /></div>' },
  VisLine: { name: 'VisLine', props: ['x', 'y', 'color', 'interpolateMissingData'], template: '<div />' },
  VisAxis: { name: 'VisAxis', props: ['type', 'tickFormat'], template: '<div />' },
  VisCrosshair: { name: 'VisCrosshair', props: ['template'], template: '<div />' },
  VisTooltip: { name: 'VisTooltip', template: '<div />' },
}))
```

Assertions, over the mapper's output for the fixture of task 4.1 unless stated otherwise:

1. **`hands one line per series to the chart`** — `wrapper.findAllComponents({ name: 'VisLine' })`
   has length 4, and their `color` props are, in order, `'var(--muted-foreground)'`,
   `'var(--foreground)'`, `'var(--chart-3)'`, `'var(--chart-1)'`.
2. `never interpolates a missing value` — every `VisLine` has `interpolateMissingData` `false`, and
   none of them received a `fallbackValue` prop.
3. **`shows the recent window by default, not the whole horizon`** — mounted with 301 points whose
   real values stop at index 1, the `VisXYContainer` stub's `data` prop has length 14. Then clicking
   the `Todo` button gives it length 301. This is the decision at the top of this file, pinned down.
4. `renders a legend with the Spanish labels` — the four `[data-testid="chart-legend-item"]`
   elements read `Aportado`, `Cartera real`, `Sin interés`, `Escenario 2`.
5. `renders nothing to draw when there are no series` — with `series: []` and `points: []`, the
   `[data-testid="chart-empty"]` element is present, `findAllComponents({ name: 'VisLine' })` is
   empty, and the text contains no `NaN`.

**Verify:** `pnpm test --project app app/components/chart/EvolutionChart.test.ts`

---

## Task 4.4 — The chart on the dashboard

**Depends on:** 4.3.

**File:** `app/pages/index.vue` (edit).

**Behaviour.** Between `<PortfolioSummary>` and `<FundPositionsTable>`, under a heading `Evolución`:

```vue
<ClientOnly>
  <EvolutionChart :points="chart.points" :series="chart.series" />
  <template #fallback>
    <p class="text-muted-foreground text-sm">Preparando el gráfico…</p>
  </template>
</ClientOnly>
```

with

```ts
const chart = computed(() => data.value
  ? buildEvolutionSeries(data.value)
  : { points: [], series: [] })
```

**Why `<ClientOnly>`.** Unovis builds its SVG against a real layout; rendering it on the server
produces at best a wrong-sized chart and at worst a crash on a missing DOM API. The fallback is
server-rendered, so the page is never a hole. Should a later check show Unovis server-renders
cleanly, dropping the wrapper is a one-line change — and the fallback text is what
`test/routes/pages.test.ts` asserts in task 4.5, so removing it would be caught.

**Verify:** `pnpm build` and `pnpm typecheck` exit 0.

---

## Task 4.5 — The chart is on the page, over HTTP

**Depends on:** 4.4.

**File:** `test/routes/pages.test.ts` (extend).

**Test.** In the dashboard block, one more `it('renders the chart region')`: `GET /` and assert the
HTML contains `Evolución` and `Preparando el gráfico`. This proves the chart is mounted on the page
and that the server-side render does not throw, which is the only part of a client-drawn chart an
HTTP test can honestly claim.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 4

- `pnpm test --project app` green, with the spec's chart test and the default-range test passing by
  name.
- `pnpm test --project routes` green.
- `grep -rl "@unovis" app/ --include=*.vue --include=*.ts` lists exactly one file:
  `app/components/chart/EvolutionChart.vue`.
- `pnpm build` and `pnpm typecheck` exit 0.
- The human partner opens `/` with purchases arranged and sees, **without touching anything**, a
  chart where the real line is legible against a year of projection — and, on pressing `Todo`, the
  whole twenty-five-year horizon. The real line ends where the data ends; it never falls to the axis.
