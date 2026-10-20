import { apiUrl } from '../../shared/apiUrl'
import { shouldForceFailure } from './forcedFailure'

/** Resolve if the API says it is healthy. Reject with a message the user can read. */
export async function checkHealth(): Promise<void> {
  if (shouldForceFailure()) throw new Error('forced failure')
  let response: Response
  try {
    response = await fetch(apiUrl('/health'))
  } catch {
    // fetch rejects for network and CORS failures, and its message ("Failed to fetch") says little.
    throw new Error('Could not reach the API')
  }
  if (!response.ok) {
    throw new Error(`API health check failed (${response.status})`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('API health check failed (response is not JSON)')
  }
  if (typeof body !== 'object' || body === null || !('status' in body) || body.status !== 'ok') {
    throw new Error('API health check failed (unexpected response)')
  }
}
