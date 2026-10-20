import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative base: the build works from any folder on the host (public_html/ or a subfolder).
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/mocks/**', 'src/test/**'],
    },
  },
})
