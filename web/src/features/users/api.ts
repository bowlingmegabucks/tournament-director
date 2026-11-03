import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import type { CreatedUser, NewUser, UserOptions } from './types'

/** A failed add. The message is what the page shows. */
export class CreateUserError extends Error {}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export async function fetchUserOptions(): Promise<UserOptions> {
  const failure = 'The user options could not be loaded'
  const response = await apiFetch(apiUrl('/v1/users/options'))
  if (!response.ok) throw new Error(`${failure}. Try again.`)
  const body = await readJson(response, failure)
  const roles = field(body, 'roles')
  const inviteEmail = field(body, 'inviteEmail')
  if (!isTextList(roles) || typeof inviteEmail !== 'boolean') {
    throw new Error(`${failure} (unexpected response)`)
  }
  return { roles, inviteEmail }
}

// The API's own words for these answers are safe to show: 400 (what to fix), 409 (email in use),
// 502 (the invite mail failed), 503 (email not set up, or the database is down).
const showApiMessage = new Set([400, 409, 502, 503])

async function createFailure(response: Response): Promise<CreateUserError> {
  if (response.status === 401) {
    return new CreateUserError('You are signed out. Sign in again and retry.')
  }
  if (response.status === 403) return new CreateUserError('Only an admin can add users.')
  if (showApiMessage.has(response.status)) {
    try {
      const message = field(await response.json(), 'message')
      if (typeof message === 'string' && message !== '') return new CreateUserError(message)
    } catch {
      // Not JSON: fall through to the general message.
    }
  }
  return new CreateUserError('The user could not be added. Try again.')
}

function isCreatedUser(value: unknown): value is CreatedUser {
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'email') === 'string' &&
    typeof field(value, 'name') === 'string' &&
    isTextList(field(value, 'roles'))
  )
}

/** Add a user. The API emails them a link to choose a password. */
export async function createUser(input: NewUser): Promise<CreatedUser> {
  let response: Response
  try {
    response = await apiFetch(apiUrl('/v1/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new CreateUserError('Could not reach the server. Try again.')
  }
  if (!response.ok) throw await createFailure(response)
  const body = await readJson(response, 'The user was added, but the answer could not be read')
  if (!isCreatedUser(body)) {
    throw new CreateUserError('The user was added, but the answer could not be read.')
  }
  return body
}
