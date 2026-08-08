import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { deletePurchase, getFund, insertPurchase, upsertNav } from '../../server/db/queries'
import { fetchJson, setupRouteServer, withQuery } from '../../server/test-utils/route-server'
import { navs } from '../../server/db/schema'
import type { Dashboard } from '../../server/services/read-model'

const database = await setupRouteServer()

describe('GET /api/portfolio', () => {
  it('serves the seeded portfolio', async () => {
    const body = await $fetch('/api/portfolio')

    expect(body).toEqual({
      id: 'index',
      name: 'Cartera indexada',
      currency: 'EUR',
      horizonYears: 25,
      firstMonth: '2026-07',
    })
  })
})

describe('PATCH /api/portfolio', () => {
  it('changes horizonYears and leaves name untouched, then can be restored', async () => {
    const patched = await $fetch('/api/portfolio', {
      method: 'PATCH',
      body: { horizonYears: 30 },
    })

    expect(patched.horizonYears).toBe(30)
    expect(patched.name).toBe('Cartera indexada')

    const fetched = await $fetch('/api/portfolio')
    expect(fetched.horizonYears).toBe(30)

    // Restored so the dashboard test below, which relies on the seeded
    // 25-year horizon producing 301 months, is not order-dependent.
    const restored = await $fetch('/api/portfolio', {
      method: 'PATCH',
      body: { horizonYears: 25 },
    })
    expect(restored.horizonYears).toBe(25)
  })

  it('rejects a horizonYears of 0', async () => {
    const response = await fetchJson('/api/portfolio', {
      method: 'PATCH',
      body: { horizonYears: 0 },
    })

    expect(response.status).toBe(400)
  })

  it('rejects a fractional horizonYears', async () => {
    const response = await fetchJson('/api/portfolio', {
      method: 'PATCH',
      body: { horizonYears: 1.5 },
    })

    expect(response.status).toBe(400)
  })
})

describe('GET /api/dashboard', () => {
  it('reports a fresh portfolio honestly: no NAV, no XIRR, a portfolio series of nulls', async () => {
    const body = await $fetch<Dashboard>('/api/dashboard', { query: { asOf: '2026-08-06' } })

    expect(body.asOf).toBe('2026-08-06')
    // No NAV has ever been entered, so there is nothing to date the
    // valuation by — `navDate` must read `null`, never today's date.
    expect(body.navDate).toBeNull()
    // Fewer than two cash flows (no purchases at all): `xirr` reads `null`,
    // never `0`, because `0` would claim a real, computed 0 % return.
    expect(body.xirr).toBeNull()

    expect(body.valuation).toEqual({
      value: 0,
      invested: 0,
      gain: 0,
      gainRatio: 0,
      byFund: [],
    })

    expect(body.series.months).toHaveLength(301)
    expect(body.series.months[0]).toBe('2026-07')
    expect(body.series.months[300]).toBe('2051-07')

    // One-time 2.000 € in the first month, then the recurring 200 € from
    // the second rule stacks on top from 2026-08 — cumulative, not a
    // monthly figure, so 200.000 + 20.000 = 220.000 cents.
    expect(body.series.contributed[0]).toBe(200000)
    expect(body.series.contributed[1]).toBe(220000)

    // Nothing has ever been purchased, so every point of the real
    // portfolio series is unknown — `null`, never `0`, all the way across.
    expect(body.series.portfolio).toHaveLength(301)
    expect(body.series.portfolio.every((point) => point === null)).toBe(true)

    expect(body.series.scenarios).toHaveLength(3)
    expect(body.series.scenarios.map((s) => s.id)).toEqual(['flat', 'moderate', 'optimistic'])
    for (const scenario of body.series.scenarios) {
      expect(scenario.balance).toHaveLength(301)
    }
    const optimistic = body.series.scenarios.find((s) => s.id === 'optimistic')!
    expect(optimistic.color).toBe('chart-1')
    expect(optimistic.annualRate).toBe('0.09')

    // Every monetary field is an integer number of cents, gainRatio and
    // xirr are plain numbers — never a float euro amount slipping through.
    expect(Number.isInteger(body.valuation.value)).toBe(true)
    expect(Number.isInteger(body.valuation.invested)).toBe(true)
    expect(Number.isInteger(body.valuation.gain)).toBe(true)
    expect(typeof body.valuation.gainRatio).toBe('number')
    for (const month of body.series.contributed) {
      expect(Number.isInteger(month)).toBe(true)
    }
  })

  it('rejects a malformed asOf', async () => {
    const response = await fetch(withQuery('/api/dashboard', { asOf: 'not-a-date' }))

    expect(response.status).toBe(400)
  })

  it('defaults asOf to today when the query omits it, without asserting the value', async () => {
    const body = await $fetch<Dashboard>('/api/dashboard')

    // Asserting an exact value here would read the system clock from the
    // test itself. The shape is enough: a real YYYY-MM-DD date came back.
    expect(body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('GET /api/dashboard — the current month reads no further ahead than asOf', () => {
  it('values the month asOf falls in at asOf, ignoring a NAV dated later in the same month', async () => {
    // A NAV on the purchase date, so the purchase itself can be valued at all.
    upsertNav(database.db, { fundId: 'world', date: '2026-07-01', value: '10.0000', source: 'manual' })
    // A hand-entered NAV dated *after* `asOf`, inside the same month `asOf`
    // falls in. If the route read ahead to the month's last day instead of
    // stopping at `asOf`, this is the value it would wrongly pick up.
    upsertNav(database.db, { fundId: 'world', date: '2026-08-06', value: '20.0000', source: 'manual' })

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
      const body = await $fetch<Dashboard>('/api/dashboard', { query: { asOf: '2026-08-05' } })

      // 160 units at the 10 € NAV in force on 2026-08-05 is 160.000 cents,
      // not the 320.000 cents the later, out-of-reach NAV would produce.
      const augustIndex = body.series.months.indexOf('2026-08')
      expect(body.series.portfolio[augustIndex]).toBe(160000)
      expect(body.navDate).toBe('2026-07-01')
    }
    finally {
      // Cleanup so no later test in this file — nor a future one added to
      // it — inherits a stray purchase or a `world` NAV it did not ask for.
      deletePurchase(database.db, purchase.id)
      database.db.delete(navs).where(eq(navs.fundId, 'world')).run()
    }
  })
})

describe('write isolation', () => {
  it('writes land in the temporary database, not in data/steady-stack.db', async () => {
    await $fetch('/api/funds', {
      method: 'POST',
      body: { id: 'probe', isin: 'IE00PROBE001', name: 'Sonda', currency: 'EUR' },
    })

    // Reading back through the handle the harness gave us — rather than
    // opening `data/steady-stack.db` to check the negative, which would
    // itself create WAL sidecar files next to it — is what proves the
    // server subprocess honoured `STEADY_STACK_DATABASE_FILE`. If it had
    // not, this row would be missing.
    const stored = getFund(database.db, 'probe')
    expect(stored).toBeDefined()
    expect(stored?.name).toBe('Sonda')
  })
})
