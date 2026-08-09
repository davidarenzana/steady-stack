<script setup lang="ts">
import { ref } from 'vue'
import Decimal from '~~/core/decimal'
import type { IsoDate } from '~~/core/types'
import { Button } from '~/components/ui/button'

/**
 * Enters a net asset value by hand — the escape hatch for a fund no provider
 * quotes, and the correction for one it quotes wrongly. A value entered here
 * always prevails: the sync never overwrites a `manual` row.
 *
 * **The value is emitted as the string that was typed**, and that is the point
 * of the manual binding below rather than a `v-model`. A NAV is a decimal string
 * from the input to the database, and `PUT /api/nav` rejects a JSON number by
 * design; Vue coerces the model of an `<input type="number">` through
 * `looseToNumber`, so a `v-model` here would put a float in the middle of the
 * one pipeline that was built to avoid them.
 *
 * The date rules duplicate what `readIsoDateNotAfter` enforces on the route.
 * That duplication is deliberate: the route answers in English with a 400, and a
 * future NAV is a mistake worth catching before the user has to read one.
 */
const props = defineProps<{
  funds: Array<{ id: string, name: string }>
  /**
   * Today, as `YYYY-MM-DD`. Injected so the boundary of the future-date rule can
   * be asserted without the test depending on the day it runs; the page passes
   * the real clock.
   */
  today: IsoDate
}>()

const emit = defineEmits<{
  submit: [payload: { fundId: string, date: IsoDate, value: string }]
}>()

const fundId = ref(props.funds[0]?.id ?? '')
const date = ref('')
/** The raw text of the input, never a number — see the note above. */
const value = ref('')

const error = ref<string>()

/** A decimal string strictly greater than zero. Matched before `Decimal`, which throws on anything else. */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

function onSubmit() {
  if (date.value === '') {
    error.value = 'Indica una fecha.'
    return
  }

  // Months are compared as strings throughout this project because
  // `YYYY-MM-DD` sorts lexicographically the same as chronologically, and a
  // date comparison is the same trick with no `Date` object involved.
  if (date.value > props.today) {
    error.value = 'La fecha no puede ser futura.'
    return
  }

  const text = value.value.trim().replace(',', '.')
  if (!DECIMAL_PATTERN.test(text) || !new Decimal(text).greaterThan(0)) {
    error.value = 'El valor liquidativo debe ser mayor que 0.'
    return
  }

  error.value = undefined
  emit('submit', { fundId: fundId.value, date: date.value, value: text })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Fondo</span>
        <select
          v-model="fundId"
          data-testid="nav-fund"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          <option v-for="fund in props.funds" :key="fund.id" :value="fund.id">
            {{ fund.name }}
          </option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Fecha</span>
        <input
          v-model="date"
          data-testid="nav-date"
          type="date"
          :max="props.today"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Valor liquidativo</span>
        <!-- Bound by hand rather than with `v-model`: the typed text has to
             survive to the payload as a string. -->
        <input
          :value="value"
          data-testid="nav-value"
          type="number"
          step="0.0001"
          min="0"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm tabular-nums"
          @input="value = ($event.target as HTMLInputElement).value"
        >
      </label>
    </div>

    <p v-if="error" data-testid="nav-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <div>
      <Button type="submit" size="sm" variant="outline">
        Guardar valor liquidativo
      </Button>
    </div>
  </form>
</template>
