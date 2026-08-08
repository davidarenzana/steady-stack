import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { listOverrides, listRules } from '../../server/db/queries'
import { fetchJson, setupRouteServer, withQuery } from '../../server/test-utils/route-server'

/**
 * Routes 12 to 17: the contribution rules and the per-month overrides.
 *
 * The invariant under test throughout is section 4 of the spec — a rule is
 * never edited to change when it starts governing, and adding a later rule
 * leaves every earlier month exactly as it was. The two seeded rules make
 * that visible without arranging anything: 2.000 € from 2026-07, then 200 €
 * from 2026-08.
 *
 * `rules` and `overrides` come back as raw database rows, so `weights` is the
 * JSON *string* the column holds. Only `months`, which `expandContributions`
 * produces, carries weights as an array. Asserted as they actually are rather
 * than as they would be nicer.
 */
const database = await setupRouteServer()

const WEIGHTS_80_20 = [
  { fundId: 'world', weight: 0.8 },
  { fundId: 'emerging', weight: 0.2 },
]

/** The seeded 80/20 split as the `weights` column stores it. */
const WEIGHTS_80_20_JSON = JSON.stringify(WEIGHTS_80_20)

interface RuleRow {
  id: number
  portfolioId: string
  fromMonth: string
  amount: number
  timing: string
  weights: string
}

interface OverrideRow {
  id: number
  portfolioId: string
  month: string
  amount: number | null
  timing: string | null
  note: string | null
}

interface ContributionsView {
  rules: RuleRow[]
  overrides: OverrideRow[]
  months: Array<{
    month: string
    amount: number
    timing: string
    weights: Array<{ fundId: string, weight: number }>
    materialised: boolean
  }>
}

/** The window every test below reads, unless it needs another one. */
function contributions(from: string, to: string): Promise<ContributionsView> {
  return $fetch<ContributionsView>('/api/contributions', { query: { from, to } })
}

describe('GET /api/contributions', () => {
  it('resolves the seeded rules into a month-by-month series', async () => {
    const body = await contributions('2026-07', '2026-09')

    expect(body.rules).toHaveLength(2)
    expect(body.overrides).toEqual([])
    expect(body.months).toEqual([
      // 2026-07 is governed by the first rule at 2.000 €, and only that month:
      // the second rule takes over from 2026-08 at 200 €.
      { month: '2026-07', amount: 200000, timing: 'start', weights: WEIGHTS_80_20, materialised: false },
      { month: '2026-08', amount: 20000, timing: 'start', weights: WEIGHTS_80_20, materialised: false },
      { month: '2026-09', amount: 20000, timing: 'start', weights: WEIGHTS_80_20, materialised: false },
    ])
  })

  it('serves the rules as the rows they are, weights included as JSON', async () => {
    const body = await contributions('2026-07', '2026-07')
    const first = body.rules.find(rule => rule.fromMonth === '2026-07')

    expect(first).toEqual({
      id: expect.any(Number),
      portfolioId: 'index',
      fromMonth: '2026-07',
      amount: 200000,
      timing: 'start',
      weights: WEIGHTS_80_20_JSON,
    })
  })

  it('rejects a missing or malformed window with 400', async () => {
    const noFrom = await fetch(withQuery('/api/contributions', { to: '2026-09' }))
    expect(noFrom.status).toBe(400)

    // Month 13 does not exist. `MONTH_PATTERN` bounds the month, so this is a
    // 400 and not a window that silently resolves to nothing.
    const month13 = await fetch(withQuery('/api/contributions', { from: '2026-13', to: '2026-13' }))
    expect(month13.status).toBe(400)
  })
})

