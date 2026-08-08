<script setup lang="ts">
import { ref } from 'vue'
import type { Cents, Month } from '~~/core/types'
import { Button } from '~/components/ui/button'
import { parseEurosToCents } from '~/utils/parse'

/**
 * A one-off exception to the plan: a month skipped, or a month contributed at a
 * different amount. Exceptions are what keep a rule from having to be rewritten
 * for a single unusual month.
 *
 * A skipped month is `amount: null`, and that is not a month worth 0 €:
 * `core/contributions.ts` drops it from the expanded series entirely, so the
 * month simply is not scheduled. The distinction is the whole mechanism.
 */
const emit = defineEmits<{
  submit: [payload: { month: Month, amount: Cents | null, note?: string }]
}>()

const month = ref('')
const skip = ref(false)
/** `string | number` because Vue coerces an `<input type="number">` model to a number as soon as it is typed into. */
const amount = ref<string | number>('')
const note = ref('')

const error = ref<string>()

function onSubmit() {
  if (month.value === '') {
    error.value = 'Indica el mes de la excepción.'
    return
  }

  let cents: Cents | null = null

  if (!skip.value) {
    const parsed = parseEurosToCents(String(amount.value))
    if (parsed === null || parsed === 0) {
      error.value = 'El importe debe ser mayor que 0.'
      return
    }
    cents = parsed
  }

  error.value = undefined

  const trimmedNote = note.value.trim()
  emit('submit', {
    month: month.value,
    amount: cents,
    // Omitted rather than sent empty: `note` is nullable, and an empty string
    // would be a value where none was given.
    ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
  })
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Mes</span>
        <input
          v-model="month"
          data-testid="override-month"
          type="month"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Importe (€)</span>
        <input
          v-model="amount"
          data-testid="override-amount"
          type="number"
          step="0.01"
          min="0"
          :disabled="skip"
          class="border-input bg-background rounded-md border px-3 py-2 text-sm tabular-nums disabled:opacity-50"
        >
      </label>
    </div>

    <label class="flex items-center gap-2 text-sm">
      <input v-model="skip" data-testid="override-skip" type="checkbox">
      Saltar este mes
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="font-medium">Nota</span>
      <input
        v-model="note"
        data-testid="override-note"
        type="text"
        class="border-input bg-background rounded-md border px-3 py-2 text-sm"
      >
    </label>

    <p v-if="error" data-testid="override-error" class="text-destructive text-sm">
      {{ error }}
    </p>

    <div>
      <Button type="submit" size="sm" variant="outline">
        Guardar excepción
      </Button>
    </div>
  </form>
</template>
