import { valuate, type FundPosition, type Valuation } from '~~/core/valuation'
import { xirr, type CashFlow } from '~~/core/returns'
import { lastDayOfMonth, monthOf } from '~~/core/dates'
import { addMonths, monthRange } from '~~/core/months'
import { expandContributions } from '~~/core/contributions'
import { projectScenario } from '~~/core/scenarios'
import Decimal from '~~/core/decimal'
import type { Cents, Contribution, IsoDate, Month } from '~~/core/types'
import type { Purchase } from '~~/core/purchases'
import type { AppDatabase } from '../db/client'
import {
  PORTFOLIO_ID,
  getFund,
  getPortfolio,
  latestNavOnOrBefore,
  listFunds,
  listOverrides,
  listPurchases,
  listRules,
  listScenarios,
} from '../db/queries'
import { toContributionOverride, toContributionRule, toPurchase } from '../db/mappers'
import type { ContributionOverrideRow, ContributionRuleRow } from '../db/schema'
import { NotFoundError } from '../utils/errors'

/**
 * Re-exported so existing callers keep importing it from here: thrown when a
 * figure the dashboard needs cannot be produced because a fund holding units
 * has no NAV to value it with. The route layer turns this into a 404 the
 * interface can explain, rather than a 500.
 */
export { NotFoundError }

/** Everything `GET /api/portfolio` answers: the portfolio row plus the first month it has ever governed. */
export interface PortfolioView {
  id: string
  name: string
  currency: string
  horizonYears: number
  /** The earliest contribution rule's `fromMonth`, the same one `horizonMonths` starts from. `null` with no rule at all. */
  firstMonth: Month | null
}

/**
 * The one portfolio, plus `firstMonth`, derived the same way `horizonMonths`
 * derives it: the earliest contribution rule's `fromMonth` (`listRules`
 * already returns rules ordered by that column, so the first one is it).
 * Throws `NotFoundError` if the portfolio row itself is missing, which is
 * only reachable on a database that was never seeded.
 */
export function buildPortfolioView(db: AppDatabase, portfolioId: string = PORTFOLIO_ID): PortfolioView {
  const portfolio = getPortfolio(db, portfolioId)
  if (!portfolio) {
    throw new NotFoundError(`Portfolio "${portfolioId}" not found`)
  }

  const rules = listRules(db, portfolioId)
  return {
    id: portfolio.id,
    name: portfolio.name,
    currency: portfolio.currency,
    horizonYears: portfolio.horizonYears,
    firstMonth: rules[0]?.fromMonth ?? null,
  }
}

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

/**
 * The months a projection runs over: `horizonYears * 12 + 1` of them,
 * starting at the earliest contribution rule's `fromMonth` (rules come back
 * from `listRules` already ordered by that column) and ending that many
 * years later. `[]` when there is no rule at all — nothing to project a
 * horizon from — which is also what an entirely empty database produces,
 * without needing a portfolio row to fall back on.
 */
export function horizonMonths(db: AppDatabase, portfolioId: string = PORTFOLIO_ID): Month[] {
  const rules = listRules(db, portfolioId)
  if (rules.length === 0) {
    return []
  }

  const firstMonth = rules[0]!.fromMonth
  const horizonYears = getPortfolio(db, portfolioId)?.horizonYears ?? 25
  return monthRange(firstMonth, addMonths(firstMonth, horizonYears * 12))
}

/** One theoretical scenario, projected month by month for the dashboard's chart. */
export interface ScenarioSeries {
  id: string
  name: string
  color: string
  /** Decimal string as a fraction of one, e.g. `'0.09'` for 9 %. */
  annualRate: string
  balance: Cents[]
}

/** Everything `GET /api/dashboard` answers: today's real figures alongside the projected chart. */
export interface Dashboard {
  asOf: IsoDate
  /** The oldest of the per-fund latest NAV dates. `null` when no fund has a NAV yet. */
  navDate: IsoDate | null
  valuation: {
    value: Cents
    invested: Cents
    gain: Cents
    gainRatio: number
    byFund: FundPositionView[]
  }
  /** `null` when there are fewer than two cash flows or they all share a sign. */
  xirr: number | null
  series: {
    /** `horizonYears * 12 + 1` months, starting at the first contribution month. `[]` with no rules. */
    months: Month[]
    /** Cumulative planned contributions across the whole horizon. */
    contributed: Cents[]
    /** Real portfolio value per month. `null` where it is unknown or still in the future. */
    portfolio: Array<Cents | null>
    /** Only scenarios with `enabled = 1`. */
    scenarios: ScenarioSeries[]
  }
}

/**
 * Assembles the whole dashboard: the real valuation and XIRR from task 12,
 * plus the theoretical scenario projections, over the horizon of
 * `horizonMonths`.
 *
 * The monthly rate every scenario compounds with is `(1 + r)^(1/12) - 1`,
 * computed inside `projectScenario` — never re-derived here as `r / 12`,
 * which would overstate a 25-year, 9 % projection by 14.415 €.
 *
 * `series.contributed` is read off the first enabled scenario's points,
 * because every scenario accumulates the identical contribution series
 * regardless of its rate. With no scenario enabled it falls back to
 * projecting at 0 % just to get that column, which changes nothing about
 * what a 0 % projection accumulates.
 */
