import { firstDayOfMonth, lastDayOfMonth } from '~~/core/dates'
import { expandContributions } from '~~/core/contributions'
import { buildPurchases } from '~~/core/purchases'
import type { IsoDate, Month } from '~~/core/types'
import type { AppDatabase } from '../db/client'
import { PORTFOLIO_ID, listPurchases, listOverrides, listRules, navDatesInRange, listNavs } from '../db/queries'
import { toContributionOverride, toContributionRule, toPurchase, type StoredPurchase } from '../db/mappers'
import { purchases } from '../db/schema'

/** Options for one call to `materialiseContributions`. */
export interface MaterialisationOptions {
  portfolioId?: string
  /** Materialise every contribution month up to and including this one. */
  throughMonth: Month
}

/** Why a month was left unmaterialised. */
export type SkipReason = 'already-materialised' | 'no-nav'

export interface MaterialisationResult {
  created: StoredPurchase[]
  skipped: Array<{ month: Month, reason: SkipReason }>
}

/**
 * The earliest date in `month` on which every fund named in `fundIds` has a
 * NAV row, or `undefined` if no such date exists. Found by intersecting the
 * per-fund date sets rather than picking the first fund's earliest date,
 * because a contribution can never execute on a day only some of its funds
 * have priced — that would misstate the split.
 */
function earliestCommonNavDate(db: AppDatabase, fundIds: string[], month: Month): IsoDate | undefined {
  const from = firstDayOfMonth(month)
  const to = lastDayOfMonth(month)

  let common: Set<IsoDate> | undefined

  for (const fundId of fundIds) {
    const dates = new Set(navDatesInRange(db, fundId, from, to))
    common = common === undefined ? dates : new Set([...common].filter(date => dates.has(date)))
    if (common.size === 0) {
      return undefined
    }
  }

  if (common === undefined || common.size === 0) {
    return undefined
  }

  return [...common].sort()[0]
}

/** The NAV value of a fund on an exact date. Throws if none exists, which would mean a caller bug: the date must have already been proven common. */
function navOn(db: AppDatabase, fundId: string, date: IsoDate): string {
  const row = listNavs(db, fundId, date, date)[0]
  if (row === undefined) {
    throw new Error(`Expected a NAV for fund "${fundId}" on ${date}, found none`)
  }
  return row.value
}

/**
 * Turns the derived contribution series into stored purchases, per section 11
 * of the spec.
 *
 * A month that already has a purchase row for the portfolio — automatic or
 * recorded by hand — is skipped as `'already-materialised'`, which is what
 * lets a rule be edited without ever rewriting an executed purchase: the
 * amount governs future months only, the past stays exactly as it was
 * bought. The `purchase_auto_month_unique` partial index backs this at the
 * database level, so a bug here cannot silently duplicate a row.
 *
 * The execution date of a month is the earliest day on which every fund in
 * its weights has a NAV, never the first of the month: a contribution for
 * 2026-08 can legitimately execute on 2026-09-02 if that is when the last of
 * its funds first published a price. A month with no such day is skipped as
 * `'no-nav'` — the data has simply not arrived yet, it is not an error.
 *
 * The whole loop commits in one transaction, so a failure partway leaves
 * nothing behind: half a materialisation, 160 € of world without the
 * matching 40 € of emerging, would misstate the split worse than not running
 * it at all.
 */
export function materialiseContributions(
  db: AppDatabase,
  options: MaterialisationOptions,
): MaterialisationResult {
  const portfolioId = options.portfolioId ?? PORTFOLIO_ID

  const ruleRows = listRules(db, portfolioId)
  if (ruleRows.length === 0) {
    return { created: [], skipped: [] }
  }

  const rules = ruleRows.map(toContributionRule)
  const overrides = listOverrides(db, portfolioId).map(toContributionOverride)

  const firstMonth = rules.reduce(
    (earliest, rule) => (rule.fromMonth < earliest ? rule.fromMonth : earliest),
    rules[0]!.fromMonth,
  )

  const contributions = expandContributions(rules, overrides, firstMonth, options.throughMonth)
  const settledMonths = new Set(listPurchases(db, portfolioId).map(row => row.month))

  const created: StoredPurchase[] = []
  const skipped: MaterialisationResult['skipped'] = []

  db.transaction((tx) => {
    for (const contribution of contributions) {
      const { month } = contribution

      if (settledMonths.has(month)) {
        skipped.push({ month, reason: 'already-materialised' })
        continue
      }

      const fundIds = contribution.weights.map(weight => weight.fundId)
      const date = earliestCommonNavDate(db, fundIds, month)
      if (date === undefined) {
        skipped.push({ month, reason: 'no-nav' })
        continue
      }

      const navByFund: Record<string, string> = {}
      for (const fundId of fundIds) {
        navByFund[fundId] = navOn(db, fundId, date)
      }

      for (const purchase of buildPurchases(contribution, date, navByFund)) {
        const row = tx.insert(purchases).values({
          portfolioId,
          fundId: purchase.fundId,
          month,
          date: purchase.date,
          amount: purchase.amount,
          nav: purchase.nav,
          units: purchase.units,
          source: 'auto',
        }).returning().get()

        created.push(toPurchase(row))
      }

      // A month just materialised must not be materialised again within the
      // same call — `expandContributions` never repeats a month, but this
      // keeps the invariant explicit rather than relying on that alone.
      settledMonths.add(month)
    }
  })

  return { created, skipped }
}
