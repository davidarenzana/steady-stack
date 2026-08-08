import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { deletePurchase, insertPurchase } from '../../server/db/queries'
import { fetchJson, setupRouteServer, withQuery } from '../../server/test-utils/route-server'
import type { FundView } from '../../server/services/read-model'

/**
 * This file must never call `/api/nav/sync`: it does not set a
 * `providerSymbol` on any fund, so a sync would have nothing to skip on and
 * would try to reach Yahoo for real.
 *
 * It does call `/api/funds/resolve` with `IE00BYX5NX33`, which is safe
 * because a fixture is committed for it and the server runs under
 * `STEADY_STACK_FORBID_NETWORK`: the handler is served from disk and a real
 * request would throw rather than open a socket. That call is here, and not
 * only in `test/routes/network-guard.test.ts`, because it asserts route 8's
 * substance rather than the guard's — and nobody looking for the contract of
 * a route reads a file named after the network guard.
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

  it('sets a providerSymbol, clears it with an explicit null, and leaves it alone when the field is absent', async () => {
    // Undoing a wrong share-class choice. Section 6 of the spec has one ISIN
    // publishing several share classes at different prices, so picking the
    // wrong one is an ordinary mistake, and `null` is the only way to say
    // "none of them" again — an absent field has to keep meaning "leave it".
    const chosen = await $fetch('/api/funds/world', {
      method: 'PATCH',
      body: { providerSymbol: '0P0001CLDK.F' },
    })
    expect(chosen.providerSymbol).toBe('0P0001CLDK.F')

    const cleared = await $fetch('/api/funds/world', {
      method: 'PATCH',
      body: { providerSymbol: null },
    })
    expect(cleared.providerSymbol).toBeNull()

    const renamed = await $fetch('/api/funds/world', {
      method: 'PATCH',
      body: { name: 'Fidelity MSCI World Index Fund EUR P Acc' },
    })
    expect(renamed.providerSymbol).toBeNull()
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

  it('returns every share class of an ISIN and picks none of them', async () => {
    // Section 6 of the spec: one ISIN publishes several share classes at
    // different prices — 0P0001CLDK.F at 9,99 € against IE00BYX5NX33.SG at
    // 14,33 € — and only the user's own statement says which they hold.
    //
    // Asserted by set and by count, never by position. `pnpm capture:fixtures`
    // re-records these responses, and Yahoo is free to order them differently
    // when it does; an assertion that leaned on the current order would keep
    // passing while silently guarding nothing.
    const response = await fetch(withQuery('/api/funds/resolve', { isin: 'IE00BYX5NX33' }))
    expect(response.status).toBe(200)

    const symbols = ((await response.json()) as Array<{ symbol: string }>).map(c => c.symbol)

    expect(symbols.length).toBeGreaterThanOrEqual(2)
    expect(new Set(symbols)).toEqual(new Set(['IE00BYX5NX33.SG', '0P0001CLDK.F']))
  })
})
