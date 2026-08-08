import Decimal from '~~/core/decimal'
import type { IsoDate, Month, Timing, Weight } from '~~/core/types'
import { ValidationError } from './errors'

/**
 * Hand-rolled request validation. There is no schema library in this
 * project and none is added: the checks that matter — `Number.isInteger`
 * over cents and a regular expression over a decimal string — are not done
 * better by a generic validator, and eight functions do not justify a
 * dependency. Imports nothing but `./errors` and the core types.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

/** Renders a value the way it should appear after "received" in a message: quoted if it is a string, as-is otherwise. */
function formatReceived(value: unknown): string {
  if (value === undefined) return 'undefined'
  return JSON.stringify(value)
}

/** Reads a named field off a plain object, or `undefined` if the body is not an object at all. */
function fieldValue(body: unknown, field: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined
  return (body as Record<string, unknown>)[field]
}

/** Throws `ValidationError` unless `value` is present (neither `undefined` nor `null`). */
function requireValue(field: string, value: unknown): void {
  if (value === undefined || value === null) {
    throw new ValidationError(`Field "${field}" is required`)
  }
}

/** Reads a required string field. */
export function readString(body: unknown, field: string): string {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads a required string field that must not be empty. For an identifier
 * that names a row — a fund id, an ISIN, a purchase's `fundId` — an empty
 * string is not "a short name", it is a value pointing at nothing: `readString`
 * alone would let `{ fundId: '' }` through and create a purchase against no
 * fund at all.
 */
export function readNonEmptyString(body: unknown, field: string): string {
  const value = readString(body, field)
  if (value.length === 0) {
    throw new ValidationError(`Field "${field}" must not be an empty string`)
  }
  return value
}

/** Reads an optional string field, returning `undefined` when it is absent or explicitly `null`. */
export function readOptionalString(body: unknown, field: string): string | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads a required field that must be an exact integer number of cents. Never `parseFloat`, never a coerced string. */
export function readCents(body: unknown, field: string): number {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`Field "${field}" must be an integer number of cents, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads a field that must be present and is either an integer number of cents or explicitly `null`. */
export function readNullableCents(body: unknown, field: string): number | null {
  const value = fieldValue(body, field)
  if (value === undefined) {
    throw new ValidationError(`Field "${field}" is required`)
  }
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`Field "${field}" must be an integer number of cents, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads a required field that must be a month in the format `YYYY-MM`. */
export function readMonth(body: unknown, field: string): Month {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) {
    throw new ValidationError(`Field "${field}" must be a month in the format YYYY-MM, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads a required field that must be a calendar-valid date in the format
 * `YYYY-MM-DD`. Round-trips through `Date` to reject dates such as
 * `2026-02-30` that the format regular expression alone would let through.
 */
export function readIsoDate(body: unknown, field: string): IsoDate {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ValidationError(`Field "${field}" must be a date in the format YYYY-MM-DD, received ${formatReceived(value)}`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Field "${field}" must be a date in the format YYYY-MM-DD, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads a required decimal-string field, such as a NAV or an annual rate.
 * A JSON number is rejected rather than coerced, per section 7 of the spec:
 * money never travels as a floating-point number.
 */
export function readDecimalString(body: unknown, field: string): string {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    throw new ValidationError(`Field "${field}" must be a decimal string, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads a required field that must be exactly `"start"` or `"end"`. */
export function readTiming(body: unknown, field: string): Timing {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (value !== 'start' && value !== 'end') {
    throw new ValidationError(`Field "${field}" must be "start" or "end", received ${formatReceived(value)}`)
  }
  return value
}

/** How close the sum of weights must be to 1 to be accepted, absorbing floating-point noise from repeated additions. */
const WEIGHT_SUM_TOLERANCE = 1e-9

/** Rounds away floating-point noise before reporting a sum back to the caller. */
function roundForDisplay(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

/**
 * Reads a required, non-empty array of `{ fundId, weight }`, and verifies
 * the weights add up to exactly 1 — a split whose parts do not sum to the
 * whole is a bug however small the shortfall.
 */
export function readWeights(body: unknown, field: string): Weight[] {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`Field "${field}" must be a non-empty array of weights, received ${formatReceived(value)}`)
  }

  const weights: Weight[] = value.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new ValidationError(`Field "${field}[${index}]" must be an object with "fundId" and "weight", received ${formatReceived(item)}`)
    }
    const record = item as Record<string, unknown>
    const fundId = record.fundId
    const weight = record.weight
    if (typeof fundId !== 'string' || fundId.length === 0) {
      throw new ValidationError(`Field "${field}[${index}].fundId" must be a non-empty string, received ${formatReceived(fundId)}`)
    }
    // Bounded to (0, 1], not just "a number": a split's parts add up to 1 whether
    // one of them is negative or not, so the sum check below cannot catch
    // `[{ world, 2 }, { emerging, -1 }]` on its own — and `split()` in
    // core/money.ts would turn that into a negative contribution to a fund.
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > 1) {
      throw new ValidationError(`Field "${field}[${index}].weight" must be a number greater than 0 and at most 1, received ${formatReceived(weight)}`)
    }
    return { fundId, weight }
  })

  const sum = roundForDisplay(weights.reduce((total, w) => total + w.weight, 0))
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new ValidationError(`Field "${field}" must add up to 1, they add up to ${sum}`)
  }

  // A repeated fundId would make split()'s result keyed by fundId lose one of
  // its two parts silently, since a plain object cannot hold two entries under
  // the same key — the total would then no longer add up to the contribution.
  const seen = new Set<string>()
  for (const weight of weights) {
    if (seen.has(weight.fundId)) {
      throw new ValidationError(`Field "${field}" cannot repeat fundId "${weight.fundId}"`)
    }
    seen.add(weight.fundId)
  }

  return weights
}

