import { describe, expect, it } from 'vitest'
import { fetch } from '@nuxt/test-utils/e2e'
import { setupRouteServer } from '../../server/test-utils/route-server'

/**
 * Proves `STEADY_STACK_FORBID_NETWORK` is a structural guard rather than a
 * matter of every route test remembering not to send a real ISIN. Without
 * it, this call would open a socket to Yahoo — on a train with no wifi, or
 * in a sandboxed CI runner, that is a hang or a flake that proves nothing
 * about the route.
 */
await setupRouteServer()

describe('the network guard', () => {
  it('refuses a real outbound request instead of silently making it', async () => {
    // No fixture is committed for this ISIN, so `defaultFetchJson` cannot
    // serve it from disk and must fall through to the refusal.
    const response = await fetch('/api/funds/resolve?isin=XX0000000000')

    expect(response.status).toBe(502)
    const body = await response.json()
    const message = body.statusMessage ?? body.message
    expect(message).toContain('Refused a real network request in a test')
    expect(message).toContain('XX0000000000')
  })

  it('serves the happy path from a committed fixture under the same guard', async () => {
    // IE00BYX5NX33 has a recorded fixture, so the guard does not have to
    // choose between "structural" and "thin": a real handler, a real
    // response shape, and still not one byte over a socket.
    const response = await fetch('/api/funds/resolve?isin=IE00BYX5NX33')

    expect(response.status).toBe(200)
    const candidates = await response.json()
    expect(Array.isArray(candidates)).toBe(true)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.map((c: { symbol: string }) => c.symbol)).toContain('0P0001CLDK.F')
  })
})
