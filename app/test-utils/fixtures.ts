import type { Dashboard, FundPositionView } from '~~/server/services/read-model'

/**
 * Fixtures for the component tests, imported by tests and never by a
 * component.
 *
 * The `Dashboard` type is imported from the read model rather than
 * re-declared: a fixture that drifts from the payload it stands for is worse
 * than no fixture, because the tests keep passing while the screen breaks.
 */

/** Everything at zero, which is exactly what a clean checkout's dashboard returns. */
function zeroDashboard(): Dashboard {
  return {
    asOf: '2026-08-06',
    navDate: null,
    valuation: {
      value: 0,
      invested: 0,
      gain: 0,
      // `0` and never `NaN`: nothing invested means no ratio to report, and the
      // read model settles that rather than leaving it to a division.
      gainRatio: 0,
      byFund: [],
    },
    xirr: null,
    series: {
      months: [],
      contributed: [],
      portfolio: [],
      scenarios: [],
    },
  }
}

/**
 * A `Dashboard` with everything at zero, overridden shallowly. Only the two
 * levels the tests actually override are merged — `valuation` and `series` —
 * which is enough for every test in this plan and does not pull in a
 * deep-merge dependency for the privilege.
 */
export function makeDashboard(overrides: {
  asOf?: Dashboard['asOf']
  navDate?: Dashboard['navDate']
  xirr?: Dashboard['xirr']
  valuation?: Partial<Dashboard['valuation']>
  series?: Partial<Dashboard['series']>
} = {}): Dashboard {
  const base = zeroDashboard()

  return {
    ...base,
    ...(overrides.asOf !== undefined ? { asOf: overrides.asOf } : {}),
    ...(overrides.navDate !== undefined ? { navDate: overrides.navDate } : {}),
    ...(overrides.xirr !== undefined ? { xirr: overrides.xirr } : {}),
    valuation: { ...base.valuation, ...overrides.valuation },
    series: { ...base.series, ...overrides.series },
  }
}

/** One position, worth 1.760 € against 1.600 € paid in: 160 units of `world` at 11 €. */
export function makePosition(overrides: Partial<FundPositionView> = {}): FundPositionView {
  return {
    fundId: 'world',
    name: 'Fidelity MSCI World Index Fund EUR P Acc',
    units: '160.000000',
    nav: '11.0000',
    navDate: '2026-08-03',
    value: 176000,
    invested: 160000,
    gain: 16000,
    ...overrides,
  }
}
