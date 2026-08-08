import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { purchases, funds, portfolios } from './schema'
import { createTempDatabase } from '../test-utils/temp-db'
import { MIGRATIONS_FOLDER, resolveMigrationsFolder } from './client'

describe('MIGRATIONS_FOLDER', () => {
  it('points at server/db/migrations, already applied', () => {
    expect(MIGRATIONS_FOLDER.endsWith('server/db/migrations')).toBe(true)
    expect(existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)).toBe(true)
  })
})

describe('resolveMigrationsFolder', () => {
  it('returns STEADY_STACK_MIGRATIONS_DIR resolved to an absolute path when set', () => {
    const env = { STEADY_STACK_MIGRATIONS_DIR: 'somewhere/migrations' }
    expect(resolveMigrationsFolder(env)).toBe(
      `${process.cwd()}/somewhere/migrations`,
    )
  })

  it('falls back to the default strategy when the variable is unset', () => {
    expect(resolveMigrationsFolder({})).toBe(MIGRATIONS_FOLDER)
  })

  it('treats an empty string as unset', () => {
    const env = { STEADY_STACK_MIGRATIONS_DIR: '' }
    expect(resolveMigrationsFolder(env)).toBe(MIGRATIONS_FOLDER)
  })
})

describe('createTempDatabase', () => {
  it('creates a migrated database outside the repository', () => {
    const temp = createTempDatabase()
    try {
      expect(existsSync(temp.path)).toBe(true)
      expect(temp.path).not.toContain('steady-stack/data')
    }
    finally {
      temp.close()
    }
  })

  it('removes the file on close', () => {
    const temp = createTempDatabase()
    const { path } = temp
    temp.close()

    expect(existsSync(path)).toBe(false)
  })

  it('hands out an isolated database on every call', () => {
    const a = createTempDatabase()
    const b = createTempDatabase()
    try {
      expect(a.path).not.toBe(b.path)
    }
    finally {
      a.close()
      b.close()
    }
  })
})

describe('the migrated schema', () => {
  it('writes and reads back a purchase without touching the numbers', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({
        id: 'world',
        isin: 'IE00BYX5NX33',
        name: 'Fidelity MSCI World Index Fund EUR P Acc',
      }).run()

      temp.db.insert(purchases).values({
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }).run()

      const rows = temp.db.select().from(purchases).where(eq(purchases.fundId, 'world')).all()

      expect(rows).toEqual([{
        id: 1,
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }])
    }
    finally {
      temp.close()
    }
  })

  it('refuses a second auto purchase for the same fund and month', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity' }).run()

      const row = {
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto' as const,
      }
      temp.db.insert(purchases).values(row).run()

      expect(() => temp.db.insert(purchases).values(row).run()).toThrow(/UNIQUE/)
    }
    finally {
      temp.close()
    }
  })

  it('allows two manual purchases for the same fund and month', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()
      temp.db.insert(funds).values({ id: 'world', isin: 'IE00BYX5NX33', name: 'Fidelity' }).run()

      const row = {
        portfolioId: 'index',
        fundId: 'world',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'manual' as const,
      }
      temp.db.insert(purchases).values(row).run()
      temp.db.insert(purchases).values(row).run()

      expect(temp.db.select().from(purchases).all()).toHaveLength(2)
    }
    finally {
      temp.close()
    }
  })

  it('rejects a purchase pointing at a fund that does not exist', () => {
    const temp = createTempDatabase()
    try {
      temp.db.insert(portfolios).values({ id: 'index', name: 'Cartera indexada' }).run()

      expect(() => temp.db.insert(purchases).values({
        portfolioId: 'index',
        fundId: 'ghost',
        month: '2026-08',
        date: '2026-08-03',
        amount: 16_000,
        nav: '14.8321',
        units: '10.787414',
        source: 'auto',
      }).run()).toThrow(/FOREIGN KEY/)
    }
    finally {
      temp.close()
    }
  })
})
