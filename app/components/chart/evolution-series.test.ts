import { describe, expect, it } from 'vitest'
import { buildEvolutionSeries } from './evolution-series'
import { makeDashboard } from '~/test-utils/fixtures'

/** Two months, one of them with no real value yet — the shape a young portfolio actually has. */
const SERIES = {
  months: ['2026-07', '2026-08'],
  contributed: [200000, 220000],
  portfolio: [200000, null],
  scenarios: [
    { id: 'flat', name: 'Sin interés', color: 'chart-3', annualRate: '0', balance: [200000, 220000] },
    { id: 'optimistic', name: 'Escenario 2', color: 'chart-1', annualRate: '0.09', balance: [201441, 222892] },
  ],
}

function build(series: Partial<typeof SERIES> = {}) {
  return buildEvolutionSeries(makeDashboard({ series: { ...SERIES, ...series } }))
}

describe('buildEvolutionSeries', () => {
  it('maps each month into a point in euros', () => {
    const { points } = build()

    expect(points).toHaveLength(2)
    expect(points[0]).toEqual({
      index: 0,
      month: '2026-07',
      contributed: 2000,
      portfolio: 2000,
      scenarios: { flat: 2000, optimistic: 2014.41 },
    })
    // The point keeps the API's `null`: the data model stays as honest as the
    // payload, and it is the accessor that decides what a chart does with it.
    expect(points[1]!.portfolio).toBeNull()
  })

  it('gives the chart the real portfolio and the active scenarios', () => {
    const { series } = build()

    expect(series.map(line => line.key)).toEqual([
      'contributed',
      'portfolio',
      'scenario:flat',
      'scenario:optimistic',
    ])
    expect(series.map(line => line.label)).toEqual([
      'Aportado',
      'Cartera real',
      'Sin interés',
      'Escenario 2',
    ])
  })

  it('draws exactly the scenarios the API sent, neither re-filtering nor inventing', () => {
    // What the API sends when the other two scenarios are disabled. The route
    // already filters on `enabled`, so a mapper that filtered again — or
    // padded the list back to three — would be second-guessing it.
    const { series } = build({ scenarios: [SERIES.scenarios[1]!] })

    expect(series.filter(line => line.key.startsWith('scenario:'))).toHaveLength(1)
    expect(series.map(line => line.key)).toEqual(['contributed', 'portfolio', 'scenario:optimistic'])
  })

  it('breaks the real line where the value is unknown instead of dropping it to zero', () => {
    // The ruling in TODO.md: a null is "we do not know", never zero. Unovis
    // breaks a line on `undefined` and treats `null` as numerical zero, so a
    // line that fell to the axis here would draw a total loss that never
    // happened.
    const { points, series } = build()
    const portfolio = series.find(line => line.key === 'portfolio')!

    expect(portfolio.accessor(points[1]!)).toBeUndefined()
    expect(portfolio.accessor(points[1]!)).not.toBe(0)
    expect(portfolio.accessor(points[1]!)).not.toBeNull()

    // And it still reads a real value where there is one.
    expect(portfolio.accessor(points[0]!)).toBe(2000)
  })

  it('resolves scenario colours to theme tokens', () => {
    // A hex value would fight the dark theme, where --chart-1 is a different
    // colour entirely.
    const { series } = build()

    expect(series.find(line => line.key === 'scenario:optimistic')!.color).toBe('var(--chart-1)')
    expect(series.find(line => line.key === 'scenario:flat')!.color).toBe('var(--chart-3)')
    expect(series.every(line => !line.color.includes('#'))).toBe(true)
  })

  it('omits the real portfolio line when nothing has been bought', () => {
    // Half of section 11's empty-state requirement: no phantom flat line at
    // zero, and no NaN. The contributions and the projections still draw,
    // because those are known.
    const { series } = build({ portfolio: [null, null] })

    expect(series.map(line => line.key)).toEqual([
      'contributed',
      'scenario:flat',
      'scenario:optimistic',
    ])
  })

  it('returns nothing to draw when there is no horizon', () => {
    const empty = buildEvolutionSeries(makeDashboard())

    expect(empty).toEqual({ points: [], series: [] })
  })

  it('gives each series an accessor that reads its own value', () => {
    const { points, series } = build()

    expect(series.find(line => line.key === 'scenario:optimistic')!.accessor(points[0]!)).toBe(2014.41)
    expect(series.find(line => line.key === 'scenario:flat')!.accessor(points[1]!)).toBe(2200)
    expect(series.find(line => line.key === 'contributed')!.accessor(points[1]!)).toBe(2200)
  })
})
