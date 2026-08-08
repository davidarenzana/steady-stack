import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { MIGRATIONS_FOLDER } from '../db/client'
import { seedInitialData } from '../db/seed'
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
    },
  })

  return temp
}
