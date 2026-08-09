import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HorizonForm from './HorizonForm.vue'

async function submit(years: string) {
  const wrapper = mount(HorizonForm, { props: { horizonYears: 25 } })

  await wrapper.get('[data-testid="horizon-years"]').setValue(years)
  await wrapper.get('form').trigger('submit')

  return wrapper
}

describe('HorizonForm', () => {
  it('starts on the horizon the portfolio already has', () => {
    const wrapper = mount(HorizonForm, { props: { horizonYears: 25 } })
    const input = wrapper.get<HTMLInputElement>('[data-testid="horizon-years"]')

    expect(input.element.value).toBe('25')
  })

  it('says what the horizon decides, because it is not obvious from this screen', () => {
    const wrapper = mount(HorizonForm, { props: { horizonYears: 25 } })

    expect(wrapper.text()).toContain(
      'El horizonte decide cuántos meses proyecta el gráfico del resumen para todos los escenarios.',
    )
  })

  it('emits the new horizon as a number', async () => {
    // A number and not a string: `readOptionalPositiveInteger` on
    // `PATCH /api/portfolio` requires a real integer.
    const wrapper = await submit('30')

    const payload = wrapper.emitted('submit')![0]![0]
    expect(payload).toBe(30)
    expect(typeof payload).toBe('number')
  })

  it('refuses a horizon of zero years', async () => {
    const wrapper = await submit('0')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El horizonte debe ser un número entero de años mayor que 0.')
  })

  it('refuses a fraction of a year', async () => {
    // The projection steps month by month over `horizonYears * 12`, so half a
    // year is not a horizon this engine can express.
    const wrapper = await submit('1.5')

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El horizonte debe ser un número entero de años mayor que 0.')
  })

  it('refuses a negative horizon and an empty one', async () => {
    expect((await submit('-5')).emitted('submit')).toBeUndefined()
    expect((await submit('')).emitted('submit')).toBeUndefined()
  })
})
