import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // `unit` is fast and needs no Docker. `db` starts one real MariaDB for its files (D-36).
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.db.test.ts', 'node_modules/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          globalSetup: ['src/test/dbGlobalSetup.ts'],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/generated/**',
        'src/server.ts',
        'src/instrumentation.ts',
        'src/test/**',
        'src/**/*.test.ts',
      ],
      // Match the SonarCloud default gate (80% coverage).
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
