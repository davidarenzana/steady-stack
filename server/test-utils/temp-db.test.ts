import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('createTempDatabase', () => {
  afterEach(() => {
    vi.doUnmock('../db/client')
    vi.doUnmock('node:fs')
    vi.resetModules()
  })

  it('leaves nothing behind when migration fails after the directory is created', async () => {
    // Capture exactly the directory this call creates. Other test files run
    // concurrently and create and remove their own temp directories, so
    // diffing a listing of the whole temp dir would be racy; checking one
    // specific, known path is not.
    let capturedDir: string | undefined

    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
      return {
        ...actual,
        mkdtempSync: (...args: Parameters<typeof actual.mkdtempSync>) => {
          capturedDir = actual.mkdtempSync(...args)
          return capturedDir
        },
      }
    })
    vi.doMock('../db/client', async () => {
      const actual = await vi.importActual<typeof import('../db/client')>('../db/client')
      return {
        ...actual,
        applyMigrations: () => {
          throw new Error('simulated migration failure')
        },
      }
    })

    const { createTempDatabase } = await import('./temp-db')

    expect(() => createTempDatabase()).toThrow('simulated migration failure')
    expect(capturedDir).toBeDefined()
    expect(existsSync(capturedDir!)).toBe(false)
  })
})

describe('the temp-directory guard', () => {
  afterEach(() => {
    vi.doUnmock('node:fs')
    vi.doUnmock('node:os')
    vi.resetModules()
  })

  it('rejects a sibling directory that only shares the temp dir as a string prefix', async () => {
    // A directory such as `/tmp-evil/x` is not under `/tmp`, but the string
    // `/tmp-evil/x` does start with the string `/tmp`. The guard must compare
    // path segments, not raw prefixes.
    vi.doMock('node:os', async () => {
      const actual = await vi.importActual<typeof import('node:os')>('node:os')
      return { ...actual, tmpdir: () => '/tmp' }
    })
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
      return {
        ...actual,
        mkdtempSync: () => '/tmp-evil/steady-stack-test-x',
        realpathSync: (path: string) => (path === '/tmp' ? '/tmp' : '/tmp-evil/steady-stack-test-x'),
      }
    })

    const { createTempDatabase } = await import('./temp-db')

    expect(() => createTempDatabase())
      .toThrow(/Refusing to create a test database outside the system temp directory/)
  })
})
