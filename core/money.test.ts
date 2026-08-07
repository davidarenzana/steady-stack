import { describe, expect, it } from 'vitest'
import { split } from './money'

describe('split', () => {
  it('splits 200 € at 80/20 into 160 € and 40 €', () => {
    const result = split(20_000, [
      { fundId: 'world', weight: 0.8 },
      { fundId: 'emerging', weight: 0.2 },
    ])

    expect(result).toEqual({ world: 16_000, emerging: 4_000 })
  })

  it('splits the initial 2.000 € at 80/20', () => {
    const result = split(200_000, [
      { fundId: 'world', weight: 0.8 },
      { fundId: 'emerging', weight: 0.2 },
    ])

    expect(result).toEqual({ world: 160_000, emerging: 40_000 })
  })

  it('neither loses nor invents cents when the split is not exact', () => {
    const result = split(10_000, [
      { fundId: 'a', weight: 1 / 3 },
      { fundId: 'b', weight: 1 / 3 },
      { fundId: 'c', weight: 1 / 3 },
    ])

    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(10_000)
    // `sort()` without a comparator would sort as strings: this needs the numeric one.
    expect(Object.values(result).sort((a, b) => a - b)).toEqual([3_333, 3_333, 3_334])
  })

  it('gives the leftover cent to the weight with the largest remainder', () => {
    // 1.001 cents at 50/50: 500,5 each. On a tie, the first one wins.
    const result = split(1_001, [
      { fundId: 'a', weight: 0.5 },
      { fundId: 'b', weight: 0.5 },
    ])

    expect(result).toEqual({ a: 501, b: 500 })
  })

  it('splits an amount of zero without breaking', () => {
    const result = split(0, [
      { fundId: 'a', weight: 0.8 },
      { fundId: 'b', weight: 0.2 },
    ])

    expect(result).toEqual({ a: 0, b: 0 })
  })

  it('rejects amounts that are not integer cents', () => {
    expect(() => split(100.5, [{ fundId: 'a', weight: 1 }]))
      .toThrow('Amount must be an integer number of cents')
  })

  it('rejects negative amounts', () => {
    expect(() => split(-100, [{ fundId: 'a', weight: 1 }]))
      .toThrow('Amount cannot be negative')
  })

  it('rejects weights that do not add up to 1', () => {
    expect(() => split(10_000, [
      { fundId: 'a', weight: 0.8 },
      { fundId: 'b', weight: 0.1 },
    ])).toThrow('Weights must add up to 1')
  })

  it('rejects an empty list of weights', () => {
    expect(() => split(10_000, [])).toThrow('Weights must add up to 1')
  })
})
