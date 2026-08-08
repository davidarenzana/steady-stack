import { ConflictError, NotFoundError, ValidationError } from './errors'
import { PriceProviderError } from '../providers/types'

/**
 * The only module outside `server/api/` allowed to touch an `h3` /
 * Nitro auto-import. Everything under `server/db`, `server/providers`,
 * `server/services` and `scripts` is loaded unmodified by Vitest and by
 * `tsx`, where `createError` and `h3` are not resolvable — this is the
 * seam that keeps that true.
 *
 * Runs `fn` and turns a recognised domain error into the equivalent H3
 * error. `createError` is a Nitro auto-import, available inside
 * `server/api/**`; anything unrecognised is rethrown untouched and becomes
 * a plain 500, with no risk of leaking a file path or a SQL fragment in its
 * message.
 */
export async function handle<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn()
  }
  catch (error) {
    if (error instanceof ValidationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    if (error instanceof NotFoundError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    if (error instanceof ConflictError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    if (error instanceof PriceProviderError) {
      throw createError({ statusCode: 502, statusMessage: error.message })
    }
    throw error
  }
}
