<script setup lang="ts">
import { computed } from 'vue'
import { Card } from '~/components/ui/card'

/**
 * A secondary metric: what was paid in, the annualised return. Deliberately
 * *not* what the headline uses — if everything on a dashboard is emphasised
 * then nothing is, and this screen has one figure that leads and two that
 * support.
 *
 * The card formats nothing. It receives strings that `app/utils/format.ts`
 * has already turned into Spanish typography, which is what keeps every
 * figure in the application coming out of one place.
 */
const props = withDefaults(defineProps<{
  /** Spanish label, e.g. `Aportado`. */
  label: string
  /** The figure, already formatted by `app/utils/format.ts`. */
  value: string
  /** One line of plain-Spanish explanation under the figure. */
  hint?: string
  tone?: 'neutral' | 'positive' | 'negative'
}>(), {
  tone: 'neutral',
})

/**
 * Colour repeats the meaning, it never carries it: the `+` or `-` is already
 * in the string this card was handed.
 */
const TONE_CLASS = {
  neutral: 'text-foreground',
  positive: 'text-positive',
  negative: 'text-destructive',
} as const

const toneClass = computed(() => TONE_CLASS[props.tone])
</script>

<template>
  <Card size="sm" class="gap-1 px-5">
    <p class="text-muted-foreground text-xs font-medium">
      {{ label }}
    </p>

    <p
      data-testid="summary-value"
      class="font-heading text-xl font-semibold tabular-nums whitespace-nowrap"
      :class="toneClass"
    >
      {{ value }}
    </p>

    <p v-if="hint" data-testid="summary-hint" class="text-muted-foreground max-w-prose text-xs">
      {{ hint }}
    </p>
  </Card>
</template>
