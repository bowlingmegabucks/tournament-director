import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { waitMessage } from '../../shared/waitMessage'

/** A failed account change. The message is what the page shows. */
export class AccountError extends Error {}

async function failure(response: Response, what: string): Promise<AccountError> {
  if (response.status === 401) {
    return new AccountError('You are signed out. Sign in again and retry.')
  }
  if (response.status === 429) {
    return new AccountError(waitMessage(response.headers.get('Retry-After')))
  }
  // The API's own words are safe to show for a 400: it says what to fix ("The current password is wrong.").
  if (response.status === 400) {
    try {
      const message = field(await response.json(), 'message')
      if (typeof message === 'string' && message !== '') return new AccountError(message)
    } catch {
      // Not JSON: fall through to the general message.
    }
  }
  return new AccountError(`${what} Try again.`)
}

/** Send a JSON request. A network failure becomes an `AccountError`; a bad status is the caller's to judge. */
async function send(path: string, method: 'POST' | 'PATCH', body: object): Promise<Response> {
  try {
    return await apiFetch(apiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AccountError('Could not reach the server. Try again.')
  }
}

/** Change the signed-in user's password. The API ends their other sessions and keeps this one. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await send('/v1/account/password', 'POST', { currentPassword, newPassword })
  if (!response.ok) throw await failure(response, 'The password could not be changed.')
}

/** Change the signed-in user's own name. Returns the name the API saved (trimmed). */
export async function updateName(name: string): Promise<string> {
  const response = await send('/v1/account', 'PATCH', { name })
  if (!response.ok) throw await failure(response, 'The name could not be saved.')
  const body = await readJson(response, 'The name was saved, but the answer could not be read')
  const saved = field(body, 'name')
  if (typeof saved !== 'string') {
    throw new AccountError('The name was saved, but the answer could not be read.')
  }
  return saved
}
