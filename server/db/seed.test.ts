import { asc } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTempDatabase } from '../test-utils/temp-db'
import { seedInitialData } from './seed'
import { contributionRules, funds, portfolios, scenarios } from './schema'
import { toContributionRule } from './mappers'

describe('seedInitialData', () => {
  it('writes the portfolio of section 13 of the spec', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)

      expect(temp.db.select().from(portfolios).all()).toEqual([
        { id: 'index', name: 'Cartera indexada', currency: 'EUR', horizonYears: 25 },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the two funds by ISIN, with no symbol chosen', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const rows = temp.db.select().from(funds).orderBy(asc(funds.id)).all()

      expect(rows).toEqual([
        {
          id: 'emerging',
          isin: 'IE0031786696',
          name: 'Vanguard Emerging Markets Stock Index Fund Inv EUR Acc',
          providerSymbol: null,
          currency: 'EUR',
        },
        {
          id: 'world',
          isin: 'IE00BYX5NX33',
          name: 'Fidelity MSCI World Index Fund EUR P Acc',
          providerSymbol: null,
          currency: 'EUR',
        },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the initial 2.000 € and the recurring 200 €/month, both at 80/20', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const rules = temp.db.select().from(contributionRules).all().map(toContributionRule)

      expect(rules).toEqual([
        {
          fromMonth: '2026-07',
          amount: 200_000,
          timing: 'start',
          weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
        },
        {
          fromMonth: '2026-08',
          amount: 20_000,
          timing: 'start',
          weights: [{ fundId: 'world', weight: 0.8 }, { fundId: 'emerging', weight: 0.2 }],
        },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('writes the three scenarios at 0 %, 5 % and 9 %', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)

      expect(temp.db.select().from(scenarios).orderBy(asc(scenarios.annualRate)).all()).toEqual([
        { id: 'flat', name: 'Sin interés', annualRate: '0', color: 'chart-3', enabled: 1 },
        { id: 'moderate', name: 'Escenario 1', annualRate: '0.05', color: 'chart-2', enabled: 1 },
        { id: 'optimistic', name: 'Escenario 2', annualRate: '0.09', color: 'chart-1', enabled: 1 },
      ])
    }
    finally {
      temp.close()
    }
  })

  it('is idempotent: seeding twice changes nothing', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      const before = {
        portfolios: temp.db.select().from(portfolios).all(),
        funds: temp.db.select().from(funds).all(),
        rules: temp.db.select().from(contributionRules).all(),
        scenarios: temp.db.select().from(scenarios).all(),
      }

      seedInitialData(temp.db)

      expect({
        portfolios: temp.db.select().from(portfolios).all(),
        funds: temp.db.select().from(funds).all(),
        rules: temp.db.select().from(contributionRules).all(),
        scenarios: temp.db.select().from(scenarios).all(),
      }).toEqual(before)
    }
    finally {
      temp.close()
    }
  })

  it('does not overwrite a symbol the user has already chosen', () => {
    const temp = createTempDatabase()
    try {
      seedInitialData(temp.db)
      temp.db.update(funds).set({ providerSymbol: '0P0001CLDK.F' }).run()

      seedInitialData(temp.db)

      const world = temp.db.select().from(funds).all().find((f) => f.id === 'world')
      expect(world?.providerSymbol).toBe('0P0001CLDK.F')
    }
    finally {
      temp.close()
    }
  })
})
