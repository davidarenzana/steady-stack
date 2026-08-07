import { describe, expect, it } from 'vitest'
import { valuate } from './valuation'
import type { Purchase } from './purchases'

const PURCHASES: Purchase[] = [
  { fundId: 'world', date: '2026-08-03', amount: 16_000, nav: '10', units: '16.000000' },
  { fundId: 'emerging', date: '2026-08-03', amount: 4_000, nav: '10', units: '4.000000' },
]

describe('valuate', () => {
  it('values every position at the current NAV', () => {
    const result = valuate(PURCHASES, { world: '11', emerging: '12' })

    // 16 × 11 = 176 € and 4 × 12 = 48 €
    expect(result.value).toBe(22_400)
    expect(result.invested).toBe(20_000)
    expect(result.gain).toBe(2_400)
    expect(result.gainRatio).toBeCloseTo(0.12, 10)
  })

  it('aggregates several purchases of the same fund', () => {
    const purchases: Purchase[] = [
      ...PURCHASES,
      { fundId: 'world', date: '2026-09-01', amount: 16_000, nav: '16', units: '10.000000' },
    ]
    const result = valuate(purchases, { world: '20', emerging: '10' })

    const world = result.byFund.find((p) => p.fundId === 'world')!
    expect(world.units).toBe('26.000000')
    expect(world.invested).toBe(32_000)
    expect(world.value).toBe(52_000)
  })

  it('records losses with a negative sign', () => {
    const result = valuate(PURCHASES, { world: '8', emerging: '9' })

    // 16 × 8 = 128 € and 4 × 9 = 36 €
    expect(result.value).toBe(16_400)
    expect(result.gain).toBe(-3_600)
    expect(result.gainRatio).toBeCloseTo(-0.18, 10)
  })

  it('returns an empty valuation when there are no purchases', () => {
    const result = valuate([], {})

    expect(result).toEqual({ value: 0, invested: 0, gain: 0, gainRatio: 0, byFund: [] })
  })

  it('orders the positions by descending value', () => {
    const result = valuate(PURCHASES, { world: '10', emerging: '10' })

    expect(result.byFund.map((p) => p.fundId)).toEqual(['world', 'emerging'])
  })

  it('rejects a fund with no current NAV', () => {
    expect(() => valuate(PURCHASES, { world: '11' }))
      .toThrow('No current NAV available for fund "emerging"')
  })
})
