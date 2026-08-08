# Phase 2 — Formatting, typography and the shell

**Goal:** the two things every screen afterwards depends on — a single module that turns figures into
Spanish typography, and a page frame you can navigate — plus a real Vue test setup in the `app`
Vitest project, which plan 2 left empty and waiting.

**Prerequisite:** phase 1 closed. `pnpm test --project routes` green.

**Verification of the whole phase:** `pnpm test --project app` green, `pnpm test --project routes
test/routes/pages.test.ts` green (the four screens answer 200 with their Spanish headings in the
server-rendered HTML), `pnpm build` exits 0.

---

## Progress

Tick each task as it closes. **Commit after every task**: the main agent stages the change and
the `committer` agent writes the message — no conventional-commit prefix, no co-authorship
line, subject in the imperative, body hand-wrapped at 80 columns saying why.

- [x] Task 2.1 — The `app` Vitest project becomes real
- [x] Task 2.2 — `app/utils/format.ts`, the only place a figure becomes a string
- [x] Task 2.3 — The typeface decision
- [ ] Task 2.4 — The shadcn-vue components the shell needs
- [ ] Task 2.5 — Shared empty state, error notice and page header
- [ ] Task 2.6 — Layout, navigation and the four routes
- [ ] Task 2.7 — The screens answer over HTTP

---

## Context an implementer needs

**Spanish typography is not decoration, it is the spec.** Comma as decimal separator, point as
thousands separator, currency symbol after the figure with a space, space before `%`: `1.090,00 €`,
`14.415 €`, `9 %`, `+231,50 €`. Never `€1,090.00`, never `9%`.

**`Intl.NumberFormat('es-ES')` does all of it, once the options are right — and hand-rolling it is
the mistake.** The defaults are misleading: `format(1090)` gives `"1090,00"`, because Spanish omits
the thousands separator for exactly four digits. **`useGrouping: 'always'` is what fixes it**, and
with it the platform produces the spec's typography exactly, including the space before `€` and
before `%`. Verified on this project's Node 22.14:

```
new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always',
                                 minimumFractionDigits: 2, maximumFractionDigits: 2 })
  '1090.00'  -> '1.090,00 €'      '999.00' -> '999,00 €'      '-231.50' -> '-231,50 €'

new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 2 })
  0.1052272727 -> '10,52 %'
```

Digit grouping, the negative sign, the single-digit case, the exact-thousand case and the four-digit
boundary are all places a hand-written formatter hides a bug, and all of them are already tested by
the platform. **Write no grouping code.** This module's own job is two lines of string work and the
choice of options.

**Money never becomes a float, because `format()` takes a string.** Since ES2023 `Intl.NumberFormat`
accepts a decimal string and formats it at arbitrary precision — verified here:
`format('9007199254740993.99')` gives `'9.007.199.254.740.993,99 €'`, exact past
`Number.MAX_SAFE_INTEGER`. So the pipeline is **integer cents → decimal string by string
manipulation → `Intl.format(string)`**, with no arithmetic and no `Number` anywhere in it. (What
remains bounded is the `Cents` value itself, which is a JavaScript number by the API's contract;
that bound is the API's, not this module's.)

**One thing the platform gets typographically right and the test suite cannot type: the space before
`€` and `%` is `U+00A0`, a non-breaking space**, not `U+0020`. Measured, not assumed. Every
assertion in this plan — here, and the server-rendered HTML checks in phases 3 to 7 — is written
with an ordinary space, as is every figure in the spec, `CLAUDE.md` and this repository's prose. So
**`format.ts` normalises `U+00A0` and `U+202F` to an ordinary space on the way out**, and the
protection the non-breaking space was buying is bought instead with `whitespace-nowrap` on the
element rendering the figure — which is better, since it also keeps `1.090` from breaking across its
own thousands separator. The normalisation is one `replace`, and task 2.2 pins it with a test so
nobody removes it.

---

## Task 2.1 — The `app` Vitest project becomes real

**Depends on:** nothing.

**Files:** `package.json` (edit), `vitest.config.ts` (edit), `app/components/Probe.vue` (new,
temporary), `app/components/Probe.test.ts` (new, temporary).

**Behaviour.** The `app` project currently declares `environment: 'happy-dom'` and nothing else, so
it cannot compile a single-file component: Vitest has no Vue plugin and no path aliases.

1. `pnpm add -D @vitejs/plugin-vue` (it resolves to 6.0.8, already in the store as a transitive
   dependency of Nuxt).
2. In `vitest.config.ts`, the `app` project becomes:

