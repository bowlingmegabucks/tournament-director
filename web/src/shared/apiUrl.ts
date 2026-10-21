/**
 * Build the URL for an API path. VITE_API_BASE_URL is `/api` in dev (the Vite proxy strips it),
 * empty under mocks and tests, and the API host in production, where the site and the API are on
 * different origins.
 * Read at call time so tests can set it.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  let end = base.length
  // Past the start, `base[-1]` is undefined, so an empty or all-slash base stops the loop at 0.
  while (base[end - 1] === '/') end--
  return `${base.slice(0, end)}${path}`
}
