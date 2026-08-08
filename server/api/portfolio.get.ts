import { buildPortfolioView } from '../services/read-model'

/** GET /api/portfolio — the one portfolio, plus the first month it has ever governed. */
export default defineEventHandler(async () => handle(async () => {
  return buildPortfolioView(useDatabase())
}))
