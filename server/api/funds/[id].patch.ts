import { updateFund } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/**
 * PATCH /api/funds/:id — `{ name?, providerSymbol? }`.
 *
 * `providerSymbol` is read with `readClearableString`, not
 * `readOptionalString`: an explicit `null` clears the column, which is how the
 * funds screen undoes a wrong share-class choice. `updateFund` already types
 * the field `string | null` and Drizzle skips `undefined` keys, so absent
 * still leaves the stored value alone.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const id = readRouteParam(getRouterParam(event, 'id'), 'id')
  const body = await readBody(event)
  const name = readOptionalString(body, 'name')
  const providerSymbol = readClearableString(body, 'providerSymbol')

  const fund = updateFund(useDatabase(), id, { name, providerSymbol })
  if (!fund) {
    throw new NotFoundError(`Fund "${id}" not found`)
  }
  return fund
}))
