import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyDashboard from './EmptyDashboard.vue'

const WORLD = {
  id: 'world',
  name: 'Fidelity MSCI World Index Fund EUR P Acc',
  providerSymbol: null,
  hasNav: false,
}

const EMERGING = {
  id: 'emerging',
  name: 'Vanguard Emerging Markets Stock Index Fund EUR Acc',
  providerSymbol: null,
  hasNav: false,
}

describe('EmptyDashboard', () => {
  it('names the three steps and marks them all pending on a clean checkout', () => {
    // This is what a clean checkout renders: two rules, no purchases, no NAVs
    // and no provider symbols. "No hay datos" would be accurate and useless —
    // the portfolio has a plan, it just has no history yet.
    const wrapper = mount(EmptyDashboard, { props: { funds: [WORLD, EMERGING] } })
    const text = wrapper.text()

    expect(text).toContain('Todavía no hay nada que valorar')
    expect(text).toContain('Elige el símbolo de cada fondo')
    expect(text).toContain('Descarga los valores liquidativos')
    expect(text).toContain('Materializa las aportaciones')

    expect(wrapper.findAll('[data-testid="step-state"]').map(step => step.text()))
      .toEqual(['Pendiente', 'Pendiente', 'Pendiente'])
  })

  it('names the funds whose symbol is missing, so the step is actionable', () => {
    const text = mount(EmptyDashboard, { props: { funds: [WORLD, EMERGING] } }).text()

    expect(text).toContain('Fidelity MSCI World Index Fund EUR P Acc')
    expect(text).toContain('Vanguard Emerging Markets Stock Index Fund EUR Acc')
  })

  it('marks the symbol step done once every fund has one', () => {
    const wrapper = mount(EmptyDashboard, {
      props: {
        funds: [
          { ...WORLD, providerSymbol: '0P0001CLDK.F' },
          { ...EMERGING, providerSymbol: '0P00000KSP.F' },
        ],
      },
    })

    expect(wrapper.findAll('[data-testid="step-state"]').map(step => step.text()))
      .toEqual(['Hecho', 'Pendiente', 'Pendiente'])
  })

  it('marks the download step done once every fund has a net asset value', () => {
    const wrapper = mount(EmptyDashboard, {
      props: {
        funds: [
          { ...WORLD, providerSymbol: '0P0001CLDK.F', hasNav: true },
          { ...EMERGING, providerSymbol: '0P00000KSP.F', hasNav: true },
        ],
      },
    })

    // The third step is never done in this state: if the contributions had
    // been materialised there would be purchases, and this component would
    // not be on screen at all.
    expect(wrapper.findAll('[data-testid="step-state"]').map(step => step.text()))
      .toEqual(['Hecho', 'Hecho', 'Pendiente'])
  })

  it('asks for funds first when the portfolio has none', () => {
    const text = mount(EmptyDashboard, { props: { funds: [] } }).text()

    expect(text).toContain('Añade tus fondos')
  })

  it('does not render a figure', () => {
    // Section 11 of the spec: neither a blank figure nor a NaN. A zero here
    // would be a claim — that the portfolio is worth nothing — rather than the
    // absence it actually is.
    const text = mount(EmptyDashboard, { props: { funds: [WORLD, EMERGING] } }).text()

    expect(text).not.toContain('0,00 €')
    expect(text).not.toContain('0,00 %')
    expect(text).not.toContain('NaN')
  })

  it('links each step to the screen that completes it', () => {
    const wrapper = mount(EmptyDashboard, { props: { funds: [WORLD, EMERGING] } })
    const hrefs = wrapper.findAll('a').map(link => link.attributes('href'))

    expect(hrefs).toEqual(['/fondos', '/fondos', '/aportaciones'])
  })

  it('marks state with text and an icon, never with colour alone', () => {
    const wrapper = mount(EmptyDashboard, { props: { funds: [WORLD, EMERGING] } })

    // The text is the assertion above; this one pins that an icon accompanies
    // it and is hidden from assistive technology, which reads the word.
    const marker = wrapper.get('[data-testid="step-state"]')
    expect(marker.text()).toBe('Pendiente')
    expect(wrapper.findAll('[data-testid="step-icon"]')).toHaveLength(3)
    expect(wrapper.get('[data-testid="step-icon"]').attributes('aria-hidden')).toBe('true')
  })
})
