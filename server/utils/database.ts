import { applyMigrations, openDatabase, type AppDatabase } from '../db/client'

const DATABASE_FILE = 'data/steady-stack.db'

let database: AppDatabase | undefined

/**
 * The process-wide database. Opens `data/steady-stack.db` and applies every
 * pending migration the first time a route needs it, so `pnpm dev` on a
 * clean checkout works with no manual migration step. Later calls reuse the
 * same connection: SQLite through `better-sqlite3` is synchronous and a
 * single handle is meant to be shared, not reopened per request.
 */
export function useDatabase(): AppDatabase {
  if (!database) {
    const handle = openDatabase(DATABASE_FILE)
    applyMigrations(handle)
    database = handle.db
  }
  return database
}
