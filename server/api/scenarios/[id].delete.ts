import { deleteScenario, getScenario } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/** DELETE /api/scenarios/:id — 204. */
export default defineEventHandler(async (event) => {
  await handle(async () => {
    const id = readRouteParam(getRouterParam(event, 'id'), 'id')
    const db = useDatabase()

    if (!getScenario(db, id)) {
      throw new NotFoundError(`Scenario "${id}" not found`)
    }
    deleteScenario(db, id)
  })
  setResponseStatus(event, 204)
  return null
})
