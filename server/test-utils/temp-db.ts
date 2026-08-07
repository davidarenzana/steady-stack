import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { applyMigrations, openDatabase, type DatabaseHandle, type AppDatabase } from '../db/client'

export interface TempDatabase {
  db: AppDatabase
  path: string
  close(): void
}

/**
 * Creates a freshly migrated database under the system temp directory, one
 * file per call, so integration tests never collide and never touch
 * `data/steady-stack.db`.
 *
 * The directory check is not decorative: it is the only thing standing
 * between a bug in this helper and a test writing to the real database.
 *
 * Any failure after the directory is created — the guard tripping, opening
 * the connection, or applying migrations — closes the connection if one was
 * opened and removes the directory before rethrowing, so a setup failure
 * never leaves an orphan directory in the system temp dir.
 */
export function createTempDatabase(): TempDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'steady-stack-test-'))
  let handle: DatabaseHandle | undefined

  try {
    const resolvedTmpdir = realpathSync(tmpdir())

    // Bounded on the path separator, not a raw string prefix: `/tmp-evil`
    // starts with the string `/tmp` but is not nested under it.
    if (!realpathSync(dir).startsWith(resolvedTmpdir + sep)) {
      throw new Error(`Refusing to create a test database outside the system temp directory: ${dir}`)
    }

    const path = join(dir, 'test.db')
    handle = openDatabase(path)
    applyMigrations(handle)

    return {
      db: handle.db,
      path,
      close() {
        handle!.close()
        rmSync(dir, { recursive: true, force: true })
      },
    }
  }
  catch (error) {
    handle?.close()
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}
