import Decimal from './decimal'
import type { Purchase } from './purchases'
import type { Cents } from './types'

/** Decimal places units are recorded with. */
const UNIT_DECIMALS = 6

export interface FundPosition {
  fundId: string
  /** Accumulated units, as a decimal string. */
  units: string
  /** NAV applied in the valuation. */
  nav: string
  value: Cents
  invested: Cents
  gain: Cents
}

export interface Valuation {
  value: Cents
  invested: Cents
  gain: Cents
  /** Gain as a fraction of the amount invested. Zero when nothing is invested. */
  gainRatio: number
  byFund: FundPosition[]
}

/**
 * Values a portfolio from its purchases and the current NAVs.
 *
 * Aggregates the purchases per fund, adding up units and cost, and multiplies by
 * the NAV in force. The rounding to cents happens once per fund, at the end.
 */
export function valuate(purchases: Purchase[], navByFund: Record<string, string>): Valuation {
  const aggregated = new Map<string, { units: Decimal, invested: Cents }>()

  for (const purchase of purchases) {
    const current = aggregated.get(purchase.fundId) ?? { units: new Decimal(0), invested: 0 }
    aggregated.set(purchase.fundId, {
      units: current.units.plus(purchase.units),
      invested: current.invested + purchase.amount,
    })
  }

  const byFund: FundPosition[] = []
  for (const [fundId, position] of aggregated) {
    const nav = navByFund[fundId]
    if (nav === undefined) {
      throw new Error(`No current NAV available for fund "${fundId}"`)
    }

    const value = position.units
      .times(nav)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber()

    byFund.push({
      fundId,
      units: position.units.toFixed(UNIT_DECIMALS),
      nav,
      value,
      invested: position.invested,
      gain: value - position.invested,
    })
  }

  byFund.sort((a, b) => b.value - a.value)

  const value = byFund.reduce((sum, p) => sum + p.value, 0)
  const invested = byFund.reduce((sum, p) => sum + p.invested, 0)

  return {
    value,
    invested,
    gain: value - invested,
    gainRatio: invested === 0 ? 0 : (value - invested) / invested,
    byFund,
  }
}
