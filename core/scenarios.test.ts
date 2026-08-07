import { describe, expect, it } from 'vitest'
import { monthRange } from './months'
import { projectScenario } from './scenarios'
import type { Contribution, Timing } from './types'

const NO_WEIGHTS: Contribution['weights'] = []

function contribution(month: string, amount: number, timing: Timing = 'start'): Contribution {
  return { month, amount, timing, weights: NO_WEIGHTS }
}

describe('projectScenario', () => {
  it('turns 1.000 € at 9 % into 1.090,00 € over twelve months', () => {
    const months = monthRange('2026-01', '2026-12')
    const result = projectScenario([contribution('2026-01', 100_000)], 0.09, months)

    expect(result).toHaveLength(12)
    expect(result[11]!.balance).toBe(109_000)
  })

  it('does not compound an end-of-month contribution in its arrival month', () => {
    const months = monthRange('2026-01', '2026-12')
    const atStart = projectScenario([contribution('2026-01', 100_000, 'start')], 0.09, months)
    const atEnd = projectScenario([contribution('2026-01', 100_000, 'end')], 0.09, months)

    // The start-of-month one compounds twelve times; the end-of-month one, eleven.
    expect(atStart[11]!.balance).toBe(109_000)
    expect(atEnd[11]!.balance).toBeLessThan(atStart[11]!.balance)
    expect(atEnd[0]!.balance).toBe(100_000)
  })

  it('returns the accumulated contribution and nothing else at a 0 % rate', () => {
    const months = monthRange('2026-08', '2026-12')
    const contributions = months.map((m) => contribution(m, 20_000))
    const result = projectScenario(contributions, 0, months)

    expect(result.map((p) => p.balance)).toEqual([20_000, 40_000, 60_000, 80_000, 100_000])
  })

  it('accumulates the total contributed alongside the balance', () => {
    const months = monthRange('2026-08', '2026-10')
    const contributions = months.map((m) => contribution(m, 20_000))
    const result = projectScenario(contributions, 0.09, months)

    expect(result.map((p) => p.contributed)).toEqual([20_000, 40_000, 60_000])
    expect(result[2]!.balance).toBeGreaterThan(60_000)
  })

  it('keeps compounding through the months with no contribution', () => {
    const months = monthRange('2026-01', '2026-12')
    const result = projectScenario([contribution('2026-01', 100_000)], 0.09, months)

    expect(result[5]!.contributed).toBe(100_000)
    expect(result[5]!.balance).toBeGreaterThan(result[4]!.balance)
  })

  it('returns a zero balance when there are no contributions', () => {
    const months = monthRange('2026-01', '2026-03')
    const result = projectScenario([], 0.09, months)

    expect(result.map((p) => p.balance)).toEqual([0, 0, 0])
  })

  it("projects the portfolio's real plan over 25 years without overflowing", () => {
    const months = monthRange('2026-07', '2051-07')
    const contributions = months.map((m, i) => contribution(m, i === 0 ? 200_000 : 20_000))
    const result = projectScenario(contributions, 0.09, months)

    expect(result).toHaveLength(301)
    expect(Number.isSafeInteger(result[300]!.balance)).toBe(true)
    // Sanity bound: between 200.000 € and 400.000 €.
    expect(result[300]!.balance).toBeGreaterThan(20_000_000)
    expect(result[300]!.balance).toBeLessThan(40_000_000)
  })

  it('ignores the contributions falling outside the projected range of months', () => {
    const months = monthRange('2026-02', '2026-03')
    const result = projectScenario([contribution('2026-01', 100_000)], 0, months)

    expect(result.map((p) => p.balance)).toEqual([0, 0])
  })
})
