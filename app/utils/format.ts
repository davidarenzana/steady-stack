import type { Cents, IsoDate, Month } from '~~/core/types'

/**
 * The only place in the application where a figure becomes a string. Every
 * amount, rate, unit count and date the interface shows passes through here,
 * so Spanish typography is decided once: comma for the decimal separator,
 * point for thousands, the unit after the figure with a space —
 * `1.090,00 €`, `9 %`, `107,8641`.
 *
 * `Intl.NumberFormat` does the formatting and no grouping is written by hand.
 * Digit grouping, the negative sign, the single-digit case and the four-digit
 * boundary are all places a hand-written formatter hides a bug, and the
 * platform has them tested already. What this module owns is the choice of
 * options and the cents-to-string step.
 *
 * Money never becomes a floating-point number on the way to the screen: since
 * ES2023 `format()` accepts a decimal string and renders it at arbitrary
 * precision, so the pipeline is integer cents → decimal string by string
 * manipulation → `Intl.format(string)`, with no arithmetic in it. The decimal
 * strings that arrive already formed — a NAV, a unit count, an annual rate —
 * are passed straight through, never through `Number()` and never through
 * `Decimal`.
 */

/**
 * An integer number of cents as a decimal string: `243150` → `'2431.50'`.
 * Pure string manipulation — inserting a decimal point two digits from the
 * right is exact by construction — so money reaches `Intl` without ever
 * having been a float.
 */
function centsToDecimalString(cents: Cents): string {
  const negative = cents < 0
  const digits = String(Math.abs(cents)).padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/**
 * `Intl` separates a figure from its `€` or `%` with U+00A0, and uses U+202F
 * in some locales. Every figure in this repository — the spec, `CLAUDE.md`,
 * every test — is written with an ordinary space, so that is what leaves this
 * module. Line breaking is prevented with `whitespace-nowrap` on the element
 * rendering the figure instead, which is better anyway: it also stops
 * `1.090` from breaking across its own thousands separator.
 */
function normaliseSpaces(formatted: string): string {
  return formatted.replace(/[\u00A0\u202F]/g, ' ')
}

/**
 * Formats a decimal string, which is the whole point of this module: since
 * ES2023 `Intl.NumberFormat.format` reads a string at arbitrary precision, so
 * money reaches the screen without passing through a float.
 *
 * The cast is the one unavoidable piece of unpleasantness. TypeScript types
 * that parameter as `Intl.StringNumericLiteral`, which is
 * `` `${number}` | 'Infinity' | '-Infinity' | '+Infinity' `` — a
 * template-literal type that no plain `string` is assignable to, however
 * numeric its contents. Every string reaching here is numeric by
 * construction: `centsToDecimalString` builds `-?\d+\.\d\d` from digits, and
 * the NAVs, unit counts and rates that arrive already formed were checked
 * against `DECIMAL_PATTERN` by `server/utils/validation.ts` before they were
 * ever stored. Confining the cast to this one function is what keeps it from
 * being repeated eleven times below.
 */
function formatDecimal(formatter: Intl.NumberFormat, decimal: string): string {
  return normaliseSpaces(formatter.format(decimal as Intl.StringNumericLiteral))
}

/** Formats a value that is a JavaScript number by contract — a ratio, or a count of something that is not money. */
function formatNumber(formatter: Intl.NumberFormat, value: number): string {
  return normaliseSpaces(formatter.format(value))
}

const LOCALE = 'es-ES'

/**
 * Built once at module scope rather than per call: constructing an
 * `Intl.NumberFormat` is the expensive part, formatting with one is cheap.
 *
 * `useGrouping: 'always'` is not decoration. The `es-ES` default omits the
 * thousands separator for exactly four digits, so without it `109000` renders
 * as `1090,00 €` instead of the spec's `1.090,00 €`. Removing that option
 * breaks one figure in ten and none of the others.
 */
const MONEY = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const SIGNED_MONEY = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // What puts the `+` on a gain and leaves a zero unsigned, so no sign is
  // ever prepended by hand.
  signDisplay: 'exceptZero',
})

const NAV = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const PERCENT = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const SIGNED_PERCENT = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  useGrouping: 'always',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/** An annual rate reads as `9 %`, not `9,00 %`: the trailing zeros carry no information a user wants. */
const RATE = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  useGrouping: 'always',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const UNITS = new Intl.NumberFormat(LOCALE, {
  useGrouping: 'always',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const INTEGER = new Intl.NumberFormat(LOCALE, {
  useGrouping: 'always',
  maximumFractionDigits: 0,
})

/** An amount in cents as euros: `formatEuros(243150)` -> `'2.431,50 €'`. */
export function formatEuros(cents: Cents): string {
  return formatDecimal(MONEY, centsToDecimalString(cents))
}

/** The same with an explicit sign when non-zero: `formatSignedEuros(23150)` -> `'+231,50 €'`. */
export function formatSignedEuros(cents: Cents): string {
  return formatDecimal(SIGNED_MONEY, centsToDecimalString(cents))
}

/** A ratio as a percentage with two decimals: `formatPercent(0.1052)` -> `'10,52 %'`. */
export function formatPercent(ratio: number): string {
  return formatNumber(PERCENT, ratio)
}

/** The same with an explicit sign when non-zero: `'+10,52 %'`. */
export function formatSignedPercent(ratio: number): string {
  return formatNumber(SIGNED_PERCENT, ratio)
}

/** An annual rate held as a decimal string, without trailing zeros: `formatRate('0.09')` -> `'9 %'`. */
export function formatRate(annualRate: string): string {
  return formatDecimal(RATE, annualRate)
}

/** Units as a decimal string, four decimals: `formatUnits('107.864100')` -> `'107,8641'`. */
export function formatUnits(units: string): string {
  return formatDecimal(UNITS, units)
}

/** A NAV as a decimal string, four decimals and the currency: `formatNav('14.8321')` -> `'14,8321 €'`. */
export function formatNav(nav: string): string {
  return formatDecimal(NAV, nav)
}

/**
 * `'2026-08-06'` -> `'06/08/2026'`, by slicing the string. No `Date` object:
 * a date in this application has no time zone, and constructing one would
 * drag a time zone into it — the same reason `core/dates.ts` treats a date as
 * text.
 */
export function formatIsoDate(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

/**
 * The abbreviated Spanish months, indexed by month number minus one. Written
 * out rather than taken from `Intl.DateTimeFormat`, whose abbreviations vary
 * by ICU version and have carried a trailing point in some of them.
 */
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `'2026-08'` -> `'ago 2026'`. */
export function formatMonth(month: Month): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1]
  return `${name} ${month.slice(0, 4)}`
}

/**
 * An XIRR, `null` included. A `null` is not a rate of zero — it means there
 * is not enough data to compute one, most often because nothing has been
 * bought yet — so it renders as an em dash rather than as `0,00 %`.
 */
export function formatXirr(xirr: number | null): string {
  return xirr === null ? '—' : formatSignedPercent(xirr)
}

/** A whole number, grouped: `formatInteger(14415)` -> `'14.415'`. */
export function formatInteger(value: number): string {
  return formatNumber(INTEGER, value)
}
