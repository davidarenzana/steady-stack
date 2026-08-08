import { PORTFOLIO_ID, deleteFund, getFund, listPurchases } from '../../db/queries'
import { ConflictError, NotFoundError } from '../../utils/errors'

/**
 * DELETE /api/funds/:id — 204; 409 if the fund has purchases. A purchase is
 * a historical fact — so many units at such a NAV, on a real date — and
 * deleting the fund it references would orphan it, leaving a row nothing
 * can render a name for. A fund's own NAV rows are not protected the same
 * way: `deleteFund` cascades them, since a quote is re-downloadable market
 * data, not a fact about money that moved.
 */
export default defineEventHandler(async (event) => {
  await handle(async () => {
    const id = readRouteParam(getRouterParam(event, 'id'), 'id')
    const db = useDatabase()

    if (!getFund(db, id)) {
      throw new NotFoundError(`Fund "${id}" not found`)
    }

    const purchaseCount = listPurchases(db, PORTFOLIO_ID, { fundId: id }).length
    if (purchaseCount > 0) {
      throw new ConflictError(`Fund "${id}" has ${purchaseCount} purchases and cannot be deleted`)
    }

    deleteFund(db, id)
  })
  setResponseStatus(event, 204)
  return null
})
