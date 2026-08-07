import { describe, expect, it } from 'vitest'
import { addMonths, monthRange } from './months'

describe('addMonths', () => {
  it('moves forward within the same year', () => {
    expect(addMonths('2026-08', 3)).toBe('2026-11')
  })

  it('crosses the year boundary', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
  })

  it('moves backwards', () => {
    expect(addMonths('2026-02', -3)).toBe('2025-11')
  })

  it('moves forward many years at once', () => {
    expect(addMonths('2026-08', 300)).toBe('2051-08')
  })

  it('rejects an invalid month format', () => {
    expect(() => addMonths('2026-8', 1)).toThrow('Invalid month')
    expect(() => addMonths('2026-13', 1)).toThrow('Invalid month')
  })

  it('rejects a fractional offset', () => {
    expect(() => addMonths('2026-01', 1.5)).toThrow(
      'Month offset must be an integer, received 1.5',
    )
  })

  it('accepts a negative integer offset', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('accepts an offset of zero', () => {
    expect(addMonths('2026-01', 0)).toBe('2026-01')
  })
})

describe('monthRange', () => {
  it('includes both endpoints', () => {
    expect(monthRange('2026-07', '2026-10')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('returns a single month when the endpoints coincide', () => {
    expect(monthRange('2026-07', '2026-07')).toEqual(['2026-07'])
  })

  it('returns an empty list if the end comes before the start', () => {
    expect(monthRange('2026-10', '2026-07')).toEqual([])
  })

  it("covers the spec's 25-year horizon", () => {
    expect(monthRange('2026-07', '2051-07')).toHaveLength(301)
  })
})
