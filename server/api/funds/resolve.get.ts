import { createYahooProvider } from '../../providers/yahoo'

/**
 * GET /api/funds/resolve?isin= — the only route that reaches the network,
 * which is why this project runs on Nitro at all: the Yahoo Finance API
 * answers with no `Access-Control-Allow-Origin` header, so the browser
 * cannot call it directly.
 *
 * Returns every candidate `createYahooProvider().resolve(isin)` finds,
 * untouched and in the order Yahoo gives them, and never picks one: the same
 * ISIN can publish several share classes at different prices —
 * `0P0001CLDK.F` at 9,99 € against `IE00BYX5NX33.SG` at 14,33 € — and only
 * the user's own statement says which one they hold, per spec section 6.
 * Never writes to the database.
 *
 * A `PriceProviderError` — an outage, a malformed response — becomes a 502
 * through `handle()`, so a Yahoo failure reads as somebody else's problem
 * rather than a bug in this route.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const query = getQuery(event)
  const isin = readNonEmptyString(query, 'isin')

  return createYahooProvider().resolve(isin)
}))
