import { deleteRule, getRule } from '../../../db/queries'
import { NotFoundError } from '../../../utils/errors'

/** DELETE /api/contributions/rules/:id — 204. */
export default defineEventHandler(async (event) => {
  await handle(async () => {
    const id = readIntegerRouteParam(getRouterParam(event, 'id'), 'id')
    const db = useDatabase()

    if (!getRule(db, id)) {
      throw new NotFoundError(`Contribution rule ${id} not found`)
    }
    deleteRule(db, id)
  })
  setResponseStatus(event, 204)
  return null
})
