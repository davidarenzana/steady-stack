<template>
  <div class="bg-background text-foreground min-h-dvh">
    <header class="bg-background/80 border-border sticky top-0 z-10 border-b backdrop-blur">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <NuxtLink to="/" class="font-heading text-sm font-semibold tracking-tight">
          Steady Stack
        </NuxtLink>
        <AppNav />
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-10">
      <slot />
    </main>
  </div>
</template>
