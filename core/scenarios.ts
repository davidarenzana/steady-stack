import Decimal from './decimal'
import { monthlyRate } from './rates'
import type { Cents, Contribution, Month } from './types'

export interface ScenarioPoint {
  month: Month
  /** Projected balance at the close of the month. */
  balance: Cents
  /** Total contributed up to the close of the month, with no return. */
  contributed: Cents
}

/**
 * Projects a theoretical scenario month by month.
 *
 *   balance(n) = (balance(n-1) + start_contributions(n)) * (1 + r) + end_contributions(n)
 *
 * The balance is carried in `Decimal` at full precision across the whole horizon
 * and is rounded to cents only when building each output point. Rounding on every
 * iteration would accumulate error over 300 months.
 *
 * Contributions whose month falls outside `months` are ignored.
 */
export function projectScenario(
  contributions: Contribution[],
  annualRate: number,
  months: Month[],
): ScenarioPoint[] {
  const rateFactor = monthlyRate(annualRate).plus(1)

  const startOfMonth = new Map<Month, Cents>()
  const endOfMonth = new Map<Month, Cents>()
  for (const c of contributions) {
    const bucket = c.timing === 'start' ? startOfMonth : endOfMonth
    bucket.set(c.month, (bucket.get(c.month) ?? 0) + c.amount)
  }

  let balance = new Decimal(0)
  let contributed = 0
  const points: ScenarioPoint[] = []

  for (const month of months) {
    const atStart = startOfMonth.get(month) ?? 0
    const atEnd = endOfMonth.get(month) ?? 0

    balance = balance.plus(atStart).times(rateFactor).plus(atEnd)
    contributed += atStart + atEnd

    points.push({
      month,
      balance: balance.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      contributed,
    })
  }

  return points
}
