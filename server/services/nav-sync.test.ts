import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NavPoint } from '~~/core/types'
import { funds, navs, portfolios } from '../db/schema'
import { PORTFOLIO_ID } from '../db/queries'
import { seedInitialData, WORLD_FUND_ID, EMERGING_FUND_ID } from '../db/seed'
import { createTempDatabase, type TempDatabase } from '../test-utils/temp-db'
import { createFakeProvider } from '../test-utils/fake-provider'
import { PriceProviderError } from '../providers/types'
import { syncNavs, syncNavsWithPartialReport } from './nav-sync'

const WORLD_SYMBOL = '0P0001CLDK.F'
const EMERGING_SYMBOL = '0P00012I6A.F'

const WORLD: NavPoint[] = [
  { date: '2026-08-03', value: '14.8321' },
  { date: '2026-08-04', value: '14.9100' },
  { date: '2026-08-05', value: '15.0000' },
]
const EMERGING: NavPoint[] = [
  { date: '2026-08-03', value: '9.9900' },
  { date: '2026-08-04', value: '10.0100' },
  { date: '2026-08-05', value: '10.1000' },
]

let temp: TempDatabase

/** Seeds the portfolio, the two funds with their provider symbols set, and the two rules. */
function seed(): void {
  seedInitialData(temp.db)
  temp.db.update(funds).set({ providerSymbol: WORLD_SYMBOL }).where(sql`${funds.id} = ${WORLD_FUND_ID}`).run()
  temp.db.update(funds).set({ providerSymbol: EMERGING_SYMBOL }).where(sql`${funds.id} = ${EMERGING_FUND_ID}`).run()
}

function countNavRows(): number {
  return temp.db.select().from(navs).all().length
}

beforeEach(() => {
  temp = createTempDatabase()
  seed()
})

afterEach(() => {
  temp.close()
})

