import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import ScenarioForm from './ScenarioForm.vue'

async function fill(wrapper: VueWrapper, values: {
  id?: string
  name?: string
  rate?: string
  color?: string
  enabled?: boolean
}) {
  if (values.id !== undefined) {
    await wrapper.get('[data-testid="scenario-id"]').setValue(values.id)
  }
  if (values.name !== undefined) {
    await wrapper.get('[data-testid="scenario-name"]').setValue(values.name)
  }
  if (values.rate !== undefined) {
    await wrapper.get('[data-testid="scenario-rate"]').setValue(values.rate)
  }
  if (values.color !== undefined) {
    await wrapper.get(`[data-testid="scenario-color-${values.color}"]`).setValue(true)
  }
  if (values.enabled === false) {
    await wrapper.get('[data-testid="scenario-active"]').setValue(false)
  }

  await wrapper.get('form').trigger('submit')
}

describe('ScenarioForm', () => {
  it('emits the whole scenario, with the rate as the decimal string the API stores', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, {
      id: 'pesimista',
      name: 'Escenario pesimista',
      rate: '2',
      color: 'chart-4',
    })

    expect(wrapper.emitted('submit')).toEqual([[{
      id: 'pesimista',
      name: 'Escenario pesimista',
      annualRate: '0.02',
      color: 'chart-4',
      enabled: true,
    }]])
  })

  it('emits annualRate as a string, which is what stops the regression', async () => {
    // `POST /api/scenarios` rejects a JSON number: `readDecimalString` refuses to
    // coerce, per section 7 of the spec. A `<input type="number">` model is a
    // number as soon as it is typed into, so the conversion has to happen here
    // and the type has to be asserted here.
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', name: 'X', rate: '9', color: 'chart-1' })

    const payload = wrapper.emitted('submit')![0]![0] as { annualRate: unknown }
    expect(typeof payload.annualRate).toBe('string')
    expect(payload.annualRate).toBe('0.09')
  })

  it('accepts a rate of zero, which is a scenario and not a missing value', async () => {
    // `Sin interés` is one of the three seeded scenarios: contributions with no
    // return at all, which is the line the real portfolio is measured against.
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'flat', name: 'Sin interés', rate: '0', color: 'chart-3' })

    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ annualRate: '0' })
  })

  it('creates a scenario switched off when asked to', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', name: 'X', rate: '9', color: 'chart-1', enabled: false })

    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ enabled: false })
  })

  it('refuses a negative rate', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', name: 'X', rate: '-1', color: 'chart-1' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica una rentabilidad anual válida.')
  })

  it('refuses a scenario with no rate at all', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', name: 'X', color: 'chart-1' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica una rentabilidad anual válida.')
  })

  it('refuses a scenario with no identifier', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { name: 'X', rate: '9', color: 'chart-1' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica un identificador.')
  })

  it('refuses a scenario with no name', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', rate: '9', color: 'chart-1' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica un nombre.')
  })

  it('refuses a scenario with no colour chosen', async () => {
    const wrapper = mount(ScenarioForm)

    await fill(wrapper, { id: 'x', name: 'X', rate: '9' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Elige un color.')
  })

  it('offers exactly the five colours the theme declares', async () => {
    // The API does not restrict `color` to these five — a recorded finding in
    // TODO.md — so the interface does, by offering nothing else. A token outside
    // the palette resolves to no colour at all and the line vanishes from the
    // chart.
    const wrapper = mount(ScenarioForm)
    const radios = wrapper.findAll('[name="scenario-color"]')

    expect(radios.map(radio => radio.attributes('value'))).toEqual([
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
      'chart-5',
    ])
  })
})
