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

function waitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Too many attempts. Try again later.'
  }
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE)
  return `Too many attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`
}

async function errorCode(response: Response): Promise<unknown> {
  try {
    return field(await response.json(), 'code')
  } catch {
    return undefined
  }
}

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
