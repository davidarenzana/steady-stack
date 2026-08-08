import type { IsoDate, NavPoint } from '~~/core/types'
import type { PriceProvider, SymbolCandidate } from '../providers/types'

/**
 * A `PriceProvider` that records every call to `history()`, so a test can
 * assert on what was asked for — not only on what the database ended up
 * holding. This is how "requests only the missing days" gets verified: a
 * table full of the right rows says nothing about whether the provider was
 * asked to fetch a year it did not need to.
 */
export interface FakeProvider extends PriceProvider {
  /** Every `history()` call, in the order they happened. */
  readonly calls: Array<{ symbol: string, from: IsoDate, to: IsoDate }>
}

/**
 * Builds a fake provider backed by fixed, in-memory series per symbol.
 * `history()` clips the series of `symbol` to `[from, to]`, both ends
 * included, and records the call before returning. `resolve()` always
 * returns an empty list: nothing under `server/services/` needs it, and the
 * Yahoo and manual providers already have their own tests for it.
 */
export function createFakeProvider(
  id: 'yahoo' | 'manual',
  historyBySymbol: Record<string, NavPoint[]>,
): FakeProvider {
  const calls: Array<{ symbol: string, from: IsoDate, to: IsoDate }> = []

  return {
    id,
    calls,

    async resolve(_isin: string): Promise<SymbolCandidate[]> {
      return []
    },

    async history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]> {
      calls.push({ symbol, from, to })
      const series = historyBySymbol[symbol] ?? []
      return series.filter(point => point.date >= from && point.date <= to)
    },
  }
}
