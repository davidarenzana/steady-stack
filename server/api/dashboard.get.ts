import { buildDashboard } from '../services/read-model'

/** GET /api/dashboard?asOf=YYYY-MM-DD — defaults asOf to today when the query omits it. */
export default defineEventHandler(async (event) => handle(async () => {
  const query = getQuery(event)
  const asOf = query.asOf ? readIsoDate(query, 'asOf') : today()
  return buildDashboard(useDatabase(), asOf)
}))
