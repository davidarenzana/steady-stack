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
 * Divides an amount in cents by a NAV, in units, rounded to six decimal
 * places with `ROUND_HALF_UP`. The single place this division happens, so a
 * purchase materialised automatically and one recorded by hand — through
 * `POST /api/purchases` when the caller omits `units` — divide by the net
 * asset value exactly the same way and cannot drift apart.
 */
export function unitsFor(amountCents: Cents, nav: string): string {
  const navDecimal = new Decimal(nav)
  if (navDecimal.lessThanOrEqualTo(0)) {
    throw new Error(`NAV must be positive, received ${nav}`)
  }

  return new Decimal(amountCents)
    .div(100)
    .div(navDecimal)
    .toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_HALF_UP)
    .toFixed(UNIT_DECIMALS)
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

    // Checked here, not inside unitsFor, so the message can name the fund:
    // unitsFor is generic and has no fundId to report.
    if (new Decimal(nav).lessThanOrEqualTo(0)) {
      throw new Error(`NAV of fund "${weight.fundId}" must be positive, received ${nav}`)
    }

    const amount = amounts[weight.fundId]!
    return { fundId: weight.fundId, date, amount, nav, units: unitsFor(amount, nav) }
  })
}
