import { describe, expect, it } from 'vitest'
import type { EvolutionRange } from './evolution-range'
import { DEFAULT_EVOLUTION_RANGE, EVOLUTION_RANGE_LABELS, pointsInRange } from './evolution-range'
import type { EvolutionPoint } from './evolution-series'

/**
 * The seeded portfolio's horizon: 25 years plus the starting month. Building
 * them here rather than through the mapper keeps this file about windowing.
 */
function makePoints(count: number, realThrough: number): EvolutionPoint[] {
  return Array.from({ length: count }, (_unused, index) => ({
    index,
    month: '2026-07',
    contributed: 2000,
    portfolio: index <= realThrough ? 2000 : null,
    scenarios: {},
  }))
}

/** 301 points, real values at indices 0 and 1 only — the shape the application actually has today. */
const HORIZON = makePoints(301, 1)

describe('pointsInRange', () => {
  it('defaults to reality plus a year', () => {
    // The decision this phase turns on. Plotting all 301 months would give the
    // real line — the only line that is a fact — about half a percent of the
    // width, against three projections sweeping to the top right. Fourteen
    // months gives it roughly a seventh.
    const visible = pointsInRange(HORIZON, 'recent')

    expect(visible).toHaveLength(14)
    expect(visible.at(-1)!.index).toBe(13)
  })

  it('is the default the control starts on', () => {
    expect(DEFAULT_EVOLUTION_RANGE).toBe('recent')
  })

  it('widens as history accumulates', () => {
    // Every new month of real data widens the window by one, so the chart
    // grows into the horizon instead of being rescaled by hand.
    expect(pointsInRange(makePoints(301, 11), 'recent')).toHaveLength(24)
  })

  it('falls back to two years when nothing has been bought', () => {
    expect(pointsInRange(makePoints(301, -1), 'recent')).toHaveLength(24)
  })

  it('never runs past the horizon', () => {
    // Six points and a window that wants fourteen: the slice stops at what
    // exists rather than padding.
    expect(pointsInRange(makePoints(6, 1), 'recent')).toHaveLength(6)
  })

  it('offers five years, ten years and the whole horizon', () => {
    expect(pointsInRange(HORIZON, '5y')).toHaveLength(61)
    expect(pointsInRange(HORIZON, '10y')).toHaveLength(121)
    expect(pointsInRange(HORIZON, 'all')).toHaveLength(301)
  })

  it('returns nothing for every range when there is nothing', () => {
    for (const range of ['recent', '5y', '10y', 'all'] as const) {
      expect(pointsInRange([], range)).toEqual([])
    }
  })

  it('labels every range in Spanish', () => {
    expect(EVOLUTION_RANGE_LABELS).toEqual({
      recent: 'Reciente',
      '5y': '5 años',
      '10y': '10 años',
      all: 'Todo',
    })

    // Every range in the type has a label: a control rendered from this record
    // would otherwise show an empty button.
    const ranges: EvolutionRange[] = ['recent', '5y', '10y', 'all']
    expect(Object.keys(EVOLUTION_RANGE_LABELS).sort()).toEqual([...ranges].sort())
  })

  it('always starts at the first month, whichever range is chosen', () => {
    // The x-axis origin never moves: the ranges extend the right edge, they do
    // not pan. A window that slid would make two screenshots incomparable.
    for (const range of ['recent', '5y', '10y', 'all'] as const) {
      expect(pointsInRange(HORIZON, range)[0]!.index).toBe(0)
    }
  })
})
