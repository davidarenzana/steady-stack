import type { IsoDate, NavPoint } from '~~/core/types'
import Decimal from '~~/core/decimal'
import type { PriceProvider, SymbolCandidate } from './types'
import { PriceProviderError } from './types'

export const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'
export const YAHOO_CHART_URL = 'https://query2.finance.yahoo.com/v8/finance/chart'

/**
 * These funds publish four decimal places. Rounding to that precision is
 * what turns the IEEE double Yahoo sends — 14.10420036315918 — back into the
 * value the fund actually published, 14,1042 €.
 */
export const NAV_DECIMALS = 4

/** One row of a Yahoo search result, before it is enriched with a price. */
export interface YahooQuote {
  symbol: string
  name: string
  exchange: string
}

/** Reads a value that may be a non-empty string, else falls back. */
function stringOrFallback(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }
  return fallback
}

/**
 * Parses a Yahoo Finance search response into every quote it lists for the
 * ISIN, in the order Yahoo returns them. Never picks one: several symbols
 * can quote the same ISIN at different prices — different share classes of
 * the same fund — so the choice belongs to the user, not to this parser.
 *
 * News and industry entries Yahoo mixes into `quotes` are dropped by
 * requiring a string `symbol` and a `quoteType`; neither carries one.
 */
export function parseSearchResponse(payload: unknown, isin: string): YahooQuote[] {
  if (typeof payload !== 'object' || payload === null || !('quotes' in payload)) {
    throw new PriceProviderError(`Yahoo returned no search results for "${isin}"`)
  }

  const quotes = (payload as { quotes: unknown }).quotes
  if (!Array.isArray(quotes)) {
    throw new PriceProviderError(`Yahoo returned no search results for "${isin}"`)
  }

  return quotes
    .filter((quote): quote is Record<string, unknown> =>
      typeof quote === 'object'
      && quote !== null
      && typeof (quote as Record<string, unknown>).symbol === 'string'
      && typeof (quote as Record<string, unknown>).quoteType === 'string',
    )
    .map(quote => ({
      symbol: quote.symbol as string,
      name: stringOrFallback(quote.longname, stringOrFallback(quote.shortname, quote.symbol as string)),
      exchange: stringOrFallback(quote.exchDisp, stringOrFallback(quote.exchange, '')),
    }))
}

/**
 * Parses a Yahoo Finance chart response into a NAV series with no gaps and
 * no nulls: a `null` close is a day with no published NAV — dropped, never
 * zero-filled, never interpolated, never carried forward.
 *
 * Three shapes have to survive this parser:
 * - a full daily series;
 * - an error payload, where `chart.result` is `null` and `chart.error`
 *   carries a code and description — turned into a `PriceProviderError`;
 * - a result with no `timestamp` key at all: a symbol that resolves but
 *   publishes nothing on that exchange. That is not an error, it is an
 *   empty series.
 */
