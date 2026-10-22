import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default defineConfig(
  { ignores: ['dist', 'coverage', 'reports', '.stryker-tmp', 'src/generated'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // Read the environment once, in config.ts. Everything else takes config as an argument.
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Read process.env only in config.ts.' },
      ],
    },
  },
  { files: ['**/config.ts', '**/*.test.ts'], rules: { 'no-restricted-properties': 'off' } },
)
