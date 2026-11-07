import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Stryker runs the tests once per mutant. This leaves out what a mutation run does not use
// (coverage, CSS processing) so each run starts faster. The unit tests in `vite.config.ts` stay as is.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
