<script setup lang="ts">
import type { FundPositionView } from '~~/server/services/read-model'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatEuros, formatIsoDate, formatNav, formatSignedEuros, formatUnits } from '~/utils/format'

/**
 * The detail behind the headline: what each fund holds, at what price, and
 * what it has gained. Last on the screen because it is detail and not answer.
 *
 * Rows keep the order the API gave them — `valuate` already sorts by value
 * descending — because two layers disagreeing about order is a bug a user
 * sees. Every numeric cell is right-aligned with tabular numerals, which is
 * the whole reason the typeface decision was deferred until a table existed.
 */
const props = defineProps<{ positions: FundPositionView[] }>()

/** Right-aligned, fixed-width digits: the two classes that make a column of figures readable. */
const FIGURE = 'text-right tabular-nums'
</script>

<template>
  <Table v-if="props.positions.length > 0">
    <TableHeader>
      <TableRow>
        <TableHead>Fondo</TableHead>
        <TableHead class="text-right">Participaciones</TableHead>
        <TableHead class="text-right">Valor liquidativo</TableHead>
        <TableHead class="text-right">Fecha</TableHead>
        <TableHead class="text-right">Aportado</TableHead>
        <TableHead class="text-right">Valor</TableHead>
        <TableHead class="text-right">Plusvalía</TableHead>
      </TableRow>
    </TableHeader>

    <TableBody>
      <TableRow v-for="position in props.positions" :key="position.fundId">
        <TableCell class="font-medium">
          {{ position.name }}
        </TableCell>
        <TableCell :class="FIGURE">
          {{ formatUnits(position.units) }}
        </TableCell>
        <TableCell :class="FIGURE">
          {{ formatNav(position.nav) }}
        </TableCell>
        <TableCell :class="FIGURE">
          {{ formatIsoDate(position.navDate) }}
        </TableCell>
        <TableCell :class="FIGURE">
          {{ formatEuros(position.invested) }}
        </TableCell>
        <TableCell :class="FIGURE">
          {{ formatEuros(position.value) }}
        </TableCell>
        <!-- The sign is in the string; the colour repeats it. -->
        <TableCell
          data-testid="position-gain"
          :class="[FIGURE, position.gain < 0 ? 'text-destructive' : 'text-positive']"
        >
          {{ formatSignedEuros(position.gain) }}
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
