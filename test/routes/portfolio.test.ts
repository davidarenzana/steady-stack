import { describe, expect, it } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import { getFund } from '../../server/db/queries'
import { setupRouteServer } from '../../server/test-utils/route-server'

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
