import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { MIGRATIONS_FOLDER } from '../db/client'
import { seedInitialData } from '../db/seed'
import { YAHOO_FIXTURES_DIR } from '../providers/yahoo'
import { createTempDatabase, type TempDatabase } from './temp-db'

/**
 * Boots a real Nuxt server for one test file, pointed at a throwaway SQLite
 * file under `os.tmpdir()`, and returns the handle to that database so a
 * test can arrange rows directly instead of through HTTP.
 *
 * The server runs as a real subprocess built by `@nuxt/test-utils` — this is
 * what lets `h3` and Nitro auto-imports resolve at all, the same constraint
 * that confines them to `server/api/**` under plain Vitest. There is no
 * cheaper way to exercise a route handler from this repository.
 *
 * The subprocess also gets `STEADY_STACK_FORBID_NETWORK`, so a handler that
 * reaches Yahoo's real API fails loudly with a `PriceProviderError` naming
 * the URL instead of opening a socket, and `STEADY_STACK_YAHOO_FIXTURES_DIR`,
 * so a call this repository has a recorded fixture for is served from disk
 * instead of refused. Both are read by `defaultFetchJson` in
 * `server/providers/yahoo.ts`.
 */
export async function setupRouteServer(options?: { seed?: boolean }): Promise<TempDatabase> {
  const temp = createTempDatabase()

  if (options?.seed !== false) {
    seedInitialData(temp.db)
  }

  // Registered before `setup()` so that Vitest's last-registered-first
  // ordering closes and removes the temporary database only *after*
  // `@nuxt/test-utils` has stopped the server subprocess that was using it.
  afterAll(() => temp.close())

  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    server: true,
    build: true,
    nuxtConfig: { compatibilityDate: '2026-08-06' },
    env: {
      STEADY_STACK_DATABASE_FILE: temp.path,
      STEADY_STACK_MIGRATIONS_DIR: MIGRATIONS_FOLDER,
      // Structural, not conventional: a route that reaches
      // `defaultFetchJson` anyway fails loudly instead of opening a socket.
      // See the network guard in `server/providers/yahoo.ts`.
      STEADY_STACK_FORBID_NETWORK: '1',
      STEADY_STACK_YAHOO_FIXTURES_DIR: YAHOO_FIXTURES_DIR,
    },
  })

  return temp
}
