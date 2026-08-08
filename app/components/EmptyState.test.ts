import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders the title and the description it is given', () => {
    // Every text comes from the caller, in Spanish. The component hard-codes
    // none, because "sin aportaciones todavía" and "ningún fondo configurado"
    // are different sentences and only the screen knows which one applies.
    const wrapper = mount(EmptyState, {
      props: {
        title: 'Sin aportaciones',
        description: 'Las aportaciones aparecerán aquí en cuanto añadas una regla.',
      },
    })

    expect(wrapper.text()).toContain('Sin aportaciones')
    expect(wrapper.text()).toContain('Las aportaciones aparecerán aquí en cuanto añadas una regla.')
  })

  it('renders without a description', () => {
    const wrapper = mount(EmptyState, { props: { title: 'Sin datos' } })

    expect(wrapper.text()).toContain('Sin datos')
  })

  it('renders the default slot as the action', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 'Sin fondos' },
      slots: { default: '<button>Añadir fondo</button>' },
    })

    expect(wrapper.find('button').text()).toBe('Añadir fondo')
  })
})
