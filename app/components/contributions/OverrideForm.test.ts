import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OverrideForm from './OverrideForm.vue'

async function fill(values: { month?: string, skip?: boolean, amount?: string, note?: string }) {
  const wrapper = mount(OverrideForm)

  if (values.month !== undefined) {
    await wrapper.get('[data-testid="override-month"]').setValue(values.month)
  }
  if (values.skip) {
    await wrapper.get('[data-testid="override-skip"]').setValue(true)
  }
  if (values.amount !== undefined) {
    await wrapper.get('[data-testid="override-amount"]').setValue(values.amount)
  }
  if (values.note !== undefined) {
    await wrapper.get('[data-testid="override-note"]').setValue(values.note)
  }

  await wrapper.get('form').trigger('submit')
  return wrapper
}

describe('OverrideForm', () => {
  it('skips a month with a null amount, which is what the API means by skipped', async () => {
    // A skipped month is absent from the expanded series entirely — not a month
    // worth 0 €. `core/contributions.ts` skips it outright, so `null` here is
    // the whole mechanism.
    const wrapper = await fill({ month: '2026-09', skip: true })

    expect(wrapper.emitted('submit')).toEqual([[{ month: '2026-09', amount: null }]])
  })

  it('re-prices a month with an exact amount', async () => {
    const wrapper = await fill({ month: '2026-09', amount: '500' })

    expect(wrapper.emitted('submit')).toEqual([[{ month: '2026-09', amount: 50000 }]])
  })

  it('carries a note when there is one', async () => {
    const wrapper = await fill({ month: '2026-09', amount: '500', note: 'Paga extra' })

    expect(wrapper.emitted('submit')![0]![0]).toEqual({
      month: '2026-09',
      amount: 50000,
      note: 'Paga extra',
    })
  })

  it('omits the note entirely when it is blank', async () => {
    // Not an empty string: `note` is nullable in the schema and an empty string
    // would be a value where none was given.
    const wrapper = await fill({ month: '2026-09', amount: '500', note: '   ' })

    expect(wrapper.emitted('submit')![0]![0]).toEqual({ month: '2026-09', amount: 50000 })
  })

  it('refuses an amount of zero or none when the month is not skipped', async () => {
    const empty = await fill({ month: '2026-09' })
    expect(empty.emitted('submit')).toBeUndefined()
    expect(empty.text()).toContain('El importe debe ser mayor que 0.')

    const zero = await fill({ month: '2026-09', amount: '0' })
    expect(zero.emitted('submit')).toBeUndefined()
  })

  it('refuses an exception with no month', async () => {
    const wrapper = await fill({ skip: true })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica el mes de la excepción.')
  })

  it('disables the amount while the month is being skipped', async () => {
    const wrapper = mount(OverrideForm)
    const amount = wrapper.get<HTMLInputElement>('[data-testid="override-amount"]')

    expect(amount.element.disabled).toBe(false)

    await wrapper.get('[data-testid="override-skip"]').setValue(true)
    expect(amount.element.disabled).toBe(true)
  })

  it('ignores a typed amount once the month is skipped', async () => {
    // Ticking the box after typing must not send both: the skip wins, because
    // that is what the user did last.
    const wrapper = await fill({ month: '2026-09', amount: '500', skip: true })

    expect(wrapper.emitted('submit')).toEqual([[{ month: '2026-09', amount: null }]])
  })
})
