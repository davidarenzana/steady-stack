import Decimal from '~~/core/decimal'

/**
 * The one place a typed percentage becomes the decimal string the API stores,
 * and back.
 *
 * It is a separate module from `app/utils/parse.ts` because the conversion is
 * the whole subject: a rate is the input this application is most sensitive to.
 * Section 7 of the spec has the projection compounding a monthly rate derived
 * from it over 300 months, and `readDecimalString` on the route refuses to
 * coerce a JSON number precisely so no float can enter through that door. This
 * module is the matching refusal on the way out of the browser.
 */

/**
 * A percentage, at most four decimal places. Beyond that is a hundredth of a
 * basis point — more precision than a 25-year projection deserves, and past the
 * point where a typo is likelier than an intention. Negative rates are rejected
 * rather than clamped: a scenario projecting a loss is a different feature, not
 * a sign flip.
 */
const PERCENT_PATTERN = /^\d+(\.\d{1,4})?$/

/**
 * A percentage typed by a person, as the decimal string the API stores:
 * `'9'` -> `'0.09'`. `null` when the text is not a percentage.
 *
 * Exact through `Decimal`, never `Number(input) / 100`: `7.25 / 100` in binary
 * floating point is not `0.0725`, and `9 / 100` is `0.09` only by luck of how it
 * prints. `toFixed()` with no argument drops trailing zeros, so `'9'` gives
 * `'0.09'` rather than `'0.090000'` — the same number, but written as a claim to
 * six decimals nobody made.
 */
export function parsePercentToRate(input: string): string | null {
  // One comma is the Spanish decimal separator; a numeric input yields a point.
  const text = input.trim().replace(',', '.')

  if (!PERCENT_PATTERN.test(text)) {
    return null
  }

  return new Decimal(text)
    .dividedBy(100)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
    .toFixed()
}

/**
 * The inverse, for filling an input: `'0.09'` -> `'9'`, `'0.0725'` -> `'7.25'`.
 *
 * Deliberately not Spanish typography — an `<input type="number">` discards a
 * value containing a comma, and there is no `%` because the label carries the
 * unit. `formatRate` in `app/utils/format.ts` is the one that renders `9 %` for
 * reading.
 */
export function formatRateForInput(annualRate: string): string {
  return new Decimal(annualRate).times(100).toFixed()
}
