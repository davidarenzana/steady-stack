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
