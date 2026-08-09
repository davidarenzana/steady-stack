<script setup lang="ts">
import type { FundView } from '~~/server/services/read-model'
import EmptyState from '~/components/EmptyState.vue'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatEuros, formatIsoDate, formatNav, formatUnits } from '~/utils/format'

/**
 * The funds of the portfolio, their symbols and their latest prices.
 *
 * **This table renders no total, and that is deliberate.** `buildFundsView`
 * reports a fund holding units with no net asset value as worth `0`,
 * distinguishable only through `latestNav: null`, so adding `value` down the
 * column would silently under-count every unpriced fund. A fund without a
 * price says `Sin valoración` instead — a zero would claim it is worth nothing,
 * when what is true is that nobody has downloaded its price yet. The one
 * authoritative total lives on the dashboard, where `GET /api/dashboard`
 * answers 404 rather than under-count. Do not "fix" this by summing here.
 */
const props = defineProps<{ funds: FundView[] }>()

defineEmits<{
  clearSymbol: [fundId: string]
  remove: [fundId: string]
}>()

/** Right-aligned, fixed-width digits: the two classes that make a column of figures readable. */
const FIGURE = 'text-right tabular-nums'
</script>

<template>
  <EmptyState
    v-if="props.funds.length === 0"
    title="Todavía no hay fondos"
    description="Añade el primero con su ISIN."
  />

  <div v-else>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fondo</TableHead>
          <TableHead>ISIN</TableHead>
          <TableHead>Símbolo</TableHead>
          <TableHead class="text-right">Participaciones</TableHead>
          <TableHead class="text-right">Aportado</TableHead>
          <TableHead class="text-right">Valor</TableHead>
          <TableHead class="text-right">Último VL</TableHead>
          <TableHead><span class="sr-only">Acciones</span></TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        <TableRow v-for="fund in props.funds" :key="fund.id">
          <TableCell class="font-medium">
            {{ fund.name }}
          </TableCell>
          <TableCell class="text-muted-foreground font-mono text-xs">
            {{ fund.isin }}
          </TableCell>

          <TableCell>
            <!-- The symbol is the one field on this screen the user picked by
                 hand out of several share classes, so it comes with its own
                 undo: a wrong pick is otherwise unfixable without deleting the
                 fund. -->
            <div v-if="fund.providerSymbol" class="flex items-center gap-1">
              <span class="font-mono text-xs">{{ fund.providerSymbol }}</span>
              <Button
                data-testid="clear-symbol"
                variant="ghost"
                size="xs"
                @click="$emit('clearSymbol', fund.id)"
              >
                Quitar
              </Button>
            </div>
            <Badge v-else variant="outline">
              Sin símbolo
            </Badge>
          </TableCell>

          <TableCell :class="FIGURE">
            {{ formatUnits(fund.units) }}
          </TableCell>
          <TableCell :class="FIGURE">
            {{ formatEuros(fund.invested) }}
          </TableCell>

          <TableCell data-testid="fund-value" :class="FIGURE">
            {{ fund.latestNav ? formatEuros(fund.value) : 'Sin valoración' }}
          </TableCell>

          <TableCell data-testid="fund-nav" :class="FIGURE">
            <template v-if="fund.latestNav">
              {{ formatNav(fund.latestNav.value) }}
              <span class="text-muted-foreground block text-xs">
                {{ formatIsoDate(fund.latestNav.date) }}<template v-if="fund.latestNav.source === 'manual'"> · Manual</template>
              </span>
            </template>
            <template v-else>
              —
            </template>
          </TableCell>

          <TableCell class="text-right">
            <Button
              data-testid="remove-fund"
              variant="destructive"
              size="sm"
              @click="$emit('remove', fund.id)"
            >
              Eliminar
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <p class="text-muted-foreground mt-3 max-w-prose text-xs">
      Los fondos sin valor liquidativo no suman al total de la cartera; el resumen no se puede
      calcular hasta que lo tengan.
    </p>
  </div>
</template>
