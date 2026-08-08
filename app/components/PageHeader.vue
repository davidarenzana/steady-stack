<script setup lang="ts">
/**
 * The heading of a screen: its title, an optional subtitle, and a slot on the
 * right for whatever that screen lets you do — add a rule, sync the NAVs.
 *
 * Every text arrives as a prop. Nothing here is written in Spanish because
 * nothing here is written at all: the interface language belongs to the pages,
 * and this component would otherwise have to know which screen it is on.
 */
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <header class="mb-8 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="font-heading text-2xl font-semibold tracking-tight">
        {{ title }}
      </h1>
      <p v-if="subtitle" class="text-muted-foreground mt-1 text-sm">
        {{ subtitle }}
      </p>
    </div>

    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
