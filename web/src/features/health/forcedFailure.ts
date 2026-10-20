const FAILURE_RATE = 0.5

/**
 * True about half the time, and only under `npm run dev` (Vite mode "development"), so you can
 * see the error toast locally. Tests run in mode "test" and production builds in "production".
 */
export function shouldForceFailure(random: () => number = Math.random): boolean {
  return import.meta.env.MODE === 'development' && random() < FAILURE_RATE
}
