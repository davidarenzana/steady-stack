/**
 * `pnpm sync:nav` — downloads the missing NAVs for every fund with a
 * provider symbol set, then, with `--materialise`, turns every contribution
 * month that has arrived into stored purchases.
 *
 * Run as often as wanted: `syncNavs` only asks the provider for the days
 * missing since the last sync, so a same-day rerun asks for nothing and
 * changes nothing. Section 9 of the spec asks for a button and a script;
 * this is the script, meant to run from a shell or a scheduled job while
 * the button (plan 4's read model and interface) does not exist yet.
 */
import { pathToFileURL } from 'node:url'
import { monthOf } from '~~/core/dates'
import { applyMigrations, openDatabase, type AppDatabase } from '../server/db/client'
import { listFunds, listNavs } from '../server/db/queries'
import { materialiseContributions, type MaterialisationResult, type SkipReason } from '../server/services/materialisation'
import { syncNavs, type NavSyncFundResult } from '../server/services/nav-sync'
import { createYahooProvider } from '../server/providers/yahoo'
import type { PriceProvider } from '../server/providers/types'
import { today } from '../server/utils/today'

const DATABASE_FILE = 'data/steady-stack.db'

const FUND_COLUMN_WIDTH = 11
const STATUS_COLUMN_WIDTH = 12

/** Pads a fund id and a status word into the two aligned columns every report line starts with. */
function formatLine(fundId: string, status: string, details: string): string {
  return `${fundId.padEnd(FUND_COLUMN_WIDTH)}${status.padEnd(STATUS_COLUMN_WIDTH)}${details}`
}

/** One report line for a fund `syncNavs` actually reported on — the ordinary, no-throw case. */
export function formatFundResult(result: NavSyncFundResult): string {
  if (result.status === 'synced') {
    const manual = (result.skippedManual ?? 0) > 0 ? `, ${result.skippedManual} kept manual` : ''
    return formatLine(
      result.fundId,
      'synced',
      `${result.from} → ${result.to}   ${result.received} received, ${result.inserted} new, ${result.updated} updated${manual}`,
    )
  }

  if (result.status === 'up-to-date') {
    return formatLine(result.fundId, 'up to date', `already synced through ${result.to}`)
  }

  return formatLine(result.fundId, 'skipped', 'no provider symbol — choose one on the funds screen')
}

export interface SyncReport {
  /** One line per fund, in the order `listFunds` returns — ascending by id. */
  lines: string[]
  /** The message `syncNavs` threw with, if it threw. */
  failureMessage?: string
}

/**
 * Runs one sync and turns it into a report, fund by fund, even when
 * `syncNavs` throws partway through.
 *
 * Task 9 made `syncNavs` finish its loop and commit every fund that
 * succeeds — in its own transaction — before raising the first provider
 * failure at the very end. That means a caller catching the throw must not
 * assume nothing happened: rows for funds ordered before, and even after,
 * the failing one may already be sitting in the database. But the thrown
 * promise carries no partial result, so there is nothing to read off the
 * rejected call itself.
 *
 * What is left is the database: the NAV row count of every fund, read
 * before the call and again after a failure, is ground truth regardless of
 * what the promise resolved with. A fund whose count grew is reported as
 * synced with exactly that many new rows; a fund whose count did not move
 * is reported as not having completed. This cannot recover the exact
 * received/inserted/updated split `syncNavs` would have returned on
 * success — that information is gone once the promise rejects — but it
 * never claims that a run which wrote rows wrote nothing.
 */
export async function runSync(
  db: AppDatabase,
  provider: PriceProvider,
  currentDate: string,
): Promise<SyncReport> {
  const funds = listFunds(db)
  const countsBefore = new Map(funds.map(fund => [fund.id, listNavs(db, fund.id).length]))

  let result: Awaited<ReturnType<typeof syncNavs>> | undefined
  let failureMessage: string | undefined

  try {
    result = await syncNavs(db, provider, { today: currentDate })
  }
  catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error)
  }

  const lines = funds.map((fund) => {
    const reported = result?.funds.find(f => f.fundId === fund.id)
    if (reported !== undefined) {
      return formatFundResult(reported)
    }

    if (fund.providerSymbol === null) {
      return formatFundResult({ fundId: fund.id, status: 'skipped', reason: 'no-symbol' })
    }

    const gained = listNavs(db, fund.id).length - (countsBefore.get(fund.id) ?? 0)
    return gained > 0
      ? formatLine(fund.id, 'synced', `${gained} new NAV row(s) committed before the failure reported below`)
      : formatLine(fund.id, 'error', 'did not complete — see the failure reported below')
  })

  return { lines, failureMessage }
}

const REASON_TEXT: Record<SkipReason, string> = {
  'already-materialised': 'already materialised',
  'no-nav': 'no NAV published yet for that month',
}

/** Turns a `materialiseContributions` result into the lines the script prints. */
export function formatMaterialisationReport(result: MaterialisationResult): string[] {
  const lines = [`Materialised ${result.created.length} purchase(s).`]
  for (const skip of result.skipped) {
    lines.push(`  ${skip.month} skipped — ${REASON_TEXT[skip.reason]}`)
  }
  return lines
}

async function main(): Promise<void> {
  const materialise = process.argv.includes('--materialise')
  const currentDate = today()

  const handle = openDatabase(DATABASE_FILE)
  let exitCode = 0

  try {
    applyMigrations(handle)

    const report = await runSync(handle.db, createYahooProvider(), currentDate)
    for (const line of report.lines) {
      console.log(line)
    }

    if (report.failureMessage !== undefined) {
      console.error(`\nSync failed: ${report.failureMessage}`)
      exitCode = 1
    }

    if (materialise) {
      console.log('')
      if (report.failureMessage !== undefined) {
        console.log('Skipping --materialise: the sync above did not complete.')
      }
      else {
        const materialisation = materialiseContributions(handle.db, { throughMonth: monthOf(currentDate) })
        for (const line of formatMaterialisationReport(materialisation)) {
          console.log(line)
        }
      }
    }
  }
  finally {
    handle.close()
  }

  process.exitCode = exitCode
}

// Runs only when this module is the process entry point, so the functions
// above stay importable — and testable — without launching the whole
// script, which would open the real database and reach for the network.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntryPoint) {
  // A caught rejection here means something failed before `runSync` even
  // got a chance to report on it — the database file could not be opened,
  // say, or a migration is broken. That is unrelated to a fund failing to
  // sync, but it must still exit 1 with a plain message rather than a raw
  // stack trace.
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
