import type { NavPoint, IsoDate } from '~~/core/types'
import type { PriceProvider, SymbolCandidate } from './types'

/**
 * A provider backed by a hand-maintained list of net asset values, kept
 * entirely in memory. Two jobs: let a fund with no Yahoo symbol be synced
 * from figures typed in by hand, and stand in as the provider whose entries
 * always prevail over Yahoo's, per the precedence rule in spec section 6.
 *
 * Holding its entries in memory rather than reading them from the database
 * keeps `server/providers/` free of any Drizzle import.
 */
export function createManualProvider(entriesBySymbol: Record<string, NavPoint[]>): PriceProvider {
  return {
    id: 'manual',

    // A hand-kept list has no catalogue to search: nothing to resolve an
    // ISIN against, so every ISIN yields no candidates.
    async resolve(_isin: string): Promise<SymbolCandidate[]> {
      return []
    },

    async history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]> {
      const entries = entriesBySymbol[symbol] ?? []
      return entries
        .filter(entry => entry.date >= from && entry.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
    },
  }
}
