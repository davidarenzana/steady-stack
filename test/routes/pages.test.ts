import { describe, expect, it } from 'vitest'
import { fetch } from '@nuxt/test-utils/e2e'
import { insertPurchase, upsertNav } from '../../server/db/queries'
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
const database = await setupRouteServer()

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

/**
 * The dashboard, against the real database.
 *
 * **Order matters in this block.** Every `it` shares one server and one
 * SQLite file, and Vitest runs them in declaration order, so the empty-state
 * assertions have to come before the test that arranges purchases — once the
 * rows exist there is no way back to an empty portfolio.
 */
describe('the dashboard', () => {
  it('shows the designed empty state on a database with no purchases', async () => {
    // What a clean checkout renders. The seed gives two contribution rules and
    // nothing else, so the screen has to say what to do next rather than
    // reporting that the portfolio is worth nothing.
    const html = await (await fetch('/')).text()

    expect(html).toContain('Todavía no hay nada que valorar')
    expect(html).toContain('Elige el símbolo de cada fondo')
    expect(html).toContain('Descarga los valores liquidativos')
    expect(html).toContain('Materializa las aportaciones')

    // Section 11 of the spec: neither a blank figure nor a NaN. A zero would
    // be a claim rather than the absence it actually is.
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('0,00 €')
  })

  it('shows the portfolio figures once there are purchases', async () => {
    // Arranged through the database handle rather than over HTTP: this is
    // state the screen reads, not behaviour of the write routes, which
    // test/routes/purchases.test.ts already covers.
    //
    // Two NAV dates per fund so the valuation has a later price than the
    // purchase: 160 units of `world` at 11 € is 1.760 €, and 20 of
    // `emerging` at 22 € is 440 €, so the portfolio is worth 2.200,00 €
    // against 2.000,00 € paid in — a gain of +200,00 € and +10,00 %, valued
    // with data from 03/08/2026.
    for (const [fundId, date, value] of [
      ['world', '2026-07-01', '10'],
      ['emerging', '2026-07-01', '20'],
      ['world', '2026-08-03', '11'],
      ['emerging', '2026-08-03', '22'],
    ] as const) {
      upsertNav(database.db, { fundId, date, value, source: 'manual' })
    }

    insertPurchase(database.db, {
      fundId: 'world',
      month: '2026-07',
      date: '2026-07-01',
      amount: 160000,
      nav: '10',
      units: '160.000000',
      source: 'manual',
    })
    insertPurchase(database.db, {
      fundId: 'emerging',
      month: '2026-07',
      date: '2026-07-01',
      amount: 40000,
      nav: '20',
      units: '20.000000',
      source: 'manual',
    })

    const html = await (await fetch('/')).text()

    expect(html).toContain('2.200,00 €')
    expect(html).toContain('2.000,00 €')
    expect(html).toContain('+200,00 €')
    expect(html).toContain('+10,00 %')
    expect(html).toContain('Valorado con datos del 03/08/2026')
    expect(html).not.toContain('NaN')

    // The empty state is gone, and the positions table has taken its place.
    expect(html).not.toContain('Todavía no hay nada que valorar')
    expect(html).toContain('Posiciones')
    expect(html).toContain('Participaciones')
    expect(html).toContain('160,0000')
  })

  it('renders the chart region', async () => {
    // All an HTTP test can honestly claim about a client-drawn chart: the
    // region is on the page and the server-side render does not throw. The
    // fallback text is what proves the `<ClientOnly>` wrapper is still there —
    // Unovis builds its SVG against a real layout, so server-rendering it
    // would be a wrong-sized chart at best.
    const html = await (await fetch('/')).text()

    expect(html).toContain('Evolución')
    expect(html).toContain('Preparando el gráfico')
  })

  it('renders the figures with tabular numerals in the served HTML', async () => {
    // Asserted here and not only in the component tests: a class that exists
    // on a mounted component but never reaches the server-rendered markup
    // would leave the column of figures misaligned on first paint, which is
    // the one paint a server-rendered page is judged on.
    const html = await (await fetch('/')).text()

    expect(html).toMatch(/class="[^"]*tabular-nums/)
  })
})

/**
 * The contributions screen. Placed after the dashboard block, which arranges
 * the purchases these assertions then see as materialised months.
 */
describe('/aportaciones', () => {
  it('renders the seeded plan', async () => {
    const html = await (await fetch('/aportaciones')).text()

    expect(html).toContain('Aportaciones')
    // The two seeded rules: 2.000 € from 2026-07, then 200 € from 2026-08.
    expect(html).toContain('2.000,00 €')
    expect(html).toContain('200,00 €')
    // The split as percentages against the real fund name, which is the whole
    // of what the route gives the screen to work with.
    expect(html).toContain('80 % Fidelity MSCI World Index Fund EUR P Acc')
    expect(html).toContain('Pendiente')
    expect(html).not.toContain('NaN')
  })

  it('states that editing a rule never rewrites the past', async () => {
    // Section 4 of the spec, on the screen rather than only behind it.
    const html = await (await fetch('/aportaciones')).text()

    expect(html).toContain('Editar una regla nunca reescribe el pasado')
  })

  it('marks a month materialised once its purchases exist', async () => {
    // The dashboard block above inserted the 2026-07 purchases, so the
    // calendar has to show that month as settled while later ones stay
    // pending. This is `buildContributionsView` joining derived months against
    // stored purchases, seen from the screen.
    const html = await (await fetch('/aportaciones')).text()

    expect(html).toContain('Materializada')
  })

  it('offers the forms that change the plan', async () => {
    const html = await (await fetch('/aportaciones')).text()

    expect(html).toContain('Añadir regla')
    expect(html).toContain('Guardar excepción')
    expect(html).toContain('Materializar aportaciones')
  })

  it('aligns the calendar figures with tabular numerals', async () => {
    // The same first-paint concern as on the dashboard, for the table this
    // screen is mostly made of.
    const html = await (await fetch('/aportaciones')).text()

    expect(html).toMatch(/class="[^"]*tabular-nums/)
  })
})
