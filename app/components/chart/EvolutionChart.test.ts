import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import EvolutionChart from './EvolutionChart.vue'
import { buildEvolutionSeries } from './evolution-series'
import type { EvolutionPoint } from './evolution-series'
import { makeDashboard } from '~/test-utils/fixtures'

/**
 * Unovis measures the DOM on mount and happy-dom lays out no SVG, so the
 * library is replaced with stubs that record the props they are handed.
 *
 * That is not a workaround for an untestable component. Section 11 of the spec
 * asks whether the chart *receives* the real portfolio and the active
 * scenarios, and props are exactly what answers that — a real renderer would
 * answer it less directly, through pixels nobody asserts on.
 */
vi.mock('@unovis/vue', () => ({
  VisXYContainer: { name: 'VisXYContainer', props: ['data', 'height'], template: '<div><slot /></div>' },
  VisLine: { name: 'VisLine', props: ['x', 'y', 'color', 'interpolateMissingData'], template: '<div />' },
  VisAxis: { name: 'VisAxis', props: ['type', 'tickFormat'], template: '<div />' },
  VisCrosshair: { name: 'VisCrosshair', props: ['template'], template: '<div />' },
  VisTooltip: { name: 'VisTooltip', template: '<div />' },
}))

const SERIES = {
  months: ['2026-07', '2026-08'],
  contributed: [200000, 220000],
  portfolio: [200000, null],
  scenarios: [
    { id: 'flat', name: 'Sin interés', color: 'chart-3', annualRate: '0', balance: [200000, 220000] },
    { id: 'optimistic', name: 'Escenario 2', color: 'chart-1', annualRate: '0.09', balance: [201441, 222892] },
  ],
}

const CHART = buildEvolutionSeries(makeDashboard({ series: SERIES }))

function mountChart(overrides: { points?: EvolutionPoint[], series?: typeof CHART.series } = {}) {
  return mount(EvolutionChart, {
    props: {
      points: overrides.points ?? CHART.points,
      series: overrides.series ?? CHART.series,
    },
  })
}

/** A full horizon, real values stopping at index 1, as the application actually stands. */
function horizon(): EvolutionPoint[] {
  return Array.from({ length: 301 }, (_unused, index) => ({
    index,
    month: '2026-07',
    contributed: 2000,
    portfolio: index <= 1 ? 2000 : null,
    scenarios: { flat: 2000, optimistic: 2014.41 },
  }))
}

describe('EvolutionChart', () => {
  it('hands one line per series to the chart', () => {
    const lines = mountChart().findAllComponents({ name: 'VisLine' })

    expect(lines).toHaveLength(4)
    expect(lines.map(line => line.props('color'))).toEqual([
      'var(--muted-foreground)',
      'var(--foreground)',
      'var(--chart-3)',
      'var(--chart-1)',
    ])
  })

  it('never interpolates a missing value', () => {
    // Leaving `fallbackValue` unset is what makes the real line break where
    // the data stops. Setting it to null would plot zero and draw a total loss.
    const lines = mountChart().findAllComponents({ name: 'VisLine' })

    for (const line of lines) {
      expect(line.props('interpolateMissingData')).toBe(false)
      expect(line.props('fallbackValue')).toBeUndefined()
    }
  })

  it('shows the recent window by default, not the whole horizon', () => {
    const wrapper = mountChart({ points: horizon() })

    expect(wrapper.getComponent({ name: 'VisXYContainer' }).props('data')).toHaveLength(14)
  })

  it('opens the whole horizon when asked for it', async () => {
    const wrapper = mountChart({ points: horizon() })
    const todo = wrapper.findAll('[data-testid="chart-range"]')
      .find(button => button.text() === 'Todo')!

    await todo.trigger('click')

    expect(wrapper.getComponent({ name: 'VisXYContainer' }).props('data')).toHaveLength(301)
    expect(todo.attributes('aria-pressed')).toBe('true')
  })

  it('offers the four ranges in Spanish and marks the current one', () => {
    const wrapper = mountChart({ points: horizon() })
    const buttons = wrapper.findAll('[data-testid="chart-range"]')

    expect(buttons.map(button => button.text())).toEqual(['Reciente', '5 años', '10 años', 'Todo'])
    expect(buttons.map(button => button.attributes('aria-pressed')))
      .toEqual(['true', 'false', 'false', 'false'])
  })

  it('renders a legend with the Spanish labels', () => {
    // Plain HTML, so the legend is readable without the charting library —
    // and so replacing that library never takes the legend with it.
    const items = mountChart().findAll('[data-testid="chart-legend-item"]')

    expect(items.map(item => item.text())).toEqual([
      'Aportado',
      'Cartera real',
      'Sin interés',
      'Escenario 2',
    ])
  })

  it('renders nothing to draw when there are no series', () => {
    // Section 11 forbids a blank box. With no lines there is no plot at all,
    // just a sentence saying so.
    const wrapper = mountChart({ points: [], series: [] })

    expect(wrapper.get('[data-testid="chart-empty"]').text()).toBe('Todavía no hay datos para el gráfico')
    expect(wrapper.findAllComponents({ name: 'VisLine' })).toHaveLength(0)
    expect(wrapper.findComponent({ name: 'VisXYContainer' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('NaN')
  })

  it('says how much of the horizon is on screen while it is windowed', () => {
    const wrapper = mountChart({ points: horizon() })

    expect(wrapper.get('[data-testid="chart-caption"]').text())
      .toBe('Mostrando 14 meses de 301. Cambia el rango para ver todo el horizonte.')
  })

  it('drops the caption once the whole horizon is on screen', async () => {
    const wrapper = mountChart({ points: horizon() })

    await wrapper.findAll('[data-testid="chart-range"]')
      .find(button => button.text() === 'Todo')!
      .trigger('click')

    expect(wrapper.find('[data-testid="chart-caption"]').exists()).toBe(false)
  })
})
