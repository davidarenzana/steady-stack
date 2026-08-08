import type { IsoDate } from '~~/core/types'

/**
 * The current date, as `YYYY-MM-DD`. This is the single place in the whole
 * project allowed to read the system clock: every function in `core/` and
 * every service takes the current date as a parameter precisely so nothing
 * else needs to.
 */
export function today(): IsoDate {
  return new Date().toISOString().slice(0, 10)
}
