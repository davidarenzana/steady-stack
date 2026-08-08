import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PortfolioSummary from './PortfolioSummary.vue'
import { makeDashboard, makePosition } from '~/test-utils/fixtures'

const FUNDS = [
  { id: 'world', name: 'Fidelity MSCI World Index Fund EUR P Acc', providerSymbol: null, hasNav: false },
  { id: 'emerging', name: 'Vanguard Emerging Markets Stock Index Fund EUR Acc', providerSymbol: null, hasNav: false },
]

/** The figures on the two supporting cards, which is where the XIRR lives. */
function mountedFigures(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('[data-testid="summary-value"]').map(element => element.text())
}

describe('PortfolioSummary', () => {
  it('renders the gain of section 11 of the spec', () => {
    // 2.200 € paid in, worth 2.431,50 €: up 231,50 € and 10,52 %. The figures
    // are the spec's own, so this test fails if the formatting pipeline drifts
    // anywhere between the payload and the screen.
    const wrapper = mount(PortfolioSummary, {
      props: {
        dashboard: makeDashboard({
          navDate: '2026-08-06',
          valuation: {
            value: 243150,
            invested: 220000,
            gain: 23150,
            gainRatio: 23150 / 220000,
            byFund: [makePosition()],
          },
        }),
        funds: FUNDS,
      },
    })

    expect(wrapper.text()).toContain('+231,50 €')
    expect(wrapper.text()).toContain('+10,52 %')
    expect(wrapper.text()).toContain('2.431,50 €')
  })

  it('shows which day the valuation\'s net asset values come from', () => {
    // Net asset values publish with a lag, so `navDate` and `asOf` are
    // different dates and conflating them is the mistake this test exists to
    // catch: the screen must show the day the prices are from, not the day it
    // was asked.
    const wrapper = mount(PortfolioSummary, {
      props: {
        dashboard: makeDashboard({
          asOf: '2026-08-08',
          navDate: '2026-08-06',
          valuation: { value: 243150, invested: 220000, gain: 23150, gainRatio: 23150 / 220000, byFund: [makePosition()] },
        }),
        funds: FUNDS,
      },
    })

    expect(wrapper.get('[data-testid="valuation-date"]').text())
      .toBe('Valorado con datos del 06/08/2026')
    expect(wrapper.text()).not.toContain('08/08/2026')
  })

  it('renders neither a figure nor a NaN with nothing bought yet', () => {
    // The empty state replaces the whole summary rather than sitting under a
    // row of zeroes.
    const wrapper = mount(PortfolioSummary, {
      props: { dashboard: makeDashboard(), funds: FUNDS },
    })

    expect(wrapper.text()).toContain('Todavía no hay nada que valorar')
    expect(wrapper.text()).not.toContain('NaN')
    expect(wrapper.text()).not.toContain('0,00 €')
    expect(wrapper.find('[data-testid="headline-value"]').exists()).toBe(false)
  })

  it('renders the absence of an XIRR rather than a zero', () => {
    // A null XIRR is not a return of zero: it means there are too few cash
    // flows to solve for one. `0 %` would be a claim.
    const wrapper = mount(PortfolioSummary, {
      props: {
        dashboard: makeDashboard({
          navDate: '2026-08-03',
          xirr: null,
          valuation: { value: 176000, invested: 160000, gain: 16000, gainRatio: 0.1, byFund: [makePosition()] },
        }),
        funds: FUNDS,
      },
    })

    expect(wrapper.text()).toContain('—')
    expect(wrapper.text()).toContain('Aún no hay suficientes movimientos para calcularla.')

    // Scoped to the supporting figures rather than asserted over the whole
    // rendered text. `'0,00 %'` is a substring of `'+10,00 %'`, so a
    // whole-text check cannot tell an XIRR that wrongly rendered as zero from
    // a gain ratio that legitimately reads 10,00 % — it would fail on correct
    // markup, which is how this assertion was caught.
    const figures = mountedFigures(wrapper)
    expect(figures).toContain('—')
    expect(figures.some(figure => figure.includes('%'))).toBe(false)
  })

  it('labels the annualised return in plain Spanish and explains it', () => {
    // Most people do not know what an internal rate of return is, and it is
    // not the same as "how much I have gained": it weighs when each
    // contribution went in.
    const wrapper = mount(PortfolioSummary, {
      props: {
        dashboard: makeDashboard({
          navDate: '2026-08-03',
          xirr: 0.0847,
          valuation: { value: 176000, invested: 160000, gain: 16000, gainRatio: 0.1, byFund: [makePosition()] },
        }),
        funds: FUNDS,
      },
    })

    expect(wrapper.text()).toContain('Rentabilidad real anualizada (TIR)')
    expect(wrapper.text()).toContain('Tiene en cuenta cuándo entró cada aportación, no solo cuánto has aportado.')
    expect(wrapper.text()).toContain('+8,47 %')
  })

  it('shows what was paid in as a secondary figure', () => {
    const wrapper = mount(PortfolioSummary, {
      props: {
        dashboard: makeDashboard({
          navDate: '2026-08-03',
          valuation: { value: 176000, invested: 160000, gain: 16000, gainRatio: 0.1, byFund: [makePosition()] },
        }),
        funds: FUNDS,
      },
    })

    expect(wrapper.text()).toContain('Aportado')
    expect(wrapper.text()).toContain('1.600,00 €')
    expect(wrapper.text()).toContain('Suma de todas las compras ejecutadas.')

    // Exactly two supporting cards, so nothing creeps into the row that would
    // flatten the hierarchy the headline depends on.
    expect(wrapper.findAll('[data-testid="summary-value"]')).toHaveLength(2)
  })
})
