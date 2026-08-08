import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RulesList from './RulesList.vue'
import type { ContributionRuleRow } from '~~/server/db/schema'

const FUND_NAMES = { world: 'Fidelity', emerging: 'Vanguard' }

function rule(overrides: Partial<ContributionRuleRow> = {}): ContributionRuleRow {
  return {
    id: 1,
    portfolioId: 'index',
    fromMonth: '2026-07',
    amount: 200000,
    timing: 'start',
    // A JSON string, not an array: the route returns the Drizzle row and this
    // is a TEXT column. `parseWeights` is what the component puts it through.
    weights: '[{"fundId":"world","weight":0.8},{"fundId":"emerging","weight":0.2}]',
    ...overrides,
  }
}

describe('RulesList', () => {
  it('renders a rule with its month, amount, timing and split', () => {
    const text = mount(RulesList, {
      props: { rules: [rule()], fundNames: FUND_NAMES },
    }).text()

    expect(text).toContain('jul 2026')
    expect(text).toContain('2.000,00 €')
    expect(text).toContain('Inicio de mes')
    expect(text).toContain('80 % Fidelity · 20 % Vanguard')
  })

  it('states that editing a rule never rewrites the past', () => {
    // Section 4 of the spec, said on the screen rather than only enforced
    // behind it: a user about to change their monthly amount needs to know
    // that adding a rule is how it is done and that the earlier months keep
    // the amount they were actually governed by.
    const text = mount(RulesList, {
      props: { rules: [rule()], fundNames: FUND_NAMES },
    }).text()

    expect(text).toContain('Editar una regla nunca reescribe el pasado')
  })

  it('emits the id of the rule to delete', () => {
    const wrapper = mount(RulesList, {
      props: { rules: [rule({ id: 7 })], fundNames: FUND_NAMES },
    })

    wrapper.get('[data-testid="delete-rule"]').trigger('click')

    expect(wrapper.emitted('delete')).toEqual([[7]])
  })

  it('lists several rules in the order given', () => {
    const wrapper = mount(RulesList, {
      props: {
        rules: [
          rule({ id: 1, fromMonth: '2026-07', amount: 200000 }),
          rule({ id: 2, fromMonth: '2026-08', amount: 20000 }),
        ],
        fundNames: FUND_NAMES,
      },
    })

    expect(wrapper.findAll('tbody tr').map(row => row.findAll('td')[0]!.text()))
      .toEqual(['jul 2026', 'ago 2026'])
  })

  it('heads every column in Spanish', () => {
    const headers = mount(RulesList, {
      props: { rules: [rule()], fundNames: FUND_NAMES },
    }).findAll('th').map(header => header.text())

    expect(headers.slice(0, 4)).toEqual(['Desde', 'Importe', 'Momento', 'Reparto'])
  })

  it('says there are no rules instead of showing an empty table', () => {
    const wrapper = mount(RulesList, { props: { rules: [], fundNames: FUND_NAMES } })

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('Todavía no hay reglas de aportación')
  })
})
