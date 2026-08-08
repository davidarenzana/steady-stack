import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { monthRange } from '~~/core/months'
import { funds, navs, portfolios, purchases } from '../db/schema'
import { PORTFOLIO_ID } from '../db/queries'
import { createTempDatabase, type TempDatabase } from '../test-utils/temp-db'
import { currentValuation, portfolioSeries, portfolioXirr, NotFoundError } from './read-model'

const WORLD_FUND_ID = 'world'
const EMERGING_FUND_ID = 'emerging'

let temp: TempDatabase

/** Inserts the one portfolio and, optionally, a set of funds by id. */
function seedPortfolioAndFunds(fundNames: Record<string, string> = {
  [WORLD_FUND_ID]: 'Fidelity MSCI World Index Fund EUR P Acc',
  [EMERGING_FUND_ID]: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
}): void {
  temp.db.insert(portfolios).values({
    id: PORTFOLIO_ID,
    name: 'Cartera indexada',
    currency: 'EUR',
    horizonYears: 25,
  }).run()

  const rows = Object.entries(fundNames).map(([id, name], index) => ({
    id,
    isin: `TEST${index}`,
    name,
    providerSymbol: null,
    currency: 'EUR',
  }))
  if (rows.length > 0) {
    temp.db.insert(funds).values(rows).run()
  }
}

/** Inserts the fixture purchase of 160,00 € in `world` and 40,00 € in `emerging`, both at NAV 10 on 2026-08-03. */
function seedFixturePurchases(): void {
  temp.db.insert(purchases).values([
    {
      portfolioId: PORTFOLIO_ID,
      fundId: WORLD_FUND_ID,
      month: '2026-08',
      date: '2026-08-03',
      amount: 16_000,
      nav: '10',
      units: '16.000000',
      source: 'auto',
    },
    {
      portfolioId: PORTFOLIO_ID,
      fundId: EMERGING_FUND_ID,
      month: '2026-08',
      date: '2026-08-03',
      amount: 4_000,
      nav: '10',
      units: '4.000000',
      source: 'auto',
    },
  ]).run()
}

function insertNav(fundId: string, date: string, value: string): void {
  temp.db.insert(navs).values({ fundId, date, value, source: 'manual' }).run()
}

beforeEach(() => {
  temp = createTempDatabase()
})

afterEach(() => {
  temp.close()
})

describe('currentValuation', () => {
  it('values the portfolio field by field: 16 units of world at 11 € and 4 units of emerging at 12 €', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    insertNav(WORLD_FUND_ID, '2026-09-01', '11')
    insertNav(EMERGING_FUND_ID, '2026-09-01', '12')

    const result = currentValuation(temp.db, '2026-09-15')

    // 16 x 11 = 176 € and 4 x 12 = 48 €
    expect(result.valuation.value).toBe(22_400)
    expect(result.valuation.invested).toBe(20_000)
    expect(result.valuation.gain).toBe(2_400)
    expect(result.valuation.gainRatio).toBeCloseTo(0.12, 10)
  })

  it('reports the oldest of the per-fund latest NAV dates, not today and not the newest', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    insertNav(WORLD_FUND_ID, '2026-09-01', '11')
    insertNav(EMERGING_FUND_ID, '2026-08-29', '12')

    const result = currentValuation(temp.db, '2026-09-15')

    expect(result.navDate).toBe('2026-08-29')
  })

  it('carries each fund\'s own name and its own NAV date in byFund', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    insertNav(WORLD_FUND_ID, '2026-09-01', '11')
    insertNav(EMERGING_FUND_ID, '2026-08-29', '12')

    const result = currentValuation(temp.db, '2026-09-15')

    const world = result.byFund.find((p) => p.fundId === WORLD_FUND_ID)
    const emerging = result.byFund.find((p) => p.fundId === EMERGING_FUND_ID)
    expect(world).toMatchObject({
      fundId: WORLD_FUND_ID,
      name: 'Fidelity MSCI World Index Fund EUR P Acc',
      navDate: '2026-09-01',
    })
    expect(emerging).toMatchObject({
      fundId: EMERGING_FUND_ID,
      name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
      navDate: '2026-08-29',
    })
  })

  it('values an empty portfolio as all zeroes, with no NAV date', () => {
    seedPortfolioAndFunds()

    const result = currentValuation(temp.db, '2026-09-15')

    expect(result.valuation).toEqual({ value: 0, invested: 0, gain: 0, gainRatio: 0, byFund: [] })
    expect(result.byFund).toEqual([])
    expect(result.navDate).toBeNull()
  })

  it('throws NotFoundError, naming the fund and the date, when a fund holding units has no NAV at all', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    insertNav(EMERGING_FUND_ID, '2026-09-01', '12')
    // No NAV at all for 'world'.

    expect(() => currentValuation(temp.db, '2026-09-01'))
      .toThrow('No NAV available for fund "world" on or before 2026-09-01')
    expect(() => currentValuation(temp.db, '2026-09-01')).toThrow(NotFoundError)
  })
})

