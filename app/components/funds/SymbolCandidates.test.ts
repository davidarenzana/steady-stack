import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { SymbolCandidate } from '~~/server/providers/types'
import SymbolCandidates from './SymbolCandidates.vue'

/**
 * The two share classes Yahoo really publishes for `IE00BYX5NX33`, at prices
 * five euros apart. They are the whole reason this component exists and the
 * whole reason it must not choose.
 */
const CANDIDATES: SymbolCandidate[] = [
  {
    symbol: '0P0001CLDK.F',
    name: 'Fidelity MSCI World Index Fund EUR P Acc',
    exchange: 'FRA',
    currency: 'EUR',
    price: '9.9900',
    priceDate: '2026-08-03',
  },
  {
    symbol: 'IE00BYX5NX33.SG',
    name: 'Fidelity MSCI World Index Fund EUR P Acc',
    exchange: 'STU',
    currency: 'EUR',
    price: '14.3300',
    priceDate: '2026-08-03',
  },
]

describe('SymbolCandidates', () => {
  it('lists every candidate with its market and its price', async () => {
    const wrapper = mount(SymbolCandidates, { props: { candidates: CANDIDATES } })
    const text = wrapper.text()

    expect(text).toContain('0P0001CLDK.F')
    expect(text).toContain('IE00BYX5NX33.SG')
    expect(text).toContain('FRA')
    expect(text).toContain('STU')
    expect(text).toContain('9,9900 €')
    expect(text).toContain('14,3300 €')
    expect(text).toContain('03/08/2026')
  })

  it('says the prices differ and that the statement decides which one is right', async () => {
    const wrapper = mount(SymbolCandidates, { props: { candidates: CANDIDATES } })

    expect(wrapper.text()).toContain('Un mismo ISIN puede tener varias clases con precios distintos')
    expect(wrapper.text()).toContain('Elige la que coincide con tu extracto.')
  })

  it('chooses nothing and recommends nothing', async () => {
    // Section 6 of the spec: the same ISIN publishes several share classes at
    // different prices — 9,99 € against 14,33 € here — and only the user's own
    // statement says which one they hold. A preselected row would be a guess
    // presented as an answer, and the price gap makes the wrong guess a wrong
    // portfolio.
    const wrapper = mount(SymbolCandidates, { props: { candidates: CANDIDATES } })

    expect(wrapper.find('[aria-selected="true"]').exists()).toBe(false)
    expect(wrapper.find('[data-recommended]').exists()).toBe(false)
    expect(wrapper.find('input:checked').exists()).toBe(false)
  })

  it('emits the symbol of the row whose button was pressed', async () => {
    const wrapper = mount(SymbolCandidates, { props: { candidates: CANDIDATES } })

    const buttons = wrapper.findAll('[data-testid="choose-symbol"]')
    expect(buttons).toHaveLength(2)
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('choose')).toEqual([['IE00BYX5NX33.SG']])
  })

  it('marks a candidate with no published price as priceless rather than free', async () => {
    const wrapper = mount(SymbolCandidates, {
      props: { candidates: [{ ...CANDIDATES[0]!, price: null, priceDate: null }] },
    })

    expect(wrapper.get('[data-testid="candidate-price"]').text()).toBe('Sin precio')
  })

  it('says it is searching while the lookup is in flight', async () => {
    const wrapper = mount(SymbolCandidates, { props: { candidates: [], loading: true } })

    expect(wrapper.text()).toContain('Buscando…')
    // And does not simultaneously report a failure to find anything.
    expect(wrapper.text()).not.toContain('No se ha encontrado')
  })

  it('reports an ISIN with no symbols once the lookup is done', async () => {
    const wrapper = mount(SymbolCandidates, { props: { candidates: [], loading: false } })

    expect(wrapper.text()).toContain('No se ha encontrado ningún símbolo para ese ISIN.')
    // The table is gone with it: an empty table with headers reads as a result.
    expect(wrapper.find('table').exists()).toBe(false)
  })
})
