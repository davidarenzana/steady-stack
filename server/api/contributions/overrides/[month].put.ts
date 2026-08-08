import { upsertOverride } from '../../../db/queries'

/**
 * PUT /api/contributions/overrides/:month — `{ amount: Cents | null, timing?, note? }`.
 *
 * Idempotent by nature: a second call for the same month replaces the
 * first rather than adding a second row, backed by
 * `contribution_override_month_unique`.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const month = readMonthRouteParam(getRouterParam(event, 'month'), 'month')
  const body = await readBody(event)
  const amount = readNullableCents(body, 'amount')
  const timing = readOptionalTiming(body, 'timing')
  const note = readOptionalString(body, 'note')

  return upsertOverride(useDatabase(), { month, amount, timing, note })
}))
