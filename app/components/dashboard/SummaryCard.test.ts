import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SummaryCard from './SummaryCard.vue'

/** The card takes strings: whatever formatted them is somebody else's job. */
const BASE = { label: 'Aportado', value: '2.000,00 €' }

describe('SummaryCard', () => {
  it('renders the label, the figure and the hint', () => {
    const wrapper = mount(SummaryCard, {
      props: { ...BASE, hint: 'Suma de todas las compras ejecutadas.' },
    })

    expect(wrapper.text()).toContain('Aportado')
    expect(wrapper.get('[data-testid="summary-value"]').text()).toBe('2.000,00 €')
    expect(wrapper.get('[data-testid="summary-hint"]').text()).toBe('Suma de todas las compras ejecutadas.')
  })

  it('omits the hint element when there is no hint', () => {
    const wrapper = mount(SummaryCard, { props: BASE })

    expect(wrapper.find('[data-testid="summary-hint"]').exists()).toBe(false)
  })

  it('renders the figure with tabular numerals', () => {
    // The whole reason IBM Plex Sans was chosen in phase 2: a column of
    // amounts has to line up digit over digit instead of shimmering as the
    // values change.
    const wrapper = mount(SummaryCard, { props: BASE })

    expect(wrapper.get('[data-testid="summary-value"]').classes()).toContain('tabular-nums')
  })

  it('colours the figure by tone, and is neutral by default', () => {
    const neutral = mount(SummaryCard, { props: BASE })
    expect(neutral.get('[data-testid="summary-value"]').classes()).toContain('text-foreground')

    const positive = mount(SummaryCard, { props: { ...BASE, tone: 'positive' } })
    expect(positive.get('[data-testid="summary-value"]').classes()).toContain('text-positive')

    const negative = mount(SummaryCard, { props: { ...BASE, tone: 'negative' } })
    expect(negative.get('[data-testid="summary-value"]').classes()).toContain('text-destructive')
  })

  it('animates nothing', () => {
    // A figure you cannot read while it moves is a figure you cannot read.
    // Asserted structurally so nobody adds a count-up later and calls it
    // delight.
    const wrapper = mount(SummaryCard, { props: BASE })
    const classes = wrapper.get('[data-testid="summary-value"]').classes().join(' ')

    expect(classes).not.toMatch(/transition|animate|duration/)
  })
})
