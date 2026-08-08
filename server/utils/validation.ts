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
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      throw new ValidationError(`Field "${field}[${index}].weight" must be a number, received ${formatReceived(weight)}`)
    }
    return { fundId, weight }
  })

  const sum = roundForDisplay(weights.reduce((total, w) => total + w.weight, 0))
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new ValidationError(`Field "${field}" must add up to 1, they add up to ${sum}`)
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