describe('syncNavs', () => {
  it('stores every point on the first run', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05' })

    expect(countNavRows()).toBe(6)
    expect(result.funds.find(f => f.fundId === 'world')).toEqual({
      fundId: 'world',
      status: 'synced',
      from: '2026-07-01',
      to: '2026-08-05',
      received: 3,
      inserted: 3,
      updated: 0,
      skippedManual: 0,
    })
  })

  it('duplicates nothing on a second run with the same today', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    await syncNavs(temp.db, provider, { today: '2026-08-05' })
    expect(countNavRows()).toBe(6)

    const second = await syncNavs(temp.db, provider, { today: '2026-08-05' })
    expect(countNavRows()).toBe(6)
    expect(second.funds.find(f => f.fundId === 'world')?.inserted).toBe(0)
  })

  it('asks the provider only for the days missing after the first run', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    await syncNavs(temp.db, provider, { today: '2026-08-05' })
    // A day has passed and there is a new close to fetch, but the run must
    // not re-request 2026-07-01 through 2026-08-05: those are already stored.
    await syncNavs(temp.db, provider, { today: '2026-08-06' })

    const worldCalls = provider.calls.filter(c => c.symbol === WORLD_SYMBOL)
    expect(worldCalls.at(-1)).toEqual({ symbol: WORLD_SYMBOL, from: '2026-08-06', to: '2026-08-06' })
  })

  it('never overwrites a NAV entered by hand', async () => {
    temp.db.insert(navs).values({ fundId: 'world', date: '2026-08-04', value: '99.0000', source: 'manual' }).run()

    const provider = createFakeProvider('yahoo', {
      [WORLD_SYMBOL]: WORLD,
      [EMERGING_SYMBOL]: [],
    })

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05' })

    const manualRow = temp.db.select().from(navs)
      .where(sql`${navs.fundId} = 'world' and ${navs.date} = '2026-08-04'`)
      .get()
    expect(manualRow).toEqual(expect.objectContaining({ value: '99.0000', source: 'manual' }))
    expect(result.funds.find(f => f.fundId === 'world')?.skippedManual).toBe(1)
  })

  it('skips a fund with no provider symbol without failing the run', async () => {
    temp.db.update(funds).set({ providerSymbol: null }).where(sql`${funds.id} = 'emerging'`).run()

    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05' })

    expect(result.funds.find(f => f.fundId === 'emerging')).toEqual({
      fundId: 'emerging',
      status: 'skipped',
      reason: 'no-symbol',
    })
    expect(result.funds.find(f => f.fundId === 'world')?.status).toBe('synced')
  })

  it('does not call the provider again once a fund is up to date', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    await syncNavs(temp.db, provider, { today: '2026-08-05' })
    const callsAfterFirstRun = provider.calls.length

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05' })

    expect(provider.calls.length).toBe(callsAfterFirstRun)
    expect(result.funds.find(f => f.fundId === 'world')).toEqual({
      fundId: 'world',
      status: 'up-to-date',
      from: '2026-08-06',
      to: '2026-08-05',
      received: 0,
      inserted: 0,
      updated: 0,
      skippedManual: 0,
    })
  })

  it('restricts the run to the funds named in fundIds', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05', fundIds: ['world'] })

    expect(result.funds).toHaveLength(1)
    expect(result.funds[0]!.fundId).toBe('world')
    expect(temp.db.select().from(navs).where(sql`${navs.fundId} = 'emerging'`).all()).toHaveLength(0)
  })

  it('propagates a provider failure as a PriceProviderError naming the fund, after committing the funds that succeeded', async () => {
    const failing = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })
    const originalHistory = failing.history.bind(failing)
    failing.history = async (symbol: string, from: string, to: string) => {
      if (symbol === EMERGING_SYMBOL) {
        throw new Error('network unreachable')
      }
      return originalHistory(symbol, from, to)
    }

    // 'emerging' sorts before 'world' alphabetically, so it fails first;
    // 'world' is still attempted afterwards and its rows must be committed.
    let caught: unknown
    try {
      await syncNavs(temp.db, failing, { today: '2026-08-05' })
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(PriceProviderError)
    expect((caught as Error).message).toBe('Failed to sync fund "emerging": network unreachable')
    expect(temp.db.select().from(navs).where(sql`${navs.fundId} = 'world'`).all()).toHaveLength(3)
  })

  it('returns an empty result and calls nothing when the portfolio has no funds', async () => {
    const empty = createTempDatabase()
    try {
      const provider = createFakeProvider('yahoo', {})

      const result = await syncNavs(empty.db, provider, { today: '2026-08-05' })

      expect(result).toEqual({ funds: [] })
      expect(provider.calls).toEqual([])
    }
    finally {
      empty.close()
    }
  })

  it('ignores an id in fundIds that does not exist, without throwing', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    const result = await syncNavs(temp.db, provider, { today: '2026-08-05', fundIds: ['ghost'] })

    expect(result).toEqual({ funds: [] })
    expect(provider.calls).toEqual([])
  })

  it('falls back to today itself when a fund has no NAV, no fallbackFrom and no rule to anchor on', async () => {
    const bare = createTempDatabase()
    try {
      // A portfolio and its fund, but no contribution rule at all.
      bare.db.insert(portfolios).values({ id: PORTFOLIO_ID, name: 'Cartera indexada' }).run()
      bare.db.insert(funds).values({
        id: 'world',
        isin: 'IE00BYX5NX33',
        name: 'Fidelity MSCI World',
        providerSymbol: WORLD_SYMBOL,
      }).run()

      const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD })

      const result = await syncNavs(bare.db, provider, { today: '2026-08-05' })

      expect(result.funds).toEqual([{
        fundId: 'world',
        status: 'synced',
        from: '2026-08-05',
        to: '2026-08-05',
        received: 1,
        inserted: 1,
        updated: 0,
        skippedManual: 0,
      }])
      expect(provider.calls).toEqual([{ symbol: WORLD_SYMBOL, from: '2026-08-05', to: '2026-08-05' }])
    }
    finally {
      bare.close()
    }
  })
})

