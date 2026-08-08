import { getFund, upsertNav } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/**
 * PUT /api/nav — `{ fundId, date, value }`, always `source: 'manual'`,
 * always overwriting whatever was there for that fund and date. This is the
 * override channel of spec section 6: the next `pnpm sync:nav` will not
 * undo it.
 *
 * `date` cannot be later than today — see the decision recorded on
 * `readIsoDateNotAfter` in `server/utils/validation.ts`. `value` must be a
 * positive decimal: a NAV of zero or negative is not a valuation, and would
 * only surface as a division failure later, inside `unitsFor`, far from
 * where the bad value was actually typed in.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const body = await readBody(event)
  const fundId = readNonEmptyString(body, 'fundId')
  const date = readIsoDateNotAfter(body, 'date', today())
  const value = readPositiveDecimalString(body, 'value')

  const db = useDatabase()
  if (!getFund(db, fundId)) {
    throw new NotFoundError(`Fund "${fundId}" not found`)
  }

  const row = upsertNav(db, { fundId, date, value, source: 'manual' })
  // The documented shape has no `id`: GET /api/nav does not expose one either,
  // and a NAV is identified by (fundId, date), not by its row id.
  return { fundId: row.fundId, date: row.date, value: row.value, source: row.source }
}))
