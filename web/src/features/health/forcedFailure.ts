const FAILURE_RATE = 0.5

/**
 * True about half the time under the dev server with mocks on (`npm run dev:mocks`), so you can
 * see the error toast locally. Never under `npm run dev` (a failure there would look like a real
 * API outage), in tests, or in a build. The e2e tests force failures with Playwright routes.
 */
export function shouldForceFailure(random: () => number = Math.random): boolean {
  return (
    import.meta.env.DEV &&
    import.meta.env.MODE !== 'test' &&
    import.meta.env.VITE_USE_MOCKS === 'true' &&
    random() < FAILURE_RATE
  )
}
