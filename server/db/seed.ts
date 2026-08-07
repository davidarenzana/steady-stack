import type { AppDatabase } from './client'
import { PORTFOLIO_ID } from './queries'
import { serialiseWeights } from './mappers'
import { contributionRules, funds, portfolios, scenarios } from './schema'

/**
 * The initial data of section 13 of the spec: one portfolio, its two index
 * funds, the two contribution rules (the initial lump sum and the recurring
 * monthly amount, both 80/20) and the three projection scenarios.
 */

export const WORLD_FUND_ID = 'world'
export const EMERGING_FUND_ID = 'emerging'

/** 80/20 between the world fund and the emerging markets fund. */
const DEFAULT_WEIGHTS = serialiseWeights([
  { fundId: WORLD_FUND_ID, weight: 0.8 },
  { fundId: EMERGING_FUND_ID, weight: 0.2 },
])

/**
 * Seeds the portfolio, funds, contribution rules and scenarios of section 13
 * of the spec. Every insert is `onConflictDoNothing`, so running this twice
 * leaves exactly one of each row — including a provider symbol the user has
 * already chosen for a fund, which an `onConflictDoNothing` insert never
 * touches.
 */
export function seedInitialData(db: AppDatabase): void {
  db.transaction((tx) => {
    tx.insert(portfolios).values({
      id: PORTFOLIO_ID,
      name: 'Cartera indexada',
      currency: 'EUR',
      horizonYears: 25,
    }).onConflictDoNothing().run()

    tx.insert(funds).values([
      {
        id: WORLD_FUND_ID,
        isin: 'IE00BYX5NX33',
        name: 'Fidelity MSCI World Index Fund EUR P Acc',
        providerSymbol: null,
        currency: 'EUR',
      },
      {
        id: EMERGING_FUND_ID,
        isin: 'IE0031786696',
        name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
        providerSymbol: null,
        currency: 'EUR',
      },
    ]).onConflictDoNothing().run()

    tx.insert(contributionRules).values([
      {
        portfolioId: PORTFOLIO_ID,
        fromMonth: '2026-07',
        amount: 200_000,
        timing: 'start',
        weights: DEFAULT_WEIGHTS,
      },
      {
        portfolioId: PORTFOLIO_ID,
        fromMonth: '2026-08',
        amount: 20_000,
        timing: 'start',
        weights: DEFAULT_WEIGHTS,
      },
    ]).onConflictDoNothing().run()

    tx.insert(scenarios).values([
      { id: 'flat', name: 'Sin interés', annualRate: '0', color: 'chart-3', enabled: 1 },
      { id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color: 'chart-2', enabled: 1 },
      { id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color: 'chart-1', enabled: 1 },
    ]).onConflictDoNothing().run()
  })
}
