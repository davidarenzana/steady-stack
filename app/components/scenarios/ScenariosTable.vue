<script setup lang="ts">
import type { ScenarioRow } from '~~/server/db/schema'
import EmptyState from '~/components/EmptyState.vue'
import { Button } from '~/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatRate } from '~/utils/format'

/**
 * The theoretical rates the dashboard chart draws against the real portfolio.
 *
 * Two shapes cross here and must not be confused. `enabled` arrives from the
 * database as `0` or `1`, because SQLite has no boolean, and it has to leave as
 * `true` or `false`: `readOptionalBoolean` on `PATCH /api/scenarios/:id` requires
 * a real boolean and answers a `1` with a 400. And `annualRate` arrives as the
 * decimal string `'0.09'`, which is rendered as `9 %` rather than shown as
 * stored.
 *
 * A native checkbox rather than a reka-ui `Switch`: this component is
 * unit-tested under happy-dom, which lays out none of the DOM APIs a switch
 * needs, and a checkbox is the accessible control for this anyway.
 */
const props = defineProps<{ scenarios: ScenarioRow[] }>()

defineEmits<{
  toggle: [payload: { id: string, enabled: boolean }]
  remove: [id: string]
}>()
</script>

<template>
  <EmptyState
    v-if="props.scenarios.length === 0"
    title="Todavía no hay escenarios"
    description="Añade una rentabilidad teórica para comparar la cartera real con ella."
  />

  <div v-else>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Escenario</TableHead>
          <TableHead class="text-right">Rentabilidad anual</TableHead>
          <TableHead>Color</TableHead>
          <TableHead>Activo</TableHead>
          <TableHead><span class="sr-only">Acciones</span></TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <TableRow v-for="scenario in props.scenarios" :key="scenario.id">
          <TableCell class="font-medium">
            {{ scenario.name }}
          </TableCell>
          <TableCell class="text-right tabular-nums">
            {{ formatRate(scenario.annualRate) }}
          </TableCell>

          <TableCell>
            <!-- The token name is next to the swatch on purpose: a colour a
                 reader cannot distinguish is not an identifier, and these five
                 are theme tokens with a light and a dark value each, so there is
                 no hex code to show even if one were wanted. -->
            <div class="flex items-center gap-2">
              <span
                data-testid="scenario-color"
                class="border-border size-3 shrink-0 rounded-full border"
                :style="{ backgroundColor: `var(--${scenario.color})` }"
                aria-hidden="true"
              />
              <span class="text-muted-foreground font-mono text-xs">{{ scenario.color }}</span>
            </div>
          </TableCell>

          <TableCell>
            <input
              data-testid="scenario-enabled"
              type="checkbox"
              :checked="scenario.enabled === 1"
              :aria-label="`Dibujar ${scenario.name} en el gráfico`"
              @change="$emit('toggle', {
                id: scenario.id,
                enabled: ($event.target as HTMLInputElement).checked,
              })"
            >
          </TableCell>

          <TableCell class="text-right">
            <Button
              data-testid="remove-scenario"
              variant="destructive"
              size="sm"
              @click="$emit('remove', scenario.id)"
            >
              Eliminar
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <p class="text-muted-foreground mt-3 max-w-prose text-xs">
      Solo los escenarios activos se dibujan en el gráfico del resumen.
    </p>
  </div>
</template>
