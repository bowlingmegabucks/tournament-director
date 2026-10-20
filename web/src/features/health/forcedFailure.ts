const FAILURE_RATE = 0.5

/**
 * True about half the time under `npm run dev:mocks`, so you can see the error toast locally.
 * Never under `npm run dev` (a failure there would look like a real API outage), in tests, or in a
 * production build.
 */
export function shouldForceFailure(random: () => number = Math.random): boolean {
  return import.meta.env.DEV && import.meta.env.MODE === 'mocks' && random() < FAILURE_RATE
}