describe('portfolioSeries', () => {
  it('is null before the first purchase and after the month of asOf, and the month-end value in between', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    // First quotes shortly after the purchase, valid through the end of August.
    insertNav(WORLD_FUND_ID, '2026-08-10', '12.5')
    insertNav(EMERGING_FUND_ID, '2026-08-10', '11')
    // Later quotes, valid through the end of September.
    insertNav(WORLD_FUND_ID, '2026-09-01', '11')
    insertNav(EMERGING_FUND_ID, '2026-09-01', '12')

    const result = portfolioSeries(temp.db, monthRange('2026-07', '2026-10'), '2026-09-15')

    // August: 16 x 12,5 + 4 x 11 = 200 € + 44 € = 244,00 €
    // September: 16 x 11 + 4 x 12 = 176 € + 48 € = 224,00 €
    expect(result).toEqual([null, 24_400, 22_400, null])
  })

  it('clamps the current month to asOf, ignoring a NAV dated later in that same month', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    // Quotes in force on asOf, 2026-09-15.
    insertNav(WORLD_FUND_ID, '2026-09-01', '11')
    insertNav(EMERGING_FUND_ID, '2026-09-01', '12')
    // A hand-entered NAV dated after asOf but still inside September — reachable
    // through PUT /api/nav, where a manual entry outranks a downloaded one.
    // The September point must not read it.
    insertNav(WORLD_FUND_ID, '2026-09-20', '99')
    insertNav(EMERGING_FUND_ID, '2026-09-20', '99')

    const result = portfolioSeries(temp.db, monthRange('2026-09', '2026-09'), '2026-09-15')

    // 16 x 11 + 4 x 12 = 176 € + 48 € = 224,00 €, not the 2026-09-20 quotes.
    expect(result).toEqual([22_400])
  })

  it('throws NotFoundError when a month it must value has no NAV yet', () => {
    seedPortfolioAndFunds()
    seedFixturePurchases()
    // No NAV inserted at all.

    expect(() => portfolioSeries(temp.db, monthRange('2026-08', '2026-08'), '2026-09-15'))
      .toThrow(NotFoundError)
  })
})

describe('portfolioXirr', () => {
  function seedSinglePurchase(): void {
    seedPortfolioAndFunds()
    temp.db.insert(purchases).values({
      portfolioId: PORTFOLIO_ID,
      fundId: WORLD_FUND_ID,
      month: '2021-01',
      date: '2021-01-01',
      amount: 100_000,
      nav: '10',
      units: '10000.000000',
      source: 'auto',
    }).run()
  }

  it('finds approximately 10 % on a single contribution that grows 10 % in exactly a year', () => {
    seedSinglePurchase()

    const rate = portfolioXirr(temp.db, 110_000, '2022-01-01')

    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(0.1, 6)
  })

  it('returns null, not a throw, for a portfolio with no purchases at all', () => {
    seedPortfolioAndFunds()

    const rate = portfolioXirr(temp.db, 0, '2026-09-15')

    expect(rate).toBeNull()
  })

  it('returns null when every flow is non-positive, such as a current value of zero', () => {
    seedSinglePurchase()

    const rate = portfolioXirr(temp.db, 0, '2022-01-01')

    expect(rate).toBeNull()
  })
})
