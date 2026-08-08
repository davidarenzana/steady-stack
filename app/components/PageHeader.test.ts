import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from './PageHeader.vue'

describe('PageHeader', () => {
  it('renders its title as the page heading', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Resumen' } })

    // An `<h1>` and not a styled `<div>`: it is the one heading of the
    // document, and a screen reader navigating by heading needs it to exist.
    expect(wrapper.find('h1').text()).toBe('Resumen')
  })

  it('renders a subtitle when given one, and nothing when not', () => {
    const withSubtitle = mount(PageHeader, {
      props: { title: 'Fondos', subtitle: 'Dos fondos indexados' },
    })
    expect(withSubtitle.text()).toContain('Dos fondos indexados')

    const without = mount(PageHeader, { props: { title: 'Fondos' } })
    expect(without.text()).toBe('Fondos')
  })

  it('renders the actions slot beside the title', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Aportaciones' },
      slots: { actions: '<button>Añadir regla</button>' },
    })

    expect(wrapper.find('button').text()).toBe('Añadir regla')
  })
})
