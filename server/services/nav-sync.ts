import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { addDays, firstDayOfMonth } from '~~/core/dates'
import type { IsoDate } from '~~/core/types'
import type { AppDatabase } from '../db/client'
import { listFunds, listNavs, listRules } from '../db/queries'
import { navs } from '../db/schema'
import { PriceProviderError, type PriceProvider } from '../providers/types'

/** Options for one call to `syncNavs`. */
export interface NavSyncOptions {
  /** The current date. Injected, never read from the clock in here. */
  today: IsoDate
  /** Restrict the run to these funds. All of them when omitted. */
  fundIds?: string[]
  /** Where to start for a fund with no NAV yet. Defaults to the first contribution month. */
  fallbackFrom?: IsoDate
}

/** The outcome of syncing one fund. */
export interface NavSyncFundResult {
  fundId: string
  status: 'synced' | 'up-to-date' | 'skipped' | 'incomplete'
  reason?: 'no-symbol'
  from?: IsoDate
  to?: IsoDate
  received?: number
  inserted?: number
  updated?: number
  skippedManual?: number
}

export interface NavSyncResult { funds: NavSyncFundResult[] }

/** Reduces `error` to a message string, whether or not it is an `Error`. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The most recent date this fund has a NAV confirmed by a provider, or
 * `undefined` if it has none. Deliberately ignores rows entered by hand:
 * a manual value protects itself against being overwritten through
 * `setWhere`, but it must not push the resume point past it, or a manual
 * entry sitting inside an otherwise-unsynced range would silently and
 * permanently hide from every future sync instead of being examined and
 * reported as `skippedManual` on the run that reaches it.
 */
function latestProviderNavDate(db: AppDatabase, fundId: string): IsoDate | undefined {
  const row = db.select().from(navs)
    .where(and(eq(navs.fundId, fundId), ne(navs.source, 'manual')))
    .orderBy(desc(navs.date))
    .limit(1)
    .get()

  return row?.date
}

/**
 * Synchronises the `nav` table against a `PriceProvider`, one fund at a
 * time, ordered by id.
 *
 * A sync starts the day after the last NAV already stored for that fund —
 * never re-downloading a day that is already there — which is what makes a
 * second run in the same afternoon ask the provider for nothing. A fund
 * with no NAV yet starts at `options.fallbackFrom`, or the first day of the
 * earliest contribution rule, or `options.today` if neither exists.
 *
 * A NAV entered by hand always prevails: the upsert's `setWhere` refuses to
 * overwrite a row whose `source` is `'manual'`, per spec section 6. Those
 * rows are counted as `skippedManual` rather than silently ignored.
 *
 * Each fund commits in its own transaction, so a provider failure on one
 * fund does not undo the funds already synced before it — the NAVs already
 * downloaded are worth keeping, per the mitigation spec section 6 names for
 * an unofficial API. A failing fund does not stop the funds ordered after
 * it from being attempted either: the loop runs to completion and the
 * first failure is what propagates, as a `PriceProviderError` naming the
 * fund, once every fund has had its turn.
 */
