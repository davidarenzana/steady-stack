import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ContributionMonthsTable from './ContributionMonthsTable.vue'
import type { ContributionsViewMonth } from '~~/server/services/read-model'

const FUND_NAMES = { world: 'Fidelity', emerging: 'Vanguard' }

function month(overrides: Partial<ContributionsViewMonth> = {}): ContributionsViewMonth {
  return {
    month: '2026-08',
    amount: 20000,
    timing: 'start',
    weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
    materialised: false,
    ...overrides,
  }
}

describe('ContributionMonthsTable', () => {
  it('renders a month with its amount, timing and split', () => {
    const text = mount(ContributionMonthsTable, {
      props: { months: [month()], fundNames: FUND_NAMES },
    }).text()

    expect(text).toContain('ago 2026')
    expect(text).toContain('200,00 €')
    expect(text).toContain('Inicio de mes')
    // Percentages rather than euros: the payload sends weights, and splitting
    // 200 € into 160 € and 40 € is `split()`'s largest-remainder arithmetic on
    // the server. The interface does no arithmetic on money.
    expect(text).toContain('80 % Fidelity · 20 % Vanguard')
  })

  it('marks a month pending until it has been materialised', () => {
    const pending = mount(ContributionMonthsTable, {
      props: { months: [month()], fundNames: FUND_NAMES },
    })
    expect(pending.text()).toContain('Pendiente')
    expect(pending.text()).not.toContain('Materializada')

    const done = mount(ContributionMonthsTable, {
      props: { months: [month({ materialised: true })], fundNames: FUND_NAMES },
    })
    expect(done.text()).toContain('Materializada')
  })

  it('names the end of the month when that is when the money goes in', () => {
    const text = mount(ContributionMonthsTable, {
      props: { months: [month({ timing: 'end' })], fundNames: FUND_NAMES },
    }).text()

    expect(text).toContain('Fin de mes')
  })

  it('falls back to the fund id when there is no name for it', () => {
    // A fund deleted after a rule was written still appears in that rule's
    // weights. An id is ugly but true; a blank cell would hide a real problem.
    const text = mount(ContributionMonthsTable, {
      props: { months: [month()], fundNames: {} },
    }).text()

    expect(text).toContain('80 % world · 20 % emerging')
  })

  it('heads every column in Spanish, in order', () => {
    const headers = mount(ContributionMonthsTable, {
      props: { months: [month()], fundNames: FUND_NAMES },
    }).findAll('th').map(header => header.text())

    expect(headers).toEqual(['Mes', 'Importe', 'Momento', 'Reparto', 'Estado'])
  })

  it('right-aligns the amount with tabular numerals', () => {
    const amount = mount(ContributionMonthsTable, {
      props: { months: [month()], fundNames: FUND_NAMES },
    }).get('[data-testid="month-amount"]')

    expect(amount.classes()).toContain('tabular-nums')
    expect(amount.classes()).toContain('text-right')
  })

  it('says there is nothing in the period instead of showing an empty table', () => {
    const wrapper = mount(ContributionMonthsTable, {
      props: { months: [], fundNames: FUND_NAMES },
    })

    expect(wrapper.find('table').exists()).toBe(false)
    expect(wrapper.text()).toContain('No hay aportaciones en este periodo')
  })
})
