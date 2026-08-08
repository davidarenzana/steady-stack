import { listScenarios } from '../../db/queries'

/** GET /api/scenarios — every stored scenario, enabled or not. */
export default defineEventHandler(async () => handle(async () => {
  return listScenarios(useDatabase())
}))
