import { monthRange } from './months'
import type { Contribution, ContributionOverride, ContributionRule, Month } from './types'

/**
 * Devuelve la regla vigente en un mes: la de `fromMonth` más tardío que no sea
 * posterior al mes consultado. `undefined` si ninguna regla ha entrado aún en vigor.
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
 * Expande reglas y excepciones en la serie de aportaciones de un rango de meses.
 *
 * Las aportaciones son derivadas, no almacenadas: cambiar una regla recalcula la
 * serie sin tocar el histórico de compras ya materializadas.
 *
 * Una excepción con `amount: null` salta el mes. Una excepción de un mes en el que
 * no hay regla vigente se ignora: sin regla no hay pesos con los que repartirla.
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
        `Hay dos reglas de aportación con el mismo mes de inicio: "${rule.fromMonth}"`,
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
