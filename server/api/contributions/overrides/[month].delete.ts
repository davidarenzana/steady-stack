import { deleteOverride, getOverride } from '../../../db/queries'
import { NotFoundError } from '../../../utils/errors'

/** DELETE /api/contributions/overrides/:month — 204. */
export default defineEventHandler(async (event) => {
  await handle(async () => {
    const month = readMonthRouteParam(getRouterParam(event, 'month'), 'month')
    const db = useDatabase()

    if (!getOverride(db, month)) {
      throw new NotFoundError(`No contribution override for "${month}"`)
    }
    deleteOverride(db, month)
  })
  setResponseStatus(event, 204)
  return null
})
