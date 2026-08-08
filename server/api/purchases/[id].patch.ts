import { unitsFor } from '~~/core/purchases'
import { getPurchase, updatePurchase } from '../../db/queries'
import { toPurchase } from '../../db/mappers'
import { NotFoundError } from '../../utils/errors'

/**
 * PATCH /api/purchases/:id — `{ date?, amount?, nav?, units? }`.
 *
 * When `amount` or `nav` changes and the body does not also give `units`,
 * `units` is recomputed from the effective amount and NAV — the merge of
 * what changed with what the row already had — with the same `unitsFor` a
 * fresh purchase uses. Left alone, a NAV correction would leave `units`
 * quietly wrong: exactly the kind of drift extracting `unitsFor` was meant
 * to close off.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const id = readIntegerRouteParam(getRouterParam(event, 'id'), 'id')
  const body = await readBody(event)

  const db = useDatabase()
  const existing = getPurchase(db, id)
  if (!existing) {
    throw new NotFoundError(`Purchase ${id} not found`)
  }

  const date = readOptionalIsoDate(body, 'date')
  const amount = readOptionalCents(body, 'amount')
  const nav = readOptionalDecimalString(body, 'nav')
  const unitsGiven = readOptionalDecimalString(body, 'units')

  const units = unitsGiven ?? (amount !== undefined || nav !== undefined
    ? unitsFor(amount ?? existing.amount, nav ?? existing.nav)
    : undefined)

  const row = updatePurchase(db, id, { date, amount, nav, units })
  return toPurchase(row!)
}))
