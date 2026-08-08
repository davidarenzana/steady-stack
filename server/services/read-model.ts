import { valuate, type FundPosition, type Valuation } from '~~/core/valuation'
import { xirr, type CashFlow } from '~~/core/returns'
import { lastDayOfMonth, monthOf } from '~~/core/dates'
import type { Cents, IsoDate, Month } from '~~/core/types'
import type { Purchase } from '~~/core/purchases'
import type { AppDatabase } from '../db/client'
import { PORTFOLIO_ID, getFund, latestNavOnOrBefore, listPurchases } from '../db/queries'
import { toPurchase } from '../db/mappers'

/**
 * Thrown when a figure the dashboard needs cannot be produced because a
 * fund holding units has no NAV to value it with. The route layer turns
 * this into a 404 the interface can explain, rather than a 500.
 */
export class NotFoundError extends Error {}

/** One fund's position, plus the display name and the date its own NAV was published. */
export interface FundPositionView extends FundPosition {
  name: string
  navDate: IsoDate
}

/** The result of valuing a portfolio right now, honest as of `navDate`. */
export interface CurrentValuation {
  valuation: Valuation
  byFund: FundPositionView[]
  /** The oldest of the per-fund NAV dates used, or `null` when there is nothing to value. */
  navDate: IsoDate | null
}

/**
 * Resolves the NAV of each fund on or before `date`, throwing `NotFoundError`
 * for the first one that has none at all. Returns both the value, for
 * `valuate`, and the date it was published on, for the dashboard.
 */
function resolveNavs(
  db: AppDatabase,
  fundIds: string[],
  date: IsoDate,
): { navByFund: Record<string, string>, navDateByFund: Map<string, IsoDate> } {
  const navByFund: Record<string, string> = {}
  const navDateByFund = new Map<string, IsoDate>()

  for (const fundId of fundIds) {
    const row = latestNavOnOrBefore(db, fundId, date)
    if (!row) {
      throw new NotFoundError(`No NAV available for fund "${fundId}" on or before ${date}`)
    }
    navByFund[fundId] = row.value
    navDateByFund.set(fundId, row.date)
  }

  return { navByFund, navDateByFund }
}

/** The distinct fund ids referenced by a list of purchases, in first-seen order. */
function fundIdsOf(purchases: Purchase[]): string[] {
  return [...new Set(purchases.map((p) => p.fundId))]
}

/**
 * Values the portfolio as it stands, each fund at its own latest NAV on or
 * before `asOf`. NAVs publish with about a day of lag, so `navDate` — the
 * oldest of the per-fund dates actually used — is almost never `asOf`
 * itself; the dashboard shows it so the figure is not mistaken for today's.
 *
 * A fund holding units with no NAV at all is not a silent zero: it throws
 * `NotFoundError`, because a valuation missing a position is wrong, not
 * incomplete.
 */
export function currentValuation(
  db: AppDatabase,
  asOf: IsoDate,
  portfolioId: string = PORTFOLIO_ID,
): CurrentValuation {
  const purchases: Purchase[] = listPurchases(db, portfolioId).map(toPurchase)
  const { navByFund, navDateByFund } = resolveNavs(db, fundIdsOf(purchases), asOf)

  const valuation = valuate(purchases, navByFund)

  const byFund: FundPositionView[] = valuation.byFund.map((position) => {
    const fund = getFund(db, position.fundId)
    return {
      ...position,
      name: fund?.name ?? position.fundId,
      navDate: navDateByFund.get(position.fundId)!,
    }
  })

  const navDate = byFund.length === 0
    ? null
    : byFund.reduce((oldest, p) => (p.navDate < oldest ? p.navDate : oldest), byFund[0]!.navDate)

  return { valuation, byFund, navDate }
}

/**
 * The value of the portfolio at the end of each month in `months`, for the
 * chart. A month before the first purchase, or after the month `asOf` falls
 * in, is `null` — the line stops at today rather than falling to zero.
 *
 * Each included month is valued at every fund's latest NAV on or before that
 * month's last day, which is what makes an already-closed month's point
 * reproducible independently of when it is computed. The month `asOf` falls
 * in is the one exception: it is valued on or before `asOf` itself, not its
 * own last day, for the same reason `currentValuation` never reads ahead of
 * `asOf` — a hand-entered NAV dated later in the same month must not make
 * today's point on the chart look ahead of today.
 */
export function portfolioSeries(
  db: AppDatabase,
  months: Month[],
  asOf: IsoDate,
  portfolioId: string = PORTFOLIO_ID,
): Array<Cents | null> {
  const asOfMonth = monthOf(asOf)
  const purchases: Purchase[] = listPurchases(db, portfolioId).map(toPurchase)

  return months.map((month) => {
    if (month > asOfMonth) {
      return null
    }

    const day = month === asOfMonth ? asOf : lastDayOfMonth(month)
    const purchasesToDate = purchases.filter((p) => p.date <= day)
    if (purchasesToDate.length === 0) {
      return null
    }

    const { navByFund } = resolveNavs(db, fundIdsOf(purchasesToDate), day)
    return valuate(purchasesToDate, navByFund).value
  })
}

/**
 * The internal rate of return of the portfolio: one outgoing flow per
 * purchase, at its own date and amount, plus the current value coming in on
 * `asOf`. Returns `null` instead of throwing when `xirr` cannot make sense of
 * the flows — fewer than two of them, or all sharing a sign, most commonly a
 * brand-new portfolio with nothing to compute a rate over yet.
 */
export function portfolioXirr(
  db: AppDatabase,
  valueNow: Cents,
  asOf: IsoDate,
  portfolioId: string = PORTFOLIO_ID,
): number | null {
  const purchases: Purchase[] = listPurchases(db, portfolioId).map(toPurchase)

  const flows: CashFlow[] = [
    ...purchases.map((p): CashFlow => ({ date: p.date, amount: -p.amount })),
    { date: asOf, amount: valueNow },
  ]

  try {
    return xirr(flows)
  }
  catch {
    return null
  }
}
