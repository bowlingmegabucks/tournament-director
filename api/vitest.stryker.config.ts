import { defineConfig } from 'vitest/config'

// Stryker runs the tests once per mutant, often in parallel. The `db` project starts a Docker
// container and shares one database, so mutation runs only the `unit` project (D-36).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.db.test.ts', 'node_modules/**'],
  },
})
