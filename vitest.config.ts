import { fileURLToPath } from 'node:url'
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
        // Component tests. To be filled in by plan 3.
        test: {
          name: 'app',
          include: ['app/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
})
