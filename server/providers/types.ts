import type { IsoDate, NavPoint } from '~~/core/types'

/**
 * One of the symbols a provider offers for an ISIN. Several symbols can
 * quote the same ISIN at different prices — different share classes of the
 * same fund, for instance — so `resolve()` returns every candidate and never
 * picks one: the user chooses the one matching their statement.
 */
export interface SymbolCandidate {
  symbol: string
  name: string
  exchange: string
  currency: string | null
  /** Latest published price as a decimal string, or null when unavailable. */
  price: string | null
  /** The date `price` corresponds to. NAVs publish with about a day of lag. */
  priceDate: IsoDate | null
}

/**
 * The contract both price providers satisfy: Yahoo Finance and the
 * hand-maintained list. Implementations live under `server/providers/` and
 * must import neither `h3` nor `ofetch` nor rely on Nitro auto-imports, so
 * they load the same way under Vitest, under `tsx` and under Nitro.
 */
export interface PriceProvider {
  /** Stored in `nav.source`. */
  readonly id: 'yahoo' | 'manual'
  /** Every candidate the provider offers, in the order it offers them. */
  resolve(isin: string): Promise<SymbolCandidate[]>
  /** Net asset values in `[from, to]`, ascending by date, with no gaps and no nulls. */
  history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]>
}

/** Raised when a provider cannot fulfil a request — a network failure, an unknown symbol, a malformed response. */
export class PriceProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PriceProviderError'
  }
}
