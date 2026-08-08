import { PORTFOLIO_ID, listPurchases } from '../../db/queries'
import { toPurchase } from '../../db/mappers'

/** GET /api/purchases?from=&to=&fundId= — the stored purchases of the portfolio, every filter optional. */
export default defineEventHandler(async (event) => handle(async () => {
  const query = getQuery(event)
  const fundId = query.fundId ? readString(query, 'fundId') : undefined
  const from = query.from ? readIsoDate(query, 'from') : undefined
  const to = query.to ? readIsoDate(query, 'to') : undefined

  return listPurchases(useDatabase(), PORTFOLIO_ID, { fundId, from, to }).map(toPurchase)
}))
