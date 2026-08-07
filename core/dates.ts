import type { IsoDate, Month } from './types'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function parseMonth(month: Month): { year: number, monthIndex: number } {
  const match = MONTH_PATTERN.exec(month)
  if (!match) {
    throw new Error(`Invalid month: "${month}". Expected the format YYYY-MM`)
  }
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 }
}

/**
 * Validates and parses an ISO date, rejecting anything that does not
 * round-trip through `Date`, which is what catches calendar-invalid dates
 * such as `2026-02-30` that `Date` would otherwise silently roll over.
 */
function parseDate(date: IsoDate): Date {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`Invalid date: "${date}". Expected the format YYYY-MM-DD`)
  }
  const parsed = new Date(`${date}T00:00:00Z`)
  if (parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid date: "${date}". Expected the format YYYY-MM-DD`)
  }
  return parsed
}

/** The first day of a month, as `YYYY-MM-DD`. */
export function firstDayOfMonth(month: Month): IsoDate {
  const { year, monthIndex } = parseMonth(month)
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10)
}

/**
 * The last day of a month, as `YYYY-MM-DD`. Day zero of the next month is
 * the last day of this one, so this gets February right in leap years with
 * no special case.
 */
export function lastDayOfMonth(month: Month): IsoDate {
  const { year, monthIndex } = parseMonth(month)
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10)
}

/** The month a date falls in, as `YYYY-MM`. */
export function monthOf(date: IsoDate): Month {
  parseDate(date)
  return date.slice(0, 7)
}

/** Shifts a date by `count` days. Accepts negative values. */
export function addDays(date: IsoDate, count: number): IsoDate {
  if (!Number.isInteger(count)) {
    throw new Error(`Day offset must be an integer, received ${count}`)
  }

  const parsed = parseDate(date)
  parsed.setUTCDate(parsed.getUTCDate() + count)
  return parsed.toISOString().slice(0, 10)
}
