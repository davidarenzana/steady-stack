import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { makeFund } from '~/test-utils/fixtures'
import FundsTable from './FundsTable.vue'

describe('FundsTable', () => {
  it('renders a fund with its units, what was paid in, and what it is worth', async () => {
    const wrapper = mount(FundsTable, { props: { funds: [makeFund()] } })
    const text = wrapper.text()

    expect(text).toContain('Fidelity MSCI World Index Fund EUR P Acc')
    expect(text).toContain('IE00BYX5NX33')
    expect(text).toContain('0P0001CLDK.F')
    expect(text).toContain('160,0000')
    expect(text).toContain('1.600,00 €')
    expect(text).toContain('1.760,00 €')
    expect(text).toContain('11,0000 €')
    expect(text).toContain('03/08/2026')
    // A downloaded price carries no `Manual` marker — the pair of assertions is
    // what makes the marker mean something in the test below.
    expect(text).not.toContain('Manual')
  })

  it('shows a fund with no net asset value as unvalued, not as zero', async () => {
    // The inherited finding, pinned down: `buildFundsView` reports a fund with
    // no NAV as worth `0`, distinguishable only through `latestNav: null`. A
    // screen that printed that zero would be claiming the fund is worth
    // nothing, when what is true is that nobody knows yet.
    const wrapper = mount(FundsTable, {
      props: { funds: [makeFund({ latestNav: null, value: 0 })] },
    })

    // Scoped to the value cell rather than asserted over the whole row: the
    // plan writes this as `not.toContain('0,00 €')` over the rendered text, and
    // that assertion cannot fail — `'1.600,00 €'` in the neighbouring
    // `Aportado` cell contains `'0,00 €'` as a substring. The claim worth
    // making is about the one cell that could have printed a zero.
    expect(wrapper.get('[data-testid="fund-value"]').text()).toBe('Sin valoración')
    // And no price either: there is none to show.
    expect(wrapper.get('[data-testid="fund-nav"]').text()).toBe('—')
  })

  it('marks a fund with no symbol rather than leaving the cell blank', async () => {
    const wrapper = mount(FundsTable, {
      props: { funds: [makeFund({ providerSymbol: null })] },
    })

    expect(wrapper.text()).toContain('Sin símbolo')
  })

  it('marks a hand-entered net asset value as manual', async () => {
    // Which one it is matters: a manual NAV is never overwritten by a sync, so
    // a wrong one stays wrong until it is corrected by hand.
    const wrapper = mount(FundsTable, {
      props: { funds: [makeFund({ latestNav: { date: '2026-08-03', value: '11.0000', source: 'manual' } })] },
    })

    expect(wrapper.text()).toContain('Manual')
  })

  it('offers to clear a wrong symbol', async () => {
    const wrapper = mount(FundsTable, { props: { funds: [makeFund()] } })

    await wrapper.get('[data-testid="clear-symbol"]').trigger('click')

    expect(wrapper.emitted('clearSymbol')).toEqual([['world']])
  })

  it('offers to remove a fund', async () => {
    const wrapper = mount(FundsTable, { props: { funds: [makeFund()] } })

    await wrapper.get('[data-testid="remove-fund"]').trigger('click')

    expect(wrapper.emitted('remove')).toEqual([['world']])
  })

  it('does not render a portfolio total', async () => {
    // Deliberate, not an omission: summing `value` across funds would silently
    // under-count every fund without a NAV. The one authoritative total lives
    // on the dashboard, where the route refuses to answer rather than
    // under-count.
    const wrapper = mount(FundsTable, {
      props: {
        funds: [
          makeFund(),
          makeFund({ id: 'emerging', isin: 'IE0031786696', name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc' }),
        ],
      },
    })

    expect(wrapper.find('[data-testid="funds-total"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Total')
    // And it says why, so the missing total does not read as a bug.
    expect(wrapper.text()).toContain('no suman al total de la cartera')
  })

  it('renders the designed empty state with no funds', async () => {
    const wrapper = mount(FundsTable, { props: { funds: [] } })

    expect(wrapper.text()).toContain('Todavía no hay fondos')
    expect(wrapper.text()).toContain('Añade el primero con su ISIN.')
    expect(wrapper.find('table').exists()).toBe(false)
  })
})
