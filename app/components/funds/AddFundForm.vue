<script setup lang="ts">
import { ref } from 'vue'
import type { SymbolCandidate } from '~~/server/providers/types'
import SymbolCandidates from '~/components/funds/SymbolCandidates.vue'
import { Button } from '~/components/ui/button'

/**
 * Adds a fund: its ISIN, a short identifier, a name, a currency, and — if the
 * provider knows any — the share class the user recognises.
 *
 * The symbol is optional, and that is deliberate: an ISIN may resolve to
 * nothing today, and a fund is still worth recording before its price can be
 * downloaded. The symbol can be assigned later from the table.
 *
 * Validation happens here rather than being left to the route, because the
 * route answers in English with a 400 the user should never have to read. Two
 * of these rules are also stricter than the API: an empty `currency` is
 * accepted by `POST /api/funds` today — an open finding in `TODO.md` — and a
 * fund with no currency is a fund whose figures mean nothing.
 *
 * Native inputs rather than reka-ui widgets: this component is unit-tested
 * under happy-dom, which lays out no DOM APIs a listbox needs.
 */
const props = defineProps<{
  candidates: SymbolCandidate[]
  /** True while `GET /api/funds/resolve` is in flight. */
  resolving?: boolean
}>()

const emit = defineEmits<{
  resolve: [isin: string]
  submit: [payload: {
    id: string
    isin: string
    name: string
    providerSymbol?: string
    currency: string
  }]
}>()

const isin = ref('')
const id = ref('')
const name = ref('')
const currency = ref('EUR')

const chosenSymbol = ref<string>()

/**
 * Whether a search has been asked for. It is what separates "nothing found"
 * from "nothing asked yet": `<SymbolCandidates>` reads an empty list as a
 * failed lookup, which is right after a search and wrong before one.
 */
const searched = ref(false)

const error = ref<string>()

function onResolve() {
  const trimmed = isin.value.trim()
  if (trimmed === '') {
    error.value = 'Indica el ISIN.'
    return
  }

  error.value = undefined
  searched.value = true
  emit('resolve', trimmed)
}

function onSubmit() {
  const values = {
    isin: isin.value.trim(),
    id: id.value.trim(),
    name: name.value.trim(),
    currency: currency.value.trim(),
  }

  const missing
    = values.isin === '' ? 'Indica el ISIN.'
      : values.id === '' ? 'Indica un identificador.'
        : values.name === '' ? 'Indica el nombre del fondo.'
          : values.currency === '' ? 'Indica la divisa.'
            : undefined

  if (missing) {
    error.value = missing
    return
  }

  error.value = undefined
  emit('submit', {
    ...values,
    // Omitted rather than sent empty: `providerSymbol: ''` is accepted by the
    // route and then treated as a symbol by the sync, which would send an empty
    // string to Yahoo. The absent case is `null` in the database and skipped.
    ...(chosenSymbol.value ? { providerSymbol: chosenSymbol.value } : {}),
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">ISIN</span>
        <div class="flex gap-2">
          <input
            v-model="isin"
            data-testid="fund-isin"
            type="text"
            class="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
          >
          <Button
            data-testid="resolve-isin"
            type="button"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="onResolve()"
          >
            Buscar símbolos
          </Button>
        </div>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Identificador</span>
        <input
          v-model="id"
          data-testid="fund-id"
          type="text"
          placeholder="world"
          class="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Nombre</span>
        <input
          v-model="name"
          data-testid="fund-name"
          type="text"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Divisa</span>
        <input
          v-model="currency"
          data-testid="fund-currency"
          type="text"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm uppercase"
        >
      </label>
    </div>

    <p v-if="chosenSymbol" class="flex items-center gap-2 text-sm">
      <span>Símbolo elegido: <span class="font-mono">{{ chosenSymbol }}</span></span>
      <Button
        data-testid="change-symbol"
        type="button"
        variant="ghost"
        size="xs"
        @click="chosenSymbol = undefined"
      >
        Cambiar
      </Button>
    </p>

    <SymbolCandidates
      v-else-if="searched || props.resolving || props.candidates.length > 0"
      :candidates="props.candidates"
      :loading="props.resolving"
      @choose="chosenSymbol = $event"
    />

    <p v-if="error" data-testid="add-fund-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <div>
      <Button type="submit" size="sm">
        Añadir fondo
      </Button>
    </div>
  </form>
</template>
