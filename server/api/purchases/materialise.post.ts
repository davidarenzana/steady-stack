import { monthOf } from '~~/core/dates'
import { materialiseContributions } from '../../services/materialisation'

/**
 * POST /api/purchases/materialise — `{ throughMonth?: Month }`, defaulting
 * to the month `today()` falls in. Turns the derived contribution series
 * into stored purchases, per spec section 11.
 *
 * Idempotent and insert-only: `materialiseContributions` skips a month that
 * already has a purchase row with `reason: 'already-materialised'` and
 * never updates or deletes one, because an executed purchase is a
 * historical fact. Running this route twice with the same `throughMonth`
 * creates the purchases once.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const body = await readBody(event)
  const throughMonth = readOptionalMonth(body, 'throughMonth')

  return materialiseContributions(useDatabase(), { throughMonth: throughMonth ?? monthOf(today()) })
}))
