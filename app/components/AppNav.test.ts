import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppNav from './AppNav.vue'

/**
 * `NuxtLink` is stubbed because this component is mounted outside Nuxt, where
 * neither the component nor the router exists — the ruling of task 2.1. The
 * stub renders an `<a>` with the `to` prop as its `href`, which is enough to
 * assert the four destinations.
 */
const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountNav() {
  return mount(AppNav, { global: { stubs: { NuxtLink } } })
}

describe('AppNav', () => {
  it('renders the four sections in order, labelled in Spanish', () => {
    // The labels are the point of this test. The interface is in Spanish while
    // everything a developer reads is in English, and a nav quietly rendering
    // "Overview" would be a spec violation no type checker can see.
    const wrapper = mountNav()

    expect(wrapper.findAll('a').map(link => link.text())).toEqual([
      'Resumen',
      'Aportaciones',
      'Fondos',
      'Escenarios',
    ])
  })

  it('points each label at its own route', () => {
    const wrapper = mountNav()

    expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual([
      '/',
      '/aportaciones',
      '/fondos',
      '/escenarios',
    ])
  })

  it('renders exactly four links, so a fifth screen cannot appear by accident', () => {
    expect(mountNav().findAll('a')).toHaveLength(4)
  })
})
