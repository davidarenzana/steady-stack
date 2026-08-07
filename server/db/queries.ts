import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import type { IsoDate } from '~~/core/types'
import type { AppDatabase } from './client'
import {
  contributionOverrides,
  contributionRules,
  funds,
  navs,
  portfolios,
  purchases,
  scenarios,
  type ContributionOverrideRow,
  type ContributionRuleRow,
  type FundRow,
  type NavRow,
  type PortfolioRow,
  type PurchaseRow,
  type ScenarioRow,
} from './schema'

/**
 * The one portfolio this application manages. There is no portfolio
 * selector in the interface: the id exists so the schema stays ready for
 * more than one, without the application pretending it supports that today.
 */
export const PORTFOLIO_ID = 'index'

/** Reads the portfolio by id, `PORTFOLIO_ID` by default. */
export function getPortfolio(db: AppDatabase, id: string = PORTFOLIO_ID): PortfolioRow | undefined {
  return db.select().from(portfolios).where(eq(portfolios.id, id)).get()
}

/** Lists every fund, ordered by id ascending so the result is deterministic. */
export function listFunds(db: AppDatabase): FundRow[] {
  return db.select().from(funds).orderBy(asc(funds.id)).all()
}

/** Reads a single fund by id. */
export function getFund(db: AppDatabase, id: string): FundRow | undefined {
  return db.select().from(funds).where(eq(funds.id, id)).get()
}

/** Lists the contribution rules of a portfolio, ordered by `fromMonth` ascending. */
export function listRules(db: AppDatabase, portfolioId: string = PORTFOLIO_ID): ContributionRuleRow[] {
  return db.select().from(contributionRules)
    .where(eq(contributionRules.portfolioId, portfolioId))
    .orderBy(asc(contributionRules.fromMonth))
    .all()
}

/** Lists the contribution overrides of a portfolio, ordered by `month` ascending. */
export function listOverrides(db: AppDatabase, portfolioId: string = PORTFOLIO_ID): ContributionOverrideRow[] {
  return db.select().from(contributionOverrides)
    .where(eq(contributionOverrides.portfolioId, portfolioId))
    .orderBy(asc(contributionOverrides.month))
    .all()
}

/**
 * Lists the purchases of a portfolio, ordered by `date` then `id`. The `id`
 * tiebreak matters: several purchases can share a date, and the XIRR
 * calculation needs a stable order over its cash flows.
 */
export function listPurchases(db: AppDatabase, portfolioId: string = PORTFOLIO_ID): PurchaseRow[] {
  return db.select().from(purchases)
    .where(eq(purchases.portfolioId, portfolioId))
    .orderBy(asc(purchases.date), asc(purchases.id))
    .all()
}

/** Lists the NAV rows of a fund, ordered by date ascending, optionally bounded by `[from, to]`. */
export function listNavs(db: AppDatabase, fundId: string, from?: IsoDate, to?: IsoDate): NavRow[] {
  const conditions = [eq(navs.fundId, fundId)]
  if (from !== undefined) {
    conditions.push(gte(navs.date, from))
  }
  if (to !== undefined) {
    conditions.push(lte(navs.date, to))
  }

  return db.select().from(navs).where(and(...conditions)).orderBy(asc(navs.date)).all()
}

/** Returns the most recent date with a NAV for a fund, or `undefined` if it has none. */
export function latestNavDate(db: AppDatabase, fundId: string): IsoDate | undefined {
  const row = db.select().from(navs)
    .where(eq(navs.fundId, fundId))
    .orderBy(desc(navs.date))
    .limit(1)
    .get()

  return row?.date
}

/**
 * Returns the NAV row of a fund on `date`, or the most recent one before it
 * when the fund has no quote for that exact day — the market is not open
 * every day, but a purchase still needs a price.
 */
export function latestNavOnOrBefore(db: AppDatabase, fundId: string, date: IsoDate): NavRow | undefined {
  return db.select().from(navs)
    .where(and(eq(navs.fundId, fundId), lte(navs.date, date)))
    .orderBy(desc(navs.date))
    .limit(1)
    .get()
}

/** Lists the dates with a NAV for a fund inside `[from, to]`, ordered ascending. */
export function navDatesInRange(db: AppDatabase, fundId: string, from: IsoDate, to: IsoDate): IsoDate[] {
  return listNavs(db, fundId, from, to).map(row => row.date)
}

/** Lists every scenario stored. */
export function listScenarios(db: AppDatabase): ScenarioRow[] {
  return db.select().from(scenarios).all()
}
