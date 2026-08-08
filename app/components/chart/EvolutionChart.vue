<script setup lang="ts">
import { computed, ref } from 'vue'
import { VisAxis, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from '@unovis/vue'
import type { EvolutionRange } from './evolution-range'
import { DEFAULT_EVOLUTION_RANGE, EVOLUTION_RANGE_LABELS, pointsInRange } from './evolution-range'
import type { EvolutionPoint, EvolutionSeries } from './evolution-series'
import { formatEuros, formatInteger, formatMonth } from '~/utils/format'

/**
 * **The only file in this project that imports `@unovis/vue`.** Section 3 of
 * the spec asks for the charting library to be replaceable by touching one
 * file, and this is that file: everything above it speaks in `EvolutionPoint`
 * and `EvolutionSeries`, which belong to this project. If a second file ever
 * imports the library, this wrapper has failed at its only job.
 *
 * The chart is deliberately quiet. Two lines matter — the real portfolio
 * against the theory — so there are no gradients, no area fills, no point
 * markers over 301 months and no load animation. The real line is the
 * strongest thing in the plot.
 */
const props = withDefaults(defineProps<{
  /** Every point of the horizon. The component windows them itself. */
  points: EvolutionPoint[]
  series: EvolutionSeries[]
  /** Pixel height of the plot. */
  height?: number
}>(), {
  height: 320,
})

/**
 * The visible range is this component's own state, so the page does not have
 * to own something only the chart cares about.
 */
const range = ref<EvolutionRange>(DEFAULT_EVOLUTION_RANGE)

const visiblePoints = computed(() => pointsInRange(props.points, range.value))

const RANGES = Object.keys(EVOLUTION_RANGE_LABELS) as EvolutionRange[]

/** Only while something is hidden: a caption over the full horizon would be noise. */
const caption = computed(() => visiblePoints.value.length < props.points.length
  ? `Mostrando ${visiblePoints.value.length} meses de ${props.points.length}. Cambia el rango para ver todo el horizonte.`
  : undefined)

/** The x-axis is an index, so a tick has to look its month up. Years only — 301 months would print 301 labels. */
function formatXTick(value: number): string {
  return visiblePoints.value[value]?.month.slice(0, 4) ?? ''
}

/** Euros without cents on the axis: the scale is thousands and the decimals are noise there. */
function formatYTick(value: number): string {
  return `${formatInteger(value)} €`
}

/**
 * Back to cents before formatting, because `app/utils/format.ts` speaks cents
 * and the chart is the one place that holds euros as a float.
 */
function formatTooltipValue(euros: number | undefined): string {
  return euros === undefined ? '—' : formatEuros(Math.round(euros * 100))
}

function crosshairTemplate(point: EvolutionPoint): string {
  const rows = props.series
    .map(line => `${line.label}: ${formatTooltipValue(line.accessor(point))}`)
    .join('<br/>')
  return `<strong>${formatMonth(point.month)}</strong><br/>${rows}`
}
</script>

<template>
  <p v-if="props.series.length === 0" data-testid="chart-empty" class="text-muted-foreground text-sm">
    Todavía no hay datos para el gráfico
  </p>

  <div v-else>
    <!-- Native buttons rather than a reka-ui widget: this component is
         unit-tested under happy-dom, and a range control is four buttons. -->
    <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
      <ul data-testid="chart-legend" class="flex flex-wrap items-center gap-4">
        <li
          v-for="item in props.series"
          :key="item.key"
          data-testid="chart-legend-item"
          class="text-muted-foreground flex items-center gap-2 text-xs"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: item.color }"
            aria-hidden="true"
          />
          {{ item.label }}
        </li>
      </ul>

      <div class="flex items-center gap-1">
        <button
          v-for="option in RANGES"
          :key="option"
          type="button"
          data-testid="chart-range"
          :aria-pressed="range === option"
          class="text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground rounded-md px-2 py-1 text-xs font-medium"
          @click="range = option"
        >
          {{ EVOLUTION_RANGE_LABELS[option] }}
        </button>
      </div>
    </div>

    <VisXYContainer :data="visiblePoints" :height="props.height">
      <!-- `fallback-value` is deliberately not set: its default of `undefined`
           is what breaks the real line where the data stops, instead of
           dropping it to the axis and drawing a loss that never happened. -->
      <VisLine
        v-for="item in props.series"
        :key="item.key"
        :x="(point: EvolutionPoint) => point.index"
        :y="item.accessor"
        :color="item.color"
        :interpolate-missing-data="false"
      />

      <VisAxis type="x" :tick-format="formatXTick" />
      <VisAxis type="y" :tick-format="formatYTick" />
      <VisCrosshair :template="crosshairTemplate" />
      <VisTooltip />
    </VisXYContainer>

    <p v-if="caption" data-testid="chart-caption" class="text-muted-foreground mt-2 text-xs">
      {{ caption }}
    </p>
  </div>
</template>
