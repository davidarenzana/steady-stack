import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { ScenarioRow } from '~~/server/db/schema'
import ScenariosTable from './ScenariosTable.vue'

/**
 * The three seeded scenarios, with the third disabled. The seed enables all
 * three; the row that matters to this component is a disabled one, and that
 * state is reachable through the toggle on this very table.
 */
const SCENARIOS: ScenarioRow[] = [
  { id: 'flat', name: 'Sin interés', annualRate: '0', color: 'chart-3', enabled: 1 },
  { id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color: 'chart-2', enabled: 1 },
  { id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color: 'chart-1', enabled: 0 },
]

describe('ScenariosTable', () => {
  it('renders each rate in Spanish typography rather than as it is stored', () => {
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })
    const text = wrapper.text()

    expect(text).toContain('Sin interés')
    expect(text).toContain('Escenario 1')
    expect(text).toContain('Escenario 2')
    expect(text).toContain('0 %')
    expect(text).toContain('5 %')
    expect(text).toContain('9 %')
    // Not the decimal string the database holds, and not `9%` either.
    expect(text).not.toContain('0.09')
    expect(text).not.toContain('9%')
  })

  it('reflects which scenarios are drawn on the chart', () => {
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })
    const boxes = wrapper.findAll<HTMLInputElement>('[data-testid="scenario-enabled"]')

    expect(boxes.map(box => box.element.checked)).toEqual([true, true, false])
    expect(wrapper.text()).toContain('Solo los escenarios activos se dibujan en el gráfico del resumen.')
  })

  it('emits a real boolean when a scenario is switched off, not a zero', async () => {
    // `enabled` arrives from the database as `0` or `1` and has to leave as
    // `true` or `false`: `readOptionalBoolean` on `PATCH /api/scenarios/:id`
    // requires a real boolean and answers a `1` with a 400.
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })

    await wrapper.findAll('[data-testid="scenario-enabled"]')[0]!.setValue(false)

    const payload = wrapper.emitted('toggle')![0]![0] as { id: string, enabled: unknown }
    expect(payload).toEqual({ id: 'flat', enabled: false })
    expect(typeof payload.enabled).toBe('boolean')
  })

  it('emits a real boolean when a scenario is switched back on', async () => {
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })

    await wrapper.findAll('[data-testid="scenario-enabled"]')[2]!.setValue(true)

    expect(wrapper.emitted('toggle')).toEqual([[{ id: 'optimistic', enabled: true }]])
  })

  it('shows each colour as the theme token it is, never as a hex code', () => {
    // The five `chart-N` tokens are the palette, and they are defined once in
    // `app/assets/css/tailwind.css` with a light and a dark value. A hex code
    // here would be one of those two values frozen into the wrong theme.
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })
    const swatches = wrapper.findAll('[data-testid="scenario-color"]')

    expect(swatches).toHaveLength(3)
    expect(swatches[2]!.attributes('style')).toContain('var(--chart-1)')
    expect(swatches[2]!.attributes('style')).not.toContain('#')
    // And the token name is readable, so a colour is identifiable without
    // relying on the swatch — which a colour-blind reader may not distinguish.
    expect(wrapper.text()).toContain('chart-1')
  })

  it('offers to remove a scenario', async () => {
    const wrapper = mount(ScenariosTable, { props: { scenarios: SCENARIOS } })

    await wrapper.findAll('[data-testid="remove-scenario"]')[1]!.trigger('click')

    expect(wrapper.emitted('remove')).toEqual([['moderate']])
  })

  it('renders the designed empty state with no scenarios', () => {
    const wrapper = mount(ScenariosTable, { props: { scenarios: [] } })

    expect(wrapper.text()).toContain('Todavía no hay escenarios')
    expect(wrapper.find('table').exists()).toBe(false)
  })
})
