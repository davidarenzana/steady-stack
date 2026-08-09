<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '~/components/ui/button'

/**
 * The projection horizon, in years.
 *
 * It belongs to the portfolio rather than to any one scenario — it is a column
 * on `portfolio`, changed with `PATCH /api/portfolio` — and it decides how many
 * months `GET /api/dashboard` returns for **every** scenario at once. That is
 * not visible from this screen, which is why the note under the field says it.
 *
 * The value is emitted as a number, unlike the rate above it: `horizonYears` is
 * a count of years and `readOptionalPositiveInteger` on the route requires a
 * real integer. A fraction of a year is refused because the projection steps
 * month by month over `horizonYears * 12` and half a year is not a horizon the
 * engine can express.
 */
const props = defineProps<{ horizonYears: number }>()

const emit = defineEmits<{ submit: [years: number] }>()

/** `string | number` because Vue coerces an `<input type="number">` model to a number as soon as it is typed into. */
const years = ref<string | number>(props.horizonYears)

const error = ref<string>()

function onSubmit() {
  const value = Number(years.value)

  if (!Number.isInteger(value) || value <= 0) {
    error.value = 'El horizonte debe ser un número entero de años mayor que 0.'
    return
  }

  error.value = undefined
  emit('submit', value)
}
</script>

<template>
  <form class="flex flex-col gap-3" @submit.prevent="onSubmit">
    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Horizonte (años)</span>
        <input
          v-model="years"
          data-testid="horizon-years"
          type="number"
          step="1"
          min="1"
          max="100"
          class="border-input bg-background w-24 rounded-md border px-3 py-2 text-right text-sm tabular-nums"
        >
      </label>

      <Button type="submit" size="sm" variant="outline">
        Guardar
      </Button>
    </div>

    <p v-if="error" data-testid="horizon-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <p class="text-muted-foreground max-w-prose text-xs">
      El horizonte decide cuántos meses proyecta el gráfico del resumen para todos los escenarios.
    </p>
  </form>
</template>
