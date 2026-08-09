import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import type { SymbolCandidate } from '~~/server/providers/types'
import AddFundForm from './AddFundForm.vue'

const CANDIDATE: SymbolCandidate = {
  symbol: 'IE00BYX5NX33.SG',
  name: 'Fidelity MSCI World Index Fund EUR P Acc',
  exchange: 'STU',
  currency: 'EUR',
  price: '14.3300',
  priceDate: '2026-08-03',
}

/** Fills whichever fields are given and submits. `currency` defaults to `EUR` in the form. */
async function fill(wrapper: VueWrapper, values: {
  isin?: string
  id?: string
  name?: string
  currency?: string
}) {
  for (const [field, value] of Object.entries(values)) {
    await wrapper.get(`[data-testid="fund-${field}"]`).setValue(value)
  }
  await wrapper.get('form').trigger('submit')
}

describe('AddFundForm', () => {
  it('asks the provider for the symbols of a typed ISIN', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await wrapper.get('[data-testid="fund-isin"]').setValue('IE00BYX5NX33')
    await wrapper.get('[data-testid="resolve-isin"]').trigger('click')

    expect(wrapper.emitted('resolve')).toEqual([['IE00BYX5NX33']])
  })

  it('submits the whole fund once a symbol has been chosen', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [CANDIDATE] } })

    await wrapper.get('[data-testid="choose-symbol"]').trigger('click')
    expect(wrapper.text()).toContain('Símbolo elegido: IE00BYX5NX33.SG')

    await fill(wrapper, {
      isin: 'IE00BYX5NX33',
      id: 'world',
      name: 'Fidelity MSCI World Index Fund EUR P Acc',
    })

    expect(wrapper.emitted('submit')).toEqual([[{
      id: 'world',
      isin: 'IE00BYX5NX33',
      name: 'Fidelity MSCI World Index Fund EUR P Acc',
      providerSymbol: 'IE00BYX5NX33.SG',
      currency: 'EUR',
    }]])
  })

  it('omits providerSymbol entirely when no symbol was chosen', async () => {
    // A fund is worth adding before its symbol is known: the ISIN may resolve
    // to nothing today, and the symbol can be assigned later from the table.
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await fill(wrapper, { isin: 'IE0031786696', id: 'emerging', name: 'Vanguard Emerging Markets' })

    expect(wrapper.emitted('submit')![0]![0]).toEqual({
      id: 'emerging',
      isin: 'IE0031786696',
      name: 'Vanguard Emerging Markets',
      currency: 'EUR',
    })
  })

  it('lets a chosen symbol be changed', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [CANDIDATE] } })

    await wrapper.get('[data-testid="choose-symbol"]').trigger('click')
    await wrapper.get('[data-testid="change-symbol"]').trigger('click')

    expect(wrapper.text()).not.toContain('Símbolo elegido')
  })

  it('refuses a fund with no ISIN', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await fill(wrapper, { id: 'world', name: 'Fidelity' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica el ISIN.')
  })

  it('refuses a fund with no identifier', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await fill(wrapper, { isin: 'IE00BYX5NX33', name: 'Fidelity' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica un identificador.')
  })

  it('refuses a fund with no name', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await fill(wrapper, { isin: 'IE00BYX5NX33', id: 'world' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica el nombre del fondo.')
  })

  it('refuses an empty currency, which the API would accept', async () => {
    // Stricter than the route on purpose: `POST /api/funds` takes an empty
    // `currency` today, an open finding in TODO.md, and a fund with no currency
    // is a fund whose figures mean nothing.
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await fill(wrapper, { isin: 'IE00BYX5NX33', id: 'world', name: 'Fidelity', currency: '  ' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica la divisa.')
  })

  it('does not ask the provider for an empty ISIN', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [] } })

    await wrapper.get('[data-testid="resolve-isin"]').trigger('click')

    expect(wrapper.emitted('resolve')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica el ISIN.')
  })

  it('passes the search through to the candidates list while it is running', async () => {
    const wrapper = mount(AddFundForm, { props: { candidates: [], resolving: true } })

    expect(wrapper.text()).toContain('Buscando…')
  })
})
