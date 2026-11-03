import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import type { Me, SignedInUser } from './types'

const SECONDS_PER_MINUTE = 60

/** A failed sign-in. The message is what the page shows. */
export class SignInError extends Error {}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSignedInUser(value: unknown): value is SignedInUser {
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'email') === 'string' &&
    typeof field(value, 'name') === 'string' &&
    isStringArray(field(value, 'roles')) &&
    isStringArray(field(value, 'permissions'))
  )
}

/**
 * Who is signed in. A 200 with `user: null` is data (signed out). Any failure throws, so the
 * caller never mistakes "could not check" for "signed out" (D-102).
 */
export async function fetchMe(): Promise<Me> {
  const response = await apiFetch(apiUrl('/v1/me'))
  if (!response.ok) throw new Error('Sign-in could not be checked. Try again.')
  const user = field(await readJson(response, 'Sign-in could not be checked'), 'user')
  if (user === null) return { user: null }
  if (!isSignedInUser(user)) throw new Error('Sign-in could not be checked. Try again.')
  return { user }
}

export function waitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Too many attempts. Try again later.'
  }
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE)
  return `Too many attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`
}

// Stryker disable BlockStatement: the `catch` block only returns `undefined`, which falling out of it does too.
async function errorCode(response: Response): Promise<unknown> {
  try {
    return field(await response.json(), 'code')
  } catch {
    return undefined
  }
}
// Stryker restore BlockStatement

async function signInFailure(response: Response): Promise<SignInError> {
  if (response.status === 401) return new SignInError('Email or password is wrong.')
  if (response.status === 429)
    return new SignInError(waitMessage(response.headers.get('Retry-After')))
  if (response.status === 403) {
    const code = await errorCode(response)
    if (code === 'BANNED_USER') return new SignInError('This account is disabled. Ask an admin.')
    if (code === 'INVALID_ORIGIN') {
      return new SignInError('Sign-in is not set up for this address.')
    }
  }
  if (response.status >= 500) return new SignInError('Sign-in is not working right now. Try again.')
  return new SignInError('Could not reach the sign-in service. Try again.')
}

/**
 * Sign in with email and password. The API answers with a cookie; the body lacks permissions, so
 * the caller refetches `/v1/me` instead of reading it.
 */
export async function signIn(email: string, password: string): Promise<void> {
  let response: Response
  try {
    response = await apiFetch(apiUrl('/v1/auth/sign-in/email'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new SignInError('Could not reach the sign-in service. Try again.')
  }
  if (!response.ok) throw await signInFailure(response)
}

export async function signOut(): Promise<void> {
  let response: Response
  try {
    response = await apiFetch(apiUrl('/v1/auth/sign-out'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
  } catch {
    throw new Error('Could not sign out. Try again.')
  }
  if (!response.ok) throw new Error('Could not sign out. Try again.')
}

/** A failed set-password call. The message is what the page shows. */
export class SetPasswordError extends Error {}

async function setPasswordFailure(response: Response): Promise<SetPasswordError> {
  if (response.status === 429) {
    return new SetPasswordError(waitMessage(response.headers.get('Retry-After')))
  }
  if (response.status === 400) {
    const code = await errorCode(response)
    if (code === 'INVALID_TOKEN') {
      return new SetPasswordError(
        'This link has expired or was already used. Ask an admin for a new one.',
      )
    }
    return new SetPasswordError('That password is not allowed. Use 12 to 128 characters.')
  }
  if (response.status >= 500) {
    return new SetPasswordError('Setting the password is not working right now. Try again.')
  }
  return new SetPasswordError('Could not set the password. Try again.')
}

/**
 * Choose a password with the token from an invite email (D-101). The token goes in the body, never
 * the address, so it stays out of logs. It works once.
 */
export async function setPassword(token: string, newPassword: string): Promise<void> {
  let response: Response
  try {
    response = await apiFetch(apiUrl('/v1/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    })
  } catch {
    throw new SetPasswordError('Could not reach the server. Try again.')
  }
  if (!response.ok) throw await setPasswordFailure(response)
}

/** A failed forgot-password request. The message is what the page shows. */
export class ForgotPasswordError extends Error {}

function forgotFailure(response: Response): ForgotPasswordError {
  if (response.status === 429) {
    return new ForgotPasswordError(waitMessage(response.headers.get('Retry-After')))
  }
  if (response.status === 400) return new ForgotPasswordError('Enter a valid email address.')
  if (response.status === 503) {
    return new ForgotPasswordError('Password reset is not available right now. Ask an admin.')
  }
  return new ForgotPasswordError('Could not send the link. Try again.')
}

/**
 * Ask for a set-password link. The API answers the same whether or not the email has an account,
 * so a success here says nothing about the account (and the page must not either).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  let response: Response
  try {
    response = await apiFetch(apiUrl('/v1/auth/request-password-reset'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new ForgotPasswordError('Could not reach the server. Try again.')
  }
  if (!response.ok) throw forgotFailure(response)
}
