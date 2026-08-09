<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import type { IsoDate } from '~~/core/types'
import type { SymbolCandidate } from '~~/server/providers/types'
import type { NavSyncResult } from '~~/server/services/nav-sync'
import type { FundView } from '~~/server/services/read-model'
import ErrorNotice from '~/components/ErrorNotice.vue'
import PageHeader from '~/components/PageHeader.vue'
import AddFundForm from '~/components/funds/AddFundForm.vue'
import FundsTable from '~/components/funds/FundsTable.vue'
import ManualNavForm from '~/components/funds/ManualNavForm.vue'
import NavSyncReport from '~/components/funds/NavSyncReport.vue'
import SymbolCandidates from '~/components/funds/SymbolCandidates.vue'
import { Button } from '~/components/ui/button'

/**
 * Screen 3 of section 8 of the spec, and the one where the application does the
 * thing it exists to do: download net asset values instead of having them typed
 * into a spreadsheet.
 *
 * Every network call lives here. The components take values in and emit values
 * out, which is what lets them be unit-tested under happy-dom with no socket in
 * sight.
 */
useHead({ title: 'Fondos · Steady Stack' })

const { data, error, refresh } = await useFetch<FundView[]>('/api/funds')

/** Today, for the manual entry form's future-date rule. A page asking what day it is is a legitimate question; `core/` is what may never ask. */
const today = new Date().toISOString().slice(0, 10) as IsoDate

/** Set by `run()` when an action fails, cleared on the next success. */
const failure = ref<{ message: string, detail?: string }>()

const syncing = ref(false)
const report = ref<NavSyncResult | null>(null)

/** Candidates for the fund being added, kept apart from the ones for a fund that already exists. */
const newCandidates = ref<SymbolCandidate[]>([])
const resolvingNew = ref(false)

/** The existing fund a symbol is being assigned to, and the candidates for its own stored ISIN. */
const assignFundId = ref('')
const assignCandidates = ref<SymbolCandidate[]>([])
const resolvingAssign = ref(false)
const assignSearched = ref(false)

const fundOptions = computed(() =>
  (data.value ?? []).map(fund => ({ id: fund.id, name: fund.name })))

const fundNames = computed(() =>
  Object.fromEntries((data.value ?? []).map(fund => [fund.id, fund.name])))

/**
 * Every write goes through here: the API's messages are English and
 * developer-facing, so the headline is always a Spanish sentence written by this
 * page and the technical detail goes underneath it. The message can be a
 * function of the failure, which is how a 409 on a delete gets its own wording.
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

function resolveForNewFund(isin: string) {
  resolvingNew.value = true
  return run(
    async () => {
      try {
        newCandidates.value = await $fetch<SymbolCandidate[]>('/api/funds/resolve', { query: { isin } })
      }
      finally {
        resolvingNew.value = false
      }
    },
    'No se han podido buscar los símbolos de ese ISIN.',
  )
}

function addFund(payload: { id: string, isin: string, name: string, providerSymbol?: string, currency: string }) {
  return run(
    async () => {
      await $fetch('/api/funds', { method: 'POST', body: payload })
      newCandidates.value = []
    },
    'No se ha podido añadir el fondo.',
  )
}

/** Resolves the ISIN the selected fund already carries, so nobody retypes twelve characters. */
function resolveForExistingFund() {
  const fund = (data.value ?? []).find(candidate => candidate.id === assignFundId.value)
  if (!fund) {
    failure.value = { message: 'Elige el fondo al que asignar el símbolo.' }
    return
  }

  resolvingAssign.value = true
  assignSearched.value = true
  return run(
    async () => {
      try {
        assignCandidates.value = await $fetch<SymbolCandidate[]>('/api/funds/resolve', {
          query: { isin: fund.isin },
        })
      }
      finally {
        resolvingAssign.value = false
      }
    },
    'No se han podido buscar los símbolos de ese ISIN.',
  )
}

function assignSymbol(providerSymbol: string) {
  const fundId = assignFundId.value
  return run(
    async () => {
      await $fetch(`/api/funds/${fundId}`, { method: 'PATCH', body: { providerSymbol } })
      assignCandidates.value = []
      assignSearched.value = false
    },
    'No se ha podido asignar el símbolo.',
  )
}

/**
 * The undo that did not exist before phase 1's task 1.5: an explicit `null`
 * clears the column, where `readOptionalString` used to collapse it into
 * "absent, leave it alone" and ignore the request in silence.
 */
