<script setup lang="ts">
/**
 * The four sections of the application. Labels in Spanish, because the
 * interface is; paths in Spanish too, since they are part of the interface a
 * user sees in the address bar.
 *
 * `NuxtLink` needs no import — it is a global component in a Nuxt application
 * — and it is stubbed when this file is mounted by Vitest, which is why this
 * component takes no props and reads no route: `useRoute()` would tie it to a
 * router that does not exist under plain Vitest.
 *
 * The active link is marked with `aria-current="page"`, which `RouterLink`
 * applies by itself on an exactly-active link — `ariaCurrentValue` defaults to
 * `'page'`. Nothing here has to compute it, and a class alone would not do:
 * `router-link-active` is styling, not an accessible state. Asserted for real
 * in the server-rendered HTML by `test/routes/pages.test.ts`.
 */
const SECTIONS = [
  { label: 'Resumen', to: '/' },
  { label: 'Aportaciones', to: '/aportaciones' },
  { label: 'Fondos', to: '/fondos' },
  { label: 'Escenarios', to: '/escenarios' },
] as const
</script>

<template>
  <nav aria-label="Secciones" class="flex items-center gap-1">
    <NuxtLink
      v-for="section in SECTIONS"
      :key="section.to"
      :to="section.to"
      class="text-muted-foreground hover:text-foreground hover:bg-muted aria-[current=page]:text-foreground aria-[current=page]:bg-muted rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
    >
      {{ section.label }}
    </NuxtLink>
  </nav>
</template>
