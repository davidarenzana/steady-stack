import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorNotice from './ErrorNotice.vue'

describe('ErrorNotice', () => {
  it('renders the title and the detail it is given', () => {
    const wrapper = mount(ErrorNotice, {
      props: {
        title: 'No se pudo cargar la cartera',
        detail: 'El servidor respondió 502.',
      },
    })

    expect(wrapper.text()).toContain('No se pudo cargar la cartera')
    expect(wrapper.text()).toContain('El servidor respondió 502.')
  })

  it('renders without a detail', () => {
    const wrapper = mount(ErrorNotice, { props: { title: 'Algo ha fallado' } })

    expect(wrapper.text()).toBe('Algo ha fallado')
  })

  it('renders the default slot, which is where a retry button goes', () => {
    const wrapper = mount(ErrorNotice, {
      props: { title: 'Sin conexión' },
      slots: { default: '<button>Reintentar</button>' },
    })

    expect(wrapper.find('button').text()).toBe('Reintentar')
  })

  it('announces itself to assistive technology', () => {
    // A failure that is only red is a failure a screen reader never mentions.
    const wrapper = mount(ErrorNotice, { props: { title: 'Sin conexión' } })

    expect(wrapper.attributes('role')).toBe('alert')
  })
})