function clearSymbol(fundId: string) {
  return run(
    () => $fetch(`/api/funds/${fundId}`, { method: 'PATCH', body: { providerSymbol: null } }),
    'No se ha podido quitar el símbolo.',
  )
}

function removeFund(fundId: string) {
  return run(
    () => $fetch(`/api/funds/${fundId}`, { method: 'DELETE' }),
    caught => caught.statusCode === 409
      ? 'Ese fondo tiene compras registradas y no se puede eliminar.'
      : 'No se ha podido eliminar el fondo.',
  )
}

/**
 * A 502 from the sync is not an empty answer: the run can insert rows for one
 * fund and then fail on the next, and the partial report travels in
 * `error.data.funds`. Showing it is the difference between "nothing happened"
 * and "this much happened, then it broke".
 */
function syncNavs() {
  syncing.value = true
  return run(
    async () => {
      try {
        report.value = await $fetch<NavSyncResult>('/api/nav/sync', { method: 'POST', body: {} })
      }
      catch (caught) {
        const partial = (caught as { data?: NavSyncResult }).data
        if (partial?.funds) {
          report.value = partial
        }
        throw caught
      }
      finally {
        syncing.value = false
      }
    },
    'No se han podido actualizar los valores liquidativos.',
  )
}

function saveNav(payload: { fundId: string, date: IsoDate, value: string }) {
  return run(
    () => $fetch('/api/nav', { method: 'PUT', body: payload }),
    'No se ha podido guardar el valor liquidativo.',
  )
}
</script>

<template>
  <div>
    <PageHeader title="Fondos" subtitle="Los fondos de la cartera y sus valores liquidativos">
      <template #actions>
        <Button size="sm" :disabled="syncing" @click="syncNavs()">
          <RefreshCw aria-hidden="true" :class="syncing ? 'animate-spin' : ''" />
          {{ syncing ? 'Actualizando…' : 'Actualizar valores liquidativos' }}
        </Button>
      </template>
    </PageHeader>

    <ErrorNotice
      v-if="error"
      title="No se han podido cargar los fondos."
      :detail="error.statusMessage ?? ''"
    >
      <Button variant="outline" size="sm" @click="refresh()">
        Reintentar
      </Button>
    </ErrorNotice>

    <template v-else-if="data">
      <ErrorNotice v-if="failure" :title="failure.message" :detail="failure.detail" class="mb-6" />

      <FundsTable :funds="data" @clear-symbol="clearSymbol" @remove="removeFund" />

      <section v-if="report" class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Última sincronización
        </h2>
        <NavSyncReport :report="report" :fund-names="fundNames" />
      </section>

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Asignar un símbolo
        </h2>
        <p class="text-muted-foreground mb-3 max-w-prose text-xs">
          Busca las clases que publica el proveedor para el ISIN del fondo y elige la que coincide
          con tu extracto. Sin símbolo no se pueden descargar los valores liquidativos.
        </p>

        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Fondo</span>
            <select
              v-model="assignFundId"
              data-testid="assign-fund"
              class="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="">
                Elige un fondo
              </option>
              <option v-for="fund in data" :key="fund.id" :value="fund.id">
                {{ fund.name }}
              </option>
            </select>
          </label>

          <Button
            data-testid="assign-resolve"
            variant="outline"
            size="sm"
            @click="resolveForExistingFund()"
          >
            Buscar símbolos
          </Button>
        </div>

        <SymbolCandidates
          v-if="assignSearched || resolvingAssign"
          class="mt-4"
          :candidates="assignCandidates"
          :loading="resolvingAssign"
          @choose="assignSymbol"
        />
      </section>

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Añadir fondo
        </h2>
        <AddFundForm
          :candidates="newCandidates"
          :resolving="resolvingNew"
          @resolve="resolveForNewFund"
          @submit="addFund"
        />
      </section>

      <section class="mt-10">
        <h2 class="font-heading mb-3 text-sm font-semibold tracking-tight">
          Introducir un valor liquidativo a mano
        </h2>
        <p class="text-muted-foreground mb-3 max-w-prose text-xs">
          Un valor introducido a mano nunca se sobrescribe al sincronizar.
        </p>
        <ManualNavForm :funds="fundOptions" :today="today" @submit="saveNav" />
      </section>
    </template>
  </div>
</template>
