import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-config-prettier'

export default defineConfig(
  { ignores: ['dist', 'coverage', 'reports', '.stryker-tmp', 'public/mockServiceWorker.js'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // Components and hooks go through api.ts, and api.ts calls apiFetch (it sends the cookie).
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Call apiFetch from a feature api.ts file.' },
      ],
    },
  },
  { files: ['src/shared/apiFetch.ts'], rules: { 'no-restricted-globals': 'off' } },
)
