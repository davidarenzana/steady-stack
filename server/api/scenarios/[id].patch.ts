import { updateScenario } from '../../db/queries'
import { NotFoundError } from '../../utils/errors'

/** PATCH /api/scenarios/:id — `{ name?, annualRate?, color?, enabled? }`. */
export default defineEventHandler(async (event) => handle(async () => {
  const id = readRouteParam(getRouterParam(event, 'id'), 'id')
  const body = await readBody(event)
  const name = readOptionalString(body, 'name')
  const annualRate = readOptionalDecimalString(body, 'annualRate')
  const color = readOptionalString(body, 'color')
  const enabled = readOptionalBoolean(body, 'enabled')

  const scenario = updateScenario(useDatabase(), id, { name, annualRate, color, enabled })
  if (!scenario) {
    throw new NotFoundError(`Scenario "${id}" not found`)
  }
  return scenario
}))
