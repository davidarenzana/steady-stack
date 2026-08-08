import { updateRule } from '../../../db/queries'
import { NotFoundError, ValidationError } from '../../../utils/errors'

/**
 * PATCH /api/contributions/rules/:id — `{ amount?, timing?, weights? }`.
 *
 * Refuses a body carrying `fromMonth` at all, even set to `null`, with a
 * 400: per section 4 of the spec, editing a rule must never rewrite the
 * past. A new rule with its own `fromMonth` is how a change takes effect
 * from a given month onward, leaving every earlier month governed exactly
 * as it was.
 */
export default defineEventHandler(async (event) => handle(async () => {
  const id = readIntegerRouteParam(getRouterParam(event, 'id'), 'id')
  const body = await readBody(event)

  if (hasField(body, 'fromMonth')) {
    throw new ValidationError('A rule\'s start month cannot be changed. Add a new rule with its own fromMonth instead')
  }

  const amount = readOptionalCents(body, 'amount')
  const timing = readOptionalTiming(body, 'timing')
  const weights = readOptionalWeights(body, 'weights')

  const rule = updateRule(useDatabase(), id, { amount, timing, weights })
  if (!rule) {
    throw new NotFoundError(`Contribution rule ${id} not found`)
  }
  return rule
}))
