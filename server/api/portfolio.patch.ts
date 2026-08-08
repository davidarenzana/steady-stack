import { updatePortfolio } from '../db/queries'
import { buildPortfolioView } from '../services/read-model'

/**
 * PATCH /api/portfolio — `{ name?, horizonYears? }`. Both optional; an
 * absent field leaves the stored value untouched. The response is the same
 * shape as `GET /api/portfolio`, including `firstMonth`, so the caller never
 * has to make a second request to see what it just changed.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const body = await readBody(event)
  const name = readOptionalString(body, 'name')
  const horizonYears = readOptionalPositiveInteger(body, 'horizonYears')

  updatePortfolio(useDatabase(), { name, horizonYears })
  return buildPortfolioView(useDatabase())
}))
