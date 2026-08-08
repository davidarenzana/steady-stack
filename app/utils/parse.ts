import Decimal from '~~/core/decimal'
import type { Weight } from '~~/core/types'

/**
 * The boundary where a typed string becomes a domain value — the mirror of
 * `app/utils/format.ts`, which turns domain values into text.
 *
 * Everything here refuses rather than guesses. An amount with three decimal
 * places is a typo, not a value to round quietly, and a rejected input leaves
 * the user looking at what they typed instead of at something the application
 * silently decided on their behalf.
 */

/** A plain amount, point-separated, at most two decimal places. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/**
 * An amount typed by a person, as an exact number of cents. `null` when the
 * text is not an amount.
 *
 * The multiplication goes through `Decimal` rather than `Number(text) * 100`
 * because binary floating point cannot hold most decimal fractions: `8.11 *
 * 100` is `810.9999999999999`, which truncates to 810 cents and loses a cent
 * of somebody's money.
 */
export function parseEurosToCents(input: string): number | null {
  // One comma is the Spanish decimal separator; a numeric input yields a point.
  const text = input.trim().replace(',', '.')

  if (!AMOUNT_PATTERN.test(text)) {
    return null
  }

  return new Decimal(text).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/**
 * The inverse, for filling an `<input type="number">`: `20000` -> `'200.00'`.
 * Deliberately not Spanish typography — an `<input type="number">` accepts
 * only a point, so `formatEuros` would produce a value the browser discards.
 */
export function formatCentsForInput(cents: number): string {
  return new Decimal(cents).dividedBy(100).toFixed(2)
}

/**
 * The `weights` column of a rule row, which `GET /api/contributions` returns as
 * a JSON string: the route hands back the Drizzle row and `weights` is a `TEXT`
 * column holding `JSON.stringify(Weight[])`. The `months[].weights` of the same
 * payload is a real array, because it comes from `expandContributions` — so the
 * interface parses one and not the other. That asymmetry is a finding about the
 * route surface, recorded in `TODO.md`, not a shape worth designing around.
 *
 * Throws rather than returning a fallback: an unparseable rule is a broken row,
 * and rendering it as "no split" would be a lie about how the money is divided.
 */
export function parseWeights(raw: string): Weight[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Expected a non-empty array of weights, received ${raw}`)
  }

  return parsed.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Expected weights[${index}] to be an object, received ${JSON.stringify(item)}`)
    }
    const { fundId, weight } = item as Record<string, unknown>
    if (typeof fundId !== 'string' || fundId.length === 0) {
      throw new Error(`Expected weights[${index}].fundId to be a non-empty string, received ${JSON.stringify(fundId)}`)
    }
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      throw new Error(`Expected weights[${index}].weight to be a finite number, received ${JSON.stringify(weight)}`)
    }
    return { fundId, weight }
  })
}
