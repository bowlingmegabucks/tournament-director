import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type {
  BowlerResponse,
  BowlerSearch,
  BowlerSearchResult,
  DeskFieldErrors,
  DeskRegistrationRequest,
  DeskResult,
  ExistingRegistration,
} from './types'

const isText = (value: unknown) => typeof value === 'string'
const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)

function isResult(value: unknown): value is BowlerSearchResult {
  const registered = field(value, 'registered')
  return (
    ['id', 'name', 'firstName', 'lastName', 'usbcId', 'city', 'state'].every((key) =>
      isText(field(value, key)),
    ) &&
    (registered === null || isText(field(registered, 'divisionName')))
  )
}

function isSearch(value: unknown): value is BowlerSearch {
  const bowlers = field(value, 'bowlers')
  return (
    Array.isArray(bowlers) && bowlers.every(isResult) && typeof field(value, 'more') === 'boolean'
  )
}

const valueKeys = [
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

function isBowler(value: unknown): boolean {
  const gender = field(value, 'gender')
  return (
    isText(field(value, 'id')) &&
    valueKeys.every((key) => isText(field(value, key))) &&
    (gender === '' || gender === 'Male' || gender === 'Female')
  )
}

function isRegistration(value: unknown): boolean {
  if (value === null) return true
  const average = field(value, 'average')
  return (
    ['id', 'divisionId', 'divisionName'].every((key) => isText(field(value, key))) &&
    (average === null || typeof average === 'number') &&
    typeof field(value, 'superSweeper') === 'boolean' &&
    typeof field(value, 'hasScores') === 'boolean' &&
    isTextList(field(value, 'squadIds')) &&
    isTextList(field(value, 'sweeperIds'))
  )
}

function isBowlerResponse(value: unknown): value is BowlerResponse {
  return isBowler(field(value, 'bowler')) && isRegistration(field(value, 'registration'))
}

export interface BowlerFilter {
  lastName: string
  firstName: string
  email: string
  usbcId: string
}

export class NoSearchFieldError extends Error {
  constructor() {
    super('Enter at least one search field.')
  }
}

/** BWL-14: the desk's search. `tournamentId` adds the Registered marker (D-159). */
export async function searchBowlers(
  filter: BowlerFilter,
  tournamentId: string,
): Promise<BowlerSearch> {
  const query = new URLSearchParams({ tournamentId })
  for (const [name, value] of Object.entries(filter)) {
    if (value.trim() !== '') query.set(name, value.trim())
  }
  const response = await apiFetch(apiUrl(`/v1/bowlers?${query.toString()}`))
  if (response.status === 400) throw new NoSearchFieldError()
  if (response.status === 401) throw new Error('Sign in to search for a bowler.')
  if (response.status === 403) throw new Error('You do not have permission to search for a bowler.')
  if (!response.ok) throw new Error(`Failed to search for bowlers (${response.status})`)
  const body = await readJson(response, 'Failed to search for bowlers')
  if (!isSearch(body)) throw new Error('Failed to search for bowlers (unexpected response)')
  return body
}

export class BowlerNotFoundError extends Error {
  constructor() {
    super('Bowler not found')
  }
}

/** One bowler for the form, with the registration in this tournament (D-165). */
export async function fetchBowler(id: string, tournamentId: string): Promise<BowlerResponse> {
  const response = await apiFetch(
    apiUrl(
      `/v1/bowlers/${encodeURIComponent(id)}?tournamentId=${encodeURIComponent(tournamentId)}`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new BowlerNotFoundError()
  if (!response.ok) throw new Error(`Failed to load the bowler (${response.status})`)
  const body = await readJson(response, 'Failed to load the bowler')
  if (!isBowlerResponse(body)) throw new Error('Failed to load the bowler (unexpected response)')
  return body
}

/** The API refused the save (400, or 409 with `errors`). `errors` has one message per form field. */
export class DeskRejectedError extends Error {
  readonly errors: DeskFieldErrors

  constructor(message: string, errors: DeskFieldErrors) {
    super(message)
    this.errors = errors
  }
}

/** The bowler is already registered here; the desk decides whether to add to it (D-159). */
export class AlreadyRegisteredError extends Error {
  readonly existing: ExistingRegistration

  constructor(message: string, existing: ExistingRegistration) {
    super(message)
    this.existing = existing
  }
}

/** A new bowler's USBC ID belongs to a stored bowler; the desk may use that bowler (D-161). */
export class UsbcIdOnFileError extends Error {
  readonly bowler: { id: string; name: string }

  constructor(message: string, bowler: { id: string; name: string }) {
    super(message)
    this.bowler = bowler
  }
}

function errorsOf(value: unknown): DeskFieldErrors {
  const errors: DeskFieldErrors = {}
  if (typeof value !== 'object' || value === null) return errors
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === 'string') errors[key] = message
  }
  return errors
}

function existingOf(value: unknown): ExistingRegistration | undefined {
  if (
    !['registrationId', 'divisionId', 'divisionName'].every((key) => isText(field(value, key))) ||
    !isTextList(field(value, 'squadIds')) ||
    !isTextList(field(value, 'sweeperIds'))
  ) {
    return undefined
  }
  return value as ExistingRegistration
}

async function rejection(response: Response): Promise<Error> {
  const body = await readJson(response, 'Failed to save the registration')
  const message = field(body, 'message')
  const text = typeof message === 'string' ? message : 'The registration was not accepted.'
  const conflict = field(body, 'conflict')
  const existing = existingOf(field(body, 'existing'))
  if (conflict === 'alreadyRegistered' && existing)
    return new AlreadyRegisteredError(text, existing)
  const bowler = field(body, 'bowler')
  if (conflict === 'usbcIdOnFile' && isText(field(bowler, 'id')) && isText(field(bowler, 'name'))) {
    return new UsbcIdOnFileError(text, bowler as { id: string; name: string })
  }
  return new DeskRejectedError(text, errorsOf(field(body, 'errors')))
}

/**
 * Add a registration at the desk (D-157). Throws `DeskRejectedError` for a bad field or a refusal,
 * `AlreadyRegisteredError` and `UsbcIdOnFileError` for the two conflicts the desk settles.
 */
export async function createDeskRegistration(
  tournamentId: string,
  request: DeskRegistrationRequest,
): Promise<DeskResult> {
  const response = await apiFetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/registrations`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  )
  if (response.status === 400 || response.status === 409) throw await rejection(response)
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to add a registration.')
  if (response.status === 403) throw new Error('You do not have permission to add a registration.')
  if (!response.ok) throw new Error(`Failed to save the registration (${response.status})`)
  const body = await readJson(response, 'Failed to save the registration')
  const registrationId = field(body, 'registrationId')
  const mode = field(body, 'mode')
  if (!isText(registrationId) || (mode !== 'created' && mode !== 'appended')) {
    throw new Error('Failed to save the registration (unexpected response)')
  }
  return { registrationId: registrationId as string, mode }
}
