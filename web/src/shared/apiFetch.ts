/**
 * `fetch` for our API. It always sends the session cookie, which the browser withholds from a
 * different origin unless asked (the API is on its own subdomain from 0.4.0). Pass the URL from
 * `apiUrl`.
 */
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: 'include' })
}
