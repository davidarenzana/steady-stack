import { listNavs } from '../../db/queries'

/** GET /api/nav?fundId=&from=&to= — a fund's quotes, `from` and `to` both optional and inclusive. */
export default defineEventHandler(async (event) => handle(async () => {
  const query = getQuery(event)
  const fundId = readString(query, 'fundId')
  const from = query.from ? readIsoDate(query, 'from') : undefined
  const to = query.to ? readIsoDate(query, 'to') : undefined

  const rows = listNavs(useDatabase(), fundId, from, to)
  return {
    fundId,
    navs: rows.map((row) => ({ date: row.date, value: row.value, source: row.source })),
  }
}))
