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
  deleteFund,
  deleteOverride,
  deletePurchase,
  deleteRule,
  deleteScenario,
  getFund,
  getFundByIsin,
  getOverride,
  getPortfolio,
  getPurchase,
  getRule,
  getScenario,
  insertFund,
  insertPurchase,
  insertRule,
  insertScenario,
  latestNavDate,
  latestNavOnOrBefore,
  listFunds,
  listNavs,
  listOverrides,
  listPurchases,
  listRules,
  listScenarios,
  navDatesInRange,
  updateFund,
  updatePortfolio,
  updatePurchase,
  updateRule,
  updateScenario,
  upsertNav,
  upsertOverride,
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

  it('narrows by fundId, from and to when a filter is given', () => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
    temp.db.insert(funds).values([
      { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' },
      { id: 'emerging', isin: 'IE00B4L5ZX48', name: 'iShares Emerging Markets' },
    ]).run()
    temp.db.insert(purchases).values([
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-07', date: '2026-07-01', amount: 16_000, nav: '10', units: '1.600000', source: 'auto' },
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '10', units: '1.600000', source: 'auto' },
      { portfolioId: PORTFOLIO_ID, fundId: 'emerging', month: '2026-08', date: '2026-08-03', amount: 4_000, nav: '10', units: '0.400000', source: 'auto' },
      { portfolioId: PORTFOLIO_ID, fundId: 'world', month: '2026-09', date: '2026-09-01', amount: 16_000, nav: '10', units: '1.600000', source: 'auto' },
    ]).run()

    expect(listPurchases(temp.db, PORTFOLIO_ID, { fundId: 'world' }).map(r => r.date))
      .toEqual(['2026-07-01', '2026-08-03', '2026-09-01'])

    expect(listPurchases(temp.db, PORTFOLIO_ID, { from: '2026-08-01', to: '2026-08-31' }).map(r => r.fundId))
      .toEqual(['world', 'emerging'])

    expect(listPurchases(temp.db, PORTFOLIO_ID, { fundId: 'emerging', from: '2026-01-01', to: '2026-12-31' }))
      .toHaveLength(1)
  })

  it('applies no filter, and defaults to every purchase of the portfolio, when the filter argument is omitted', () => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()
    temp.db.insert(purchases).values({
      portfolioId: PORTFOLIO_ID,
      fundId: 'world',
      month: '2026-08',
      date: '2026-08-03',
      amount: 16_000,
      nav: '10',
      units: '1.600000',
      source: 'auto',
    }).run()

    expect(listPurchases(temp.db)).toHaveLength(1)
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

describe('updatePortfolio', () => {
  beforeEach(() => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada', horizonYears: 25 }).run()
  })

  it('updates only the provided fields', () => {
    const updated = updatePortfolio(temp.db, { horizonYears: 10 })
    expect(updated).toEqual({ id: PORTFOLIO_ID, name: 'Cartera indexada', currency: 'EUR', horizonYears: 10 })
  })

  it('leaves the row untouched when no field is given', () => {
    expect(updatePortfolio(temp.db, {})).toEqual(getPortfolio(temp.db))
  })

  it('leaves the row untouched when every field is explicitly undefined, the shape a route actually sends for an empty PATCH body', () => {
    // A route builds { name: readOptionalString(...), horizonYears: readOptionalPositiveInteger(...) }
    // unconditionally, so an empty body arrives here as both keys present and undefined,
    // not as `{}`. Drizzle's `.set()` throws "No values to set" if that reaches it unfiltered.
    expect(updatePortfolio(temp.db, { name: undefined, horizonYears: undefined }))
      .toEqual(getPortfolio(temp.db))
  })

  it('returns undefined when the portfolio does not exist', () => {
    expect(updatePortfolio(temp.db, { horizonYears: 10 }, 'ghost')).toBeUndefined()
  })
})