describe('syncNavsWithPartialReport', () => {
  it('reports exactly what syncNavs reports when nothing fails', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    const outcome = await syncNavsWithPartialReport(temp.db, provider, { today: '2026-08-05' })

    expect(outcome.failureMessage).toBeUndefined()
    expect(outcome.funds.find(f => f.fundId === 'world')).toEqual({
      fundId: 'world',
      status: 'synced',
      from: '2026-07-01',
      to: '2026-08-05',
      received: 3,
      inserted: 3,
      updated: 0,
      skippedManual: 0,
    })
  })

  it('reports the funds that committed before a later fund failed, instead of dropping them', async () => {
    // 'emerging' sorts before 'world' alphabetically, so it fails first and
    // 'world' is the fund ordered after it whose rows still land.
    const failing = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })
    const originalHistory = failing.history.bind(failing)
    failing.history = async (symbol: string, from: string, to: string) => {
      if (symbol === EMERGING_SYMBOL) {
        throw new Error('network unreachable')
      }
      return originalHistory(symbol, from, to)
    }

    const outcome = await syncNavsWithPartialReport(temp.db, failing, { today: '2026-08-05' })

    expect(outcome.failureMessage).toBe('Failed to sync fund "emerging": network unreachable')
    expect(outcome.funds.find(f => f.fundId === 'world')).toEqual({
      fundId: 'world',
      status: 'synced',
      received: 3,
      inserted: 3,
      updated: 0,
      skippedManual: 0,
    })
    expect(outcome.funds.find(f => f.fundId === 'emerging')).toEqual({
      fundId: 'emerging',
      status: 'incomplete',
    })
  })

  it('still reports a fund with no provider symbol as skipped, even when another fund fails', async () => {
    temp.db.update(funds).set({ providerSymbol: null }).where(sql`${funds.id} = 'emerging'`).run()

    const failing = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD })
    failing.history = async () => {
      throw new Error('network unreachable')
    }

    const outcome = await syncNavsWithPartialReport(temp.db, failing, { today: '2026-08-05' })

    expect(outcome.failureMessage).toBe('Failed to sync fund "world": network unreachable')
    expect(outcome.funds.find(f => f.fundId === 'emerging')).toEqual({
      fundId: 'emerging',
      status: 'skipped',
      reason: 'no-symbol',
    })
    expect(outcome.funds.find(f => f.fundId === 'world')).toEqual({
      fundId: 'world',
      status: 'incomplete',
    })
  })

  it('propagates a failure that is not a PriceProviderError unchanged, rather than reshaping it into a report', async () => {
    // Stands in for a bug in the database layer rather than a provider
    // outage: a trigger that fails only on INSERT lets every read syncNavs
    // does (the counts, latestProviderNavDate) succeed, and only the write
    // inside its transaction — outside the try/catch that wraps
    // provider.history() into a PriceProviderError — throws SQLite's own
    // error.
    temp.db.run(sql`CREATE TRIGGER fail_insert BEFORE INSERT ON nav BEGIN SELECT RAISE(ABORT, 'simulated database bug'); END`)
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    let caught: unknown
    try {
      await syncNavsWithPartialReport(temp.db, provider, { today: '2026-08-05' })
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeDefined()
    expect(caught).not.toBeInstanceOf(PriceProviderError)
  })

  it('does not duplicate rows when called twice with the same today, even through the partial-report wrapper', async () => {
    const provider = createFakeProvider('yahoo', { [WORLD_SYMBOL]: WORLD, [EMERGING_SYMBOL]: EMERGING })

    await syncNavsWithPartialReport(temp.db, provider, { today: '2026-08-05' })
    await syncNavsWithPartialReport(temp.db, provider, { today: '2026-08-05' })

    expect(countNavRows()).toBe(6)
  })
})
