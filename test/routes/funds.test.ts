import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { deletePurchase, insertPurchase } from '../../server/db/queries'
import { fetchJson, setupRouteServer, withQuery } from '../../server/test-utils/route-server'
import type { FundView } from '../../server/services/read-model'

/**
 * This file must never call `/api/nav/sync`: it does not set a
 * `providerSymbol` on any fund, so a sync would have nothing to skip on and
 * would try to reach Yahoo for real. It also never sends a real ISIN to
 * `/api/funds/resolve` — the only assertion made against that route here is
 * the 400 raised before the provider is even constructed. The happy path,
 * including the "more than one candidate, none of them picked for you"
 * contract of spec section 6, is exercised against the committed fixtures in
 * `test/routes/network-guard.test.ts` and `server/providers/yahoo.test.ts`.
 */
const database = await setupRouteServer()

describe('GET /api/funds', () => {
  it('reports both seeded funds, each holding nothing at all', async () => {
    const body = await $fetch<FundView[]>('/api/funds')

    expect(body).toHaveLength(2)
    const world = body.find(fund => fund.id === 'world')
    expect(world).toEqual({
      id: 'world',
      isin: 'IE00BYX5NX33',
      name: 'Fidelity MSCI World Index Fund EUR P Acc',
      providerSymbol: null,
      currency: 'EUR',
      latestNav: null,
      units: '0.000000',
      invested: 0,
      value: 0,
    })
  })
})

describe('POST /api/funds', () => {
  it('creates a fund with no providerSymbol', async () => {
    const response = await fetchJson('/api/funds', {
      method: 'POST',
      body: { id: 'small', isin: 'IE00SMALL001', name: 'Small caps', currency: 'EUR' },
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.id).toBe('small')
    expect(body.providerSymbol).toBeNull()
  })

  it('rejects a repeated id with 409', async () => {
    const response = await fetchJson('/api/funds', {
      method: 'POST',
      body: { id: 'small', isin: 'IE00OTHER001', name: 'Otro nombre', currency: 'EUR' },
    })

    expect(response.status).toBe(409)
  })

  it('rejects a repeated ISIN under a different id with 409', async () => {
    const response = await fetchJson('/api/funds', {
      method: 'POST',
      body: { id: 'small-2', isin: 'IE00SMALL001', name: 'Otro nombre', currency: 'EUR' },
    })

    expect(response.status).toBe(409)
  })

  it('rejects an empty id with 400', async () => {
    const response = await fetchJson('/api/funds', {
      method: 'POST',
      body: { id: '', isin: 'IE00EMPTY001', name: 'Sin id', currency: 'EUR' },
    })

    expect(response.status).toBe(400)
  })

  it('rejects a missing isin with 400', async () => {
    const response = await fetchJson('/api/funds', {
      method: 'POST',
      body: { id: 'no-isin', name: 'Sin ISIN', currency: 'EUR' },
    })

    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/funds/:id', () => {
  it('renames a fund and leaves its isin untouched', async () => {
    const body = await $fetch('/api/funds/small', {
      method: 'PATCH',
      body: { name: 'Small caps renombrado' },
    })

    expect(body.name).toBe('Small caps renombrado')
    expect(body.isin).toBe('IE00SMALL001')
  })

  it('returns 404 for a fund that does not exist', async () => {
    const response = await fetchJson('/api/funds/does-not-exist', {
      method: 'PATCH',
      body: { name: 'Nadie' },
    })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/funds/:id', () => {
  it('deletes a fund with no purchases and it stops appearing in the list', async () => {
    const response = await fetch('/api/funds/small', { method: 'DELETE' })
    expect(response.status).toBe(204)

    const body = await $fetch<FundView[]>('/api/funds')
    expect(body.find(fund => fund.id === 'small')).toBeUndefined()
  })

  it('returns 404 for a fund that does not exist', async () => {
    const response = await fetch('/api/funds/does-not-exist', { method: 'DELETE' })
    expect(response.status).toBe(404)
  })

  it('refuses to delete a fund that has purchases, with 409', async () => {
    // No NAV has ever been entered for `world` in this file, so this also
    // pins the other half of `buildFundsView`'s contract: a fund holding
    // units it cannot price reports `value: 0`, distinguishable from a fund
    // holding nothing at all only through `latestNav` staying `null`.
    const purchase = insertPurchase(database.db, {
      fundId: 'world',
      month: '2026-07',
      date: '2026-07-01',
      amount: 160000,
      nav: '10',
      units: '160.000000',
      source: 'manual',
    })

    try {
      const funds = await $fetch<FundView[]>('/api/funds')
      const world = funds.find(fund => fund.id === 'world')
      expect(world?.latestNav).toBeNull()
      expect(world?.units).toBe('160.000000')
      expect(world?.invested).toBe(160000)
      expect(world?.value).toBe(0)

      const response = await fetch('/api/funds/world', { method: 'DELETE' })
      expect(response.status).toBe(409)
    }
    finally {
      deletePurchase(database.db, purchase.id)
    }
  })
})

describe('GET /api/funds/resolve', () => {
  it('rejects a request with no isin query with 400', async () => {
    const response = await fetch(withQuery('/api/funds/resolve', {}))

    expect(response.status).toBe(400)
  })
})
