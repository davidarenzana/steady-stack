import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * The seven tables of section 4 of the spec.
 *
 * Column types are not negotiable: amounts are INTEGER cents, and net asset
 * values, units and annual rates are TEXT decimal strings handled with
 * decimal.js. There is no REAL column in this schema. When this moves to
 * Postgres the TEXT columns become NUMERIC and nothing else changes.
 */

export const portfolios = sqliteTable('portfolio', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('EUR'),
  /** Projection horizon in years. Configurable, 25 by default. */
  horizonYears: integer('horizon_years').notNull().default(25),
})

export const funds = sqliteTable('fund', {
  id: text('id').primaryKey(),
  isin: text('isin').notNull().unique(),
  name: text('name').notNull(),
  /**
   * The symbol chosen by the user among the candidates the provider returns.
   * Null until they choose: the same ISIN publishes several share classes at
   * different prices and it is never guessed.
   */
  providerSymbol: text('provider_symbol'),
  currency: text('currency').notNull().default('EUR'),
})

export const contributionRules = sqliteTable('contribution_rule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  /** `YYYY-MM`. Governs from this month until a later rule supersedes it. */
  fromMonth: text('from_month').notNull(),
  /** Integer cents. */
  amount: integer('amount').notNull(),
  timing: text('timing', { enum: ['start', 'end'] }).notNull().default('start'),
  /** `JSON.stringify(Weight[])`, e.g. `[{"fundId":"world","weight":0.8}]`. */
  weights: text('weights').notNull(),
}, (t) => [
  // core/contributions.ts throws when two rules share a start month. The database
  // makes that state unreachable rather than merely detected.
  uniqueIndex('contribution_rule_month_unique').on(t.portfolioId, t.fromMonth),
])

export const contributionOverrides = sqliteTable('contribution_override', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  /** `YYYY-MM`. */
  month: text('month').notNull(),
  /** Integer cents, or null for a skipped month. */
  amount: integer('amount'),
  timing: text('timing', { enum: ['start', 'end'] }),
  note: text('note'),
}, (t) => [
  uniqueIndex('contribution_override_month_unique').on(t.portfolioId, t.month),
])

export const purchases = sqliteTable('purchase', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  portfolioId: text('portfolio_id').notNull().references(() => portfolios.id),
  fundId: text('fund_id').notNull().references(() => funds.id),
  /** `YYYY-MM`, the contribution month this materialises. The idempotency key. */
  month: text('month').notNull(),
  /** `YYYY-MM-DD`, the day it actually executed. May fall outside `month`. */
  date: text('date').notNull(),
  /** Integer cents. */
  amount: integer('amount').notNull(),
  /** Decimal string. */
  nav: text('nav').notNull(),
  /** Decimal string with six decimal places. */
  units: text('units').notNull(),
  source: text('source', { enum: ['auto', 'manual'] }).notNull().default('auto'),
}, (t) => [
  // Partial index: materialisation can never write the same month twice, while a
  // user remains free to record several manual purchases in one month.
  uniqueIndex('purchase_auto_month_unique')
    .on(t.portfolioId, t.fundId, t.month)
    .where(sql`${t.source} = 'auto'`),
])

export const navs = sqliteTable('nav', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fundId: text('fund_id').notNull().references(() => funds.id),
  /** `YYYY-MM-DD`. */
  date: text('date').notNull(),
  /** Decimal string with four decimal places. */
  value: text('value').notNull(),
  source: text('source', { enum: ['yahoo', 'manual'] }).notNull(),
}, (t) => [
  uniqueIndex('nav_fund_date_unique').on(t.fundId, t.date),
])

export const scenarios = sqliteTable('scenario', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Decimal string as a fraction of one: `'0.09'` is 9 %. Never a REAL. */
  annualRate: text('annual_rate').notNull(),
  /** A theme token, `chart-1` … `chart-5`, resolved to `var(--chart-N)` by the interface. */
  color: text('color').notNull(),
  /** 0 or 1. Only enabled scenarios are drawn on the chart. */
  enabled: integer('enabled').notNull().default(1),
})

export type PortfolioRow = typeof portfolios.$inferSelect
export type FundRow = typeof funds.$inferSelect
export type ContributionRuleRow = typeof contributionRules.$inferSelect
export type ContributionOverrideRow = typeof contributionOverrides.$inferSelect
export type PurchaseRow = typeof purchases.$inferSelect
export type NavRow = typeof navs.$inferSelect
export type ScenarioRow = typeof scenarios.$inferSelect