```ts
{
  // Component tests. `@vue/test-utils` over happy-dom, per section 11 of the
  // spec: no browser, no server — given a state, does the component render the
  // right thing. Nuxt's own aliases are re-declared by hand because these files
  // are compiled by Vitest, not by Nuxt.
  plugins: [vue()],
  resolve: {
    alias: {
      '~~': fileURLToPath(new URL('.', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    name: 'app',
    include: ['app/**/*.test.ts'],
    environment: 'happy-dom',
  },
}
```

3. Prove it with a throwaway component: `app/components/Probe.vue` rendering
   `<p>{{ label }}</p>` from a `label: string` prop, and `app/components/Probe.test.ts` mounting it
   with `@vue/test-utils` and asserting the text.
4. **Delete both probe files** once the run is green, and re-run to confirm the project reports "no
   test files" rather than an error. They exist only to prove the toolchain compiles a `.vue` file.

**Ruling this task establishes, and every later phase obeys:** components under test import nothing
from Nuxt. No `useFetch`, no `useState`, no `definePageMeta`, no auto-imported `~/utils/*` — imports
are written out in full. Nuxt auto-imports do not exist under plain Vitest, and a component that
needs them is a page, not a component. Pages are not unit-tested; they are covered by the
server-rendered assertions in `test/routes/pages.test.ts`.

**Verify:** `pnpm test --project app` green with the probe, then green-and-empty after deleting it.

---

## Task 2.2 — `app/utils/format.ts`, the only place a figure becomes a string

**Depends on:** 2.1.

**Files:** `app/utils/format.ts` (new), `app/utils/format.test.ts` (new).

**Read the context section above first.** The short version: `Intl` does the formatting, this module
chooses the options and does the cents-to-string step. **No digit grouping is written by hand, and
no figure passes through a `Number` on its way to the screen.**

**Public surface.** Exactly these eleven functions, with these signatures:

```ts
import type { Cents, IsoDate, Month } from '~~/core/types'

/** An amount in cents as euros: `formatEuros(243150)` -> `'2.431,50 €'`. */
export function formatEuros(cents: Cents): string

/** The same with an explicit sign when non-zero: `formatSignedEuros(23150)` -> `'+231,50 €'`. */
export function formatSignedEuros(cents: Cents): string

/** A ratio as a percentage with two decimals: `formatPercent(0.1052)` -> `'10,52 %'`. */
export function formatPercent(ratio: number): string

/** The same with an explicit sign when non-zero: `'+10,52 %'`. */
export function formatSignedPercent(ratio: number): string

/** An annual rate held as a decimal string, without trailing zeros: `formatRate('0.09')` -> `'9 %'`. */
export function formatRate(annualRate: string): string

/** Units as a decimal string, four decimals: `formatUnits('107.864100')` -> `'107,8641'`. */
export function formatUnits(units: string): string

/** A NAV as a decimal string, four decimals and the currency: `formatNav('14.8321')` -> `'14,8321 €'`. */
export function formatNav(nav: string): string

/** `'2026-08-06'` -> `'06/08/2026'`. */
export function formatIsoDate(date: IsoDate): string

/** `'2026-08'` -> `'ago 2026'`. */
export function formatMonth(month: Month): string

/** An XIRR, `null` included: `'—'` when there is not enough data to compute one. */
export function formatXirr(xirr: number | null): string

/** A whole number, grouped: `formatInteger(14415)` -> `'14.415'`. */
export function formatInteger(value: number): string
```

**How they are built.** Two private helpers and a set of module-level formatters — built once at
module scope, not per call, because constructing an `Intl.NumberFormat` is the expensive part:

```ts
/**
 * An integer number of cents as a decimal string: `243150` -> `'243150'` ->
 * `'2431.50'`. Pure string manipulation — inserting a decimal point two digits
 * from the right is exact by construction — so money reaches `Intl` without
 * ever having been a floating-point number.
 */
function centsToDecimalString(cents: Cents): string {
  const negative = cents < 0
  const digits = String(Math.abs(cents)).padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/**
 * `Intl` separates a figure from its `€` or `%` with U+00A0. Every figure in
 * this repository — spec, tests, prose — is written with an ordinary space, so
 * that is what leaves this module. Line breaking is prevented with
 * `whitespace-nowrap` on the element instead, which also protects the
 * thousands separator.
 */
function normaliseSpaces(formatted: string): string {
  return formatted.replace(/[\u00A0\u202F]/g, ' ')
}
```

The formatters, all `'es-ES'`, all with `useGrouping: 'always'` — **that option is the whole reason
the spec's `1.090,00 €` comes out right, and removing it silently reverts to `1090,00 €`**:

