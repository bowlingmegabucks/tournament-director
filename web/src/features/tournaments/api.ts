import { apiUrl } from '../../shared/apiUrl'
import { apiFetch } from '../../shared/apiFetch'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type {
  EditInfo,
  FieldErrors,
  NewTournament,
  Tournament,
  TournamentChanges,
  TournamentSettingsView,
  TournamentWarning,
} from './types'
import { tournamentFields } from './types'

function isTournament(value: unknown): value is Tournament {
  return (
    typeof field(value, 'id') === 'string' &&
    typeof field(value, 'name') === 'string' &&
    typeof field(value, 'startDate') === 'string' &&
    typeof field(value, 'endDate') === 'string' &&
    typeof field(value, 'entryFee') === 'number' &&
    typeof field(value, 'bowlingCenter') === 'string'
  )
}

export async function fetchTournaments(): Promise<Tournament[]> {
  const response = await apiFetch(apiUrl('/v1/tournaments'))
  if (!response.ok) {
    throw new Error(`Failed to load tournaments (${response.status})`)
  }
  const tournaments = field(await readJson(response, 'Failed to load tournaments'), 'tournaments')
  if (!Array.isArray(tournaments) || !tournaments.every(isTournament)) {
    throw new Error('Failed to load tournaments (unexpected response)')
  }
  return tournaments
}

export async function fetchTournament(id: string): Promise<Tournament> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load tournament (${response.status})`)
  }
  const tournament = field(await readJson(response, 'Failed to load tournament'), 'tournament')
  if (!isTournament(tournament)) {
    throw new Error('Failed to load tournament (unexpected response)')
  }
  return tournament
}

function isSettings(value: unknown): value is TournamentSettingsView {
  return (
    typeof field(value, 'completed') === 'boolean' &&
    typeof field(value, 'games') === 'number' &&
    typeof field(value, 'finalsRatio') === 'number' &&
    typeof field(value, 'cashRatio') === 'number' &&
    typeof field(value, 'superSweeperCashRatio') === 'number'
  )
}

export async function fetchTournamentSettings(id: string): Promise<TournamentSettingsView> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}/settings`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load the tournament format (${response.status})`)
  }
  const settings = field(
    await readJson(response, 'Failed to load the tournament format'),
    'settings',
  )
  if (!isSettings(settings)) {
    throw new Error('Failed to load the tournament format (unexpected response)')
  }
  return settings
}

/** The API refused the tournament (400 or 409). `errors` holds one message per form field (D-121). */
export class TournamentRejectedError extends Error {
  readonly errors: FieldErrors

  constructor(message: string, errors: FieldErrors) {
    super(message)
    this.errors = errors
  }
}

function fieldErrors(value: unknown): FieldErrors {
  const errors: FieldErrors = {}
  for (const name of tournamentFields) {
    const message = field(value, name)
    if (typeof message === 'string') errors[name] = message
  }
  return errors
}

/** Create a tournament (TRN-19). Returns the stored tournament. */
export async function createTournament(input: NewTournament): Promise<Tournament> {
  const response = await apiFetch(apiUrl('/v1/tournaments'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 400 || response.status === 409) {
    const body = await readJson(response, 'Failed to save the tournament')
    const message = field(body, 'message')
    throw new TournamentRejectedError(
      typeof message === 'string' ? message : 'The tournament was not accepted.',
      fieldErrors(field(body, 'errors')),
    )
  }
  if (response.status === 401) throw new Error('Sign in to create a tournament.')
  if (response.status === 403) throw new Error('You do not have permission to create a tournament.')
  if (!response.ok) throw new Error(`Failed to save the tournament (${response.status})`)
  const tournament = field(await readJson(response, 'Failed to save the tournament'), 'tournament')
  if (!isTournament(tournament)) {
    throw new Error('Failed to save the tournament (unexpected response)')
  }
  return tournament
}

function isEditInfo(value: unknown): value is EditInfo {
  return (
    typeof field(value, 'registrationCount') === 'number' &&
    typeof field(value, 'hasScores') === 'boolean' &&
    typeof field(value, 'hasSweeperScores') === 'boolean'
  )
}

/** What the edit page needs to show its locks and warnings up front (TRN-28, D-131). */
export async function fetchEditInfo(id: string): Promise<EditInfo> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}/edit-info`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to edit a tournament.')
  if (response.status === 403) throw new Error('You do not have permission to edit a tournament.')
  if (!response.ok)
    throw new Error(`Failed to load what depends on the settings (${response.status})`)
  const editInfo = field(
    await readJson(response, 'Failed to load what depends on the settings'),
    'editInfo',
  )
  if (!isEditInfo(editInfo)) {
    throw new Error('Failed to load what depends on the settings (unexpected response)')
  }
  return editInfo
}

/** The API allows the change but wants it confirmed first; nothing was saved (D-129). */
export class TournamentWarningsError extends Error {
  readonly warnings: TournamentWarning[]

