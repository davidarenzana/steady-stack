import type {
  Cents,
  ContributionOverride,
  ContributionRule,
  Month,
  NavPoint,
  Timing,
  Weight,
} from '~~/core/types'
import type { Purchase } from '~~/core/purchases'
import type {
  ContributionOverrideRow,
  ContributionRuleRow,
  NavRow,
  PurchaseRow,
} from './schema'

/**
 * The mappers are the only line of defence between a corrupt row and a wrong
 * portfolio valuation: the schema in `./schema.ts` carries no `CHECK`
 * constraint on purpose, so an enum outside its declared values or a
 * fractional cents column is caught here, with an error naming the offending
 * column, rather than three layers up where it would just be a wrong number.
 */

/** A materialised purchase as read back from the database. */
export interface StoredPurchase extends Purchase {
  id: number
  portfolioId: string
  month: Month
  source: 'auto' | 'manual'
}

/** Same tolerance as `split()` in `core/money.ts`, so a rounding artefact never trips this check. */
const WEIGHT_SUM_TOLERANCE = 1e-9

/**
 * Parses the JSON stored in the `weights` column back into `Weight[]`.
 *
 * Throws rather than returning something core would silently misuse: invalid
 * JSON, a JSON value that is not an array, or weights that do not add up to 1
 * are all schema violations that no `CHECK` constraint catches.
 */
export function parseWeights(json: string): Weight[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  }
  catch {
    throw new Error('Stored weights are not valid JSON')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Stored weights must be an array')
  }

  const weights = parsed as Weight[]
  const total = weights.reduce((sum, w) => sum + w.weight, 0)
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`Stored weights must add up to 1, they add up to ${total}`)
  }

  return weights
}

/** Serialises a `Weight[]` for storage in the `weights` column. */
export function serialiseWeights(weights: Weight[]): string {
  return JSON.stringify(weights)
}

/**
 * Checks that `value` is an integer number of cents and returns it typed as
 * `Cents`. The only enforcement of the money invariant left, now that the
 * schema carries no `CHECK` constraint: rejects `NaN`, `Infinity`, non-integer
 * numbers and anything that is not a number at all, naming the column and the
 * offending value so the error can be traced back to its row.
 */
export function assertCents(value: unknown, field: string): Cents {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  throw new Error(`Column "${field}" must be an integer number of cents, found ${value}`)
}

/** Checks that `value` is one of the declared timing values. */
function assertTiming(value: unknown, field: string): Timing {
  if (value === 'start' || value === 'end') {
    return value
  }
  throw new Error(`Column "${field}" must be "start" or "end", found ${JSON.stringify(value)}`)
}

/** Checks that `value` is one of the declared purchase sources. */
function assertPurchaseSource(value: unknown, field: string): 'auto' | 'manual' {
  if (value === 'auto' || value === 'manual') {
    return value
  }
  throw new Error(`Column "${field}" must be "auto" or "manual", found ${JSON.stringify(value)}`)
}

/** Maps a `contribution_rule` row onto the core `ContributionRule`, dropping `id` and `portfolioId`. */
export function toContributionRule(row: ContributionRuleRow): ContributionRule {
  return {
    fromMonth: row.fromMonth,
    amount: assertCents(row.amount, 'amount'),
    timing: assertTiming(row.timing, 'timing'),
    weights: parseWeights(row.weights),
  }
}

/**
 * Maps a `contribution_override` row onto the core `ContributionOverride`.
 *
 * `timing` and `note` are built conditionally rather than set to `undefined`,
 * so a row where those columns are null maps to an object that genuinely
 * lacks the keys — matching what an override authored without them would
 * look like, and keeping `toEqual` comparisons honest.
 */
export function toContributionOverride(row: ContributionOverrideRow): ContributionOverride {
  const override: ContributionOverride = {
    month: row.month,
    amount: row.amount === null ? null : assertCents(row.amount, 'amount'),
  }

  if (row.timing !== null) {
    override.timing = assertTiming(row.timing, 'timing')
  }
  if (row.note !== null) {
    override.note = row.note
  }

  return override
}

/** Maps a `purchase` row onto a `StoredPurchase`. */
export function toPurchase(row: PurchaseRow): StoredPurchase {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    month: row.month,
    source: assertPurchaseSource(row.source, 'source'),
    fundId: row.fundId,
    date: row.date,
    amount: assertCents(row.amount, 'amount'),
    nav: row.nav,
    units: row.units,
  }
}

/** Maps a `nav` row onto the core `NavPoint`. The value stays a decimal string, never a number. */
export function toNavPoint(row: NavRow): NavPoint {
  return { date: row.date, value: row.value }
}
