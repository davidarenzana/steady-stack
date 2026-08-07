import { describe, expect, it } from 'vitest'
import { xirr } from './returns'

describe('xirr', () => {
  it('gives 0,10 for a 10 % return over exactly one year', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 110_000 },
    ])

    expect(result).toBeCloseTo(0.1, 6)
  })

  it('gives 1,00 for doubling the capital in a year', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 200_000 },
    ])

    expect(result).toBeCloseTo(1, 6)
  })

  it('gives a negative return for a loss', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 90_000 },
    ])

    expect(result).toBeCloseTo(-0.1, 6)
  })

  it('gives 0 % for recovering exactly what was contributed', () => {
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 100_000 },
    ])

    expect(result).toBeCloseTo(0, 6)
  })

  it('weights every contribution by the time it stayed invested', () => {
    // Two equal contributions, the second one halfway through the year. With
    // 2.100 € at the end the return beats the 5 % nominal, because half of the
    // capital was invested for only six months.
    const result = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2021-07-01', amount: -100_000 },
      { date: '2022-01-01', amount: 210_000 },
    ])

    expect(result).toBeGreaterThan(0.05)
    expect(result).toBeLessThan(0.20)
  })

  it('does not depend on the order of the flows', () => {
    const ordered = xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: 110_000 },
    ])
    const shuffled = xirr([
      { date: '2022-01-01', amount: 110_000 },
      { date: '2021-01-01', amount: -100_000 },
    ])

    expect(shuffled).toBeCloseTo(ordered, 12)
  })

  it('rejects fewer than two flows', () => {
    expect(() => xirr([{ date: '2021-01-01', amount: -100_000 }]))
      .toThrow('XIRR needs at least two cash flows')
  })

  it('rejects flows of a single sign', () => {
    expect(() => xirr([
      { date: '2021-01-01', amount: -100_000 },
      { date: '2022-01-01', amount: -100_000 },
    ])).toThrow('XIRR needs both positive and negative cash flows')
  })
})