| Formatter | Options | Used by |
|---|---|---|
| `MONEY` | `style: 'currency'`, `currency: 'EUR'`, 2 fraction digits | `formatEuros` |
| `SIGNED_MONEY` | the same plus `signDisplay: 'exceptZero'` | `formatSignedEuros` |
| `NAV` | `style: 'currency'`, `currency: 'EUR'`, 4 fraction digits | `formatNav` |
| `PERCENT` | `style: 'percent'`, 2 fraction digits | `formatPercent` |
| `SIGNED_PERCENT` | the same plus `signDisplay: 'exceptZero'` | `formatSignedPercent`, `formatXirr` |
| `RATE` | `style: 'percent'`, `minimumFractionDigits: 0`, `maximumFractionDigits: 2` | `formatRate` |
| `UNITS` | decimal, `minimumFractionDigits: 4`, `maximumFractionDigits: 4` | `formatUnits` |
| `INTEGER` | decimal, `maximumFractionDigits: 0` | `formatInteger` |

Then every function is one line: normalise the output of the right formatter applied to either
`centsToDecimalString(cents)` or, for the decimal-string inputs, **the string exactly as it arrived**
— `formatRate`, `formatUnits` and `formatNav` pass `annualRate`, `units` and `nav` straight through,
never through `Number()` and never through `Decimal`. `signDisplay: 'exceptZero'` is what puts the
`+` on a gain and leaves a zero unsigned, so no sign is prepended by hand. Rounding is `Intl`'s
default `halfExpand` — half away from zero — which is `ROUND_HALF_UP` for the positive figures and
symmetric for a loss.

The three that do not go straight through a formatter:

- `formatIsoDate('2026-08-06')` → `'06/08/2026'`, by slicing the string. **No `Date` object**: a
  `Date` would drag a time zone into a value that has none.
- `formatMonth('2026-08')` → `'ago 2026'`, from a hand-written table
  `['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']` indexed by the month
  number. Not `Intl.DateTimeFormat`, whose abbreviations vary by ICU version and have carried a
  trailing point in some.
- `formatXirr(null)` → `'—'` (an em dash, U+2014); a number → `formatSignedPercent(value)`.

**Tests**, in `app/utils/format.test.ts`. Write them first and watch them fail. Every expected value
below was measured on Node 22.14, and every space in them is an ordinary `U+0020`:

| Call | Expected |
|---|---|
| `formatEuros(243150)` | `'2.431,50 €'` |
| `formatEuros(109000)` | `'1.090,00 €'` |
| `formatEuros(99900)` | `'999,00 €'` |
| `formatEuros(0)` | `'0,00 €'` |
| `formatEuros(5)` | `'0,05 €'` |
| `formatEuros(-23150)` | `'-231,50 €'` |
| `formatEuros(100000000)` | `'1.000.000,00 €'` |
| `formatSignedEuros(23150)` | `'+231,50 €'` |
| `formatSignedEuros(-23150)` | `'-231,50 €'` |
| `formatSignedEuros(0)` | `'0,00 €'` |
| `formatPercent(0.1052272727272727)` | `'10,52 %'` |
| `formatPercent(0)` | `'0,00 %'` |
| `formatPercent(-0.0525)` | `'-5,25 %'` |
| `formatSignedPercent(0.1052272727272727)` | `'+10,52 %'` |
| `formatRate('0.09')` | `'9 %'` |
| `formatRate('0')` | `'0 %'` |
| `formatRate('0.0725')` | `'7,25 %'` |
| `formatUnits('107.864100')` | `'107,8641'` |
| `formatUnits('0.000000')` | `'0,0000'` |
| `formatUnits('1234.567890')` | `'1.234,5679'` |
| `formatNav('14.8321')` | `'14,8321 €'` |
| `formatNav('10')` | `'10,0000 €'` |
| `formatIsoDate('2026-08-06')` | `'06/08/2026'` |
| `formatMonth('2026-08')` | `'ago 2026'` |
| `formatMonth('2026-01')` | `'ene 2026'` |
| `formatXirr(null)` | `'—'` |
| `formatXirr(0.0847)` | `'+8,47 %'` |
| `formatInteger(14415)` | `'14.415'` |

**Four of those rows are guards rather than examples, and each gets its own named `it` so a failure
says what broke:**

1. **`groups thousands even at four digits`** — `formatEuros(109000)` is `'1.090,00 €'`. This is the
   case that fails the moment somebody "simplifies" `useGrouping: 'always'` away, because the
   `es-ES` default renders it `'1090,00 €'`. It is also the figure the spec uses, from the
   compounding example.
