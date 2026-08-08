<script setup lang="ts">
import { computed } from 'vue'
import { Check, Circle } from '@lucide/vue'
import { Card } from '~/components/ui/card'

/**
 * On a clean checkout this *is* the dashboard. The seed gives the portfolio
 * two contribution rules and nothing else — no purchases, no net asset values,
 * no provider symbols — so there is genuinely nothing to value yet.
 *
 * "No hay datos" would be accurate and useless. The portfolio has a plan; what
 * it lacks is history, and there are exactly three steps between the user and
 * a working screen. This state names them, says which are already done, and
 * links to where each one happens. It renders no figure at all: a `0,00 €`
 * here would be a claim that the portfolio is worth nothing rather than the
 * absence it actually is.
 *
 * The links are plain `<a href>` rather than `NuxtLink`, because this
 * component is mounted outside Nuxt in its test and a full page load inside a
 * local application is a fair price for needing no framework.
 */
const props = defineProps<{
  /** Every fund the portfolio holds, with what is still missing on each. */
  funds: Array<{ id: string, name: string, providerSymbol: string | null, hasNav: boolean }>
}>()

/** Named rather than abstract: which funds still need a share class chosen. */
const missingSymbol = computed(() => props.funds.filter(fund => fund.providerSymbol === null))

const steps = computed(() => [
  {
    label: props.funds.length === 0
      ? 'Añade tus fondos en Fondos'
      : 'Elige el símbolo de cada fondo en Fondos',
    href: '/fondos',
    done: props.funds.length > 0 && missingSymbol.value.length === 0,
    detail: missingSymbol.value.length > 0 && props.funds.length > 0
      ? `Falta el símbolo de: ${missingSymbol.value.map(fund => fund.name).join(', ')}`
      : undefined,
  },
  {
    label: 'Descarga los valores liquidativos desde Fondos',
    href: '/fondos',
    done: props.funds.length > 0 && props.funds.every(fund => fund.hasNav),
    detail: undefined,
  },
  {
    // Never done here: had the contributions been materialised there would be
    // purchases, and this component would not be on screen.
    label: 'Materializa las aportaciones en Aportaciones',
    href: '/aportaciones',
    done: false,
    detail: undefined,
  },
])
</script>

<template>
  <Card class="px-6 py-8">
    <div>
      <h2 class="font-heading text-lg font-semibold tracking-tight">
        Todavía no hay nada que valorar
      </h2>
      <p class="text-muted-foreground mt-2 max-w-prose text-sm">
        La cartera ya tiene su plan de aportaciones, pero aún no se ha comprado nada.
        Estos son los tres pasos que faltan.
      </p>
    </div>

    <ol class="mt-6 flex flex-col gap-4">
      <li v-for="(step, index) in steps" :key="index" class="flex items-start gap-3">
        <component
          :is="step.done ? Check : Circle"
          data-testid="step-icon"
          class="mt-0.5 size-4 shrink-0"
          :class="step.done ? 'text-positive' : 'text-muted-foreground/60'"
          aria-hidden="true"
        />

        <div class="flex-1">
          <a :href="step.href" class="text-sm font-medium underline-offset-4 hover:underline">
            {{ step.label }}
          </a>
          <p v-if="step.detail" class="text-muted-foreground mt-1 text-xs">
            {{ step.detail }}
          </p>
        </div>

        <!-- Text, not only a colour or an icon: the state has to survive for
             anyone who cannot distinguish the hues. -->
        <span
          data-testid="step-state"
          class="shrink-0 text-xs font-medium"
          :class="step.done ? 'text-positive' : 'text-muted-foreground'"
        >
          {{ step.done ? 'Hecho' : 'Pendiente' }}
        </span>
      </li>
    </ol>
  </Card>
</template>
