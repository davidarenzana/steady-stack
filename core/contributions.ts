import { monthRange } from './months'
import type { Contribution, ContributionOverride, ContributionRule, Month } from './types'

/**
 * Returns the rule in force in a month: the one with the latest `fromMonth` that is
 * not after the month asked about. `undefined` if no rule has taken effect yet.
 */
function ruleFor(rules: ContributionRule[], month: Month): ContributionRule | undefined {
  let active: ContributionRule | undefined
  for (const rule of rules) {
    if (rule.fromMonth <= month && (!active || rule.fromMonth > active.fromMonth)) {
      active = rule
    }
  }
  return active
}

/**
 * Expands rules and exceptions into the contribution series for a range of months.
 *
 * Contributions are derived, not stored: changing a rule recalculates the series
 * without touching the history of purchases already materialised.
 *
 * An exception with `amount: null` skips the month. An exception for a month with no
 * rule in force is ignored: with no rule there are no weights to split it across.
 */
export function expandContributions(
  rules: ContributionRule[],
  overrides: ContributionOverride[],
  from: Month,
  to: Month,
): Contribution[] {
  const seenFromMonths = new Set<Month>()
  for (const rule of rules) {
    if (seenFromMonths.has(rule.fromMonth)) {
      throw new Error(
        `Two contribution rules share the same start month: "${rule.fromMonth}"`,
      )
    }
    seenFromMonths.add(rule.fromMonth)
  }

  const overrideByMonth = new Map(overrides.map((o) => [o.month, o]))
  const contributions: Contribution[] = []

  for (const month of monthRange(from, to)) {
    const rule = ruleFor(rules, month)
    if (!rule) continue

    const override = overrideByMonth.get(month)
    if (override && override.amount === null) continue

    contributions.push({
      month,
      amount: override?.amount ?? rule.amount,
      timing: override?.timing ?? rule.timing,
      weights: rule.weights,
    })
  }

  return contributions
}
