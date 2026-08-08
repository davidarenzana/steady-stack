import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IsoDate, NavPoint } from '~~/core/types'
import { funds, navs } from '../server/db/schema'
import { seedInitialData, WORLD_FUND_ID, EMERGING_FUND_ID } from '../server/db/seed'
import { createTempDatabase, type TempDatabase } from '../server/test-utils/temp-db'
import { createFakeProvider } from '../server/test-utils/fake-provider'
import type { PriceProvider, SymbolCandidate } from '../server/providers/types'
import { formatFundResult, formatMaterialisationReport, runSync } from './sync-nav'

const WORLD_SYMBOL = '0P0001CLDK.F'
const EMERGING_SYMBOL = '0P00012I6A.F'

const EMERGING_POINTS: NavPoint[] = [
  { date: '2026-08-03', value: '9.9900' },
  { date: '2026-08-04', value: '10.0100' },
]

let temp: TempDatabase

beforeEach(() => {
  temp = createTempDatabase()
})

afterEach(() => {
  temp.close()
})

describe('formatFundResult', () => {
  it('formats a synced fund with Spanish-typography-free plain figures, aligned into columns', () => {
    expect(formatFundResult({
      fundId: 'world',
      status: 'synced',
      from: '2026-08-06',
      to: '2026-08-07',
      received: 3,
      inserted: 3,
      updated: 0,
      skippedManual: 0,
    })).toBe('world      synced      2026-08-06 → 2026-08-07   3 received, 3 new, 0 updated')
  })

  it('mentions a kept manual row rather than dropping it silently', () => {
    expect(formatFundResult({
      fundId: 'world',
      status: 'synced',
      from: '2026-08-06',
      to: '2026-08-07',
      received: 2,
      inserted: 1,
      updated: 0,
      skippedManual: 1,
    })).toBe('world      synced      2026-08-06 → 2026-08-07   2 received, 1 new, 0 updated, 1 kept manual')
  })

  it('formats a fund with no provider symbol', () => {
    expect(formatFundResult({ fundId: 'emerging', status: 'skipped', reason: 'no-symbol' }))
      .toBe('emerging   skipped     no provider symbol — choose one on the funds screen')
  })

  it('formats a fund already up to date', () => {
    expect(formatFundResult({ fundId: 'world', status: 'up-to-date', from: '2026-08-08', to: '2026-08-07' }))
      .toBe('world      up to date  already synced through 2026-08-07')
  })
})

describe('formatMaterialisationReport', () => {
  it('reports the count and every skip with its reason', () => {
    const lines = formatMaterialisationReport({
      created: [{} as any, {} as any],
      skipped: [{ month: '2026-09', reason: 'no-nav' }],
    })

    expect(lines).toEqual([
      'Materialised 2 purchase(s).',
      '  2026-09 skipped — no NAV published yet for that month',
    ])
  })

  it('reports zero purchases and zero skips without failing on an empty result', () => {
    expect(formatMaterialisationReport({ created: [], skipped: [] })).toEqual([
      'Materialised 0 purchase(s).',
    ])
  })
})

describe('runSync', () => {
  function seedWithSymbols(): void {
    seedInitialData(temp.db)
    temp.db.update(funds).set({ providerSymbol: WORLD_SYMBOL }).where(sql`${funds.id} = ${WORLD_FUND_ID}`).run()
    temp.db.update(funds).set({ providerSymbol: EMERGING_SYMBOL }).where(sql`${funds.id} = ${EMERGING_FUND_ID}`).run()
  }

  it('reports every fund as skipped, and never calls the provider, when no fund has a symbol', async () => {
    seedInitialData(temp.db)
    const provider = createFakeProvider('yahoo', {})

    const report = await runSync(temp.db, provider, '2026-08-07')

    expect(report.failureMessage).toBeUndefined()
    expect(report.lines).toEqual([
      'emerging   skipped     no provider symbol — choose one on the funds screen',
      'world      skipped     no provider symbol — choose one on the funds screen',
    ])
    expect(provider.calls).toEqual([])
  })

  it('reports a normal successful sync fund by fund', async () => {
    seedWithSymbols()
    const provider = createFakeProvider('yahoo', {
      [WORLD_SYMBOL]: [{ date: '2026-08-07', value: '15.0000' }],
      [EMERGING_SYMBOL]: EMERGING_POINTS,
    })

    const report = await runSync(temp.db, provider, '2026-08-07')

    expect(report.failureMessage).toBeUndefined()
    expect(report.lines[0]).toContain('emerging   synced')
    expect(report.lines[1]).toContain('world      synced')
  })

  it('reports the funds that committed before a later fund fails, then the failure — never silence about what succeeded', async () => {
    seedWithSymbols()

    // A provider that behaves like the real Yahoo one for `emerging` — the
    // fund processed first, alphabetically — but fails for `world`, the one
    // processed after it. `syncNavs` commits `emerging` in its own
    // transaction, finishes its loop over `world` too, and only then
    // throws: the promise this test awaits never resolves with anything,
    // so the two rows for `emerging` are only visible by reading the table.
    const failing: PriceProvider = {
      id: 'yahoo',
      async resolve(): Promise<SymbolCandidate[]> {
        return []
      },
      async history(symbol: string, from: IsoDate, to: IsoDate): Promise<NavPoint[]> {
        if (symbol === WORLD_SYMBOL) {
          throw new Error('Yahoo request failed with status 500 Internal Server Error')
        }
        return EMERGING_POINTS.filter(point => point.date >= from && point.date <= to)
      },
    }

    const report = await runSync(temp.db, failing, '2026-08-07')

    expect(report.failureMessage).toContain('world')
    expect(report.lines).toEqual([
      'emerging   synced      2 new NAV row(s) committed before the failure reported below',
      'world      error       did not complete — see the failure reported below',
    ])

    // Ground truth: `emerging` really did commit, `world` really did not.
    const emergingRows = temp.db.select().from(navs).where(sql`${navs.fundId} = ${EMERGING_FUND_ID}`).all()
    const worldRows = temp.db.select().from(navs).where(sql`${navs.fundId} = ${WORLD_FUND_ID}`).all()
    expect(emergingRows).toHaveLength(2)
    expect(worldRows).toHaveLength(0)
  })
})
