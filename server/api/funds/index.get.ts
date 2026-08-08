import { buildFundsView } from '../../services/read-model'

/** GET /api/funds — every fund, valued at its own latest NAV on or before today. */
export default defineEventHandler(async () => handle(async () => {
  return buildFundsView(useDatabase(), today())
}))
