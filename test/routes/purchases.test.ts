import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { upsertNav } from '../../server/db/queries'
import { fetchJson, setupRouteServer, withQuery } from '../../server/test-utils/route-server'

/**
 * Routes 18 to 22: the stored purchases, and the materialisation that turns
 * the derived contribution series into them.
 *
 * The two invariants under test are the ones the whole application is built
 * around. A purchase is a historical fact: materialisation is insert-only and
 * idempotent, and editing the rule that produced a purchase leaves the
 * purchase exactly as it was. And units are never a floating-point
 * convenience: they come from `unitsFor`, six places, `ROUND_HALF_UP`, over
 * integer cents and a decimal-string NAV.
 */
const database = await setupRouteServer()

/**
 * Round NAVs, so every expected unit count below is exact rather than
 * rounded: 1.600 € at 10 € is 160 units and 400 € at 20 € is 20 units, with
 * nothing to argue about at the sixth decimal place.
 *
 * One NAV per fund per month, on a day both funds share — `2026-07-01` and
 * `2026-08-03` — because `earliestCommonNavDate` materialises a month on the
 * earliest date for which *every* fund in the split has a price, and skips
 * the month with `reason: 'no-nav'` when there is none.
 */
for (const [fundId, value] of [['world', '10'], ['emerging', '20']] as const) {
  for (const date of ['2026-07-01', '2026-08-03'] as const) {
    upsertNav(database.db, { fundId, date, value, source: 'yahoo' })
  }
}

interface StoredPurchase {
  id: number
  portfolioId: string
  fundId: string
  month: string
  date: string
  amount: number
  nav: string
  units: string
  source: string
}

interface MaterialisationResult {
  created: StoredPurchase[]
  skipped: Array<{ month: string, reason: string }>
}

function purchases(query: Record<string, string> = {}): Promise<StoredPurchase[]> {
  return $fetch<StoredPurchase[]>('/api/purchases', { query })
}

/** Empties the table over HTTP, so a block that counts rows starts from a known state. */
async function deleteEveryPurchase(): Promise<void> {
  for (const purchase of await purchases()) {
    const response = await fetch(`/api/purchases/${purchase.id}`, { method: 'DELETE' })
    expect(response.status).toBe(204)
  }
  expect(await purchases()).toEqual([])
}

describe('GET /api/purchases', () => {
  it('reports no purchases on the seeded database', async () => {
    // Nothing is materialised by the seed: contributions are derived, and
    // only an executed purchase is stored.
    expect(await purchases()).toEqual([])
  })
})

describe('POST /api/purchases', () => {
  it('computes units from the amount and the NAV, and stores the purchase as manual', async () => {
    const response = await fetchJson('/api/purchases', {
      method: 'POST',
      body: { fundId: 'world', month: '2026-07', date: '2026-07-01', amount: 160000, nav: '10' },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: expect.any(Number),
      portfolioId: 'index',
      fundId: 'world',
      month: '2026-07',
      date: '2026-07-01',
      amount: 160000,
      nav: '10',
      // 1.600 € at 10 € a unit. `unitsFor` divides cents by 100 and then by
      // the NAV, so this is 160 units and not 16.000.
      units: '160.000000',
      source: 'manual',
    })
  })

  it('keeps the units the caller gives rather than recomputing them', async () => {
    // The escape hatch for a statement that disagrees with the arithmetic:
    // the fund house has already told the user how many units they hold, and
    // that number wins over anything derived here.
    const body = await $fetch<StoredPurchase>('/api/purchases', {
      method: 'POST',
      body: {
        fundId: 'world',
        month: '2026-07',
        date: '2026-07-01',
        amount: 160000,
        nav: '10',
        units: '159.500000',
      },
    })

    expect(body.units).toBe('159.500000')
  })

  it('refuses an unknown fund with 404, and a bad amount, NAV or month with 400', async () => {
    const ghost = await fetchJson('/api/purchases', {
      method: 'POST',
      body: { fundId: 'ghost', month: '2026-07', date: '2026-07-01', amount: 160000, nav: '10' },
    })
    expect(ghost.status).toBe(404)

    // A JSON number for a NAV is refused rather than coerced: section 7 of
    // the spec keeps money out of floating point end to end.
    const numericNav = await fetchJson('/api/purchases', {
      method: 'POST',
      body: { fundId: 'world', month: '2026-07', date: '2026-07-01', amount: 160000, nav: 10 },
    })
    expect(numericNav.status).toBe(400)

    // `2026-7` is not a month: months are `YYYY-MM` so that comparing them is
    // comparing strings, and a single-digit one would sort wrongly.
    const shortMonth = await fetchJson('/api/purchases', {
      method: 'POST',
      body: { fundId: 'world', month: '2026-7', date: '2026-07-01', amount: 160000, nav: '10' },
    })
    expect(shortMonth.status).toBe(400)
  })
})

