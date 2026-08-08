<script setup lang="ts">
import type { ContributionRuleRow } from '~~/server/db/schema'
import EmptyState from '~/components/EmptyState.vue'
import { Button } from '~/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatEuros, formatMonth, formatWeight } from '~/utils/format'
import { parseWeights } from '~/utils/parse'

/**
 * The rules in force, each governing from its own month until a later one
 * supersedes it.
 *
 * The note under the table is not decoration. Section 4 of the spec forbids
 * editing a rule in a way that rewrites the past, and a user about to change
 * their monthly amount has no way of knowing that adding a rule is how it is
 * done — or that the earlier months will keep the amount they were actually
 * governed by — unless the screen says so.
 *
 * `weights` arrives as a JSON string because the route returns the database row
 * untouched, so it goes through `parseWeights`.
 */
const props = defineProps<{
  rules: ContributionRuleRow[]
  fundNames: Record<string, string>
}>()

defineEmits<{ delete: [id: number] }>()

const TIMING_LABELS = { start: 'Inicio de mes', end: 'Fin de mes' } as const

function describeWeights(raw: string): string {
  return parseWeights(raw)
    .map(weight => `${formatWeight(weight.weight)} ${props.fundNames[weight.fundId] ?? weight.fundId}`)
    .join(' · ')
}
</script>

<template>
  <EmptyState
    v-if="props.rules.length === 0"
    title="Todavía no hay reglas de aportación"
    description="Añade una regla para que la cartera tenga un plan mensual."
  />

  <div v-else>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Desde</TableHead>
          <TableHead class="text-right">Importe</TableHead>
          <TableHead>Momento</TableHead>
          <TableHead>Reparto</TableHead>
          <TableHead><span class="sr-only">Acciones</span></TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <TableRow v-for="rule in props.rules" :key="rule.id">
          <TableCell class="font-medium">
            {{ formatMonth(rule.fromMonth) }}
          </TableCell>
          <TableCell class="text-right tabular-nums">
            {{ formatEuros(rule.amount) }}
          </TableCell>
          <TableCell class="text-muted-foreground">
            {{ TIMING_LABELS[rule.timing] }}
          </TableCell>
          <TableCell class="text-muted-foreground">
            {{ describeWeights(rule.weights) }}
          </TableCell>
          <TableCell class="text-right">
            <Button
              data-testid="delete-rule"
              variant="destructive"
              size="sm"
              @click="$emit('delete', rule.id)"
            >
              Eliminar
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <p class="text-muted-foreground mt-3 max-w-prose text-xs">
      Editar una regla nunca reescribe el pasado: añade una regla nueva con su propio mes
      de inicio y la anterior sigue gobernando los meses anteriores.
    </p>
  </div>
</template>
