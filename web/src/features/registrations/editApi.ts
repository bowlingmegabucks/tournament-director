import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { DeskRejectedError, errorsOf, existingOf } from './bowlerApi'
import type {
  EditInfo,
  EditRegistrationRequest,
  EditResult,
  EditWarning,
  ExistingRegistration,
} from './types'

const isText = (value: unknown) => typeof value === 'string'
const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)
const valueKeys = [
  'id',
  'firstName',
  'middleInitial',
  'lastName',
  'suffix',
  'street',
  'city',
  'state',
  'zipCode',
  'email',
  'phoneNumber',
  'usbcId',
  'dateOfBirth',
] as const

function isEditInfo(value: unknown): value is EditInfo {
  const bowler = field(value, 'bowler')
  const gender = field(bowler, 'gender')
  const registration = field(value, 'registration')
  const average = field(registration, 'average')
  const locks = field(value, 'locks')
  return (
    valueKeys.every((key) => isText(field(bowler, key))) &&
    (gender === '' || gender === 'Male' || gender === 'Female') &&
    ['id', 'divisionId'].every((key) => isText(field(registration, key))) &&
    (average === null || typeof average === 'number') &&
    typeof field(registration, 'superSweeper') === 'boolean' &&
    isTextList(field(registration, 'squadIds')) &&
    isTextList(field(registration, 'sweeperIds')) &&
    isTextList(field(locks, 'scoredSessionIds')) &&
    typeof field(locks, 'hasScores') === 'boolean' &&
    typeof field(locks, 'hasSweeperScores') === 'boolean'
  )
}

/** The registration is not in this tournament, or was deleted meanwhile. */
export class RegistrationNotFoundError extends Error {
  constructor() {
    super('Registration not found')
  }
}

const base = (tournamentId: string, registrationId: string) =>
  `/v1/tournaments/${encodeURIComponent(tournamentId)}/registrations/${encodeURIComponent(registrationId)}`

/** The registration, its bowler, and what is locked, for the edit page (D-197). */
export async function fetchEditInfo(
  tournamentId: string,
  registrationId: string,
): Promise<EditInfo> {
  const response = await apiFetch(apiUrl(`${base(tournamentId, registrationId)}/edit-info`))
  if (response.status === 404) {
    const body: unknown = await response.json().catch(() => null)
    if (field(body, 'message') === 'Registration not found') throw new RegistrationNotFoundError()
    throw new TournamentNotFoundError()
  }
  if (response.status === 400) throw new RegistrationNotFoundError()
  if (response.status === 401) throw new Error('Sign in to edit a registration.')
  if (response.status === 403) throw new Error('You do not have permission to edit a registration.')
  if (!response.ok) throw new Error(`Failed to load the registration (${response.status})`)
  const body = await readJson(response, 'Failed to load the registration')
  if (!isEditInfo(body)) throw new Error('Failed to load the registration (unexpected response)')
  return body
}

/** The record changed after the desk read it: a squad to add is held, or one to remove is gone (D-199). */
export class RegistrationChangedError extends Error {
  readonly existing: ExistingRegistration | undefined

  constructor(message: string, existing: ExistingRegistration | undefined) {
    super(message)
    this.existing = existing
  }
}

/** The change is allowed once the director confirms (D-201). */
export class ConfirmWarningsError extends Error {
  readonly warnings: EditWarning[]

  constructor(message: string, warnings: EditWarning[]) {
    super(message)
    this.warnings = warnings
  }
}

function warningsOf(value: unknown): EditWarning[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const warning = field(item, 'field')
    const message = field(item, 'message')
    return typeof warning === 'string' && typeof message === 'string'
      ? [{ field: warning, message }]
      : []
  })
}

async function rejection(response: Response): Promise<Error> {
  const body = await readJson(response, 'Failed to save the registration')
  const message = field(body, 'message')
  const text = typeof message === 'string' ? message : 'The change was not accepted.'
  if (response.status === 409) {
    if (field(body, 'conflict') === 'changed') {
      return new RegistrationChangedError(text, existingOf(field(body, 'existing')))
    }
    const warnings = warningsOf(field(body, 'warnings'))
    if (warnings.length > 0) return new ConfirmWarningsError(text, warnings)
  }
  return new DeskRejectedError(text, errorsOf(field(body, 'errors')))
}

/**
 * Save the desk's changes (D-197). Throws `DeskRejectedError` for a bad field or a refusal,
 * `RegistrationChangedError` for a stale read (D-199), and `ConfirmWarningsError` when the
 * director must confirm first (D-201).
 */
export async function patchRegistration(
  tournamentId: string,
  registrationId: string,
  request: EditRegistrationRequest,
): Promise<EditResult> {
  const response = await apiFetch(apiUrl(base(tournamentId, registrationId)), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404) {
    const body: unknown = await response.json().catch(() => null)
    if (field(body, 'message') === 'Registration not found') throw new RegistrationNotFoundError()
    throw new TournamentNotFoundError()
  }
  if (response.status === 401) throw new Error('Sign in to edit a registration.')
  if (response.status === 403) throw new Error('You do not have permission to edit a registration.')
  if (!response.ok) throw new Error(`Failed to save the registration (${response.status})`)
  const body = await readJson(response, 'Failed to save the registration')
  const added = field(body, 'added')
  const removed = field(body, 'removed')
  const registrationIdBack = field(body, 'registrationId')
  if (
    typeof registrationIdBack !== 'string' ||
    typeof added !== 'number' ||
    typeof removed !== 'number'
  ) {
    throw new TypeError('Failed to save the registration (unexpected response)')
  }
  return { registrationId: registrationIdBack, added, removed }
}