/** Reads a required boolean field. */
export function readBoolean(body: unknown, field: string): boolean {
  const value = fieldValue(body, field)
  requireValue(field, value)
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Field "${field}" must be a boolean, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * True when `body` is a plain object carrying `field` as an own concept, even
 * set to `null` — as opposed to `fieldValue` returning `undefined` for both
 * "absent" and "explicitly null". Used where a field must never be supplied at
 * all, such as `fromMonth` on `PATCH /api/contributions/rules/:id`: rejecting
 * only a non-null value would still let `{ fromMonth: null }` slip through.
 */
export function hasField(body: unknown, field: string): boolean {
  return typeof body === 'object' && body !== null && field in (body as Record<string, unknown>)
}

/** Reads a required, non-empty route parameter, such as a fund id or a scenario id. */
export function readRouteParam(value: string | undefined, field: string): string {
  if (value === undefined || value.length === 0) {
    throw new ValidationError(`Route parameter "${field}" is required`)
  }
  return value
}

const INTEGER_PARAM_PATTERN = /^\d+$/

/** Reads a route parameter that must be a non-negative integer, such as a purchase or a rule id. */
export function readIntegerRouteParam(value: string | undefined, field: string): number {
  if (value === undefined || !INTEGER_PARAM_PATTERN.test(value)) {
    throw new ValidationError(`Route parameter "${field}" must be a positive integer, received ${formatReceived(value)}`)
  }
  return Number(value)
}

/** Reads a route parameter that must be a month in the format `YYYY-MM`. */
export function readMonthRouteParam(value: string | undefined, field: string): Month {
  if (value === undefined || !MONTH_PATTERN.test(value)) {
    throw new ValidationError(`Route parameter "${field}" must be a month in the format YYYY-MM, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads an optional field that must be a positive integer, such as
 * `horizonYears`. Absent or explicitly `null` returns `undefined`, so a
 * `PATCH` body that omits it leaves the stored value untouched.
 */
export function readOptionalPositiveInteger(body: unknown, field: string): number | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`Field "${field}" must be a positive integer, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads a required date field and rejects one later than `bound`. Used by
 * `PUT /api/nav`: a net asset value dated after today has not been quoted by
 * any market yet, and `data/steady-stack.db` already held two hand-entered
 * rows dated a month into the future before this check existed — a manual
 * NAV outranks a synced one by design, so an unbounded date would let a typo
 * or a test value falsify every valuation downstream of it, silently,
 * forever. `bound` itself is allowed: entering today's price by hand, ahead
 * of the day's sync, is the whole point of the manual channel. There is no
 * lower bound — a fund can legitimately be backfilled with an old NAV.
 */
export function readIsoDateNotAfter(body: unknown, field: string, bound: IsoDate): IsoDate {
  const value = readIsoDate(body, field)
  if (value > bound) {
    throw new ValidationError(`Field "${field}" cannot be later than ${bound}, received ${formatReceived(value)}`)
  }
  return value
}

/**
 * Reads a required decimal-string field that must be strictly positive, such
 * as a NAV: a fund's net asset value of zero or negative is not a smaller
 * price, it is not a price, and would make `unitsFor` divide by a
 * non-positive number.
 */
export function readPositiveDecimalString(body: unknown, field: string): string {
  const value = readDecimalString(body, field)
  if (new Decimal(value).lessThanOrEqualTo(0)) {
    throw new ValidationError(`Field "${field}" must be a positive decimal, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads an optional field that must be an integer number of cents, `undefined` when absent or explicitly `null`. */
export function readOptionalCents(body: unknown, field: string): number | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`Field "${field}" must be an integer number of cents, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads an optional decimal-string field, `undefined` when absent or explicitly `null`. */
export function readOptionalDecimalString(body: unknown, field: string): string | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    throw new ValidationError(`Field "${field}" must be a decimal string, received ${formatReceived(value)}`)
  }
  return value
}

/** Reads an optional date field in the format `YYYY-MM-DD`, `undefined` when absent or explicitly `null`. */
export function readOptionalIsoDate(body: unknown, field: string): IsoDate | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  return readIsoDate(body, field)
}

/** Reads an optional `"start"` / `"end"` field, `undefined` when absent or explicitly `null`. */
export function readOptionalTiming(body: unknown, field: string): Timing | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  return readTiming(body, field)
}

/** Reads an optional boolean field, `undefined` when absent or explicitly `null`. */
export function readOptionalBoolean(body: unknown, field: string): boolean | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  return readBoolean(body, field)
}

/** Reads an optional weights array, `undefined` when absent or explicitly `null`, validated the same way `readWeights` validates a required one. */
export function readOptionalWeights(body: unknown, field: string): Weight[] | undefined {
  const value = fieldValue(body, field)
  if (value === undefined || value === null) return undefined
  return readWeights(body, field)
}
