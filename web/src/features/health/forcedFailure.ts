const FAILURE_RATE = 0.5

/**
 * True about half the time under the dev server (`npm run dev` and `npm run dev:mocks`), so you
 * can see the error toast locally. Never in tests (mode "test") or in a production build.
 */
export function shouldForceFailure(random: () => number = Math.random): boolean {
  return import.meta.env.DEV && import.meta.env.MODE !== 'test' && random() < FAILURE_RATE
}
