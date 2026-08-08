import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { listNavs } from '../../server/db/queries'
import { fetchJson, setupRouteServer } from '../../server/test-utils/route-server'

/**
 * Routes 9, 10 and 11: `GET /api/nav`, `PUT /api/nav`, `POST /api/nav/sync`.
 *
 * No fund in this file is ever given a `providerSymbol`, so the two sync
 * tests below exercise only the paths that stop before a provider request is
 * built — an empty `fundIds` array, which filters every fund out, and the
 * `no-symbol` skip both seeded funds qualify for. The happy path of a real
 * sync belongs to `server/services/nav-sync.test.ts`, against a stub
 * provider, and `STEADY_STACK_FORBID_NETWORK` makes the rule structural
 * rather than a habit: a handler that reached Yahoo anyway would fail loudly.
 */
const database = await setupRouteServer()

/** The shape `GET /api/nav` returns: a fund id, then its quotes with no row ids. */
interface NavListResponse {
  fundId: string
  navs: Array<{ date: string, value: string, source: string }>
}

describe('GET /api/nav', () => {
  it('reports a seeded fund as having no quotes at all', async () => {
    // The seed inserts no NAVs, which is why every valuation in
    // `portfolio.test.ts` reads zero and every portfolio point reads null.
    const body = await $fetch<NavListResponse>('/api/nav', { query: { fundId: 'world' } })

    expect(body).toEqual({ fundId: 'world', navs: [] })
  })

  it('rejects a request with no fundId query with 400', async () => {
    const response = await fetch('/api/nav')

    expect(response.status).toBe(400)
  })
})

describe('PUT /api/nav', () => {
  it('records a manual quote and identifies it by fund and date, never by a row id', async () => {
    const body = await $fetch('/api/nav', {
      method: 'PUT',
      body: { fundId: 'world', date: '2026-07-01', value: '10.0000' },
    })

    // `toEqual` and not a field-by-field check on purpose: the documented
    // shape carries no `id`, and an extra key would fail this.
    expect(body).toEqual({
      fundId: 'world',
      date: '2026-07-01',
      value: '10.0000',
      source: 'manual',
    })
  })

  it('overwrites the quote already held for that fund and date rather than adding a second', async () => {
    // The override channel of section 6 of the spec: entering a price by hand
    // twice is a correction, not two prices for one day.
    await $fetch('/api/nav', {
      method: 'PUT',
      body: { fundId: 'world', date: '2026-07-01', value: '11.0000' },
    })

    const body = await $fetch<NavListResponse>('/api/nav', { query: { fundId: 'world' } })

    expect(body.navs).toHaveLength(1)
    expect(body.navs[0]).toEqual({ date: '2026-07-01', value: '11.0000', source: 'manual' })
  })

  it('rejects a value of zero or less, and a JSON number, with 400', async () => {
    // A NAV of zero is not a smaller price, it is not a price: `unitsFor`
    // would divide by it. A JSON number is refused rather than coerced,
    // per section 7 — money never travels as a floating-point number.
    for (const value of ['0', '-1', 10]) {
      const response = await fetchJson('/api/nav', {
        method: 'PUT',
        body: { fundId: 'world', date: '2026-07-01', value },
      })

      expect(response.status, `value ${JSON.stringify(value)}`).toBe(400)
    }
  })

  it('rejects a date later than today with 400', async () => {
    const response = await fetchJson('/api/nav', {
      method: 'PUT',
      body: { fundId: 'world', date: '2099-01-01', value: '10.0000' },
    })

    expect(response.status).toBe(400)
  })

  it('returns 404 for a fund that does not exist', async () => {
    const response = await fetchJson('/api/nav', {
      method: 'PUT',
      body: { fundId: 'ghost', date: '2026-07-01', value: '10.0000' },
    })

    expect(response.status).toBe(404)
  })
})

describe('GET /api/nav over a range', () => {
  it('includes both ends of the range and excludes a day outside it', async () => {
    const inside = await $fetch<NavListResponse>('/api/nav', {
      query: { fundId: 'world', from: '2026-07-01', to: '2026-07-01' },
    })
    expect(inside.navs).toHaveLength(1)
    expect(inside.navs[0]?.date).toBe('2026-07-01')

    const after = await $fetch<NavListResponse>('/api/nav', {
      query: { fundId: 'world', from: '2026-08-01' },
    })
    expect(after.navs).toEqual([])
  })
})

describe('POST /api/nav/sync', () => {
  it('syncs nothing at all when fundIds is an empty array', async () => {
    // An empty array is not the same as an absent one: it filters every fund
    // out, where `undefined` syncs all of them. See `readOptionalStringArray`.
    const body = await $fetch('/api/nav/sync', { method: 'POST', body: { fundIds: [] } })

    expect(body).toEqual({ funds: [] })
  })

  it('skips every fund that has no providerSymbol, without building a request', async () => {
    const body = await $fetch<{ funds: Array<{ fundId: string, status: string, reason?: string }> }>(
      '/api/nav/sync',
      { method: 'POST', body: {} },
    )

    // Compared as a sorted copy rather than by position: `listFunds`' order
    // is not part of this route's contract, and an assertion that leaned on
    // it would keep passing while guarding nothing.
    expect(body.funds).toHaveLength(2)
    expect([...body.funds].sort((a, b) => a.fundId.localeCompare(b.fundId))).toEqual([
      { fundId: 'emerging', status: 'skipped', reason: 'no-symbol' },
      { fundId: 'world', status: 'skipped', reason: 'no-symbol' },
    ])

    // The quote entered by hand above survives a sync that skipped its fund.
    const navs = await $fetch<NavListResponse>('/api/nav', { query: { fundId: 'world' } })
    expect(navs.navs).toHaveLength(1)
    expect(navs.navs[0]?.source).toBe('manual')
  })
})

describe('the temporary database', () => {
  it('holds the quotes these tests wrote, so nothing reached data/steady-stack.db', () => {
    // The same check `portfolio.test.ts` makes for a fund, made here for a
    // NAV: read back through the handle, not over HTTP. If the server
    // subprocess had ignored `STEADY_STACK_DATABASE_FILE`, this row would be
    // somewhere else entirely.
    expect(listNavs(database.db, 'world')).toHaveLength(1)
  })
})
