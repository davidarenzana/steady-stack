import type { Cents, Month } from '~~/core/types'
import type { Dashboard } from '~~/server/services/read-model'

/**
 * Turns the dashboard payload into lines, described independently of whatever
 * library draws them. Section 3 of the spec asks for the charting library to be
 * replaceable by touching one file; this is the other half of that — the shape
 * the chart consumes is ours, not Unovis's.
 */

/** One month on the x-axis, with every line's value for it. */
export interface EvolutionPoint {
  /** Position on the x-axis. Unovis needs a number, and a month is a string. */
  index: number
  month: Month
  /** Cumulative planned contributions, in euros. */
  contributed: number
  /** The real portfolio, in euros. `null` where it is unknown or still in the future. */
  portfolio: number | null
  /** Projected balance in euros, keyed by scenario id. */
  scenarios: Record<string, number>
}

/** One line, described independently of the charting library that draws it. */
export interface EvolutionSeries {
  /** `'contributed'`, `'portfolio'`, or `` `scenario:${id}` ``. */
  key: string
  /** Spanish, for the legend. */
  label: string
  /** A CSS colour, always a theme token: `'var(--chart-1)'`. */
  color: string
  /** `undefined` — never `null` — where there is no value, so the line breaks instead of falling to zero. */
  accessor: (point: EvolutionPoint) => number | undefined
}

export interface EvolutionChartData {
  points: EvolutionPoint[]
  series: EvolutionSeries[]
}

/**
 * The only place in the interface where money becomes a floating-point number.
 * A chart places pixels, and no arithmetic happens downstream of this call —
 * every figure the user reads as text goes through `app/utils/format.ts`
 * instead, straight from integer cents.
 */
function centsToEuros(cents: Cents): number {
  return cents / 100
}

export function buildEvolutionSeries(dashboard: Dashboard): EvolutionChartData {
  const { months, contributed, portfolio, scenarios } = dashboard.series

  if (months.length === 0) {
    return { points: [], series: [] }
  }

  const points: EvolutionPoint[] = months.map((month, index) => ({
    index,
    month,
    contributed: centsToEuros(contributed[index] ?? 0),
    // The API's `null` is preserved rather than coerced. What a chart should
    // draw for an unknown value is the accessor's decision, below.
    portfolio: portfolio[index] === null || portfolio[index] === undefined
      ? null
      : centsToEuros(portfolio[index]!),
    scenarios: Object.fromEntries(
      scenarios.map(scenario => [scenario.id, centsToEuros(scenario.balance[index] ?? 0)]),
    ),
  }))

  const series: EvolutionSeries[] = [
    {
      key: 'contributed',
      label: 'Aportado',
      color: 'var(--muted-foreground)',
      accessor: point => point.contributed,
    },
  ]

  // Omitted entirely rather than drawn flat at zero: a portfolio with nothing
  // bought yet has no real line, and a phantom one along the axis would read as
  // a portfolio that lost everything.
  if (portfolio.some(value => value !== null)) {
    series.push({
      key: 'portfolio',
      label: 'Cartera real',
      color: 'var(--foreground)',
      // `undefined` and never `null`: Unovis breaks the line on the first and
      // plots the second as zero.
      accessor: point => point.portfolio ?? undefined,
    })
  }

  for (const scenario of scenarios) {
    series.push({
      key: `scenario:${scenario.id}`,
      label: scenario.name,
      // A theme token, never a hex value, so the line follows the dark theme.
      color: `var(--${scenario.color})`,
      accessor: point => point.scenarios[scenario.id],
    })
  }

  return { points, series }
}