  constructor(message: string, warnings: TournamentWarning[]) {
    super(message)
    this.warnings = warnings
  }
}

function warningsOf(value: unknown): TournamentWarning[] | undefined {
  if (!Array.isArray(value)) return undefined
  const warnings: TournamentWarning[] = []
  for (const item of value as unknown[]) {
    const name = field(item, 'field')
    const message = field(item, 'message')
    // An unknown field still counts: the director must see every warning before confirming.
    if (typeof name !== 'string' || typeof message !== 'string') return undefined
    warnings.push({ field: name, message })
  }
  return warnings
}

/**
 * Edit a tournament (TRN-24). Throws `TournamentRejectedError` for a bad field or a lock (400, 409
 * with `errors`) and `TournamentWarningsError` when the change needs confirming (409 with
 * `warnings`).
 */
export async function updateTournament(
  id: string,
  changes: TournamentChanges,
): Promise<Tournament> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changes),
  })
  if (response.status === 400 || response.status === 409) {
    const body = await readJson(response, 'Failed to save the tournament')
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : 'The change was not accepted.'
    const warnings = warningsOf(field(body, 'warnings'))
    if (warnings !== undefined && warnings.length > 0) {
      throw new TournamentWarningsError(text, warnings)
    }
    throw new TournamentRejectedError(text, fieldErrors(field(body, 'errors')))
  }
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to edit a tournament.')
  if (response.status === 403) throw new Error('You do not have permission to edit a tournament.')
  if (!response.ok) throw new Error(`Failed to save the tournament (${response.status})`)
  const tournament = field(await readJson(response, 'Failed to save the tournament'), 'tournament')
  if (!isTournament(tournament)) {
    throw new Error('Failed to save the tournament (unexpected response)')
  }
  return tournament
}

/** The API refused the delete (409 with `errors`): one reason per line, nothing deleted (D-133). */
export class TournamentDeleteRefusedError extends Error {
  readonly reasons: string[]

  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

/** What a delete removes besides the tournament. The confirming request sends it back (D-137). */
export interface DeleteCounts {
  registrations: number
  divisions: number
  squads: number
  sweepers: number
}

/** The delete needs a confirmation. `counts` is what the warning showed; send it back to confirm. */
export class TournamentDeleteWarningError extends TournamentWarningsError {
  readonly counts: DeleteCounts

  constructor(message: string, warnings: TournamentWarning[], counts: DeleteCounts) {
    super(message, warnings)
    this.counts = counts
  }
}

function countsOf(value: unknown): DeleteCounts | undefined {
  const registrations = field(value, 'registrations')
  const divisions = field(value, 'divisions')
  const squads = field(value, 'squads')
  const sweepers = field(value, 'sweepers')
  if (
    typeof registrations === 'number' &&
    typeof divisions === 'number' &&
    typeof squads === 'number' &&
    typeof sweepers === 'number'
  ) {
    return { registrations, divisions, squads, sweepers }
  }
  return undefined
}

/** The API puts one reason per line under `errors.tournament`. */
function reasonsOf(value: unknown, fallback: string): string[] {
  const text = field(value, 'tournament')
  const lines = typeof text === 'string' ? text.split('\n').filter((line) => line !== '') : []
  return lines.length > 0 ? lines : [fallback]
}

/**
 * Delete a tournament (TRN-32, D-132 to D-134). Throws `TournamentDeleteRefusedError` when
 * something forbids it (409 with `errors`), `TournamentWarningsError` when the director must
 * confirm first (409 with `warnings`), and `TournamentNotFoundError` when it is already gone (404).
 * To go ahead after a warning, send `confirm` with the counts that warning carried: the API deletes
 * only if they still match, and otherwise warns again with the new counts (D-137).
 */
export async function deleteTournament(
  id: string,
  options: { confirm?: DeleteCounts } = {},
): Promise<void> {
  const { confirm } = options
  const query =
    confirm === undefined
      ? ''
      : `?confirmWarnings=true&registrations=${confirm.registrations}&divisions=${confirm.divisions}&squads=${confirm.squads}&sweepers=${confirm.sweepers}`
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}${query}`), {
    method: 'DELETE',
  })
  if (response.status === 409) {
    const body = await readJson(response, 'Failed to delete the tournament')
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : 'The tournament cannot be deleted.'
    const warnings = warningsOf(field(body, 'warnings'))
    if (warnings !== undefined && warnings.length > 0) {
      const counts = countsOf(field(body, 'counts'))
      // Without the counts the director cannot confirm, so a warning with none is a bad reply.
      if (counts === undefined)
        throw new Error('Failed to delete the tournament (unexpected response)')
      throw new TournamentDeleteWarningError(text, warnings, counts)
    }
    throw new TournamentDeleteRefusedError(text, reasonsOf(field(body, 'errors'), text))
  }
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to delete a tournament.')
  if (response.status === 403) throw new Error('You do not have permission to delete a tournament.')
  if (!response.ok) throw new Error(`Failed to delete the tournament (${response.status})`)
}
