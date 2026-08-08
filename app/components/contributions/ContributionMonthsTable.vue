<script setup lang="ts">
import type { ContributionsViewMonth } from '~~/server/services/read-model'
import type { Weight } from '~~/core/types'
import EmptyState from '~/components/EmptyState.vue'
import { Badge } from '~/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatEuros, formatMonth, formatWeight } from '~/utils/format'

/**
 * The monthly calendar a set of rules expands into — the visible proof that
 * contributions are derived rather than stored. Nothing in this table is a row
 * in the database until it has been materialised, which is what the `Estado`
 * column says.
 *
 * The split is shown as percentages, not euros. The payload sends
 * `weights: [{ fundId, weight }]` and never a per-fund amount, and turning
 * 200 € into 160 € and 40 € is `split()`'s largest-remainder arithmetic on the
 * server — the interface does no arithmetic on money. That the route offers no
 * euro split is a finding recorded in `TODO.md`, not something worked around
 * here.
 */
const props = defineProps<{
  months: ContributionsViewMonth[]
  /** Fund id -> display name, for the `Reparto` column. */
  fundNames: Record<string, string>
}>()

const TIMING_LABELS = { start: 'Inicio de mes', end: 'Fin de mes' } as const

/** `80 % Fidelity · 20 % Vanguard`. Falls back to the id, which is ugly but true. */
function describeWeights(weights: Weight[]): string {
  return weights
    .map(weight => `${formatWeight(weight.weight)} ${props.fundNames[weight.fundId] ?? weight.fundId}`)
    .join(' · ')
}
</script>

<template>
  <EmptyState
    v-if="props.months.length === 0"
    title="No hay aportaciones en este periodo"
    description="Cambia el rango de meses o añade una regla de aportación."
  />

  <Table v-else>
    <TableHeader>
      <TableRow>
        <TableHead>Mes</TableHead>
        <TableHead class="text-right">Importe</TableHead>
        <TableHead>Momento</TableHead>
        <TableHead>Reparto</TableHead>
        <TableHead>Estado</TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      <TableRow v-for="month in props.months" :key="month.month">
        <TableCell class="font-medium">
          {{ formatMonth(month.month) }}
        </TableCell>
        <TableCell data-testid="month-amount" class="text-right tabular-nums">
          {{ formatEuros(month.amount) }}
        </TableCell>
        <TableCell class="text-muted-foreground">
          {{ TIMING_LABELS[month.timing] }}
        </TableCell>
        <TableCell class="text-muted-foreground">
          {{ describeWeights(month.weights) }}
        </TableCell>
        <TableCell>
          <Badge :variant="month.materialised ? 'secondary' : 'outline'">
            {{ month.materialised ? 'Materializada' : 'Pendiente' }}
          </Badge>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
