import Database from 'better-sqlite3'
import { insertRule } from '../../../db/queries'
import { ConflictError } from '../../../utils/errors'

/**
 * POST /api/contributions/rules — `{ fromMonth, amount, timing, weights }`, 201.
 *
 * `fromMonth` is not checked for uniqueness up front: the unique index
 * `contribution_rule_month_unique` is the single source of truth for "is
 * this month already governed", and catching its violation here — rather
 * than a separate `SELECT` that could race it — is what the plan asks for.
 */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return handle(async () => {
    const body = await readBody(event)
    const fromMonth = readMonth(body, 'fromMonth')
    const amount = readCents(body, 'amount')
    const timing = readTiming(body, 'timing')
    const weights = readWeights(body, 'weights')

    try {
      return insertRule(useDatabase(), { fromMonth, amount, timing, weights })
    }
    catch (error) {
      if (error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ConflictError(`A contribution rule already governs "${fromMonth}"`)
      }
      throw error
    }
  })
})
