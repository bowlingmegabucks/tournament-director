import { reasonsFor } from '../../shared/refusalReasons'
import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { RegistrationNotFoundError } from './editApi'
import type { DeleteEntry, DeleteInfo } from './types'

const base = (tournamentId: string, registrationId: string) =>
  `/v1/tournaments/${encodeURIComponent(tournamentId)}/registrations/${encodeURIComponent(registrationId)}`

// `Number.isFinite` is false for anything that is not a finite number, so no `typeof` check is needed.
const isNumber = (value: unknown) => Number.isFinite(value)

function isEntry(value: unknown): value is DeleteEntry {
  const kind = field(value, 'kind')
  return (
    typeof field(value, 'id') === 'string' &&
    (kind === 'squad' || kind === 'sweeper') &&
    typeof field(value, 'date') === 'string' &&
    isNumber(field(value, 'entryFee'))
  )
}

function isPayment(value: unknown) {
  return typeof field(value, 'system') === 'string' && isNumber(field(value, 'amount'))
}

function isDeleteInfo(value: unknown): value is DeleteInfo {
  const entries = field(value, 'entries')
  const payments = field(value, 'payments')
  return (
    typeof field(value, 'bowlerName') === 'string' &&
    typeof field(value, 'divisionName') === 'string' &&
    typeof field(value, 'tournamentComplete') === 'boolean' &&
    typeof field(value, 'hasScores') === 'boolean' &&
    Array.isArray(entries) &&
    entries.every(isEntry) &&
    isNumber(field(value, 'entriesTotal')) &&
    Array.isArray(payments) &&
    payments.every(isPayment) &&
    isNumber(field(value, 'paidTotal'))
  )
}

/** The registration, its fees, and its real payments, for the delete dialog (D-212). */
export async function fetchDeleteInfo(
  tournamentId: string,
  registrationId: string,
): Promise<DeleteInfo> {
  const response = await apiFetch(apiUrl(`${base(tournamentId, registrationId)}/delete-info`))
  if (response.status === 404) {
    // Stryker disable next-line ArrowFunction: `null` and `undefined` both fail the message check below.
    const body: unknown = await response.json().catch(() => null)
    if (field(body, 'message') === 'Registration not found') throw new RegistrationNotFoundError()
    throw new TournamentNotFoundError()
  }
  if (response.status === 400) throw new RegistrationNotFoundError()
  if (response.status === 401) throw new Error('Sign in to delete a registration.')
  if (response.status === 403) {
    throw new Error('You do not have permission to delete a registration.')
  }
  if (!response.ok) throw new Error(`Failed to load the registration (${response.status})`)
  const body = await readJson(response, 'Failed to load the registration')
  const info = field(body, 'deleteInfo')
  if (!isDeleteInfo(info)) throw new Error('Failed to load the registration (unexpected response)')
  return info
}

/** The API refused the delete (409 with errors): scores or a complete tournament (D-211). Never overridden. */
export class RegistrationDeleteRefusedError extends Error {
  readonly reasons: string[]

  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

/**
 * A real payment exists and the confirm was missing or out of date (D-210). `paid` is the total
 * stored now: the dialog compares it with the total it showed.
 */
export class RegistrationPaidWarningError extends Error {
  readonly paid: number

  constructor(message: string, paid: number) {
    super(message)
    this.paid = paid
  }
}

/**
 * Delete a registration at the desk (REG-19, D-209). `confirmPaid` is the total paid the director
 * saw and ticked for (D-213); with no real payment leave it out. Throws
 * `RegistrationDeleteRefusedError` and `RegistrationPaidWarningError` for the two 409 answers.
 */
export async function deleteRegistration(
  tournamentId: string,
  registrationId: string,
  confirmPaid?: number,
): Promise<void> {
  const query =
    confirmPaid === undefined ? '' : `?confirmWarnings=true&paid=${confirmPaid.toFixed(2)}`
  const response = await apiFetch(apiUrl(`${base(tournamentId, registrationId)}${query}`), {
    method: 'DELETE',
  })
  if (response.status === 204) return
  if (response.status === 409) {
    const body = await readJson(response, 'Failed to delete the registration')
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : 'The registration cannot be deleted.'
    const paid = field(body, 'paid')
    if (Array.isArray(field(body, 'warnings')) && typeof paid === 'number') {
      throw new RegistrationPaidWarningError(text, paid)
    }
    throw new RegistrationDeleteRefusedError(
      text,
      reasonsFor(field(body, 'errors'), ['tournament', 'scores'], text),
    )
  }
  if (response.status === 404) {
    // Stryker disable next-line ArrowFunction: `null` and `undefined` both fail the message check below.
    const body: unknown = await response.json().catch(() => null)
    if (field(body, 'message') === 'Registration not found') throw new RegistrationNotFoundError()
    throw new TournamentNotFoundError()
  }
  if (response.status === 400) throw new Error('The registration cannot be deleted.')
  if (response.status === 401) throw new Error('Sign in to delete a registration.')
  if (response.status === 403) {
    throw new Error('You do not have permission to delete a registration.')
  }
  throw new Error(`Failed to delete the registration (${response.status})`)
}
