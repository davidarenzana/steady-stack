import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
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

/**
 * `fetch`, re-exported by `@nuxt/test-utils/e2e` for status-code assertions
 * (`$fetch` throws on a non-2xx response instead of returning it), is the
 * plain global `fetch` — not `ofetch`. It does not serialise a JS object
 * body, and it has no `query` shorthand. Passing `{ body: { horizonYears: 0
 * } }` straight to it does not throw: the body silently stringifies to
 * `"[object Object]"`, the server reads that as no usable JSON, the
 * optional field is treated as absent, and a test written to expect a 400
 * gets back a 200. That reads as the handler being broken, not the test —
 * it cost real time to trace once, which is why these two helpers exist
 * rather than a comment asking the next person to remember.
 *
 * Kept deliberately thin: this is a test harness, not an HTTP client. Both
 * the status code and the parsed body stay visible to the caller, because a
 * status-code test needs the `Response` and a body test needs the JSON.
 */

/** Sends a JSON body through the plain `fetch` above, with the header a real client would set for you. `body` is stringified only when given, so a bodiless request — a DELETE, most often — is unaffected. */
export function fetchJson(path: string, options: { method: string, body?: unknown }): Promise<Response> {
  return fetch(path, {
    method: options.method,
    headers: { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

/** Appends a query string built from `params` to `path`, for the same plain `fetch`, which — unlike `$fetch` — takes no `query` option to do this for you. */
export function withQuery(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString()
  return query.length === 0 ? path : `${path}?${query}`
}
