import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyMigrations, openDatabase, type AppDatabase } from '../db/client'

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
 */
export function createTempDatabase(): TempDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'steady-stack-test-'))
  const resolvedTmpdir = realpathSync(tmpdir())

  if (!realpathSync(dir).startsWith(resolvedTmpdir)) {
    throw new Error(`Refusing to create a test database outside the system temp directory: ${dir}`)
  }

  const path = join(dir, 'test.db')
  const handle = openDatabase(path)
  applyMigrations(handle)

  return {
    db: handle.db,
    path,
    close() {
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
