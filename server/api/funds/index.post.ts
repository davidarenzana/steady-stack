import { getFund, getFundByIsin, insertFund } from '../../db/queries'
import { ConflictError } from '../../utils/errors'

/**
 * POST /api/funds — `{ id, isin, name, providerSymbol?, currency? }`, 201.
 *
 * `id` and `isin` are checked for uniqueness before the insert, rather than
 * catching the database's own unique-index error, so the 409 can name which
 * of the two collided instead of a generic "already exists".
 */
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201)
  return handle(async () => {
    const body = await readBody(event)
    const id = readNonEmptyString(body, 'id')
    const isin = readNonEmptyString(body, 'isin')
    const name = readNonEmptyString(body, 'name')
    const providerSymbol = readOptionalString(body, 'providerSymbol')
    const currency = readOptionalString(body, 'currency')

    const db = useDatabase()
    if (getFund(db, id)) {
      throw new ConflictError(`Fund "${id}" already exists`)
    }
    if (getFundByIsin(db, isin)) {
      throw new ConflictError(`ISIN "${isin}" is already used by another fund`)
    }

    return insertFund(db, { id, isin, name, providerSymbol, currency })
  })
})
