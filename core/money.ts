import type { Cents, Weight } from './types'

/**
 * Splits an amount across several weights without losing or inventing cents.
 *
 * Uses the largest remainder method: gives each target the integer part it is
 * owed and hands the leftover cents to those with the largest fractional part.
 * The result always sums to exactly `amount`.
 *
 * Rounding each target with `Math.round` does not work: 100 cents at 50/50 would
 * give 50 and 50, but 101 would give 51 and 51, inventing a cent out of nothing.
 */
export function split(amount: Cents, weights: Weight[]): Record<string, Cents> {
  if (!Number.isInteger(amount)) {
    throw new Error(`Amount must be an integer number of cents, received ${amount}`)
  }
  if (amount < 0) {
    throw new Error(`Amount cannot be negative, received ${amount}`)
  }

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  if (Math.abs(totalWeight - 1) > 1e-9) {
    throw new Error(`Weights must add up to 1, they add up to ${totalWeight}`)
  }

  const parts = weights.map((w) => {
    const exact = amount * w.weight
    const floor = Math.floor(exact)
    return { fundId: w.fundId, floor, remainder: exact - floor }
  })

  const result: Record<string, Cents> = {}
  for (const part of parts) {
    result[part.fundId] = part.floor
  }

  let leftover = amount - parts.reduce((sum, p) => sum + p.floor, 0)

  // On a tie in the remainder, the one appearing earlier in the list wins:
  // `sort` has been stable in JavaScript since ES2019.
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder)
  for (let i = 0; leftover > 0; i++, leftover--) {
    const target = byRemainder[i % byRemainder.length]!
    result[target.fundId]! += 1
  }

  return result
}
