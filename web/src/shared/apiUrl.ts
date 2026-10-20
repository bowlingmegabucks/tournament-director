/**
 * Build the URL for an API path. VITE_API_BASE_URL is empty in dev (the Vite proxy handles /api)
 * and holds the API host in production, where the site and the API are on different origins.
 * Read at call time so tests can set it.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? ''
  return `${base.replace(/\/+$/, '')}${path}`
}
