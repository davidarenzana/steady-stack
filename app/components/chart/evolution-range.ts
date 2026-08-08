import type { EvolutionPoint } from './evolution-series'

/**
 * What the chart shows by default, and why it is not the whole horizon.
 *
 * `series.months` is `horizonYears * 12 + 1` entries — 301 on the seeded
 * portfolio — of which two currently hold a real value. Plotting all of them by
 * default makes the screen 99 % imagined future and a speck of reality: the
 * real portfolio line, the only line that is a fact, would occupy about half a
 * percent of the width against three projections sweeping to the top right.
 * That is a chart about the scenarios, and this screen is about the portfolio.
 *
 * So the default is reality plus a year of context. With two real points that
 * is a fourteen-month window, and every month of new history widens it. The
 * twenty-five-year view answers a different question — "where does this end
 * up?" — and it is one button away.
 */

/** The ranges the chart offers, in the order the control lists them. */
export type EvolutionRange = 'recent' | '5y' | '10y' | 'all'

/** Spanish labels for the range control. */
export const EVOLUTION_RANGE_LABELS: Record<EvolutionRange, string> = {
  recent: 'Reciente',
  '5y': '5 años',
  '10y': '10 años',
  all: 'Todo',
}

export const DEFAULT_EVOLUTION_RANGE: EvolutionRange = 'recent'

/** Twelve months of projection past the last real value: enough to show where the scenarios diverge. */
const MONTHS_OF_CONTEXT = 12

/** What `'recent'` shows when there is no real value at all to anchor it to. */
const MONTHS_WITHOUT_HISTORY = 24

const FIXED_LENGTHS: Record<Exclude<EvolutionRange, 'recent'>, number> = {
  '5y': 61,
  '10y': 121,
  all: Number.POSITIVE_INFINITY,
}

/**
 * The points a range shows. Every range starts at the first month — they extend
 * the right edge rather than panning — and none of them runs past the horizon.
 */
export function pointsInRange(points: EvolutionPoint[], range: EvolutionRange): EvolutionPoint[] {
  if (points.length === 0) {
    return []
  }

  if (range !== 'recent') {
    return points.slice(0, Math.min(FIXED_LENGTHS[range], points.length))
  }

  const lastReal = points.reduce(
    (latest, point) => (point.portfolio !== null ? point.index : latest),
    -1,
  )

  const length = lastReal >= 0
    ? lastReal + 1 + MONTHS_OF_CONTEXT
    : MONTHS_WITHOUT_HISTORY

  return points.slice(0, Math.min(length, points.length))
}
