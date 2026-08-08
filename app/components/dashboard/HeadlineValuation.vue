<script setup lang="ts">
import { computed } from 'vue'
import { Minus, TrendingDown, TrendingUp } from '@lucide/vue'
import type { Cents, IsoDate } from '~~/core/types'
import { formatEuros, formatIsoDate, formatSignedEuros, formatSignedPercent } from '~/utils/format'

/**
 * The two questions whoever opens this screen asks first — what is it worth,
 * and am I up — answered in one block. The value is the largest thing on the
 * page by design; everything else on the dashboard is deliberately lighter.
 *
 * The valuation date belongs here rather than in a corner: net asset values
 * publish with about a day of lag, so this figure is normally *not* as of
 * today, and a financial figure with no date is untrustworthy.
 */
const props = defineProps<{
  value: Cents
  gain: Cents
  gainRatio: number
  /** The date the net asset values behind `value` were published. */
  navDate: IsoDate | null
}>()

/**
 * Sign, once, and everything else reads from it. The formatted figure already
 * carries a `+` or a `-`; the icon, the colour and the accessible label repeat
 * that meaning rather than being the only place it exists.
 */
const direction = computed(() => {
  if (props.gain > 0) return 'up' as const
  if (props.gain < 0) return 'down' as const
  return 'flat' as const
})

const DIRECTIONS = {
  up: { icon: TrendingUp, class: 'text-positive', label: 'Ganancia' },
  down: { icon: TrendingDown, class: 'text-destructive', label: 'Pérdida' },
  flat: { icon: Minus, class: 'text-muted-foreground', label: 'Sin variación' },
} as const

const tone = computed(() => DIRECTIONS[direction.value])
</script>

<template>
  <div>
    <p data-testid="headline-label" class="text-muted-foreground text-sm font-medium">
      Valor actual
    </p>

    <p
      data-testid="headline-value"
      class="font-heading mt-1 text-4xl font-semibold tracking-tight tabular-nums whitespace-nowrap sm:text-5xl"
    >
      {{ formatEuros(value) }}
    </p>

    <p
      data-testid="headline-gain"
      :aria-label="tone.label"
      class="mt-2 flex items-center gap-2 text-base font-medium tabular-nums"
      :class="tone.class"
    >
      <component :is="tone.icon" class="size-4 shrink-0" aria-hidden="true" />
      <span class="whitespace-nowrap">{{ formatSignedEuros(gain) }}</span>
      <span class="text-muted-foreground/50" aria-hidden="true">·</span>
      <span class="whitespace-nowrap">{{ formatSignedPercent(gainRatio) }}</span>
    </p>

    <p data-testid="valuation-date" class="text-muted-foreground mt-3 text-xs">
      <template v-if="navDate">Valorado con datos del {{ formatIsoDate(navDate) }}</template>
      <template v-else>Sin valor liquidativo disponible todavía</template>
    </p>
  </div>
</template>
