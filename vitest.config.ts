import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // El motor de cálculo son funciones puras: no necesita DOM ni el
        // entorno de Nuxt, y arrancarlos solo lo haría más lento.
        test: {
          name: 'core',
          include: ['core/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Tests de componente. Se llenará en el plan 3.
        test: {
          name: 'app',
          include: ['app/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
    ],
  },
})