describe('POST /api/contributions/rules', () => {
  it('adds a rule that governs from its own month onward and rewrites nothing before it', async () => {
    // The whole of section 4 of the spec in one assertion: 2026-12 keeps the
    // 200 € the earlier rule gives it, and only 2027-01 sees the 300 €.
    const created = await $fetch<RuleRow>('/api/contributions/rules', {
      method: 'POST',
      body: {
        fromMonth: '2027-01',
        amount: 30000,
        timing: 'end',
        weights: WEIGHTS_80_20,
      },
    })

    expect(created.fromMonth).toBe('2027-01')
    expect(created.amount).toBe(30000)
    expect(created.timing).toBe('end')

    const body = await contributions('2026-12', '2027-01')
    expect(body.months.map(month => [month.month, month.amount, month.timing])).toEqual([
      ['2026-12', 20000, 'start'],
      ['2027-01', 30000, 'end'],
    ])
  })

  it('returns 201 for a created rule', async () => {
    // Asserted on a second, throwaway rule rather than by repeating the one
    // above: the status code is part of route 13's contract and `$fetch`
    // hides it.
    const response = await fetchJson('/api/contributions/rules', {
      method: 'POST',
      body: { fromMonth: '2028-01', amount: 10000, timing: 'start', weights: WEIGHTS_80_20 },
    })

    expect(response.status).toBe(201)

    const throwaway = (await response.json()) as RuleRow
    const deleted = await fetch(`/api/contributions/rules/${throwaway.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
  })

  it('refuses a second rule starting the same month with 409', async () => {
    // Enforced by `contribution_rule_month_unique`, not by a prior SELECT
    // that could race it.
    const response = await fetchJson('/api/contributions/rules', {
      method: 'POST',
      body: { fromMonth: '2027-01', amount: 40000, timing: 'start', weights: WEIGHTS_80_20 },
    })

    expect(response.status).toBe(409)
  })

  it('refuses weights that do not add up to 1, or that name a fund twice, with 400', async () => {
    const shortfall = await fetchJson('/api/contributions/rules', {
      method: 'POST',
      body: {
        fromMonth: '2029-01',
        amount: 10000,
        timing: 'start',
        weights: [{ fundId: 'world', weight: 0.7 }, { fundId: 'emerging', weight: 0.2 }],
      },
    })
    expect(shortfall.status).toBe(400)

    // Adds up to 1 and is still wrong: a plain object cannot hold two entries
    // under one key, so `split()` would lose one part and the total would no
    // longer match the contribution.
    const repeated = await fetchJson('/api/contributions/rules', {
      method: 'POST',
      body: {
        fromMonth: '2029-01',
        amount: 10000,
        timing: 'start',
        weights: [{ fundId: 'world', weight: 0.5 }, { fundId: 'world', weight: 0.5 }],
      },
    })
    expect(repeated.status).toBe(400)
  })
})

describe('PATCH /api/contributions/rules/:id', () => {
  /** Reads back the rule created by the block above, whichever id it got. */
  async function createdRule(): Promise<RuleRow> {
    const body = await contributions('2027-01', '2027-01')
    const rule = body.rules.find(r => r.fromMonth === '2027-01')
    expect(rule).toBeDefined()
    return rule!
  }

  it('changes the amount of an existing rule', async () => {
    const rule = await createdRule()

    const patched = await $fetch<RuleRow>(`/api/contributions/rules/${rule.id}`, {
      method: 'PATCH',
      body: { amount: 25000 },
    })

    expect(patched.amount).toBe(25000)
    expect(patched.fromMonth).toBe('2027-01')
  })

  it('refuses to move a rule\'s start month, even to null', async () => {
    // The check is `hasField`, not a value check: a rule that could be moved
    // would rewrite months it never governed. Both of these are 400.
    const rule = await createdRule()

    const moved = await fetchJson(`/api/contributions/rules/${rule.id}`, {
      method: 'PATCH',
      body: { fromMonth: '2027-02' },
    })
    expect(moved.status).toBe(400)

    const nulled = await fetchJson(`/api/contributions/rules/${rule.id}`, {
      method: 'PATCH',
      body: { fromMonth: null },
    })
    expect(nulled.status).toBe(400)
  })

  it('returns 404 for a rule that does not exist, on PATCH and on DELETE alike', async () => {
    const patched = await fetchJson('/api/contributions/rules/999999', {
      method: 'PATCH',
      body: { amount: 25000 },
    })
    expect(patched.status).toBe(404)

    const deleted = await fetch('/api/contributions/rules/999999', { method: 'DELETE' })
    expect(deleted.status).toBe(404)
  })
})

describe('DELETE /api/contributions/rules/:id', () => {
  it('removes a rule and hands its months back to the rule before it', async () => {
    const before = await contributions('2027-01', '2027-01')
    const rule = before.rules.find(r => r.fromMonth === '2027-01')

    const response = await fetch(`/api/contributions/rules/${rule!.id}`, { method: 'DELETE' })
    expect(response.status).toBe(204)

    const after = await contributions('2027-01', '2027-01')
    expect(after.rules.some(r => r.fromMonth === '2027-01')).toBe(false)
    // Back to the 200 € of the 2026-08 rule, which never stopped governing.
    expect(after.months[0]?.amount).toBe(20000)
  })
})

describe('PUT /api/contributions/overrides/:month', () => {
  it('skips a month entirely when the override amount is null', async () => {
    // Read from the code rather than guessed, as the plan asks: line 51 of
    // `core/contributions.ts` is `if (override && override.amount === null)
    // continue`, so a skipped month is *absent* from `months` — it is not
    // present with an amount of 0. That distinction matters to every screen
    // downstream: a month worth 0 € is a contribution of nothing, a month
    // that is not there was never scheduled.
    const override = await $fetch<OverrideRow>('/api/contributions/overrides/2026-09', {
      method: 'PUT',
      body: { amount: null, note: 'Mes saltado' },
    })

    expect(override).toEqual({
      id: expect.any(Number),
      portfolioId: 'index',
      month: '2026-09',
      amount: null,
      timing: null,
      note: 'Mes saltado',
    })

    const body = await contributions('2026-09', '2026-09')
    expect(body.months).toEqual([])
    expect(body.overrides).toHaveLength(1)

    // The months around it are untouched, so this is a hole and not a cut.
    const window = await contributions('2026-08', '2026-10')
    expect(window.months.map(month => month.month)).toEqual(['2026-08', '2026-10'])
  })

  it('replaces the override already held for that month rather than adding a second', async () => {
    const body = await $fetch<OverrideRow>('/api/contributions/overrides/2026-09', {
      method: 'PUT',
      body: { amount: 50000 },
    })

    expect(body.amount).toBe(50000)
    // `note` is gone: an upsert replaces the row, it does not merge into it.
    expect(body.note).toBeNull()

    const view = await contributions('2026-09', '2026-09')
    expect(view.overrides).toHaveLength(1)
    expect(view.months).toHaveLength(1)
    expect(view.months[0]?.amount).toBe(50000)
  })

  it('rejects a month that does not exist with 400', async () => {
    const response = await fetchJson('/api/contributions/overrides/2026-13', {
      method: 'PUT',
      body: { amount: 50000 },
    })

    expect(response.status).toBe(400)
  })

  it('rejects a body with no amount field at all with 400', async () => {
    // `readNullableCents` requires the field to be present even though its
    // value may be null: an absent `amount` is a caller that has not said
    // whether the month is skipped or re-priced.
    const response = await fetchJson('/api/contributions/overrides/2026-10', {
      method: 'PUT',
      body: { note: 'Sin importe' },
    })

    expect(response.status).toBe(400)
  })
})

describe('DELETE /api/contributions/overrides/:month', () => {
  it('removes the override and gives the month back to its rule', async () => {
    const response = await fetch('/api/contributions/overrides/2026-09', { method: 'DELETE' })
    expect(response.status).toBe(204)

    const view = await contributions('2026-09', '2026-09')
    expect(view.overrides).toEqual([])
    expect(view.months[0]?.amount).toBe(20000)
  })

  it('returns 404 when there is no override for that month', async () => {
    const response = await fetch('/api/contributions/overrides/2026-09', { method: 'DELETE' })

    expect(response.status).toBe(404)
  })
})

describe('the temporary database', () => {
  it('ends the file with only the two seeded rules and no overrides left', () => {
    // Read through the handle rather than over HTTP: the cheapest place to
    // notice a test that did not clean up after itself.
    expect(listRules(database.db).map(rule => rule.fromMonth)).toEqual(['2026-07', '2026-08'])
    expect(listOverrides(database.db)).toEqual([])
  })
})
