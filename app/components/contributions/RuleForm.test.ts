import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RuleForm from './RuleForm.vue'

const FUNDS = [
  { id: 'world', name: 'Fidelity' },
  { id: 'emerging', name: 'Vanguard' },
]

/** Fills the form and submits it, returning the wrapper for assertions. */
async function submit(values: {
  month?: string
  amount?: string
  timing?: 'start' | 'end'
  weights?: string[]
}) {
  const wrapper = mount(RuleForm, { props: { funds: FUNDS } })

  if (values.month !== undefined) {
    await wrapper.get('[data-testid="rule-month"]').setValue(values.month)
  }
  if (values.amount !== undefined) {
    await wrapper.get('[data-testid="rule-amount"]').setValue(values.amount)
  }
  if (values.timing === 'end') {
    await wrapper.get('[data-testid="rule-timing-end"]').setValue(true)
  }
  if (values.weights !== undefined) {
    const inputs = wrapper.findAll('[data-testid="rule-weight"]')
    for (const [index, weight] of values.weights.entries()) {
      await inputs[index]!.setValue(weight)
    }
  }

  await wrapper.get('form').trigger('submit')
  return wrapper
}

describe('RuleForm', () => {
  it('emits a rule with weights as fractions', async () => {
    // Percentages are what a person types; fractions are what the API takes.
    // The division is on a weight and not on money — `split()` on the server
    // is what turns a weight into exact cents.
    const wrapper = await submit({ month: '2027-01', amount: '300', weights: ['80', '20'] })

    expect(wrapper.emitted('submit')).toEqual([[{
      fromMonth: '2027-01',
      amount: 30000,
      timing: 'start',
      weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
    }]])
  })

  it('emits the end of the month when that is chosen', async () => {
    const wrapper = await submit({
      month: '2027-01',
      amount: '300',
      timing: 'end',
      weights: ['80', '20'],
    })

    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ timing: 'end' })
  })

  it('refuses weights that do not add up to 100 %', async () => {
    // Caught here rather than by `readWeights` on the server, which would
    // answer with an English 400 the user should never see.
    const wrapper = await submit({ month: '2027-01', amount: '300', weights: ['70', '20'] })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Los pesos deben sumar 100 %.')
  })

  it('refuses an amount of zero, which the API would accept', async () => {
    // The screen is stricter than the route on purpose: that purchases and
    // rules still accept zero and negative amounts is an open finding in
    // TODO.md, and a contribution of nothing is not a contribution.
    const wrapper = await submit({ month: '2027-01', amount: '0', weights: ['80', '20'] })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El importe debe ser mayor que 0.')
  })

  it('refuses an amount that is not a number', async () => {
    const wrapper = await submit({ month: '2027-01', amount: 'abc', weights: ['80', '20'] })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('El importe debe ser mayor que 0.')
  })

  it('refuses a rule with no starting month', async () => {
    const wrapper = await submit({ amount: '300', weights: ['80', '20'] })

    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('Indica el mes desde el que se aplica.')
  })

  it('offers one weight input per fund, labelled with its name', async () => {
    const wrapper = mount(RuleForm, { props: { funds: FUNDS } })

    expect(wrapper.findAll('[data-testid="rule-weight"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Fidelity')
    expect(wrapper.text()).toContain('Vanguard')
  })

  it('prefills the month it is given', () => {
    const wrapper = mount(RuleForm, {
      props: { funds: FUNDS, defaultMonth: '2027-03' },
    })

    expect(wrapper.get<HTMLInputElement>('[data-testid="rule-month"]').element.value)
      .toBe('2027-03')
  })

  it('clears an earlier message once the form is valid', async () => {
    const wrapper = mount(RuleForm, { props: { funds: FUNDS } })

    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Indica el mes desde el que se aplica.')

    await wrapper.get('[data-testid="rule-month"]').setValue('2027-01')
    await wrapper.get('[data-testid="rule-amount"]').setValue('300')
    const inputs = wrapper.findAll('[data-testid="rule-weight"]')
    await inputs[0]!.setValue('80')
    await inputs[1]!.setValue('20')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Indica el mes desde el que se aplica.')
  })
})