export function buildDashboard(
  db: AppDatabase,
  asOf: IsoDate,
  portfolioId: string = PORTFOLIO_ID,
): Dashboard {
  const { valuation, byFund, navDate } = currentValuation(db, asOf, portfolioId)
  const xirrValue = portfolioXirr(db, valuation.value, asOf, portfolioId)

  const months = horizonMonths(db, portfolioId)
  const portfolio = portfolioSeries(db, months, asOf, portfolioId)

  const rules = listRules(db, portfolioId).map(toContributionRule)
  const overrides = listOverrides(db, portfolioId).map(toContributionOverride)
  const contributions: Contribution[] = months.length === 0
    ? []
    : expandContributions(rules, overrides, months[0]!, months[months.length - 1]!)

  const enabledScenarios = listScenarios(db).filter((scenario) => scenario.enabled === 1)
  const projected = enabledScenarios.map((scenario) => ({
    scenario,
    points: projectScenario(contributions, Number(scenario.annualRate), months),
  }))

  const contributed = projected.length > 0
    ? projected[0]!.points.map((point) => point.contributed)
    : projectScenario(contributions, 0, months).map((point) => point.contributed)

  return {
    asOf,
    navDate,
    valuation: { ...valuation, byFund },
    xirr: xirrValue,
    series: {
      months,
      contributed,
      portfolio,
      scenarios: projected.map(({ scenario, points }) => ({
        id: scenario.id,
        name: scenario.name,
        color: scenario.color,
        annualRate: scenario.annualRate,
        balance: points.map((point) => point.balance),
      })),
    },
  }
}

/** One fund as the funds screen needs it: its identity, its latest quote, and its own position. */
export interface FundView {
  id: string
  isin: string
  name: string
  providerSymbol: string | null
  currency: string
  latestNav: { date: IsoDate, value: string, source: 'yahoo' | 'manual' } | null
  /** Accumulated units across every purchase of this fund, as a decimal string. */
  units: string
  invested: Cents
  /** `0` for a fund with no NAV at all — there is nothing to multiply the units by. */
  value: Cents
}

/**
 * One row per fund for the funds screen: its own position, valued at its
 * own latest NAV on or before `asOf`, independently of every other fund.
 * Unlike `currentValuation`, a fund with units but no NAV does not throw —
 * it comes back at `latestNav: null` and `value: 0`, because this view lists
 * every fund the user manages, including one not quoted yet.
 */
export function buildFundsView(
  db: AppDatabase,
  asOf: IsoDate,
  portfolioId: string = PORTFOLIO_ID,
): FundView[] {
  const purchases: Purchase[] = listPurchases(db, portfolioId).map(toPurchase)

  return listFunds(db).map((fund) => {
    const fundPurchases = purchases.filter((p) => p.fundId === fund.id)
    const units = fundPurchases.reduce((sum, p) => sum.plus(p.units), new Decimal(0))
    const invested = fundPurchases.reduce((sum, p) => sum + p.amount, 0)

    const navRow = latestNavOnOrBefore(db, fund.id, asOf)
    const value = navRow
      ? units.times(navRow.value).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
      : 0

    return {
      id: fund.id,
      isin: fund.isin,
      name: fund.name,
      providerSymbol: fund.providerSymbol,
      currency: fund.currency,
      latestNav: navRow ? { date: navRow.date, value: navRow.value, source: navRow.source } : null,
      units: units.toFixed(6),
      invested,
      value,
    }
  })
}

/** One row for the contributions screen: a resolved contribution plus whether it is already history. */
export interface ContributionsViewMonth extends Contribution {
  /** `true` when a purchase row already exists for this month — the plan already executed. */
  materialised: boolean
}

/** Everything `GET /api/contributions` answers. */
export interface ContributionsView {
  rules: ContributionRuleRow[]
  overrides: ContributionOverrideRow[]
  months: ContributionsViewMonth[]
}

/**
 * Expands the rules and overrides of a portfolio into the contribution
 * series between `from` and `to`, and marks each month as `materialised`
 * when a purchase row already exists for it — the fact that turns a planned
 * contribution into an executed one.
 */
export function buildContributionsView(
  db: AppDatabase,
  from: Month,
  to: Month,
  portfolioId: string = PORTFOLIO_ID,
): ContributionsView {
  const ruleRows = listRules(db, portfolioId)
  const overrideRows = listOverrides(db, portfolioId)

  const contributions = expandContributions(
    ruleRows.map(toContributionRule),
    overrideRows.map(toContributionOverride),
    from,
    to,
  )

  const materialisedMonths = new Set(listPurchases(db, portfolioId).map((p) => p.month))
  const months = contributions.map((c) => ({ ...c, materialised: materialisedMonths.has(c.month) }))

  return { rules: ruleRows, overrides: overrideRows, months }
}