describe('PATCH /api/purchases/:id', () => {
  it('recomputes the units when the NAV is corrected', async () => {
    // The drift this closes off: a NAV typed in wrongly and fixed later would
    // otherwise leave `units` describing the old price forever.
    const [first] = await purchases()

    const body = await $fetch<StoredPurchase>(`/api/purchases/${first!.id}`, {
      method: 'PATCH',
      body: { nav: '20' },
    })

    expect(body.nav).toBe('20')
    // 1.600 € at 20 € a unit, merged from the amount the row already had.
    expect(body.units).toBe('80.000000')
  })

  it('leaves the units alone when only the date changes', async () => {
    const [first] = await purchases()
    const unitsBefore = first!.units

    const body = await $fetch<StoredPurchase>(`/api/purchases/${first!.id}`, {
      method: 'PATCH',
      body: { date: '2026-07-02' },
    })

    expect(body.date).toBe('2026-07-02')
    expect(body.units).toBe(unitsBefore)
  })

  it('returns 404 for a purchase that does not exist, on PATCH and on DELETE alike', async () => {
    const patched = await fetchJson('/api/purchases/999999', {
      method: 'PATCH',
      body: { nav: '20' },
    })
    expect(patched.status).toBe(404)

    const deleted = await fetch('/api/purchases/999999', { method: 'DELETE' })
    expect(deleted.status).toBe(404)
  })
})

describe('GET /api/purchases with filters', () => {
  it('filters by fund and by date, and returns nothing when nothing matches', async () => {
    expect(await purchases({ fundId: 'emerging' })).toEqual([])

    // Both purchases in the table are dated in July, one of them moved to the
    // 2nd by the PATCH above.
    expect(await purchases({ from: '2026-08-01' })).toEqual([])

    const july = await purchases({ fundId: 'world', from: '2026-07-01', to: '2026-07-31' })
    expect(july).toHaveLength(2)
  })

  it('rejects a malformed date filter with 400', async () => {
    const response = await fetch(withQuery('/api/purchases', { from: 'not-a-date' }))

    expect(response.status).toBe(400)
  })
})

describe('DELETE /api/purchases/:id', () => {
  it('removes a purchase and it stops being listed', async () => {
    await deleteEveryPurchase()
  })
})

describe('POST /api/purchases/materialise', () => {
  it('turns two months of contributions into four frozen purchases', async () => {
    // Two months — the earliest rule month through `throughMonth` — times the
    // two funds of the 80/20 split. The date is not today's: it is the
    // earliest day in each month for which both funds have a price.
    const body = await $fetch<MaterialisationResult>('/api/purchases/materialise', {
      method: 'POST',
      body: { throughMonth: '2026-08' },
    })

    expect(body.created).toHaveLength(4)
    expect(body.skipped).toEqual([])

    const julyWorld = body.created.find(p => p.month === '2026-07' && p.fundId === 'world')
    expect(julyWorld).toEqual({
      id: expect.any(Number),
      portfolioId: 'index',
      fundId: 'world',
      month: '2026-07',
      date: '2026-07-01',
      // 2.000 € split 80/20 is 1.600 € and 400 €, exactly, with no cents
      // invented or evaporated.
      amount: 160000,
      nav: '10',
      units: '160.000000',
      // Not 'manual': this purchase was derived, and the distinction is what
      // lets a screen show which rows the user typed in themselves.
      source: 'auto',
    })

    const julyEmerging = body.created.find(p => p.month === '2026-07' && p.fundId === 'emerging')
    expect(julyEmerging).toMatchObject({
      amount: 40000,
      nav: '20',
      units: '20.000000',
      source: 'auto',
    })

    // August is materialised on the 3rd, the only day that month with a price
    // for both funds, and at the 200 € the second rule gives it: 160 € and 40 €.
    const augustWorld = body.created.find(p => p.month === '2026-08' && p.fundId === 'world')
    expect(augustWorld).toMatchObject({ date: '2026-08-03', amount: 16000, units: '16.000000' })
  })

  it('creates nothing the second time it is run with the same throughMonth', async () => {
    const body = await $fetch<MaterialisationResult>('/api/purchases/materialise', {
      method: 'POST',
      body: { throughMonth: '2026-08' },
    })

    expect(body.created).toEqual([])
    expect(body.skipped).toEqual([
      { month: '2026-07', reason: 'already-materialised' },
      { month: '2026-08', reason: 'already-materialised' },
    ])
    expect(await purchases()).toHaveLength(4)
  })

  it('leaves an executed purchase alone when the rule that produced it is edited', async () => {
    // Section 4 of the spec, from the other side: the 2026-08 rule is raised
    // from 200 € to 300 €, and the purchase already executed under it keeps
    // the 160 € it was actually made at. Materialisation is insert-only, so
    // there is no path by which a rule edit reaches a stored row.
    const view = await $fetch<{ rules: Array<{ id: number, fromMonth: string }> }>(
      '/api/contributions',
      { query: { from: '2026-08', to: '2026-08' } },
    )
    const augustRule = view.rules.find(rule => rule.fromMonth === '2026-08')

    await $fetch(`/api/contributions/rules/${augustRule!.id}`, {
      method: 'PATCH',
      body: { amount: 30000 },
    })

    const body = await $fetch<MaterialisationResult>('/api/purchases/materialise', {
      method: 'POST',
      body: { throughMonth: '2026-08' },
    })
    expect(body.created).toEqual([])

    const stored = await purchases({ fundId: 'world', from: '2026-08-01', to: '2026-08-31' })
    expect(stored).toHaveLength(1)
    expect(stored[0]?.amount).toBe(16000)
  })

  it('rejects a malformed throughMonth with 400', async () => {
    const response = await fetchJson('/api/purchases/materialise', {
      method: 'POST',
      body: { throughMonth: '2026-7' },
    })

    expect(response.status).toBe(400)
  })
})
