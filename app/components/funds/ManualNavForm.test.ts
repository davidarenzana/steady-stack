import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ManualNavForm from './ManualNavForm.vue'

const FUNDS = [
  { id: 'world', name: 'Fidelity MSCI World Index Fund EUR P Acc' },
  { id: 'emerging', name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc' },
]

/** `today` is injected so no assertion here depends on the day it runs. */
async function fill(values: { fundId?: string, date?: string, value?: string }) {
  const wrapper = mount(ManualNavForm, { props: { funds: FUNDS, today: '2026-08-09' } })

  if (values.fundId !== undefined) {
    await wrapper.get('[data-testid="nav-fund"]').setValue(values.fundId)
  }
  if (values.date !== undefined) {
    await wrapper.get('[data-testid="nav-date"]').setValue(values.date)
  }
  if (values.value !== undefined) {
    await wrapper.get('[data-testid="nav-value"]').setValue(values.value)
  }

  await wrapper.get('form').trigger('submit')
  return wrapper
}

describe('ManualNavForm', () => {
  it('emits the net asset value as the typed string, never as a number', async () => {
    // `PUT /api/nav` rejects a JSON number by design: a NAV is a decimal string
    // all the way through, and turning `11.5` into a float here would be the one
    // place the pipeline lost precision.
    const wrapper = await fill({ fundId: 'world', date: '2026-08-03', value: '11.5' })

    const payload = wrapper.emitted('submit')![0]![0] as { value: unknown }
    expect(payload).toEqual({ fundId: 'world', date: '2026-08-03', value: '11.5' })
    expect(typeof payload.value).toBe('string')
  })

  it('accepts a value dated today', async () => {
    // The boundary of the future-date rule: today is not the future.
    const wrapper = await fill({ fundId: 'world', date: '2026-08-09', value: '11.5' })

    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('refuses a value of zero', async () => {
    const wrapper = await fill({ fundId: 'world', date: '2026-08-03', value: '0' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El valor liquidativo debe ser mayor que 0.')
  })

  it('refuses a value that is not a number at all', async () => {
    const wrapper = await fill({ fundId: 'world', date: '2026-08-03', value: '' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El valor liquidativo debe ser mayor que 0.')
  })

  it('refuses a future date, which is what the route enforces anyway', async () => {
    const wrapper = await fill({ fundId: 'world', date: '2099-01-01', value: '11.5' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('La fecha no puede ser futura.')
  })

  it('refuses an entry with no date', async () => {
    const wrapper = await fill({ fundId: 'world', value: '11.5' })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica una fecha.')
  })

  it('offers every fund by name and starts on the first one', async () => {
    const wrapper = mount(ManualNavForm, { props: { funds: FUNDS, today: '2026-08-09' } })

    const options = wrapper.findAll('[data-testid="nav-fund"] option')
    expect(options.map(option => option.text())).toEqual([
      'Fidelity MSCI World Index Fund EUR P Acc',
      'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
    ])

    // Preselected rather than left blank: with one fund the choice is not a
    // choice, and an unselected `<select>` would emit an empty `fundId` the
    // route would answer with an English 400.
    await wrapper.get('[data-testid="nav-date"]').setValue('2026-08-03')
    await wrapper.get('[data-testid="nav-value"]').setValue('11.5')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ fundId: 'world' })
  })
})
