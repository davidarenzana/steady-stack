<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Cents, Month, Timing, Weight } from '~~/core/types'
import { Button } from '~/components/ui/button'
import { parseEurosToCents } from '~/utils/parse'

/**
 * Adds a rule. Since a rule governs from its own month onward and never
 * rewrites the past, this form is also how an existing plan is *changed*: you
 * add a rule starting the month the change takes effect.
 *
 * Weights are typed as percentages because that is what a person types, and
 * emitted as fractions because that is what the API takes. The division by 100
 * is on a weight, not on money — `split()` on the server is what turns a weight
 * into exact cents.
 *
 * Native inputs and radios rather than reka-ui widgets: this component is
 * unit-tested under happy-dom, which lays out no DOM APIs a listbox needs.
 */
const props = defineProps<{
  funds: Array<{ id: string, name: string }>
  /** Prefilled month, normally the month after the last rule. */
  defaultMonth?: Month
}>()

const emit = defineEmits<{
  submit: [payload: { fromMonth: Month, amount: Cents, timing: Timing, weights: Weight[] }]
}>()

const fromMonth = ref(props.defaultMonth ?? '')
const timing = ref<Timing>('start')

/**
 * Typed as `string | number` because that is what these models really hold:
 * Vue coerces the value of an `<input type="number">` through `looseToNumber`,
 * so `amount` is a number after the user types and the empty string before.
 * Declaring it `string` compiles cleanly and then fails at runtime on
 * `input.trim`, which is how this was found.
 */
const amount = ref<string | number>('')

/**
 * Percentages, keyed by fund id. Seeded empty rather than at an even split: a
 * prefilled 50/50 would be a suggestion this form has no business making.
 */
const weights = ref<Record<string, string | number>>(
  Object.fromEntries(props.funds.map(fund => [fund.id, ''])),
)

const error = ref<string>()

const percentageTotal = computed(() => props.funds
  .reduce((total, fund) => total + Number(weights.value[fund.id] || 0), 0))

function onSubmit() {
  if (fromMonth.value === '') {
    error.value = 'Indica el mes desde el que se aplica.'
    return
  }

  // `String(...)` because of the coercion noted on the ref above: the parser
  // takes text, and the component is where the DOM's quirk is absorbed.
  const cents = parseEurosToCents(String(amount.value))
  // Stricter than the route, deliberately: that rules still accept zero and
  // negative amounts is an open finding in TODO.md, and a contribution of
  // nothing is not a contribution.
  if (cents === null || cents === 0) {
    error.value = 'El importe debe ser mayor que 0.'
    return
  }

  // Caught here rather than by `readWeights`, which would answer with an
  // English 400 the user should never have to read.
  if (percentageTotal.value !== 100) {
    error.value = 'Los pesos deben sumar 100 %.'
    return
  }

  error.value = undefined
  emit('submit', {
    fromMonth: fromMonth.value,
    amount: cents,
    timing: timing.value,
    weights: props.funds.map(fund => ({
      fundId: fund.id,
      weight: Number(weights.value[fund.id]) / 100,
    })),
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Desde</span>
        <input
          v-model="fromMonth"
          data-testid="rule-month"
          type="month"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Importe (€)</span>
        <input
          v-model="amount"
          data-testid="rule-amount"
          type="number"
          step="0.01"
          min="0"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm tabular-nums"
        >
      </label>
    </div>

    <fieldset class="flex flex-col gap-2 text-sm">
      <legend class="mb-1 font-medium">Momento</legend>
      <label class="flex items-center gap-2">
        <input v-model="timing" data-testid="rule-timing-start" type="radio" value="start">
        Inicio de mes
      </label>
      <label class="flex items-center gap-2">
        <input v-model="timing" data-testid="rule-timing-end" type="radio" value="end">
        Fin de mes
      </label>
    </fieldset>

    <fieldset class="flex flex-col gap-2 text-sm">
      <legend class="mb-1 font-medium">Reparto (%)</legend>
      <label v-for="fund in props.funds" :key="fund.id" class="flex items-center justify-between gap-3">
        <span>{{ fund.name }}</span>
        <input
          v-model="weights[fund.id]"
          data-testid="rule-weight"
          type="number"
          step="1"
          min="0"
          max="100"
          class="border-input bg-background w-24 rounded-md border px-3 py-2 text-right text-sm tabular-nums"
        >
      </label>
    </fieldset>

    <p v-if="error" data-testid="rule-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <div>
      <Button type="submit" size="sm">
        Añadir regla
      </Button>
    </div>
  </form>
</template>
