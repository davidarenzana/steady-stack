<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

/**
 * A request that failed, said plainly. This application downloads net asset
 * values from a third party over the network, which is the one part of it that
 * can fail for reasons the user did not cause, so a screen needs somewhere
 * honest to put "Yahoo respondió 502" — not a silent zero, which would read as
 * a portfolio worth nothing.
 *
 * `role="alert"` because a failure that is only red is a failure a screen
 * reader never mentions. The default slot is where a retry button goes, and
 * both texts come from the caller, in Spanish.
 */
defineProps<{ title: string, detail?: string }>()
</script>

<template>
  <div
    role="alert"
    class="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
  >
    <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />

    <div class="flex-1">
      <p class="font-medium">
        {{ title }}
      </p>
      <p v-if="detail" class="text-destructive/80 mt-1">
        {{ detail }}
      </p>
      <div v-if="$slots.default" class="mt-3">
        <slot />
      </div>
    </div>
  </div>
</template>
