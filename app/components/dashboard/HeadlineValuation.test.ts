import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HeadlineValuation from './HeadlineValuation.vue'

/** The figures of section 11 of the spec: 2.200 € paid in, worth 2.431,50 €. */
const GAIN_FIXTURE = {
  value: 243150,
  gain: 23150,
  gainRatio: 23150 / 220000,
  navDate: '2026-08-06',
}

describe('HeadlineValuation', () => {
  it('renders the value as the headline', () => {
    const wrapper = mount(HeadlineValuation, { props: GAIN_FIXTURE })

    expect(wrapper.get('[data-testid="headline-value"]').text()).toBe('2.431,50 €')
    expect(wrapper.get('[data-testid="headline-label"]').text()).toBe('Valor actual')
  })

  it('renders the gain in euros and percent together', () => {
    // Both, in one block, because "up 231,50 €" and "up 10,52 %" answer
    // different questions and the screen is asked both at once.
    const gain = mount(HeadlineValuation, { props: GAIN_FIXTURE })
      .get('[data-testid="headline-gain"]')

    expect(gain.text()).toContain('+231,50 €')
    expect(gain.text()).toContain('+10,52 %')
  })

  it('carries the sign in the text, not only in the colour', () => {
    // Asserted together on purpose: a refactor that reduced the meaning to a
    // hue would pass one of these and fail the other.
    const gain = mount(HeadlineValuation, {
      props: { ...GAIN_FIXTURE, gain: -23150, gainRatio: -23150 / 220000 },
    }).get('[data-testid="headline-gain"]')

    expect(gain.text()).toContain('-231,50 €')
    expect(gain.attributes('aria-label')).toBe('Pérdida')
  })

  it('labels a gain and a flat position for assistive technology too', () => {
    const up = mount(HeadlineValuation, { props: GAIN_FIXTURE })
    expect(up.get('[data-testid="headline-gain"]').attributes('aria-label')).toBe('Ganancia')

    const flat = mount(HeadlineValuation, {
      props: { ...GAIN_FIXTURE, gain: 0, gainRatio: 0 },
    })
    expect(flat.get('[data-testid="headline-gain"]').attributes('aria-label')).toBe('Sin variación')
  })

  it('shows which day the net asset values come from', () => {
    // A financial figure with no date is untrustworthy, and net asset values
    // publish with about a day of lag, so this is normally not today.
    const wrapper = mount(HeadlineValuation, { props: GAIN_FIXTURE })

    expect(wrapper.get('[data-testid="valuation-date"]').text())
      .toBe('Valorado con datos del 06/08/2026')
  })

  it('says so when there is no net asset value yet', () => {
    const wrapper = mount(HeadlineValuation, {
      props: { ...GAIN_FIXTURE, navDate: null },
    })

    const date = wrapper.get('[data-testid="valuation-date"]')
    expect(date.text()).toBe('Sin valor liquidativo disponible todavía')
    expect(date.text()).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('renders the value with tabular numerals and animates nothing', () => {
    const value = mount(HeadlineValuation, { props: GAIN_FIXTURE })
      .get('[data-testid="headline-value"]')

    expect(value.classes()).toContain('tabular-nums')
    expect(value.classes().join(' ')).not.toMatch(/transition|animate|duration/)
  })
})