export async function syncNavs(
  db: AppDatabase,
  provider: PriceProvider,
  options: NavSyncOptions,
): Promise<NavSyncResult> {
  const funds = options.fundIds === undefined
    ? listFunds(db)
    : listFunds(db).filter(fund => options.fundIds!.includes(fund.id))

  const rules = listRules(db)
  const earliestRuleMonth = rules[0]?.fromMonth

  const results: NavSyncFundResult[] = []
  let firstFailure: PriceProviderError | undefined

  for (const fund of funds) {
    if (fund.providerSymbol === null) {
      results.push({ fundId: fund.id, status: 'skipped', reason: 'no-symbol' })
      continue
    }

    const latest = latestProviderNavDate(db, fund.id)
    const from = latest !== undefined
      ? addDays(latest, 1)
      : options.fallbackFrom ?? (earliestRuleMonth !== undefined ? firstDayOfMonth(earliestRuleMonth) : options.today)
    const to = options.today

    if (from > to) {
      results.push({ fundId: fund.id, status: 'up-to-date', from, to, received: 0, inserted: 0, updated: 0, skippedManual: 0 })
      continue
    }

    let points
    try {
      points = await provider.history(fund.providerSymbol, from, to)
    }
    catch (error) {
      // Recorded rather than thrown here, so a fund ordered after this one
      // still gets its chance and, if it succeeds, its rows are committed.
      firstFailure ??= new PriceProviderError(`Failed to sync fund "${fund.id}": ${messageOf(error)}`, { cause: error })
      continue
    }

    // Read the rows already in [from, to] once, so the upsert below can
    // tell an insert from an update, and count the manual rows it must
    // leave alone, without a second query per point.
    const existingSourceByDate = new Map(listNavs(db, fund.id, from, to).map(row => [row.date, row.source]))

    let inserted = 0
    let updated = 0
    let skippedManual = 0

    db.transaction((tx) => {
      for (const point of points) {
        const priorSource = existingSourceByDate.get(point.date)
        if (priorSource === 'manual') {
          skippedManual++
        }
        else if (priorSource !== undefined) {
          updated++
        }
        else {
          inserted++
        }

        tx.insert(navs)
          .values({ fundId: fund.id, date: point.date, value: point.value, source: provider.id })
          .onConflictDoUpdate({
            target: [navs.fundId, navs.date],
            set: { value: point.value, source: provider.id },
            // A net asset value entered by hand always prevails over the provider's.
            setWhere: sql`${navs.source} <> 'manual'`,
          })
          .run()
      }
    })

    results.push({
      fundId: fund.id,
      status: 'synced',
      from,
      to,
      received: points.length,
      inserted,
      updated,
      skippedManual,
    })
  }

  if (firstFailure !== undefined) {
    throw firstFailure
  }

  return { funds: results }
}

/** The outcome of `syncNavsWithPartialReport`: every fund it was asked about, and the message `syncNavs` threw with, if it threw. */
export interface NavSyncOutcome {
  funds: NavSyncFundResult[]
  failureMessage?: string
}

/**
 * Wraps `syncNavs` so a caller — the `POST /api/nav/sync` route, in
 * particular — never has to treat a throw as though nothing happened.
 *
 * `syncNavs` deliberately finishes its loop and commits every fund ordered
 * after a failing one before raising the first failure at the very end (see
 * the comment on `syncNavs` itself), but the rejected promise carries no
 * partial result to read off. What is left is the database: the NAV row
 * count of every fund, read before the call and again after a failure, is
 * ground truth regardless of what the promise resolved with. A fund whose
 * count grew is reported as `'synced'` with exactly that many new rows; one
 * that did not move is reported as `'incomplete'` — it may be the fund that
 * actually failed, or one ordered after it that never got its turn, and
 * there is no way to tell those two apart once the throw has already
 * happened. This cannot recover the exact received/inserted/updated split
 * `syncNavs` would have returned on success, only that rows did or did not
 * land — `scripts/sync-nav.ts`'s `runSync` accepts the same limitation for
 * the same reason.
 *
 * Only a `PriceProviderError` is turned into this report: that is the one
 * failure mode `syncNavs` is documented to produce after committing partial
 * work. Anything else — a bug in the database layer, say — propagates
 * unchanged, so a caller's generic error handling still applies to it
 * instead of every unrelated exception being reshaped into "a sync that
 * partly landed".
 */
export async function syncNavsWithPartialReport(
  db: AppDatabase,
  provider: PriceProvider,
  options: NavSyncOptions,
): Promise<NavSyncOutcome> {
  const funds = options.fundIds === undefined
    ? listFunds(db)
    : listFunds(db).filter(fund => options.fundIds!.includes(fund.id))
  const countsBefore = new Map(funds.map(fund => [fund.id, listNavs(db, fund.id).length]))

  try {
    const result = await syncNavs(db, provider, options)
    return { funds: result.funds }
  }
  catch (error) {
    if (!(error instanceof PriceProviderError)) {
      throw error
    }

    const partial = funds.map((fund): NavSyncFundResult => {
      if (fund.providerSymbol === null) {
        return { fundId: fund.id, status: 'skipped', reason: 'no-symbol' }
      }
      const gained = listNavs(db, fund.id).length - (countsBefore.get(fund.id) ?? 0)
      return gained > 0
        ? { fundId: fund.id, status: 'synced', received: gained, inserted: gained, updated: 0, skippedManual: 0 }
        : { fundId: fund.id, status: 'incomplete' }
    })
    return { funds: partial, failureMessage: messageOf(error) }
  }
}
