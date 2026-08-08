import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // The calculation engine is pure functions: it needs neither the DOM nor
        // the Nuxt environment, and starting them would only make it slower.
        test: {
          name: 'core',
          include: ['core/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // The persistence layer and the price providers. Node, because they talk
        // to better-sqlite3 and to the file system. `~~/` is mapped by hand: Nitro
        // and tsx resolve it on their own, Vitest does not.
        resolve: {
          alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
        },
        test: {
          name: 'server',
          include: ['server/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Component tests. `@vue/test-utils` over happy-dom, per section 11 of
        // the spec: no browser, no server — given a state, does the component
        // render the right thing. Nuxt's own aliases are re-declared by hand
        // because these files are compiled by Vitest, not by Nuxt, and for the
        // same reason a component under test imports nothing from Nuxt: no
        // auto-imports exist here, so every import is written out in full. A
        // component that cannot manage that is a page, and pages are covered
        // over HTTP in `test/routes/pages.test.ts` instead.
        plugins: [vue()],
        resolve: {
          alias: {
            '~~': fileURLToPath(new URL('.', import.meta.url)),
            '~': fileURLToPath(new URL('./app', import.meta.url)),
            '@': fileURLToPath(new URL('./app', import.meta.url)),
          },
        },
        test: {
          name: 'app',
          include: ['app/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
      {
        // Route tests. Each file boots a real Nuxt server through @nuxt/test-utils,
        // which is the only way `h3` resolves — the same constraint that confined
        // Nitro auto-imports to `server/api/**` throughout plan 2. `fileParallelism:
        // false` keeps six Nuxt builds from running at once — Vitest 4 folded
        // `poolOptions.forks.singleFork` into this top-level option; see
        // https://vitest.dev/guide/migration#pool-rework.
        resolve: {
          alias: { '~~': fileURLToPath(new URL('.', import.meta.url)) },
        },
        test: {
          name: 'routes',
          include: ['test/routes/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          fileParallelism: false,
          hookTimeout: 180_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
