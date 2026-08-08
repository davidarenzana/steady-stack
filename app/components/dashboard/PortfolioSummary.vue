<script setup lang="ts">
import { computed } from 'vue'
import EmptyDashboard from './EmptyDashboard.vue'
import HeadlineValuation from './HeadlineValuation.vue'
import SummaryCard from './SummaryCard.vue'
import type { Dashboard } from '~~/server/services/read-model'
import { formatEuros, formatXirr } from '~/utils/format'

/**
 * The answering half of the dashboard: what it is worth, whether you are up,
 * and what return that actually amounts to — in that order of prominence,
 * because that is the order the questions get asked in.
 *
 * Receives a payload and renders it. No fetching, no Nuxt import, no
 * arithmetic: every figure here was computed by the read model and formatted
 * by `app/utils/format.ts`.
 */
const props = defineProps<{
  dashboard: Dashboard
  /** For the empty state's next steps. An empty array is fine. */
  funds: Array<{ id: string, name: string, providerSymbol: string | null, hasNav: boolean }>
}>()

/**
 * Nothing has been bought yet — the condition for the empty state, and it is
 * `byFund` rather than `value === 0`, which a portfolio could legitimately
 * reach after a fall, or `invested === 0` alone.
 */
const nothingBought = computed(() => props.dashboard.valuation.byFund.length === 0)

const xirr = computed(() => props.dashboard.xirr)

/** A null XIRR is an absence, so it is toned neutral rather than as a loss. */
const xirrTone = computed(() => {
  if (xirr.value === null) return 'neutral' as const
  if (xirr.value > 0) return 'positive' as const
  if (xirr.value < 0) return 'negative' as const
  return 'neutral' as const
})

const xirrHint = computed(() => xirr.value === null
  ? 'Aún no hay suficientes movimientos para calcularla.'
  : 'Tiene en cuenta cuándo entró cada aportación, no solo cuánto has aportado.')
</script>

<template>
  <EmptyDashboard v-if="nothingBought" :funds="funds" />

  <div v-else class="flex flex-col gap-8">
    <HeadlineValuation
      :value="dashboard.valuation.value"
      :gain="dashboard.valuation.gain"
      :gain-ratio="dashboard.valuation.gainRatio"
      :nav-date="dashboard.navDate"
    />

    <!-- Two supporting cards, deliberately lighter than the headline: a row of
         equally weighted metrics would emphasise everything and answer
         nothing. -->
    <div class="grid gap-4 sm:grid-cols-2">
      <SummaryCard
        label="Aportado"
        :value="formatEuros(dashboard.valuation.invested)"
        hint="Suma de todas las compras ejecutadas."
      />

      <SummaryCard
        label="Rentabilidad real anualizada (TIR)"
        :value="formatXirr(xirr)"
        :hint="xirrHint"
        :tone="xirrTone"
      />
    </div>
  </div>
</template>