describe('fund writes', () => {
  it('insertFund writes a fund and returns the row', () => {
    const fund = insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    expect(fund).toEqual({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World', providerSymbol: null, currency: 'EUR' })
  })

  it('getFundByIsin finds a fund by its ISIN, or undefined', () => {
    insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    expect(getFundByIsin(temp.db, 'IE00BYX5NX33')?.id).toBe('world')
    expect(getFundByIsin(temp.db, 'GHOST')).toBeUndefined()
  })

  it('updateFund changes only the given fields', () => {
    insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    const updated = updateFund(temp.db, 'world', { providerSymbol: '0P0001CLDK.F' })
    expect(updated).toEqual({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World', providerSymbol: '0P0001CLDK.F', currency: 'EUR' })
  })

  it('updateFund returns undefined for a fund that does not exist', () => {
    expect(updateFund(temp.db, 'ghost', { name: 'x' })).toBeUndefined()
  })

  it('updateFund leaves the row untouched when every field is explicitly undefined', () => {
    insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    expect(updateFund(temp.db, 'world', { name: undefined, providerSymbol: undefined }))
      .toEqual(getFund(temp.db, 'world'))
  })

  it('deleteFund removes the row', () => {
    insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    deleteFund(temp.db, 'world')
    expect(getFund(temp.db, 'world')).toBeUndefined()
  })

  it('deleteFund also removes the fund\'s own NAV rows, since navs.fund_id is a foreign key too and a quote is re-downloadable, unlike a purchase', () => {
    insertFund(temp.db, { id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' })
    temp.db.insert(navs).values({ fundId: 'world', date: '2026-08-03', value: '14.8321', source: 'yahoo' }).run()

    expect(() => deleteFund(temp.db, 'world')).not.toThrow()
    expect(getFund(temp.db, 'world')).toBeUndefined()
    expect(listNavs(temp.db, 'world')).toEqual([])
  })
})

describe('contribution rule writes', () => {
  beforeEach(() => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
  })

  it('insertRule writes a rule with serialised weights', () => {
    const rule = insertRule(temp.db, {
      fromMonth: '2026-08',
      amount: 20_000,
      timing: 'start',
      weights: [{ fundId: 'world', weight: 1 }],
    })
    expect(rule.fromMonth).toBe('2026-08')
    expect(rule.weights).toBe('[{"fundId":"world","weight":1}]')
  })

  it('insertRule throws on a duplicate fromMonth, backed by the unique index', () => {
    insertRule(temp.db, { fromMonth: '2026-08', amount: 20_000, timing: 'start', weights: [{ fundId: 'world', weight: 1 }] })
    expect(() => insertRule(temp.db, { fromMonth: '2026-08', amount: 30_000, timing: 'start', weights: [{ fundId: 'world', weight: 1 }] }))
      .toThrow(/UNIQUE/)
  })

  it('getRule finds a rule by id, or undefined', () => {
    const rule = insertRule(temp.db, { fromMonth: '2026-08', amount: 20_000, timing: 'start', weights: [{ fundId: 'world', weight: 1 }] })
    expect(getRule(temp.db, rule.id)?.fromMonth).toBe('2026-08')
    expect(getRule(temp.db, 999)).toBeUndefined()
  })

  it('updateRule changes amount, timing and weights without touching fromMonth', () => {
    const rule = insertRule(temp.db, { fromMonth: '2026-08', amount: 20_000, timing: 'start', weights: [{ fundId: 'world', weight: 1 }] })
    const updated = updateRule(temp.db, rule.id, { amount: 30_000 })
    expect(updated?.amount).toBe(30_000)
    expect(updated?.fromMonth).toBe('2026-08')
  })

  it('deleteRule removes the row', () => {
    const rule = insertRule(temp.db, { fromMonth: '2026-08', amount: 20_000, timing: 'start', weights: [{ fundId: 'world', weight: 1 }] })
    deleteRule(temp.db, rule.id)
    expect(getRule(temp.db, rule.id)).toBeUndefined()
  })
})

describe('contribution override writes', () => {
  beforeEach(() => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
  })

  it('upsertOverride inserts a new override', () => {
    const override = upsertOverride(temp.db, { month: '2026-10', amount: null, note: 'mes sin liquidez' })
    expect(override).toEqual({ id: 1, portfolioId: PORTFOLIO_ID, month: '2026-10', amount: null, timing: null, note: 'mes sin liquidez' })
  })

  it('upsertOverride updates the same row on a second call for the same month', () => {
    upsertOverride(temp.db, { month: '2026-10', amount: null, note: 'first' })
    const second = upsertOverride(temp.db, { month: '2026-10', amount: 5_000, note: 'second' })

    expect(second.id).toBe(1)
    expect(second.amount).toBe(5_000)
    expect(second.note).toBe('second')
    expect(listOverrides(temp.db)).toHaveLength(1)
  })

  it('getOverride finds an override by month, or undefined', () => {
    upsertOverride(temp.db, { month: '2026-10', amount: null })
    expect(getOverride(temp.db, '2026-10')?.month).toBe('2026-10')
    expect(getOverride(temp.db, '2026-11')).toBeUndefined()
  })

  it('deleteOverride removes the row', () => {
    upsertOverride(temp.db, { month: '2026-10', amount: null })
    deleteOverride(temp.db, '2026-10')
    expect(getOverride(temp.db, '2026-10')).toBeUndefined()
  })
})

describe('purchase writes', () => {
  beforeEach(() => {
    temp.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()
  })

  it('insertPurchase defaults source to manual', () => {
    const purchase = insertPurchase(temp.db, {
      fundId: 'world',
      month: '2026-08',
      date: '2026-08-03',
      amount: 16_000,
      nav: '14.8321',
      units: '10.787414',
    })
    expect(purchase.source).toBe('manual')
  })

  it('getPurchase finds a purchase by id, or undefined', () => {
    const purchase = insertPurchase(temp.db, { fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '10', units: '1.600000' })
    expect(getPurchase(temp.db, purchase.id)?.fundId).toBe('world')
    expect(getPurchase(temp.db, 999)).toBeUndefined()
  })

  it('updatePurchase changes only the given fields', () => {
    const purchase = insertPurchase(temp.db, { fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '10', units: '1.600000' })
    const updated = updatePurchase(temp.db, purchase.id, { amount: 20_000 })
    expect(updated?.amount).toBe(20_000)
    expect(updated?.nav).toBe('10')
  })

  it('updatePurchase leaves the row untouched when every field is explicitly undefined', () => {
    const purchase = insertPurchase(temp.db, { fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '10', units: '1.600000' })
    expect(updatePurchase(temp.db, purchase.id, { date: undefined, amount: undefined, nav: undefined, units: undefined }))
      .toEqual(getPurchase(temp.db, purchase.id))
  })

  it('deletePurchase removes the row', () => {
    const purchase = insertPurchase(temp.db, { fundId: 'world', month: '2026-08', date: '2026-08-03', amount: 16_000, nav: '10', units: '1.600000' })
    deletePurchase(temp.db, purchase.id)
    expect(getPurchase(temp.db, purchase.id)).toBeUndefined()
  })
})

describe('scenario writes', () => {
  it('insertScenario defaults enabled to true', () => {
    const scenario = insertScenario(temp.db, { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1' })
    expect(scenario).toEqual({ id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1', enabled: 1 })
  })

  it('insertScenario respects an explicit enabled: false', () => {
    const scenario = insertScenario(temp.db, { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1', enabled: false })
    expect(scenario.enabled).toBe(0)
  })

  it('getScenario finds a scenario by id, or undefined', () => {
    insertScenario(temp.db, { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1' })
    expect(getScenario(temp.db, 'baseline')?.name).toBe('Base')
    expect(getScenario(temp.db, 'ghost')).toBeUndefined()
  })

  it('updateScenario changes only the given fields, coercing enabled to 0/1', () => {
    insertScenario(temp.db, { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1' })
    const updated = updateScenario(temp.db, 'baseline', { enabled: false })
    expect(updated?.enabled).toBe(0)
    expect(updated?.name).toBe('Base')
  })

  it('deleteScenario removes the row', () => {
    insertScenario(temp.db, { id: 'baseline', name: 'Base', annualRate: '0.09', color: 'chart-1' })
    deleteScenario(temp.db, 'baseline')
    expect(getScenario(temp.db, 'baseline')).toBeUndefined()
  })
})

describe('upsertNav', () => {
  beforeEach(() => {
    temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity MSCI World' }).run()
  })

  it('inserts a new NAV row', () => {
    const nav = upsertNav(temp.db, { fundId: 'world', date: '2026-08-03', value: '14.8321', source: 'manual' })
    expect(nav).toEqual({ id: 1, fundId: 'world', date: '2026-08-03', value: '14.8321', source: 'manual' })
  })

  it('overwrites an existing row for the same fund and date, always, including one already synced', () => {
    upsertNav(temp.db, { fundId: 'world', date: '2026-08-03', value: '14.0000', source: 'yahoo' })
    const updated = upsertNav(temp.db, { fundId: 'world', date: '2026-08-03', value: '14.8321', source: 'manual' })

    expect(updated.value).toBe('14.8321')
    expect(updated.source).toBe('manual')
    expect(listNavs(temp.db, 'world')).toHaveLength(1)
  })
})
