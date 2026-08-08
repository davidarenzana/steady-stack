<script setup lang="ts">
import { monthOf } from '~~/core/dates'
import { addMonths } from '~~/core/months'
import type { Cents, Month, Timing, Weight } from '~~/core/types'
import type { MaterialisationResult } from '~~/server/services/materialisation'
import type { ContributionsView, FundView, PortfolioView } from '~~/server/services/read-model'
import ErrorNotice from '~/components/ErrorNotice.vue'
import PageHeader from '~/components/PageHeader.vue'
import ContributionMonthsTable from '~/components/contributions/ContributionMonthsTable.vue'
import OverrideForm from '~/components/contributions/OverrideForm.vue'
import RuleForm from '~/components/contributions/RuleForm.vue'
import RulesList from '~/components/contributions/RulesList.vue'
import { Button } from '~/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { formatEuros, formatInteger, formatMonth } from '~/utils/format'

/**
 * Screen 2 of section 8 of the spec: the rules in force, the exceptions, and
 * the monthly calendar those rules expand into.
 *
 * Reading the clock here is fine — it is `core/` that may never do it, because
 * a pure engine has to be testable without freezing time. A page asking "what
 * is today" is asking a legitimate question.
 */
useHead({ title: 'Aportaciones · Steady Stack' })

const { data: portfolio } = await useFetch<PortfolioView>('/api/portfolio')
const { data: funds } = await useFetch<FundView[]>('/api/funds')

const today = monthOf(new Date().toISOString().slice(0, 10))

/**
 * From the first month the portfolio has ever governed to eleven months ahead:
 * the whole history plus the coming year. Not the full horizon — 301 months of
 * table would bury the months that matter.
 */
const from = portfolio.value?.firstMonth ?? today
const to = addMonths(today, 11)

const { data, error, refresh } = await useFetch<ContributionsView>('/api/contributions', {
  query: { from, to },
})

const fundNames = computed(() =>
  Object.fromEntries((funds.value ?? []).map(fund => [fund.id, fund.name])))

const fundOptions = computed(() =>
  (funds.value ?? []).map(fund => ({ id: fund.id, name: fund.name })))

/** The month after the last rule, which is where a new rule normally starts. */
const defaultMonth = computed<Month | undefined>(() => {
  const months = (data.value?.rules ?? []).map(rule => rule.fromMonth).sort()
  const last = months.at(-1)
  return last ? addMonths(last, 1) : undefined
})

/** Set by `run()` when an action fails, cleared on the next success. */
const failure = ref<{ message: string, detail?: string }>()

/** The Spanish summary of the last materialisation, or nothing if none has run. */
const materialised = ref<string>()

/**
 * Every write goes through here: the API's messages are English and
 * developer-facing, so the headline is always a Spanish sentence written by
 * this page and the technical detail goes underneath it.
 */
async function run(action: () => Promise<unknown>, failureMessage: string): Promise<void> {
  try {
    await action()
    failure.value = undefined
    await refresh()
  }
  catch (caught) {
    const detail = (caught as { statusMessage?: string, message?: string })
    failure.value = { message: failureMessage, detail: detail.statusMessage ?? detail.message }
  }
}

function addRule(payload: { fromMonth: Month, amount: Cents, timing: Timing, weights: Weight[] }) {
  return run(
    () => $fetch('/api/contributions/rules', { method: 'POST', body: payload }),
    'No se ha podido guardar la regla.',
  )
}

function deleteRule(id: number) {
  return run(
    () => $fetch(`/api/contributions/rules/${id}`, { method: 'DELETE' }),
    'No se ha podido eliminar la regla.',
  )
}

function saveOverride(payload: { month: Month, amount: Cents | null, note?: string }) {
  return run(
    () => $fetch(`/api/contributions/overrides/${payload.month}`, {
      method: 'PUT',
      body: { amount: payload.amount, note: payload.note },
    }),
    'No se ha podido guardar la excepción.',
  )
}

function deleteOverride(month: Month) {
  return run(
    () => $fetch(`/api/contributions/overrides/${month}`, { method: 'DELETE' }),
    'No se ha podido eliminar la excepción.',
  )
}

/** `'Se han creado 4 compras.'`, plus what was skipped and why, grouped by reason. */
function describeMaterialisation(result: MaterialisationResult): string {
  const created = `Se han creado ${formatInteger(result.created.length)} compras.`
  if (result.skipped.length === 0) {
    return created
  }

  const noNav = result.skipped.filter(skip => skip.reason === 'no-nav').length
  const already = result.skipped.filter(skip => skip.reason === 'already-materialised').length

  return `${created} ${formatInteger(result.skipped.length)} meses sin materializar: ${formatInteger(noNav)} por falta de valor liquidativo, ${formatInteger(already)} ya materializados.`
}

function materialise() {
  return run(
    async () => {
      const result = await $fetch<MaterialisationResult>('/api/purchases/materialise', {
        method: 'POST',
        body: {},
      })
      materialised.value = describeMaterialisation(result)
    },
    'No se han podido materializar las aportaciones.',
  )
}
</script>

<template>
  <div>
    <PageHeader title="Aportaciones" subtitle="Reglas en vigor, excepciones y el calendario mensual">
      <template #actions>
        <Button size="sm" @click="materialise()">
          Materializar aportaciones
        </Button>
      </template>
    </PageHeader>

    <ErrorNotice
      v-if="error"
      title="No se han podido cargar las aportaciones."
      :detail="error.statusMessage ?? ''"
    >
      <Button variant="outline" size="sm" @click="refresh()">
        Reintentar
      </Button>
    </ErrorNotice>

    <template v-else-if="data">
      <ErrorNotice v-if="failure" :title="failure.message" :detail="failure.detail" class="mb-6" />

      <p v-if="materialised" class="text-muted-foreground mb-6 text-sm">
        {{ materialised }}
      </p>

      <section class="mb-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Reglas en vigor
        </h2>
        <RulesList :rules="data.rules" :fund-names="fundNames" @delete="deleteRule" />

        <h3 class="font-heading mt-6 mb-3 text-sm font-semibold tracking-tight">
          Nueva regla
        </h3>
        <RuleForm :funds="fundOptions" :default-month="defaultMonth" @submit="addRule" />
      </section>

      <section class="mb-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Excepciones
        </h2>

        <Table v-if="data.overrides.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead class="text-right">Importe</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead><span class="sr-only">Acciones</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="override in data.overrides" :key="override.month">
              <TableCell class="font-medium">
                {{ formatMonth(override.month) }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <!-- A skipped month has no amount at all, so it says so rather
                     than showing 0,00 €, which would be a contribution of
                     nothing instead of no contribution. -->
                {{ override.amount === null ? 'Mes saltado' : formatEuros(override.amount) }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ override.note ?? '' }}
              </TableCell>
              <TableCell class="text-right">
                <Button variant="destructive" size="sm" @click="deleteOverride(override.month)">
                  Eliminar
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p v-else class="text-muted-foreground text-sm">
          No hay excepciones. Todos los meses siguen su regla.
        </p>

        <h3 class="font-heading mt-6 mb-3 text-sm font-semibold tracking-tight">
          Nueva excepción
        </h3>
        <OverrideForm @submit="saveOverride" />
      </section>

      <section>
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Calendario
        </h2>
        <ContributionMonthsTable :months="data.months" :fund-names="fundNames" />
      </section>
    </template>
  </div>
</template>
