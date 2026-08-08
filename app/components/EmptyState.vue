<script setup lang="ts">
import { Inbox } from '@lucide/vue'
import { Card } from '~/components/ui/card'

/**
 * What a screen shows where a table would be if there were anything in it.
 * This application starts empty by design — no NAVs, no purchases, nothing
 * materialised — so an empty table is the *normal* first state and deserves a
 * sentence explaining what would fill it, not a blank rectangle.
 *
 * The default slot is the action that would end the emptiness: "añadir regla",
 * "sincronizar valores". Both texts come from the caller, in Spanish; this
 * component hard-codes none, since only the screen knows what is missing.
 *
 * Imports are written out in full rather than relying on Nuxt's auto-imports,
 * per the ruling of task 2.1: this component is mounted by Vitest, where no
 * auto-import exists.
 */
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <Card class="items-center px-6 py-12 text-center">
    <Inbox class="text-muted-foreground/60 size-8" aria-hidden="true" />

    <div>
      <p class="font-heading font-medium">
        {{ title }}
      </p>
      <p v-if="description" class="text-muted-foreground mx-auto mt-1 max-w-prose text-sm">
        {{ description }}
      </p>
    </div>

    <slot />
  </Card>
</template>
