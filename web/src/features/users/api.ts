import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import type { CreatedUser, ListedUser, NewUser, UserOptions } from './types'

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

function isListedUser(value: unknown): value is ListedUser {
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'email') === 'string' &&
    typeof field(value, 'name') === 'string' &&
    isTextList(field(value, 'roles')) &&
    typeof field(value, 'disabled') === 'boolean'
  )
}

export async function fetchUsers(): Promise<ListedUser[]> {
  const failure = 'The users could not be loaded'
  const response = await apiFetch(apiUrl('/v1/users'))
  if (!response.ok) throw new Error(`${failure}. Try again.`)
  const users = field(await readJson(response, failure), 'users')
  if (!Array.isArray(users) || !users.every(isListedUser)) {
    throw new Error(`${failure} (unexpected response)`)
  }
  return users
}

/** A failed reset. The message is what the page shows. */
export class ResetPasswordError extends Error {}

async function resetFailure(response: Response): Promise<ResetPasswordError> {
  if (response.status === 401) {
    return new ResetPasswordError('You are signed out. Sign in again and retry.')
  }
  if (response.status === 403) return new ResetPasswordError('Only an admin can reset passwords.')
  if (response.status === 404) {
    return new ResetPasswordError('That user no longer exists. Reload the list.')
  }
  if (response.status === 502 || response.status === 503) {
    try {
      const message = field(await response.json(), 'message')
      if (typeof message === 'string' && message !== '') return new ResetPasswordError(message)
    } catch {
      // Not JSON: fall through to the general message.
    }
  }
  return new ResetPasswordError('The reset link could not be sent. Try again.')
}

/** Email the user a link to choose a new password. The admin never sees a password. */
export async function sendPasswordReset(userId: string): Promise<void> {
  let response: Response
  try {
    response = await apiFetch(apiUrl(`/v1/users/${encodeURIComponent(userId)}/password-reset`), {
      method: 'POST',
    })
  } catch {
    throw new ResetPasswordError('Could not reach the server. Try again.')
  }
  if (!response.ok) throw await resetFailure(response)
}

/** A failed disable, enable, or role change. The message is what the page shows. */
export class EditUserError extends Error {}

// The API's own words are safe to show for these: 400 (what to fix), 409 (last admin, or yourself),
// 503 (the database is down).
const showEditMessage = new Set([400, 409, 503])

async function editFailure(response: Response, fallback: string): Promise<EditUserError> {
  if (response.status === 401)
    return new EditUserError('You are signed out. Sign in again and retry.')
  if (response.status === 403) return new EditUserError('Only an admin can change users.')
  if (response.status === 404)
    return new EditUserError('That user no longer exists. Reload the list.')
  if (showEditMessage.has(response.status)) {
    try {
      const message = field(await response.json(), 'message')
      if (typeof message === 'string' && message !== '') return new EditUserError(message)
    } catch {
      // Not JSON: fall through to the general message.
    }
  }
  return new EditUserError(fallback)
}

async function send(path: string, init: RequestInit, fallback: string): Promise<Response> {
  let response: Response
  try {
    response = await apiFetch(apiUrl(path), init)
  } catch {
    throw new EditUserError('Could not reach the server. Try again.')
  }
  if (!response.ok) throw await editFailure(response, fallback)
  return response
}

/** Disable a user (ends their sessions) or enable them again. Nothing is deleted. */
export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  const action = disabled ? 'disable' : 'enable'
  await send(
    `/v1/users/${encodeURIComponent(userId)}/${action}`,
    { method: 'POST' },
    `The user could not be ${disabled ? 'disabled' : 'enabled'}. Try again.`,
  )
}

/** Replace a user's roles with the given set. */
export async function updateUserRoles(userId: string, roles: string[]): Promise<ListedUser> {
  const response = await send(
    `/v1/users/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles }),
    },
    'The roles could not be saved. Try again.',
  )
  const body = await readJson(response, 'The roles were saved, but the answer could not be read')
  if (!isListedUser(body)) {
    throw new EditUserError('The roles were saved, but the answer could not be read.')
  }
  return body
}
