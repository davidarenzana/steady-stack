import { buildContributionsView } from '../../services/read-model'

/** GET /api/contributions?from=YYYY-MM&to=YYYY-MM — the resolved contribution series in the window. */
export default defineEventHandler(async (event) => handle(async () => {
  const query = getQuery(event)
  const from = readMonth(query, 'from')
  const to = readMonth(query, 'to')
  return buildContributionsView(useDatabase(), from, to)
}))
