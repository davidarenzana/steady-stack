import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

/**
 * Locates the Drizzle migrations directory.
 *
 * `STEADY_STACK_MIGRATIONS_DIR` wins when set and non-empty: this is what
 * lets a route test point a server subprocess at the migrations folder it
 * already resolved correctly in the parent process (see
 * `server/test-utils/route-server.ts`), and what a `.output` production
 * build started outside the project root would need to set explicitly.
 *
 * Otherwise, `import.meta.url` is the next strategy — it resolves correctly
 * for Vitest and for `tsx`, which both run this file from its own location
 * on disk, regardless of the process's working directory.
 *
 * It does not resolve correctly once Nitro bundles this module for `nuxt
 * dev` or `nuxt build`: rollup rewrites every `import.meta.url` in the
 * bundle to the bundle's own location, not each source file's original one,
 * so the `./migrations` folder next to it is never found. `nuxt dev` and
 * `nuxt build` both run from the project root, so falling back to a path
 * resolved from `process.cwd()` recovers it there. This fallback has not
 * been verified against a `.output` production build, where the working
 * directory at start-up is not guaranteed to be the project root.
 */
export function resolveMigrationsFolder(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.STEADY_STACK_MIGRATIONS_DIR
  if (configured) {
    return resolve(process.cwd(), configured)
  }
  const bundled = fileURLToPath(new URL('./migrations', import.meta.url))
  if (existsSync(join(bundled, 'meta', '_journal.json'))) {
    return bundled
  }
  return resolve(process.cwd(), 'server/db/migrations')
}

export const MIGRATIONS_FOLDER = resolveMigrationsFolder()

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseHandle {
  db: AppDatabase
  sqlite: Database.Database
  close(): void
}

/**
 * Opens a SQLite database at `filePath`, creating the parent directory if
 * needed. Foreign keys are off by default in SQLite and must be turned on
 * per connection, or a purchase could reference a fund that does not exist.
 */
export function openDatabase(filePath: string): DatabaseHandle {
  mkdirSync(dirname(filePath), { recursive: true })

  const sqlite = new Database(filePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })

  return {
    db,
    sqlite,
    close() {
      sqlite.close()
    },
  }
}

/** Applies every migration under `MIGRATIONS_FOLDER` to the given handle. */
export function applyMigrations(handle: DatabaseHandle): void {
  migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER })
}
