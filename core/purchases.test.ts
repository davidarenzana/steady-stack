import { describe, expect, it } from 'vitest'
import { buildPurchases } from './purchases'
import type { Contribution } from './types'

const CONTRIBUTION: Contribution = {
  month: '2026-08',
  amount: 20_000,
  timing: 'start',
  weights: [
    { fundId: 'world', weight: 0.8 },
    { fundId: 'emerging', weight: 0.2 },
  ],
}

describe('buildPurchases', () => {
  it('splits the contribution and turns each part into units', () => {
    const result = buildPurchases(CONTRIBUTION, '2026-08-03', { world: '10', emerging: '10' })

    expect(result).toEqual([
      { fundId: 'world', date: '2026-08-03', amount: 16_000, nav: '10', units: '16.000000' },
      { fundId: 'emerging', date: '2026-08-03', amount: 4_000, nav: '10', units: '4.000000' },
    ])
  })

  it('rounds the units to six decimal places', () => {
    const single: Contribution = {
      ...CONTRIBUTION,
      amount: 10_000,
      weights: [{ fundId: 'world', weight: 1 }],
    }
    const result = buildPurchases(single, '2026-08-03', { world: '3' })

    // 100 € / 3 = 33,333333…
    expect(result[0]!.units).toBe('33.333333')
  })

  it('makes the purchase amounts add up to the exact contribution', () => {
    const odd: Contribution = { ...CONTRIBUTION, amount: 20_001 }
    const result = buildPurchases(odd, '2026-08-03', { world: '10', emerging: '10' })

    expect(result.reduce((sum, p) => sum + p.amount, 0)).toBe(20_001)
  })

  it('handles a NAV with many decimal places', () => {
    const single: Contribution = {
      ...CONTRIBUTION,
      amount: 16_000,
      weights: [{ fundId: 'world', weight: 1 }],
    }
    const result = buildPurchases(single, '2026-08-03', { world: '14.8321' })

    // 160 / 14,8321 = 10,787414…
    expect(result[0]!.units).toBe('10.787414')
  })

  it('rejects a fund with no NAV available', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '10' }))
      .toThrow('No NAV available for fund "emerging" on 2026-08-03')
  })

  it('rejects a NAV of zero', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '0', emerging: '10' }))
      .toThrow('NAV of fund "world" must be positive')
  })

  it('rejects a negative NAV', () => {
    expect(() => buildPurchases(CONTRIBUTION, '2026-08-03', { world: '-1', emerging: '10' }))
      .toThrow('NAV of fund "world" must be positive')
  })
})
