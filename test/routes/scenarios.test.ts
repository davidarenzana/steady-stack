import { describe, expect, it } from 'vitest'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { listScenarios } from '../../server/db/queries'
import { fetchJson, setupRouteServer } from '../../server/test-utils/route-server'

/**
 * Routes 23 to 26: the projection scenarios.
 *
 * `enabled` is an integer in the row shape, 0 or 1, not a boolean — the
 * request that sets it takes `true` and `false`, the row that comes back
 * carries `1` and `0`. Asserted as it actually is: a test written against the
 * boolean a reader would expect would fail for the wrong reason, and a screen
 * binding a checkbox to this field needs to know which of the two it gets.
 */
const database = await setupRouteServer()

interface ScenarioRow {
  id: string
  name: string
  annualRate: string
  color: string
  enabled: number
}

interface DashboardSeries {
  series: { scenarios: Array<{ id: string, color: string, annualRate: string }> }
}

describe('GET /api/scenarios', () => {
  it('returns the three seeded scenarios, rates as decimal strings and enabled as 1', async () => {
    // The rate is a decimal string and never a REAL: `'0.09'` is 9 %, and the
    // monthly rate derived from it is `(1 + r)^(1/12) - 1`, not `r / 12`.
    const body = await $fetch<ScenarioRow[]>('/api/scenarios')

    expect(body).toHaveLength(3)
    // Compared as a sorted copy: `listScenarios` does no ORDER BY, so
    // insertion order is what SQLite happens to return, not a contract.
    expect([...body].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'flat', name: 'Sin interés', annualRate: '0', color: 'chart-3', enabled: 1 },
      { id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color: 'chart-2', enabled: 1 },
      { id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color: 'chart-1', enabled: 1 },
    ])
  })
})

describe('POST /api/scenarios', () => {
  it('creates a scenario and returns 201', async () => {
    const response = await fetchJson('/api/scenarios', {
      method: 'POST',
      body: { id: 'pesimista', name: 'Escenario pesimista', annualRate: '0.02', color: 'chart-4' },
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 'pesimista',
      name: 'Escenario pesimista',
      annualRate: '0.02',
      color: 'chart-4',
      // Defaulted by the column, not by the handler: an absent `enabled`
      // means a scenario is drawn.
      enabled: 1,
    })
  })

  it('refuses a repeated id with 409', async () => {
    const response = await fetchJson('/api/scenarios', {
      method: 'POST',
      body: { id: 'pesimista', name: 'Otro', annualRate: '0.03', color: 'chart-5' },
    })

    expect(response.status).toBe(409)
  })

  it('refuses a numeric rate and an empty id with 400', async () => {
    // A rate arriving as a JSON number is refused rather than coerced. Over
    // this portfolio's 25-year horizon the difference between a decimal string
    // carried at full precision and a float is real money.
    const numericRate = await fetchJson('/api/scenarios', {
      method: 'POST',
      body: { id: 'numerico', name: 'Numérico', annualRate: 0.02, color: 'chart-4' },
    })
    expect(numericRate.status).toBe(400)

    const emptyId = await fetchJson('/api/scenarios', {
      method: 'POST',
      body: { id: '', name: 'Sin id', annualRate: '0.02', color: 'chart-4' },
    })
    expect(emptyId.status).toBe(400)
  })

  it('accepts a colour that is not a theme token — an open finding, not a fix', async () => {
    // `TODO.md`, *Findings this plan leaves for plan 3*: scenario `color` is
    // not restricted to the `chart-1` … `chart-5` tokens the theme declares,
    // so a raw hex value goes straight in and the interface would resolve
    // `var(--#ff0000)` to nothing. Asserted as the current behaviour so the
    // gap is documented rather than pretended closed; the day it becomes a
    // 400 this test is the one that says so.
    const response = await fetchJson('/api/scenarios', {
      method: 'POST',
      body: { id: 'hex', name: 'Color crudo', annualRate: '0.01', color: '#ff0000' },
    })
    expect(response.status).toBe(201)

    const deleted = await fetch('/api/scenarios/hex', { method: 'DELETE' })
    expect(deleted.status).toBe(204)
  })
})

describe('PATCH /api/scenarios/:id', () => {
  it('disables a scenario, and the dashboard stops drawing it', async () => {
    // What the scenarios screen of phase 7 relies on: the row survives, the
    // chart loses a line. A disabled scenario is not a deleted one.
    const body = await $fetch<ScenarioRow>('/api/scenarios/pesimista', {
      method: 'PATCH',
      body: { enabled: false },
    })

    expect(body.enabled).toBe(0)

    const dashboard = await $fetch<DashboardSeries>('/api/dashboard', { query: { asOf: '2026-08-06' } })
    const drawn = dashboard.series.scenarios.map(scenario => scenario.id)

    expect(drawn).toHaveLength(3)
    expect(drawn).not.toContain('pesimista')
    expect([...drawn].sort()).toEqual(['flat', 'moderate', 'optimistic'])

    // Still listed by its own route, disabled: the two routes disagree on
    // purpose. `GET /api/scenarios` is the editing surface, the dashboard is
    // the drawing one.
    const listed = await $fetch<ScenarioRow[]>('/api/scenarios')
    expect(listed.find(scenario => scenario.id === 'pesimista')?.enabled).toBe(0)
  })

  it('returns 404 for a scenario that does not exist', async () => {
    const response = await fetchJson('/api/scenarios/does-not-exist', {
      method: 'PATCH',
      body: { enabled: false },
    })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/scenarios/:id', () => {
  it('deletes a scenario, and a second delete is a 404', async () => {
    const first = await fetch('/api/scenarios/pesimista', { method: 'DELETE' })
    expect(first.status).toBe(204)

    const second = await fetch('/api/scenarios/pesimista', { method: 'DELETE' })
    expect(second.status).toBe(404)
  })
})

describe('the temporary database', () => {
  it('ends the file with the three seeded scenarios and nothing else', () => {
    // Read through the handle rather than over HTTP: the cheapest place to
    // notice a test that created a scenario and did not clean up after itself.
    expect(listScenarios(database.db).map(scenario => scenario.id).sort()).toEqual([
      'flat',
      'moderate',
      'optimistic',
    ])
  })
})
