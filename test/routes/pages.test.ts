import { describe, expect, it } from 'vitest'
import { fetch } from '@nuxt/test-utils/e2e'
import { setupRouteServer } from '../../server/test-utils/route-server'

/**
 * The four screens, asked for over HTTP and read as HTML.
 *
 * End-to-end tests with a browser are out of v1, but a page that throws during
 * server-side rendering is not a design question, it is a broken screen — and
 * nothing else in the suite would notice. So this file asks the real Nuxt
 * server for each route and reads what it sends back: no browser, no
 * hydration, no Playwright. Phases 3, 5, 6 and 7 add assertions here as they
 * fill the screens in, so it grows into the proof that every one of them
 * renders against the seeded database.
 *
 * `fetch` and not `$fetch`: the response is HTML, and `$fetch` would try to
 * parse it as JSON.
 */
await setupRouteServer()

/** The four routes, with the Spanish heading each one must render. */
const SCREENS = [
  { path: '/', heading: 'Resumen' },
  { path: '/aportaciones', heading: 'Aportaciones' },
  { path: '/fondos', heading: 'Fondos' },
  { path: '/escenarios', heading: 'Escenarios' },
] as const

describe('the four screens', () => {
  for (const screen of SCREENS) {
    it(`serves ${screen.path} with its Spanish heading`, async () => {
      const response = await fetch(screen.path)
      expect(response.status).toBe(200)

      const html = await response.text()
      expect(html).toContain(`<h1`)
      expect(html).toContain(screen.heading)
      // The shell is on every screen, not only the first one.
      expect(html).toContain('Steady Stack')
    })
  }

  it('titles each document after its section', async () => {
    const html = await (await fetch('/fondos')).text()

    expect(html).toContain('<title>Fondos · Steady Stack</title>')
  })

  it('marks the current section with aria-current, not only with a class', async () => {
    // The claim `AppNav.vue` makes without being able to test it: `RouterLink`
    // sets `aria-current="page"` on an exactly-active link by itself. The unit
    // test stubs `NuxtLink` and cannot see it, so it is asserted here against
    // the real router — and asserted as an attribute rather than as
    // `router-link-active`, because a class is styling and not an accessible
    // state.
    const html = await (await fetch('/aportaciones')).text()

    // Matched by finding the anchor that carries the attribute and then
    // checking where it points, rather than by a regular expression over both
    // in sequence: Vue renders `aria-current` *before* `href`, and an
    // assertion that assumed the other order would fail on markup that is
    // perfectly correct.
    const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)
    expect(activeLink?.[0]).toContain('href="/aportaciones"')

    // And only the current one carries it: the other three links are inert.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('answers a route that does not exist with 404', async () => {
    const response = await fetch('/no-existe')

    expect(response.status).toBe(404)
  })
})
