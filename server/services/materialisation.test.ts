import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contributionOverrides, contributionRules, navs, purchases } from '../db/schema'
import { PORTFOLIO_ID, listPurchases } from '../db/queries'
import { seedInitialData, WORLD_FUND_ID, EMERGING_FUND_ID } from '../db/seed'
import { createTempDatabase, type TempDatabase } from '../test-utils/temp-db'
import { materialiseContributions } from './materialisation'

let temp: TempDatabase

/**
 * Seeds the portfolio, its two funds and the two contribution rules from
 * `seedInitialData`: 2.000 € from 2026-07 and 200 € from 2026-08, both
 * split 80/20 between `world` and `emerging`.
 */
function seed(): void {
  seedInitialData(temp.db)
}

function insertNav(fundId: string, date: string, value: string): void {
  temp.db.insert(navs).values({ fundId, date, value, source: 'manual' }).run()
}

function countPurchaseRows(): number {
  return temp.db.select().from(purchases).all().length
}

beforeEach(() => {
  temp = createTempDatabase()
  seed()
})

afterEach(() => {
  temp.close()
})

describe('materialiseContributions', () => {
  it('turns one month into two purchases, split by weight', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    const result = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    expect(result.created).toHaveLength(2)

    const world = result.created.find(p => p.fundId === WORLD_FUND_ID)
    expect(world).toMatchObject({
      fundId: 'world',
      date: '2026-08-03',
      amount: 16_000,
      nav: '14.8321',
      units: '10.787414',
      month: '2026-08',
      portfolioId: 'index',
      source: 'auto',
    })
    expect(typeof world!.id).toBe('number')

    const emerging = result.created.find(p => p.fundId === EMERGING_FUND_ID)
    expect(emerging).toMatchObject({
      fundId: 'emerging',
      date: '2026-08-03',
      amount: 4_000,
      nav: '9.9900',
      units: '4.004004',
      month: '2026-08',
      portfolioId: 'index',
      source: 'auto',
    })

    // The split adds up to the exact 200 € contribution, not a cent more or less.
    expect(world!.amount + emerging!.amount).toBe(20_000)

    // No NAV was ever inserted for July, so it is reported, never silently dropped.
    expect(result.skipped).toEqual([{ month: '2026-07', reason: 'no-nav' }])
  })

  it('creates nothing new on a second run and reports the month as already materialised', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    materialiseContributions(temp.db, { throughMonth: '2026-08' })
    const second = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    expect(second.created).toEqual([])
    expect(second.skipped).toEqual([
      { month: '2026-07', reason: 'no-nav' },
      { month: '2026-08', reason: 'already-materialised' },
    ])
    expect(countPurchaseRows()).toBe(2)
  })

  it('never rewrites an executed purchase when the rule is edited afterwards', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    materialiseContributions(temp.db, { throughMonth: '2026-08' })
    const before = listPurchases(temp.db)
    expect(before).toHaveLength(2)

    // The monthly rule goes from 200 € to 300 €.
    temp.db.update(contributionRules)
      .set({ amount: 30_000 })
      .where(sql`${contributionRules.portfolioId} = ${PORTFOLIO_ID} and ${contributionRules.fromMonth} = '2026-08'`)
      .run()

    materialiseContributions(temp.db, { throughMonth: '2026-08' })
    const after = listPurchases(temp.db)

    expect(after).toEqual(before)
  })

  it('does not half-materialise a month when only one fund has a NAV', () => {
    insertNav(WORLD_FUND_ID, '2026-09-01', '15.0000')
    // No NAV for 'emerging' in September.

    const result = materialiseContributions(temp.db, { throughMonth: '2026-09' })

    expect(result.skipped).toContainEqual({ month: '2026-09', reason: 'no-nav' })
    const septemberRows = temp.db.select().from(purchases)
      .where(sql`${purchases.month} = '2026-09'`)
      .all()
    expect(septemberRows).toEqual([])
  })

  it('executes on the earliest date every fund shares a NAV', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(WORLD_FUND_ID, '2026-08-04', '14.9100')
    insertNav(EMERGING_FUND_ID, '2026-08-04', '10.0100')

    const result = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    expect(result.created.every(p => p.date === '2026-08-04')).toBe(true)
  })

  it('treats a manual purchase already recorded that month as already materialised', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    temp.db.insert(purchases).values({
      portfolioId: PORTFOLIO_ID,
      fundId: WORLD_FUND_ID,
      month: '2026-08',
      date: '2026-08-01',
      amount: 16_000,
      nav: '14.7000',
      units: '10.884354',
      source: 'manual',
    }).run()

    const result = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    expect(result.skipped).toContainEqual({ month: '2026-08', reason: 'already-materialised' })
    expect(result.created).toEqual([])
    expect(countPurchaseRows()).toBe(1)
  })

  it('materialises nothing for a month skipped by an override', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    temp.db.insert(contributionOverrides).values({
      portfolioId: PORTFOLIO_ID,
      month: '2026-08',
      amount: null,
    }).run()

    const result = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    expect(result.created).toEqual([])
    expect(result.skipped.find(s => s.month === '2026-08')).toBeUndefined()
  })

  it('materialises an override at its own amount, still split 80/20', () => {
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    temp.db.insert(contributionOverrides).values({
      portfolioId: PORTFOLIO_ID,
      month: '2026-08',
      amount: 150_000,
    }).run()

    const result = materialiseContributions(temp.db, { throughMonth: '2026-08' })

    const world = result.created.find(p => p.fundId === WORLD_FUND_ID)
    const emerging = result.created.find(p => p.fundId === EMERGING_FUND_ID)
    expect(world!.amount).toBe(120_000)
    expect(emerging!.amount).toBe(30_000)
  })

  it('leaves nothing behind when a month fails partway through the loop', () => {
    // July, from the initial 2.000 € rule, gets a NAV for each fund so it
    // is not skipped as no-nav, but a non-positive one for 'emerging' so
    // buildPurchases throws while processing it.
    insertNav(WORLD_FUND_ID, '2026-07-01', '10.0000')
    insertNav(EMERGING_FUND_ID, '2026-07-01', '0')
    // August has perfectly good NAVs and would otherwise materialise fine —
    // proving the failure in July does not let August commit on its own.
    insertNav(WORLD_FUND_ID, '2026-08-03', '14.8321')
    insertNav(EMERGING_FUND_ID, '2026-08-03', '9.9900')

    expect(() => materialiseContributions(temp.db, { throughMonth: '2026-08' })).toThrow()

    expect(countPurchaseRows()).toBe(0)
  })

  it('does nothing for a portfolio with no contribution rules', () => {
    const bare = createTempDatabase()
    try {
      const result = materialiseContributions(bare.db, { throughMonth: '2026-08' })
      expect(result).toEqual({ created: [], skipped: [] })
    }
    finally {
      bare.close()
    }
  })
})
