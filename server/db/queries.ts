import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import type { Cents, IsoDate, Month, Timing, Weight } from '~~/core/types'
import type { AppDatabase } from './client'
import { serialiseWeights } from './mappers'
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

/** Narrows `listPurchases` to a fund, a date window, or both. Every bound is inclusive. */
export interface PurchaseFilter {
  fundId?: string
  from?: IsoDate
  to?: IsoDate
}

/**
 * Lists the purchases of a portfolio, ordered by `date` then `id`. The `id`
 * tiebreak matters: several purchases can share a date, and the XIRR
 * calculation needs a stable order over its cash flows.
 *
 * `filter` narrows the result the same way `listNavs` narrows a fund's
 * quotes: by fund, by date window, or both. Omitted, it is every purchase of
 * the portfolio, exactly as before this parameter existed.
 */
export function listPurchases(
  db: AppDatabase,
  portfolioId: string = PORTFOLIO_ID,
  filter: PurchaseFilter = {},
): PurchaseRow[] {
  const conditions = [eq(purchases.portfolioId, portfolioId)]
  if (filter.fundId !== undefined) {
    conditions.push(eq(purchases.fundId, filter.fundId))
  }
  if (filter.from !== undefined) {
    conditions.push(gte(purchases.date, filter.from))
  }
  if (filter.to !== undefined) {
    conditions.push(lte(purchases.date, filter.to))
  }

  return db.select().from(purchases)
    .where(and(...conditions))
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

// --- Writes below. Typed inserts, updates and deletes with no policy: a
// unique-index violation, a missing row, or a 409 the caller should answer
// with are all decided by the route that calls these, not by this file. ---

/** Fields `PATCH /api/portfolio` may change. Both optional: an absent field is left untouched. */
export interface PortfolioUpdate {
  name?: string
  horizonYears?: number
}

/** Updates the portfolio row, only the fields given. `undefined` if `portfolioId` does not exist, or an empty `updates` returns the row unchanged. */
export function updatePortfolio(
  db: AppDatabase,
  updates: PortfolioUpdate,
  portfolioId: string = PORTFOLIO_ID,
): PortfolioRow | undefined {
  // Checked by value, not `Object.keys(...).length`: a route builds this object
  // unconditionally as `{ name: readOptionalString(...), horizonYears: ... }`,
  // so an empty PATCH body arrives here as both keys present and `undefined`,
  // not as `{}`. Drizzle's `.set()` throws "No values to set" on that shape.
  if (Object.values(updates).every(value => value === undefined)) {
    return getPortfolio(db, portfolioId)
  }
  return db.update(portfolios).set(updates).where(eq(portfolios.id, portfolioId)).returning().get()
}

/** A fund as `POST /api/funds` supplies it. */
export interface NewFund {
  id: string
  isin: string
  name: string
  providerSymbol?: string | null
  currency?: string
}

/** Inserts a fund. Throws the raw `SqliteError` on a duplicate id or ISIN — the caller decides how to turn that into a 409. */
export function insertFund(db: AppDatabase, fund: NewFund): FundRow {
  return db.insert(funds).values({
    id: fund.id,
    isin: fund.isin,
    name: fund.name,
    providerSymbol: fund.providerSymbol ?? null,
    currency: fund.currency ?? 'EUR',
  }).returning().get()
}

/** Finds a fund by its ISIN, the other natural key besides `id`. */
export function getFundByIsin(db: AppDatabase, isin: string): FundRow | undefined {
  return db.select().from(funds).where(eq(funds.isin, isin)).get()
}

/** Fields `PATCH /api/funds/:id` may change. */
export interface FundUpdate {
  name?: string
  providerSymbol?: string | null
}

/** Updates a fund, only the fields given. `undefined` if `id` does not exist. */
export function updateFund(db: AppDatabase, id: string, updates: FundUpdate): FundRow | undefined {
  // See the comment on updatePortfolio: checked by value, not by key count.
  if (Object.values(updates).every(value => value === undefined)) {
    return getFund(db, id)
  }
  return db.update(funds).set(updates).where(eq(funds.id, id)).returning().get()
}

/**
 * Deletes a fund by id, and with it every NAV row quoting it — `navs.fund_id`
 * is a foreign key exactly like `purchases.fund_id`, and a fund that has
 * ever been synced or quoted by hand would otherwise fail this with a raw
 * `FOREIGN KEY constraint failed` on every call. Unlike a purchase, a NAV
 * is not a historical fact worth protecting: it is a downloaded or
 * re-enterable market price, so cascading it here is safe. The caller is
 * still responsible for checking the fund has no purchases first — deleting
 * one under a historical fact would orphan it, and that check stays a 409
 * a query function has no business deciding.
 */
export function deleteFund(db: AppDatabase, id: string): void {
  db.transaction((tx) => {
    tx.delete(navs).where(eq(navs.fundId, id)).run()
    tx.delete(funds).where(eq(funds.id, id)).run()
  })
}

/** A contribution rule as `POST /api/contributions/rules` supplies it. */
export interface NewRule {
  portfolioId?: string
  fromMonth: Month
  amount: Cents
  timing: Timing
  weights: Weight[]
}

/** Inserts a contribution rule. Throws the raw `SqliteError` when `fromMonth` is already governed — the unique index this relies on is `contribution_rule_month_unique`. */
export function insertRule(db: AppDatabase, rule: NewRule): ContributionRuleRow {
  return db.insert(contributionRules).values({
    portfolioId: rule.portfolioId ?? PORTFOLIO_ID,
    fromMonth: rule.fromMonth,
    amount: rule.amount,
    timing: rule.timing,
    weights: serialiseWeights(rule.weights),
  }).returning().get()
}

/** Finds a contribution rule by its numeric id. */
export function getRule(db: AppDatabase, id: number): ContributionRuleRow | undefined {
  return db.select().from(contributionRules).where(eq(contributionRules.id, id)).get()
}

/** Fields `PATCH /api/contributions/rules/:id` may change. Deliberately has no `fromMonth`: a rule's start month never changes once set. */
export interface RuleUpdate {
  amount?: Cents
  timing?: Timing
  weights?: Weight[]
}

/** Updates a contribution rule, only the fields given. `undefined` if `id` does not exist. */
export function updateRule(db: AppDatabase, id: number, updates: RuleUpdate): ContributionRuleRow | undefined {
  const set: { amount?: Cents, timing?: Timing, weights?: string } = {}
  if (updates.amount !== undefined) set.amount = updates.amount
  if (updates.timing !== undefined) set.timing = updates.timing
  if (updates.weights !== undefined) set.weights = serialiseWeights(updates.weights)

  if (Object.keys(set).length === 0) {
    return getRule(db, id)
  }
  return db.update(contributionRules).set(set).where(eq(contributionRules.id, id)).returning().get()
}

/** Deletes a contribution rule by id. */
export function deleteRule(db: AppDatabase, id: number): void {
  db.delete(contributionRules).where(eq(contributionRules.id, id)).run()
}

/** An override as `PUT /api/contributions/overrides/:month` supplies it. */
export interface UpsertOverride {
  portfolioId?: string
  month: Month
  amount: Cents | null
  timing?: Timing | null
  note?: string | null
}

/**
 * Inserts an override for `month`, or replaces the one already there —
 * `PUT` is idempotent by nature, and `contribution_override_month_unique`
 * is exactly the `(portfolioId, month)` pair this upserts on.
 */
export function upsertOverride(db: AppDatabase, override: UpsertOverride): ContributionOverrideRow {
  const portfolioId = override.portfolioId ?? PORTFOLIO_ID
  const values = {
    portfolioId,
    month: override.month,
    amount: override.amount,
    timing: override.timing ?? null,
    note: override.note ?? null,
  }

  return db.insert(contributionOverrides).values(values)
    .onConflictDoUpdate({
      target: [contributionOverrides.portfolioId, contributionOverrides.month],
      set: { amount: values.amount, timing: values.timing, note: values.note },
    })
    .returning()
    .get()
}

/** Finds the override for a given month, or `undefined` when the month has none. */
export function getOverride(db: AppDatabase, month: Month, portfolioId: string = PORTFOLIO_ID): ContributionOverrideRow | undefined {
  return db.select().from(contributionOverrides)
    .where(and(eq(contributionOverrides.portfolioId, portfolioId), eq(contributionOverrides.month, month)))
    .get()
}

/** Deletes the override for a given month, if any. */
export function deleteOverride(db: AppDatabase, month: Month, portfolioId: string = PORTFOLIO_ID): void {
  db.delete(contributionOverrides)
    .where(and(eq(contributionOverrides.portfolioId, portfolioId), eq(contributionOverrides.month, month)))
    .run()
}

/** A purchase as `POST /api/purchases` supplies it. */
export interface NewPurchase {
  portfolioId?: string
  fundId: string
  month: Month
  date: IsoDate
  amount: Cents
  nav: string
  units: string
  /** Defaults to `'manual'`: every purchase this function inserts was typed in by a person, never materialised. */
  source?: 'auto' | 'manual'
}

/** Inserts a purchase recorded by hand. */
export function insertPurchase(db: AppDatabase, purchase: NewPurchase): PurchaseRow {
  return db.insert(purchases).values({
    portfolioId: purchase.portfolioId ?? PORTFOLIO_ID,
    fundId: purchase.fundId,
    month: purchase.month,
    date: purchase.date,
    amount: purchase.amount,
    nav: purchase.nav,
    units: purchase.units,
    source: purchase.source ?? 'manual',
  }).returning().get()
}

/** Finds a purchase by its numeric id. */
export function getPurchase(db: AppDatabase, id: number): PurchaseRow | undefined {
  return db.select().from(purchases).where(eq(purchases.id, id)).get()
}

/** Fields `PATCH /api/purchases/:id` may change. */
export interface PurchaseUpdate {
  date?: IsoDate
  amount?: Cents
  nav?: string
  units?: string
}

/** Updates a purchase, only the fields given. `undefined` if `id` does not exist. */
export function updatePurchase(db: AppDatabase, id: number, updates: PurchaseUpdate): PurchaseRow | undefined {
  // See the comment on updatePortfolio: checked by value, not by key count.
  if (Object.values(updates).every(value => value === undefined)) {
    return getPurchase(db, id)
  }
  return db.update(purchases).set(updates).where(eq(purchases.id, id)).returning().get()
}

/** Deletes a purchase by id. */
export function deletePurchase(db: AppDatabase, id: number): void {
  db.delete(purchases).where(eq(purchases.id, id)).run()
}

/** A scenario as `POST /api/scenarios` supplies it. */
export interface NewScenario {
  id: string
  name: string
  annualRate: string
  color: string
  /** Defaults to `true`. */
  enabled?: boolean
}

/** Inserts a scenario. Throws the raw `SqliteError` on a duplicate id. */
export function insertScenario(db: AppDatabase, scenario: NewScenario): ScenarioRow {
  return db.insert(scenarios).values({
    id: scenario.id,
    name: scenario.name,
    annualRate: scenario.annualRate,
    color: scenario.color,
    enabled: scenario.enabled === false ? 0 : 1,
  }).returning().get()
}

/** Finds a scenario by id. */
export function getScenario(db: AppDatabase, id: string): ScenarioRow | undefined {
  return db.select().from(scenarios).where(eq(scenarios.id, id)).get()
}

/** Fields `PATCH /api/scenarios/:id` may change. */
export interface ScenarioUpdate {
  name?: string
  annualRate?: string
  color?: string
  enabled?: boolean
}

/** Updates a scenario, only the fields given, coercing `enabled` to the stored `0`/`1`. `undefined` if `id` does not exist. */
export function updateScenario(db: AppDatabase, id: string, updates: ScenarioUpdate): ScenarioRow | undefined {
  const set: { name?: string, annualRate?: string, color?: string, enabled?: number } = {}
  if (updates.name !== undefined) set.name = updates.name
  if (updates.annualRate !== undefined) set.annualRate = updates.annualRate
  if (updates.color !== undefined) set.color = updates.color
  if (updates.enabled !== undefined) set.enabled = updates.enabled ? 1 : 0

  if (Object.keys(set).length === 0) {
    return getScenario(db, id)
  }
  return db.update(scenarios).set(set).where(eq(scenarios.id, id)).returning().get()
}

/** Deletes a scenario by id. */
export function deleteScenario(db: AppDatabase, id: string): void {
  db.delete(scenarios).where(eq(scenarios.id, id)).run()
}

/** A NAV as `PUT /api/nav` supplies it — always overwritten, per spec section 6: a manual entry always prevails over a synced one. */
export interface UpsertNav {
  fundId: string
  date: IsoDate
  value: string
  source: 'yahoo' | 'manual'
}

/**
 * Inserts a NAV row, or overwrites the one already there for the same fund
 * and date — unconditionally, unlike `syncNavs`'s own upsert in
 * `nav-sync.ts`, which refuses to overwrite a manual row. This is the
 * channel that *is* the manual override, so there is nothing here for it to
 * defer to.
 */
export function upsertNav(db: AppDatabase, nav: UpsertNav): NavRow {
  return db.insert(navs).values(nav)
    .onConflictDoUpdate({
      target: [navs.fundId, navs.date],
      set: { value: nav.value, source: nav.source },
    })
    .returning()
    .get()
}