export function parseChartResponse(
  payload: unknown,
  symbol: string,
): { symbol: string, currency: string | null, points: NavPoint[] } {
  if (typeof payload !== 'object' || payload === null || !('chart' in payload)) {
    throw new PriceProviderError(`Yahoo returned no chart data for "${symbol}"`)
  }

  const chart = (payload as { chart: unknown }).chart
  if (typeof chart !== 'object' || chart === null) {
    throw new PriceProviderError(`Yahoo returned no chart data for "${symbol}"`)
  }

  const { result, error } = chart as { result: unknown, error: unknown }

  if (error !== null && error !== undefined) {
    const description = typeof error === 'object' && error !== null && 'description' in error
      ? String((error as { description: unknown }).description)
      : 'unknown error'
    throw new PriceProviderError(`Yahoo returned no chart data for "${symbol}": ${description}`)
  }

  if (!Array.isArray(result) || result.length === 0) {
    throw new PriceProviderError(`Yahoo returned no chart data for "${symbol}"`)
  }

  const entry = result[0] as Record<string, unknown>
  const meta = (entry.meta ?? {}) as Record<string, unknown>
  const currency = typeof meta.currency === 'string' ? meta.currency : null
  const gmtoffset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0

  const timestamps = entry.timestamp
  if (!Array.isArray(timestamps)) {
    // Real, unaltered Yahoo output for a symbol that resolves but publishes
    // no data on that exchange: `meta` and `indicators` only, no `timestamp`
    // key. The symbol is valid, it simply has no series — an empty one, not
    // an exception.
    return { symbol, currency, points: [] }
  }

  const indicators = (entry.indicators ?? {}) as Record<string, unknown>
  const quoteList = indicators.quote
  const closes = Array.isArray(quoteList) && Array.isArray((quoteList[0] as Record<string, unknown> | undefined)?.close)
    ? ((quoteList[0] as Record<string, unknown>).close as unknown[])
    : []

  const points: NavPoint[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i]
    if (typeof close !== 'number') {
      continue
    }
    const timestamp = timestamps[i] as number
    const date = new Date((timestamp + gmtoffset) * 1000).toISOString().slice(0, 10)
    const value = new Decimal(close).toDecimalPlaces(NAV_DECIMALS, Decimal.ROUND_HALF_UP).toString()
    points.push({ date, value })
  }

  return { symbol, currency, points }
}

/** The number of whole days between two ISO dates. */
function daysBetween(from: IsoDate, to: IsoDate): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / msPerDay)
}

/**
 * Picks a Yahoo `range` wide enough to cover `from`, rounding up so the
 * window never falls short. Yahoo has no reliable from/to parameter pair, so
 * the caller over-fetches and clips the parsed points afterwards.
 */
function rangeFor(from: IsoDate, to: IsoDate): string {
  const days = Math.max(0, daysBetween(from, to))
  if (days <= 30) return '1mo'
  if (days <= 90) return '3mo'
  if (days <= 182) return '6mo'
  if (days <= 365) return '1y'
  if (days <= 730) return '2y'
  if (days <= 1825) return '5y'
  if (days <= 3650) return '10y'
  return 'max'
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) {
    throw new PriceProviderError(`Yahoo request failed with status ${response.status} ${response.statusText}: ${url}`)
  }
  return response.json()
}

/**
 * The Yahoo Finance provider. `resolve()` enriches every candidate with its
 * latest price, but never picks one: the same ISIN can publish several
 * share classes at different prices, and only the user's statement says
 * which one they hold. A candidate whose price lookup fails still comes
 * back, with `price` and `priceDate` set to `null`, rather than sinking the
 * whole resolution over one bad symbol.
 */
export function createYahooProvider(options?: { fetchJson?: (url: string) => Promise<unknown> }): PriceProvider {
  const fetchJson = options?.fetchJson ?? defaultFetchJson

  async function fetchLatestPrice(symbol: string): Promise<{ currency: string | null, price: string | null, priceDate: IsoDate | null }> {
    try {
      const chartUrl = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=1mo&interval=1d`
      const payload = await fetchJson(chartUrl)
      const parsed = parseChartResponse(payload, symbol)
      const last = parsed.points.at(-1)
      return {
        currency: parsed.currency,
        price: last?.value ?? null,
        priceDate: last?.date ?? null,
      }
    }
    catch {
      return { currency: null, price: null, priceDate: null }
    }
  }

  return {
    id: 'yahoo',

    async resolve(isin: string): Promise<SymbolCandidate[]> {
      const searchUrl = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(isin)}`
      const payload = await fetchJson(searchUrl)
      const quotes = parseSearchResponse(payload, isin)

      return Promise.all(quotes.map(async (quote) => {
        const { currency, price, priceDate } = await fetchLatestPrice(quote.symbol)
        return {
          symbol: quote.symbol,
          name: quote.name,
          exchange: quote.exchange,
          currency,
          price,
          priceDate,
        }
      }))
    },

    async history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]> {
      const range = rangeFor(from, to)
      const chartUrl = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`
      const payload = await fetchJson(chartUrl)
      const parsed = parseChartResponse(payload, symbol)

      return parsed.points.filter(point => point.date >= from && point.date <= to)
    },
  }
}
