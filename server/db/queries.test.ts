import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  contributionOverrides,
  contributionRules,
  funds,
  navs,
  portfolios,
  purchases,
  scenarios,
} from './schema'
import {
  PORTFOLIO_ID,
  getFund,
  getPortfolio,
  latestNavDate,
  latestNavOnOrBefore,
  listFunds,
  listNavs,
  listOverrides,
  listPurchases,
  listRules,
  listScenarios,
  navDatesInRange,
} from './queries'
import { createTempDatabase, type TempDatabase } from '../test-utils/temp-db'

let temp: TempDatabase

beforeEach(() => {
  temp = createTempDatabase()
})

afterEach(() => {
  temp.close()
})

describe('getPortfolio', () => {
  it('reads the portfolio whose id is PORTFOLIO_ID when called with no argument', () => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()

    expect(getPortfolio(temp.db)).toEqual({
      id: PORTFOLIO_ID,
      name: 'Cartera indexada',
      currency: 'EUR',
      horizonYears: 25,
    })
  })

  it('returns undefined when no portfolio with that id exists', () => {
    expect(getPortfolio(temp.db)).toBeUndefined()
  })
})

describe('listFunds and getFund', () => {
  it('lists funds ordered by id ascending, deterministically', () => {
    temp.db.insert(funds).values([
      { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' },
      { id: 'emerging', isin: 'IE00B4L5ZX48', name: 'iShares Emerging Markets' },
    ]).run()

    expect(listFunds(temp.db).map(f => f.id)).toEqual(['emerging', 'world'])
  })

  it('gets a single fund by id, or undefined when it does not exist', () => {
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()

    expect(getFund(temp.db, 'world')?.isin).toBe('IE00BYX5NX33')
    expect(getFund(temp.db, 'ghost')).toBeUndefined()
  })
})

describe('listRules and listOverrides', () => {
  beforeEach(() => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
  })

  it('lists contribution rules for the portfolio', () => {
    temp.db.insert(contributionRules).values({
      portfolioId: PORTFOLIO_ID,
      fromMonth: '2026-08',
      amount: 20_000,
      timing: 'start',
      weights: '[{"fundId":"world","weight":1}]',
    }).run()

    expect(listRules(temp.db)).toHaveLength(1)
    expect(listRules(temp.db)[0]!.fromMonth).toBe('2026-08')
  })

  it('lists contribution overrides for the portfolio', () => {
    temp.db.insert(contributionOverrides).values({
      portfolioId: PORTFOLIO_ID,
      month: '2026-10',
      amount: null,
      timing: null,
      note: 'Skipped, on holiday',
    }).run()

    expect(listOverrides(temp.db)).toHaveLength(1)
    expect(listOverrides(temp.db)[0]!.month).toBe('2026-10')
  })
})

describe('nav queries', () => {
  beforeEach(() => {
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()
  })

  it('listNavs returns only the rows inside the window, ordered by date ascending', () => {
    temp.db.insert(navs).values([
      { fundId: 'world', date: '2026-07-31', value: '14.5000', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-05', value: '14.8321', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-03', value: '14.7000', source: 'yahoo' },
      { fundId: 'world', date: '2026-09-01', value: '15.0000', source: 'yahoo' },
    ]).run()

    expect(listNavs(temp.db, 'world', '2026-08-01', '2026-08-31').map(n => n.date))
      .toEqual(['2026-08-03', '2026-08-05'])
  })

  it('latestNavDate returns the most recent date, or undefined with no rows', () => {
    expect(latestNavDate(temp.db, 'world')).toBeUndefined()

    temp.db.insert(navs).values([
      { fundId: 'world', date: '2026-08-03', value: '14.7000', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-04', value: '14.75', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-05', value: '14.8321', source: 'yahoo' },
    ]).run()

    expect(latestNavDate(temp.db, 'world')).toBe('2026-08-05')
  })

  it('latestNavOnOrBefore finds the exact date, falls back to the latest earlier date, or undefined', () => {
    temp.db.insert(navs).values([
      { fundId: 'world', date: '2026-08-03', value: '14.7000', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-04', value: '14.75', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-05', value: '14.8321', source: 'yahoo' },
    ]).run()

    expect(latestNavOnOrBefore(temp.db, 'world', '2026-08-04')?.date).toBe('2026-08-04')
    expect(latestNavOnOrBefore(temp.db, 'world', '2026-08-10')?.date).toBe('2026-08-05')
    expect(latestNavOnOrBefore(temp.db, 'world', '2026-07-01')).toBeUndefined()
  })

  it('navDatesInRange returns the dates inside the window, ordered ascending', () => {
    temp.db.insert(navs).values([
      { fundId: 'world', date: '2026-08-03', value: '14.7000', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-04', value: '14.75', source: 'yahoo' },
      { fundId: 'world', date: '2026-08-05', value: '14.8321', source: 'yahoo' },
    ]).run()

    expect(navDatesInRange(temp.db, 'world', '2026-08-01', '2026-08-31'))
      .toEqual(['2026-08-03', '2026-08-04', '2026-08-05'])
  })
})

describe('listPurchases', () => {
  it('orders by date then id, so the XIRR cash-flow order is stable', () => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()

    // Insertion order deliberately scrambled and includes two purchases on the
    // same date, so the `id` tiebreak is actually exercised.
    temp.db.insert(purchases).values([
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-09', date: '2026-09-01', amount: 20_000, nav: '15.0000', units: '13.333333', source: 'auto' },
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '14.7000', units: '10.884353', source: 'auto' },
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 4_000, nav: '14.7000', units: '2.721088', source: 'manual' },
    ]).run()

    const rows = listPurchases(temp.db)
    expect(rows.map(r => [r.date, r.id])).toEqual([
      ['2026-08-03', 2],
      ['2026-08-03', 3],
      ['2026-09-01', 1],
    ])
  })
})

describe('listScenarios', () => {
  it('lists every stored scenario', () => {
    temp.db.insert(scenarios).values([
      { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1', enabled: 1 },
      { id: 'pessimistic', name: 'Pesimista', annualRate: '0.05', color: 'chart-2', enabled: 0 },
    ]).run()

    expect(listScenarios(temp.db)).toHaveLength(2)
  })
})
