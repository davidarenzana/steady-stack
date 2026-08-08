import { deletePurchase, getPurchase } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/** DELETE /api/purchases/:id — 204. */
export default defineEventHandler(async (event) => {
  await handle(async () => {
    const id = readIntegerRouteParam(getRouterParam(event, 'id'), 'id')
    const db = useDatabase()

    if (!getPurchase(db, id)) {
      throw new NotFoundError(`Purchase ${id} not found`)
    }
    deletePurchase(db, id)
  })
  setResponseStatus(event, 204)
  return null
})
