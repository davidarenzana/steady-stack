<script setup lang="ts">
import type { SymbolCandidate } from '~~/server/providers/types'
import { Button } from '~/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatIsoDate, formatNav } from '~/utils/format'

/**
 * The symbols a provider offers for one ISIN, listed so the user can pick.
 *
 * **This component recommends nothing and preselects nothing**, and that is
 * section 6 of the spec rather than an unfinished feature. The same ISIN
 * publishes several share classes at different prices — `0P0001CLDK.F` at
 * 9,99 € against `IE00BYX5NX33.SG` at 14,33 €, both quoting `IE00BYX5NX33` —
 * and only the user's own statement says which one they hold. A highlighted row
 * would be a guess dressed as an answer, and the five-euro gap makes the wrong
 * guess a wrong portfolio for as long as it goes unnoticed.
 *
 * Rows keep the provider's own order. The price and its date are shown because
 * they are what the user compares against the statement — the name is nearly
 * identical across the classes, so the figure is the only thing that
 * distinguishes them.
 */
const props = defineProps<{
  candidates: SymbolCandidate[]
  /** True while `GET /api/funds/resolve` is in flight. */
  loading?: boolean
}>()

defineEmits<{ choose: [symbol: string] }>()
</script>

<template>
  <div>
    <p v-if="props.loading" class="text-muted-foreground text-sm">
      Buscando…
    </p>

    <p v-else-if="props.candidates.length === 0" class="text-muted-foreground text-sm">
      No se ha encontrado ningún símbolo para ese ISIN.
    </p>

    <template v-else>
      <p class="text-muted-foreground mb-3 max-w-prose text-xs">
        Un mismo ISIN puede tener varias clases con precios distintos. Elige la que coincide con tu
        extracto.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Símbolo</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Mercado</TableHead>
            <TableHead class="text-right">Precio</TableHead>
            <TableHead><span class="sr-only">Acciones</span></TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <TableRow v-for="candidate in props.candidates" :key="candidate.symbol">
            <TableCell class="font-mono text-xs">
              {{ candidate.symbol }}
            </TableCell>
            <TableCell class="font-medium">
              {{ candidate.name }}
            </TableCell>
            <TableCell class="text-muted-foreground">
              {{ candidate.exchange }}
            </TableCell>

            <TableCell data-testid="candidate-price" class="text-right tabular-nums">
              <template v-if="candidate.price">
                {{ formatNav(candidate.price) }}
                <span v-if="candidate.priceDate" class="text-muted-foreground block text-xs">
                  {{ formatIsoDate(candidate.priceDate) }}
                </span>
              </template>
              <template v-else>
                Sin precio
              </template>
            </TableCell>

            <TableCell class="text-right">
              <Button
                data-testid="choose-symbol"
                variant="outline"
                size="sm"
                @click="$emit('choose', candidate.symbol)"
              >
                Elegir
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </template>
  </div>
</template>
