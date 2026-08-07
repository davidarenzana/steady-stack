import type { Month } from './types'

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function parse(month: Month): { year: number, monthIndex: number } {
  const match = MONTH_PATTERN.exec(month)
  if (!match) {
    throw new Error(`Invalid month: "${month}". Expected the format YYYY-MM`)
  }
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 }
}

function format(year: number, monthIndex: number): Month {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** Shifts a month by `count` positions. Accepts negative values. */
export function addMonths(month: Month, count: number): Month {
  if (!Number.isInteger(count)) {
    throw new Error(`Month offset must be an integer, received ${count}`)
  }

  const { year, monthIndex } = parse(month)
  const absolute = year * 12 + monthIndex + count
  return format(Math.floor(absolute / 12), ((absolute % 12) + 12) % 12)
}

/**
 * The list of consecutive months between two endpoints, both included.
 * Returns an empty list if `to` comes before `from`.
 */
export function monthRange(from: Month, to: Month): Month[] {
  parse(from)
  parse(to)

  const months: Month[] = []
  let current = from
  while (current <= to) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}
