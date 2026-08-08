import { syncNavsWithPartialReport } from '../../services/nav-sync'
import { createYahooProvider } from '../../providers/yahoo'

/**
 * POST /api/nav/sync — `{ fundIds?: string[] }`. The button of spec
 * section 9: idempotent, because `syncNavs` only ever requests the days
 * missing since the last run.
 *
 * `syncNavs` can partially succeed and then throw: it finishes its loop and
 * commits every fund ordered after a failing one before raising the first
 * failure, so a plain `await` here would let that throw read as though
 * nothing had happened. `syncNavsWithPartialReport` reports every fund from
 * the database's own row counts instead, and a genuine provider failure
 * still comes back as a 502 — through `createError`'s `data`, not through
 * `handle()`, since by then the failure is no longer a bare message but a
 * report with a `funds` array attached that a caller should not have to
 * discard just because the run did not finish cleanly.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const body = await readBody(event)
  const fundIds = readOptionalStringArray(body, 'fundIds')

  const outcome = await syncNavsWithPartialReport(useDatabase(), createYahooProvider(), { today: today(), fundIds })

  if (outcome.failureMessage !== undefined) {
    throw createError({ statusCode: 502, statusMessage: outcome.failureMessage, data: { funds: outcome.funds } })
  }

  return { funds: outcome.funds }
}))
