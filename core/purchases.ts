import Decimal from './decimal'
import { split } from './money'
import type { Cents, Contribution, IsoDate } from './types'

/** Decimal places units are recorded with. */
const UNIT_DECIMALS = 6

export interface Purchase {
  fundId: string
  date: IsoDate
  amount: Cents
  /** NAV applied, as a decimal string. */
  nav: string
  /** Units acquired, as a decimal string with six decimal places. */
  units: string
}

/**
 * Turns a contribution into the concrete purchases that materialise it.
 *
 * The amount is split across the funds by weight first, which guarantees the
 * parts add up to the cent, and only then is each part translated into units by
 * dividing it by the NAV of the day. The other way round cents would be lost in
 * the rounding.
 *
 * A materialised purchase is a historical fact: it is persisted and never
 * recalculated, even if the contribution rule changes afterwards.
 */
export function buildPurchases(
  contribution: Contribution,
  date: IsoDate,
  navByFund: Record<string, string>,
): Purchase[] {
  const amounts = split(contribution.amount, contribution.weights)

  return contribution.weights.map((weight) => {
    const nav = navByFund[weight.fundId]
    if (nav === undefined) {
      throw new Error(`No NAV available for fund "${weight.fundId}" on ${date}`)
    }

    const navDecimal = new Decimal(nav)
    if (navDecimal.lessThanOrEqualTo(0)) {
      throw new Error(`NAV of fund "${weight.fundId}" must be positive, received ${nav}`)
    }

    const amount = amounts[weight.fundId]!
    const units = new Decimal(amount)
      .div(100)
      .div(navDecimal)
      .toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_HALF_UP)

    return { fundId: weight.fundId, date, amount, nav, units: units.toFixed(UNIT_DECIMALS) }
  })
}
