import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Absolute base: deep links such as /tournaments/abc load assets from <base>assets/..., so it must
  // match where the site sits. Local runs use '/'; the deploy sets WEB_BASE_PATH=/tournament-director/.
  // public/.htaccess sends deep links to index.html.
  base: process.env.WEB_BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    // The browser calls /api/... on the dev server (VITE_API_BASE_URL=/api in .env.development).
    // Vite strips the prefix and forwards to the API (api/ default port), which serves from the root.
    // Same origin, so no CORS in dev.
    proxy: {
      '/api': { target: 'http://localhost:3000', rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/mocks/**', 'src/test/**'],
      // Match the SonarCloud default gate (80% coverage). Vitest checks the whole project, not only new code.
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
