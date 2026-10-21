// The package ships `register-hooks.d.ts`, but TypeScript looks for `.d.mts` next to a `.mjs` import.
declare module 'import-in-the-middle/register-hooks.mjs' {
  export function register(): void
  export function supportsSyncHooks(): boolean
}