2. **`does not group below a thousand`** — `formatEuros(99900)` is `'999,00 €'`, the last value
   before grouping applies.
3. **`formats a loss as the mirror of a gain`** — `formatEuros(-23150)` is `'-231,50 €'` and
   `formatSignedEuros(-23150)` is the same string, while `formatSignedEuros(23150)` differs only in
   the sign character.
4. **`separates the figure from its unit with an ordinary space`** — assert
   `expect(formatEuros(109000)).not.toContain('\u00A0')` and the same for
   `formatPercent(0.09)`. `Intl` emits `U+00A0`; this is the test that keeps `normaliseSpaces` from
   being deleted as pointless.

Plus one `it` named after the spec: **`renders the gain of section 11 of the spec`** — given
`invested = 220000` and `value = 243150`, `formatSignedEuros(243150 - 220000)` is `'+231,50 €'` and
`formatSignedPercent((243150 - 220000) / 220000)` is `'+10,52 %'`. The subtraction lives in the test,
not in the module: components receive `gain` and `gainRatio` from the API already computed.

**Verify:** `pnpm test --project app app/utils/format.test.ts`

---

## Task 2.3 — The typeface decision

**Depends on:** nothing.

**Files:** `app/assets/css/tailwind.css` (edit, lines 1 and 115), `components.json` (edit).

**Why now.** `TODO.md`, *Deferred by decision*: Inter was left in place until a dashboard existed,
because a face for a figure-dense financial product can only be judged against real columns of
numbers. Those columns arrive in phase 3, so the decision is due now, ahead of them.

**The choice: IBM Plex Sans.** It was drawn for data-dense product interfaces, it is not the default
everyone reaches for, and — the requirement `TODO.md` names — it carries proper **tabular figures**
through the OpenType `tnum` feature, so a column of amounts lines up digit over digit instead of
shimmering as the values change.

**Changes.**

1. Line 1 becomes
   `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');`
2. `--font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;` — `--font-heading` already
   points at `--font-sans` and stays as it is.
3. In `components.json`, `"font": "inter"` becomes `"font": "ibm-plex-sans"`. If a later
   `shadcn-vue add` errors or warns about that value, revert **only that field** and note it in the
   report.
4. **Nothing else in that file changes.** It is hand-written for a reason: `shadcn-vue init`
   generates `cssVars: {}` empty for the `reka-vega` style, leaving `bg-background` and
   `border-border` undeclared and breaking the Tailwind 4 build.

**The standing rule this establishes:** every element that renders a figure produced by
`app/utils/format.ts` carries Tailwind's `tabular-nums` class. Table cells of amounts, summary card
values, chart axis labels. That rule is repeated in the tasks of phases 3 to 7 and is part of what
their component tests can assert (`expect(wrapper.find('[data-testid="value"]').classes()).toContain('tabular-nums')`)
where it matters most, which is the tables.

**Do not** run `/impeccable hooks ignore-value overused-font inter --shared`. The hook exception was
deliberately left unregistered so the warning would fire the next time this file was edited — which
is now, and the answer is that Inter is gone.

**Verify:** `pnpm build` exits 0, and `grep -c Inter app/assets/css/tailwind.css` returns 0.

---

## Task 2.4 — The shadcn-vue components the shell needs

**Depends on:** nothing.

**Files:** `app/components/ui/**` (generated).

**Behaviour.** Add four component families, one command each:

```sh
pnpm dlx shadcn-vue@latest add card
pnpm dlx shadcn-vue@latest add table
pnpm dlx shadcn-vue@latest add badge
pnpm dlx shadcn-vue@latest add separator
```

**Never `init`. Never `--force`.** After the four commands, verify the theme was not touched:

```sh
git diff --exit-code app/assets/css/tailwind.css
```

If that command reports a diff, revert the file (`git checkout -- app/assets/css/tailwind.css`) and
say so in the report: it means the CLI overwrote a hand-written theme, which breaks the build.

**Verify:** `git diff --exit-code app/assets/css/tailwind.css` exits 0, `pnpm build` exits 0, and
`pnpm typecheck` exits 0.

---

## Task 2.5 — Shared empty state, error notice and page header

**Depends on:** 2.1, 2.4.

**Files:** `app/components/EmptyState.vue`, `app/components/ErrorNotice.vue`,
`app/components/PageHeader.vue`, and one test file each.

**`EmptyState.vue`.** Props `{ title: string, description?: string }`, plus a default slot for an
action. Renders the title in a heading, the description as muted text, and the slot below. Uses
`Card` from `~/components/ui/card`. An icon from `@lucide/vue` (`Inbox`) is optional.

