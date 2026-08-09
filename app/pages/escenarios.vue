<script setup lang="ts">
import type { ScenarioRow } from '~~/server/db/schema'
import type { PortfolioView } from '~~/server/services/read-model'
import ErrorNotice from '~/components/ErrorNotice.vue'
import PageHeader from '~/components/PageHeader.vue'
import HorizonForm from '~/components/scenarios/HorizonForm.vue'
import ScenarioForm from '~/components/scenarios/ScenarioForm.vue'
import ScenariosTable from '~/components/scenarios/ScenariosTable.vue'
import { Button } from '~/components/ui/button'

/**
 * Screen 4 of section 8 of the spec: the theoretical rates and the horizon.
 *
 * Nothing on this screen is worth anything on its own — every change here is
 * seen on the dashboard, where the enabled scenarios are drawn against the real
 * portfolio. Hence the sentence under the table saying so, and hence the
 * horizon living here rather than on the chart: it is one number governing every
 * scenario at once, and the chart is where its effect shows.
 */
useHead({ title: 'Escenarios · Steady Stack' })

const { data: scenarios, error, refresh } = await useFetch<ScenarioRow[]>('/api/scenarios')
const { data: portfolio, refresh: refreshPortfolio } = await useFetch<PortfolioView>('/api/portfolio')

/** Set by `run()` when an action fails, cleared on the next success. */
const failure = ref<{ message: string, detail?: string }>()

/**
 * Every write goes through here: the API's messages are English and
 * developer-facing, so the headline is always a Spanish sentence written by this
 * page and the technical detail goes underneath it. The message can be a
 * function of the failure, which is how a 409 on a duplicate id gets its own
 * wording.
 */
async function run(
  action: () => Promise<unknown>,
  failureMessage: string | ((caught: { statusCode?: number }) => string),
): Promise<void> {
  try {
    await action()
    failure.value = undefined
    await refresh()
  }
  catch (caught) {
    const detail = caught as { statusCode?: number, statusMessage?: string, message?: string }
    failure.value = {
      message: typeof failureMessage === 'string' ? failureMessage : failureMessage(detail),
      detail: detail.statusMessage ?? detail.message,
    }
  }
}

/** `enabled` goes out as a real boolean: `readOptionalBoolean` answers a `1` with a 400. */
function toggleScenario(payload: { id: string, enabled: boolean }) {
  return run(
    () => $fetch(`/api/scenarios/${payload.id}`, {
      method: 'PATCH',
      body: { enabled: payload.enabled },
    }),
    'No se ha podido cambiar el escenario.',
  )
}

function removeScenario(id: string) {
  return run(
    () => $fetch(`/api/scenarios/${id}`, { method: 'DELETE' }),
    'No se ha podido eliminar el escenario.',
  )
}

function addScenario(payload: {
  id: string
  name: string
  annualRate: string
  color: string
  enabled: boolean
}) {
  return run(
    () => $fetch('/api/scenarios', { method: 'POST', body: payload }),
    caught => caught.statusCode === 409
      ? 'Ya existe un escenario con ese identificador.'
      : 'No se ha podido crear el escenario.',
  )
}

/**
 * The horizon is a column on `portfolio`, so its own payload has to be refetched
 * as well — `refresh()` inside `run()` only reloads the scenarios, and the form
 * would keep showing the old number until the next full page load.
 */
function saveHorizon(horizonYears: number) {
  return run(
    async () => {
      await $fetch('/api/portfolio', { method: 'PATCH', body: { horizonYears } })
      await refreshPortfolio()
    },
    'No se ha podido guardar el horizonte.',
  )
}
</script>

<template>
  <div>
    <PageHeader title="Escenarios" subtitle="Rentabilidades teóricas y horizonte de la proyección" />

    <ErrorNotice
      v-if="error"
      title="No se han podido cargar los escenarios."
      :detail="error.statusMessage ?? ''"
    >
      <Button variant="outline" size="sm" @click="refresh()">
        Reintentar
      </Button>
    </ErrorNotice>

    <template v-else-if="scenarios">
      <ErrorNotice v-if="failure" :title="failure.message" :detail="failure.detail" class="mb-6" />

      <ScenariosTable :scenarios="scenarios" @toggle="toggleScenario" @remove="removeScenario" />

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Nuevo escenario
        </h2>
        <ScenarioForm @submit="addScenario" />
      </section>

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Horizonte
        </h2>
        <HorizonForm
          :key="portfolio?.horizonYears ?? 25"
          :horizon-years="portfolio?.horizonYears ?? 25"
          @submit="saveHorizon"
        />
      </section>
    </template>
  </div>
</template>
