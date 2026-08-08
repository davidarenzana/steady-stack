<script setup lang="ts">
import type { Dashboard, FundView } from '~~/server/services/read-model'
import ErrorNotice from '~/components/ErrorNotice.vue'
import PageHeader from '~/components/PageHeader.vue'
import EvolutionChart from '~/components/chart/EvolutionChart.vue'
import { buildEvolutionSeries } from '~/components/chart/evolution-series'
import FundPositionsTable from '~/components/dashboard/FundPositionsTable.vue'
import PortfolioSummary from '~/components/dashboard/PortfolioSummary.vue'
import { Button } from '~/components/ui/button'

/**
 * Screen 1 of section 8 of the spec. It answers, in this order: what is it
 * worth, am I up, what return am I earning, and — from phase 4 — how does
 * reality compare to the theory.
 *
 * No arithmetic in this file and no animation on any figure. Everything
 * rendered comes from a response or from `app/utils/format.ts`.
 */
const { data, error, refresh, status } = await useFetch<Dashboard>('/api/dashboard')

/**
 * Fetched separately because the `Dashboard` payload cannot say whether a fund
 * has a provider symbol, and the empty state's next steps are only actionable
 * if they can name the funds still missing one. It is a cheap request and the
 * honest source.
 */
const { data: fundRows } = await useFetch<FundView[]>('/api/funds')

useHead({ title: 'Resumen · Steady Stack' })

const funds = computed(() => (fundRows.value ?? []).map(fund => ({
  id: fund.id,
  name: fund.name,
  providerSymbol: fund.providerSymbol,
  hasNav: fund.latestNav !== null,
})))

/**
 * A 404 here is the read model refusing to under-count: `currentValuation`
 * throws when a fund holding units has no NAV at all, because a valuation
 * missing a position is wrong rather than incomplete. The wording says where
 * to go and fix it.
 */
const notice = computed(() => error.value?.statusCode === 404
  ? {
      title: 'No se puede valorar la cartera',
      detail: 'Falta el valor liquidativo de algún fondo con participaciones. Actualízalos desde la pantalla de Fondos.',
    }
  : {
      title: 'No se ha podido cargar el resumen',
      detail: error.value?.statusMessage ?? '',
    })

const positions = computed(() => data.value?.valuation.byFund ?? [])

/** The chart's own shape, built by a mapper that knows nothing about Unovis. */
const chart = computed(() => data.value
  ? buildEvolutionSeries(data.value)
  : { points: [], series: [] })
</script>

<template>
  <div>
    <PageHeader title="Resumen" />

    <ErrorNotice v-if="error" :title="notice.title" :detail="notice.detail">
      <Button variant="outline" size="sm" @click="refresh()">
        Reintentar
      </Button>
    </ErrorNotice>

    <template v-else-if="data">
      <PortfolioSummary :dashboard="data" :funds="funds" />

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Evolución
        </h2>

        <!-- Unovis builds its SVG against a real layout, so rendering it on the
             server gives at best a wrong-sized chart and at worst a crash on a
             missing DOM API. The fallback is server-rendered, so the page is
             never a hole while the chart arrives. -->
        <ClientOnly>
          <EvolutionChart :points="chart.points" :series="chart.series" />
          <template #fallback>
            <p class="text-muted-foreground text-sm">Preparando el gráfico…</p>
          </template>
        </ClientOnly>
      </section>

      <section v-if="positions.length > 0" class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Posiciones
        </h2>
        <FundPositionsTable :positions="positions" />
      </section>
    </template>

    <!-- The page is server-rendered, so this is only ever seen on a
         client-side navigation. -->
    <p v-else-if="status === 'pending'" class="text-muted-foreground text-sm">
      Cargando…
    </p>
  </div>
</template>
