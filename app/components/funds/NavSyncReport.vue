<script setup lang="ts">
import type { NavSyncFundResult, NavSyncResult } from '~~/server/services/nav-sync'
import { formatInteger, formatIsoDate } from '~/utils/format'

/**
 * What the last run of `POST /api/nav/sync` did, one Spanish line per fund.
 *
 * The report is worth showing even when the call failed: the sync can partially
 * succeed and then throw, and a 502 carries `data.funds` with this same shape.
 * The page hands that through, which is why every branch here has to hold for a
 * partial report as well as a complete one.
 *
 * Two of those branches are the ones a user most needs and would otherwise
 * guess at. `skippedManual` is announced because a net asset value entered by
 * hand always prevails over a downloaded one, per section 6 of the spec, and
 * silence about it looks like values went missing. `incomplete` — the status the
 * plan's table omits and only a failed run produces — says the fund could not
 * be checked rather than that it is up to date: `syncNavsWithPartialReport`
 * cannot tell a fund that failed from one that never got its turn, and this
 * line must not claim either.
 */
const props = defineProps<{
  report: NavSyncResult | null
  fundNames: Record<string, string>
}>()

/** ` (2 manuales respetados)`, or nothing when the run overwrote no hand-entered value. */
function describeSkippedManual(skippedManual: number | undefined): string {
  return skippedManual && skippedManual > 0
    ? ` (${formatInteger(skippedManual)} manuales respetados)`
    : ''
}

function describe(result: NavSyncFundResult): string {
  const name = props.fundNames[result.fundId] ?? result.fundId
  const manual = describeSkippedManual(result.skippedManual)

  switch (result.status) {
    case 'synced':
      return `${name}: ${formatInteger(result.inserted ?? 0)} valores nuevos, `
        + `${formatInteger(result.updated ?? 0)} actualizados`
        + `${result.to ? `, hasta el ${formatIsoDate(result.to)}` : ''}${manual}`
    case 'up-to-date':
      return `${name}: ya estaba al día${manual}`
    case 'skipped':
      return `${name}: sin símbolo asignado, no se ha podido sincronizar`
    case 'incomplete':
      return `${name}: no se ha podido comprobar; puede que la descarga fallara antes de llegar a este fondo`
  }
}
</script>

<template>
  <ul v-if="props.report" class="text-muted-foreground flex flex-col gap-1 text-sm">
    <li v-for="fund in props.report.funds" :key="fund.fundId" data-testid="sync-line">
      {{ describe(fund) }}
    </li>
  </ul>
</template>