**`ErrorNotice.vue`.** Props `{ title: string, detail?: string }`, plus a default slot for a retry
button. Styled with the theme's `destructive` tokens. Its texts come from the caller, in Spanish;
the component hard-codes none.

**`PageHeader.vue`.** Props `{ title: string, subtitle?: string }`, plus an `actions` named slot.
Renders an `<h1>`.

**Tests** (`app/components/EmptyState.test.ts` and so on): each mounts the component with props and
asserts the rendered text, and one asserts that slot content appears. These are small on purpose —
they exist to keep the shared pieces honest and to prove the harness of 2.1 handles slots.

**Verify:** `pnpm test --project app`

---

## Task 2.6 — Layout, navigation and the four routes

**Depends on:** 2.3, 2.4, 2.5.

**Files:** `app/layouts/default.vue`, `app/components/AppNav.vue`, `app/components/AppNav.test.ts`,
`app/pages/index.vue` (rewrite), `app/pages/aportaciones.vue`, `app/pages/fondos.vue`,
`app/pages/escenarios.vue`, `app/app.vue` (edit).

**Behaviour.** `app/app.vue` wraps `<NuxtPage />` in `<NuxtLayout>`. `app/layouts/default.vue`
renders a header carrying the product name **Steady Stack** and `<AppNav />`, then a `<main>` with a
`max-w-6xl` container and the page slot.

**`AppNav.vue`** takes no props and renders exactly four `<NuxtLink>`s, in this order, with these
Spanish labels and paths:

| Label | Path |
|---|---|
| `Resumen` | `/` |
| `Aportaciones` | `/aportaciones` |
| `Fondos` | `/fondos` |
| `Escenarios` | `/escenarios` |

The active link is marked with `aria-current="page"` — `NuxtLink` sets `router-link-active` itself,
but a class is not an accessible state.

**The four pages** are placeholders for now, each rendering `<PageHeader>` with its Spanish title
(`Resumen`, `Aportaciones`, `Fondos`, `Escenarios`) and `useHead({ title: '<title> · Steady Stack' })`.
Phases 3, 5, 6 and 7 fill them in. The current placeholder copy of `app/pages/index.vue` — *Esqueleto
listo. El motor de cálculo llega en el plan 1.* — is deleted.

**Test** (`app/components/AppNav.test.ts`): mount with a `NuxtLink` stub, since the component is
mounted outside Nuxt:

```ts
const NuxtLink = { props: ['to'], template: '<a :href="to"><slot /></a>' }
mount(AppNav, { global: { stubs: { NuxtLink } } })
```

Assert the four labels appear in that order and that the rendered `href`s are `/`, `/aportaciones`,
`/fondos`, `/escenarios`. **The labels are asserted in Spanish**; that is the point of the test.

**Verify:** `pnpm test --project app app/components/AppNav.test.ts`, then `pnpm build` exits 0.

---

## Task 2.7 — The screens answer over HTTP

**Depends on:** 2.6, and phase 1 task 1.2 for the harness.

**File:** `test/routes/pages.test.ts` (new).

**Why this file exists.** End-to-end tests with a browser are out of v1, but a page that throws
during server-side rendering is not a design question, it is a broken screen. This file asks the real
Nuxt server for each of the four routes over HTTP and reads the HTML it sends back. No browser, no
hydration, no `playwright`. Phases 3, 5, 6 and 7 each add assertions to it, so it grows into the
proof that every screen renders against the seeded database.

**Tests.** `const database = await setupRouteServer()` at the top, exactly like the other route
files, then one `it` per route:

- `GET /` → status 200, and the HTML contains `Resumen` and `Steady Stack`.
- `GET /aportaciones` → 200, HTML contains `Aportaciones`.
- `GET /fondos` → 200, HTML contains `Fondos`.
- `GET /escenarios` → 200, HTML contains `Escenarios`.

Use `fetch` from `@nuxt/test-utils/e2e` and `await response.text()`; `$fetch` would try to parse the
HTML as JSON.

**Verify:** `pnpm test --project routes test/routes/pages.test.ts`

---

## Ending condition for phase 2

- `pnpm test --project app` green: the format module and the four shared components.
- `pnpm test --project routes test/routes/pages.test.ts` green: four screens, four 200s, Spanish
  headings in the server-rendered HTML.
- `pnpm build` and `pnpm typecheck` both exit 0.
- `git diff --exit-code app/assets/css/tailwind.css` shows only the two typography lines changed
  relative to the start of the phase, and nothing generated by a CLI.
- The human partner opens `pnpm dev` at `http://localhost:3000` and clicks through the four links.
  Everything is empty, but it is a navigable application with a face chosen for figures.
