import type { Cents, IsoDate } from './types'

const DAYS_PER_YEAR = 365
const MS_PER_DAY = 86_400_000
const TOLERANCE = 1e-9

export interface CashFlow {
  date: IsoDate
  /** Negative when money leaves the pocket (a contribution), positive when it comes in. */
  amount: Cents
}

/**
 * Internal rate of return of cash flows with irregular dates.
 *
 * Solves `Σ amount_i / (1 + r)^(years_i) = 0` with Newton-Raphson and, if that
 * does not converge, with bisection. Newton is fast but can shoot off when the
 * derivative approaches zero; bisection always converges when there is a sign
 * change, which is guaranteed because flows of both signs are required.
 *
 * Uses `number` rather than `Decimal`: this is an iterative method whose
 * precision is set by the convergence tolerance, not by the arithmetic. It
 * returns a rate, not an amount, so there are no cents to lose.
 */
export function xirr(flows: CashFlow[]): number {
  if (flows.length < 2) {
    throw new Error('XIRR needs at least two cash flows')
  }
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) {
    throw new Error('XIRR needs both positive and negative cash flows')
  }

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const origin = Date.parse(sorted[0]!.date)
  const years = sorted.map((f) => (Date.parse(f.date) - origin) / (DAYS_PER_YEAR * MS_PER_DAY))
  const amounts = sorted.map((f) => f.amount / 100)

  const npv = (rate: number): number =>
    amounts.reduce((sum, amount, i) => sum + amount / (1 + rate) ** years[i]!, 0)

  const derivative = (rate: number): number =>
    amounts.reduce((sum, amount, i) => sum - (years[i]! * amount) / (1 + rate) ** (years[i]! + 1), 0)

  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const value = npv(rate)
    if (Math.abs(value) < TOLERANCE) return rate

    const slope = derivative(rate)
    if (slope === 0) break

    const next = rate - value / slope
    if (!Number.isFinite(next) || next <= -1) break
    if (Math.abs(next - rate) < 1e-12) return next
    rate = next
  }

  // Bisection fallback over a wide but bounded range.
  let low = -0.999_999
  let high = 10
  let valueLow = npv(low)
  if (valueLow * npv(high) > 0) {
    throw new Error('XIRR does not converge within the range [-99,9999 %, 1000 %]')
  }

  for (let i = 0; i < 300; i++) {
    const middle = (low + high) / 2
    const valueMiddle = npv(middle)
    if (Math.abs(valueMiddle) < TOLERANCE) return middle

    if (valueLow * valueMiddle < 0) {
      high = middle
    } else {
      low = middle
      valueLow = valueMiddle
    }
  }

  return (low + high) / 2
}
