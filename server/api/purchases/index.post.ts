import { unitsFor } from '~~/core/purchases'
import { getFund, insertPurchase } from '../../db/queries'
import { toPurchase } from '../../db/mappers'
import { NotFoundError } from '../../utils/errors'

/**
 * POST /api/purchases — `{ fundId, month, date, amount, nav, units? }`, 201,
 * always `source: 'manual'`.
 *
 * `units` is computed from `amount` and `nav` with `unitsFor` when the body
 * omits it — the same six-place `ROUND_HALF_UP` division `buildPurchases`
 * uses to materialise a purchase automatically, so a purchase typed in by
 * hand and one derived from a contribution can never drift apart over the
 * same NAV.
 */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return handle(async () => {
    const body = await readBody(event)
    const fundId = readNonEmptyString(body, 'fundId')
    const month = readMonth(body, 'month')
    const date = readIsoDate(body, 'date')
    const amount = readCents(body, 'amount')
    const nav = readDecimalString(body, 'nav')
    const units = readOptionalDecimalString(body, 'units')

    const db = useDatabase()
    if (!getFund(db, fundId)) {
      throw new NotFoundError(`Fund "${fundId}" not found`)
    }

    const row = insertPurchase(db, {
      fundId,
      month,
      date,
      amount,
      nav,
      units: units ?? unitsFor(amount, nav),
      source: 'manual',
    })
    return toPurchase(row)
  })
})
