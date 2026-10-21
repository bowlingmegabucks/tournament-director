import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/server.ts', 'src/instrumentation.ts', 'src/test/**', 'src/**/*.test.ts'],
      // Match the SonarCloud default gate (80% coverage).
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
