import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type { RegistrationList } from './types'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isTextList = (value: unknown) => Array.isArray(value) && value.every(isText)

function isRegistration(value: unknown): boolean {
  const bowler = field(value, 'bowler')
  return (
    isText(field(value, 'id')) &&
    isText(field(bowler, 'id')) &&
    isText(field(bowler, 'name')) &&
    isText(field(bowler, 'firstName')) &&
    isText(field(bowler, 'lastName')) &&
    isText(field(bowler, 'usbcId')) &&
    isText(field(value, 'divisionId')) &&
    isText(field(value, 'divisionName')) &&
    isTextList(field(value, 'squadIds')) &&
    isTextList(field(value, 'sweeperIds')) &&
    typeof field(value, 'superSweeper') === 'boolean'
  )
}

function isSessionCount(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isSessionDate(field(value, 'date')) &&
    typeof field(value, 'complete') === 'boolean' &&
    isNumber(field(value, 'entries'))
  )
}

function isDivisionCount(value: unknown): boolean {
  return (
    isText(field(value, 'id')) &&
    isNumber(field(value, 'number')) &&
    isText(field(value, 'name')) &&
    isNumber(field(value, 'entries'))
  )
}

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

function isRegistrationList(value: unknown): value is RegistrationList {
  const summary = field(value, 'summary')
  return (
    isEvery(field(value, 'registrations'), isRegistration) &&
    isNumber(field(summary, 'registrations')) &&
    isNumber(field(summary, 'superSweepers')) &&
    isEvery(field(summary, 'divisions'), isDivisionCount) &&
    isEvery(field(summary, 'squads'), isSessionCount) &&
    isEvery(field(summary, 'sweepers'), isSessionCount)
  )
}

/** The registrations of one tournament, in the order the API sends them (REG-23), with counts. */
export async function fetchRegistrations(tournamentId: string): Promise<RegistrationList> {
  const response = await fetch(
    apiUrl(`/v1/tournaments/${encodeURIComponent(tournamentId)}/registrations`),
  )
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (!response.ok) {
    throw new Error(`Failed to load registrations (${response.status})`)
  }
  const body = await readJson(response, 'Failed to load registrations')
  if (!isRegistrationList(body)) {
    throw new Error('Failed to load registrations (unexpected response)')
  }
  return body
}
