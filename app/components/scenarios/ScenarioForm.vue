<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '~/components/ui/button'
import { parsePercentToRate } from '~/utils/rate'

/**
 * Adds a scenario: a name, a theoretical annual return, and the colour its line
 * takes on the dashboard chart.
 *
 * The rate is typed as a percentage because that is what a person says — `9`,
 * not `0.09` — and emitted as the decimal string the API stores. The conversion
 * is `parsePercentToRate`, through `Decimal`, and it has to happen here: Vue
 * coerces the model of an `<input type="number">` through `looseToNumber`, and
 * `POST /api/scenarios` rejects a JSON number outright because
 * `readDecimalString` refuses to coerce.
 *
 * The five colours are the theme's own `chart-1` … `chart-5` tokens and nothing
 * else. `TODO.md` records that the API accepts any string; the interface
 * restricts it by offering no other option, because a token outside the palette
 * resolves to no colour at all and the line simply vanishes from the chart.
 */
const emit = defineEmits<{
  submit: [payload: {
    id: string
    name: string
    annualRate: string
    color: string
    enabled: boolean
  }]
}>()

/** The palette, in the order the theme declares it. */
const COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

const id = ref('')
const name = ref('')
/** `string | number` because Vue coerces an `<input type="number">` model to a number as soon as it is typed into. */
const rate = ref<string | number>('')
const color = ref('')
const enabled = ref(true)

const error = ref<string>()

function onSubmit() {
  const values = { id: id.value.trim(), name: name.value.trim() }

  if (values.id === '') {
    error.value = 'Indica un identificador.'
    return
  }
  if (values.name === '') {
    error.value = 'Indica un nombre.'
    return
  }

  // `String(...)` because of the coercion noted on the ref above: the parser
  // takes text, and the component is where the DOM's quirk is absorbed.
  const annualRate = parsePercentToRate(String(rate.value))
  if (annualRate === null) {
    error.value = 'Indica una rentabilidad anual válida.'
    return
  }

  if (color.value === '') {
    error.value = 'Elige un color.'
    return
  }

  error.value = undefined
  emit('submit', { ...values, annualRate, color: color.value, enabled: enabled.value })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Identificador</span>
        <input
          v-model="id"
          data-testid="scenario-id"
          type="text"
          placeholder="moderado"
          class="border-input bg-background rounded-md border px-3 py-2 font-mono text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Nombre</span>
        <input
          v-model="name"
          data-testid="scenario-name"
          type="text"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Rentabilidad anual (%)</span>
        <input
          v-model="rate"
          data-testid="scenario-rate"
          type="number"
          step="0.01"
          min="0"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm tabular-nums"
        >
      </label>
    </div>

    <fieldset class="flex flex-col gap-2 text-sm">
      <legend class="mb-1 font-medium">Color</legend>
      <div class="flex flex-wrap gap-4">
        <label v-for="token in COLORS" :key="token" class="flex items-center gap-2">
          <input
            v-model="color"
            :data-testid="`scenario-color-${token}`"
            type="radio"
            name="scenario-color"
            :value="token"
          >
          <span
            class="border-border size-3 shrink-0 rounded-full border"
            :style="{ backgroundColor: `var(--${token})` }"
            aria-hidden="true"
          />
          <span class="text-muted-foreground font-mono text-xs">{{ token }}</span>
        </label>
      </div>
    </fieldset>

    <label class="flex items-center gap-2 text-sm">
      <input v-model="enabled" data-testid="scenario-active" type="checkbox">
      Activo
    </label>

    <p v-if="error" data-testid="scenario-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <div>
      <Button type="submit" size="sm">
        Añadir escenario
      </Button>
    </div>
  </form>
</template>
