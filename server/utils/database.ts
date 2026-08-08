import { resolve } from 'node:path'
import { applyMigrations, openDatabase, type AppDatabase } from '../db/client'

/**
 * Where the running server keeps its database. `STEADY_STACK_DATABASE_FILE`
 * wins; relative paths resolve against the working directory. A value that
 * is blank once trimmed — the shape a shell variable takes when it expands
 * to nothing — is treated exactly as if the variable were absent, rather
 * than resolving to a directory named from spaces.
 */
export function resolveDatabaseFile(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.STEADY_STACK_DATABASE_FILE?.trim()
  if (!value) {
    return resolve(process.cwd(), 'data/steady-stack.db')
  }
  return resolve(process.cwd(), value)
}

let database: AppDatabase | undefined

/**
 * The process-wide database. Opens `data/steady-stack.db` — or whatever
 * `STEADY_STACK_DATABASE_FILE` points at — and applies every pending
 * migration the first time a route needs it, so `pnpm dev` on a clean
 * checkout works with no manual migration step. Later calls reuse the same
 * connection: SQLite through `better-sqlite3` is synchronous and a single
 * handle is meant to be shared, not reopened per request.
 */
export function useDatabase(): AppDatabase {
  if (!database) {
    const handle = openDatabase(resolveDatabaseFile())
    applyMigrations(handle)
    database = handle.db
  }
  return database
}
