import { getScenario, insertScenario } from '../../db/queries'
import { ConflictError } from '../../utils/errors'

/** POST /api/scenarios — `{ id, name, annualRate, color, enabled? }`, 201. */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return handle(async () => {
    const body = await readBody(event)
    const id = readNonEmptyString(body, 'id')
    const name = readNonEmptyString(body, 'name')
    const annualRate = readDecimalString(body, 'annualRate')
    const color = readNonEmptyString(body, 'color')
    const enabled = readOptionalBoolean(body, 'enabled')

    const db = useDatabase()
    if (getScenario(db, id)) {
      throw new ConflictError(`Scenario "${id}" already exists`)
    }

    return insertScenario(db, { id, name, annualRate, color, enabled })
  })
})
