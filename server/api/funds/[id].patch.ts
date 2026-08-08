import { updateFund } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/** PATCH /api/funds/:id — `{ name?, providerSymbol? }`. */
export default defineEventHandler(async (event) => handle(async () => {
  const id = readRouteParam(getRouterParam(event, 'id'), 'id')
  const body = await readBody(event)
  const name = readOptionalString(body, 'name')
  const providerSymbol = readOptionalString(body, 'providerSymbol')

  const fund = updateFund(useDatabase(), id, { name, providerSymbol })
  if (!fund) {
    throw new NotFoundError(`Fund "${id}" not found`)
  }
  return fund
}))
