import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { isSessionDate } from '../../shared/sessionFormat'
import { LaneSetupError, SessionNotFoundError, type SessionKind } from '../../shared/session'
import type { LanePage } from './types'

const isText = (value: unknown) => typeof value === 'string'
const isNumber = (value: unknown) => typeof value === 'number'
const isFlag = (value: unknown) => typeof value === 'boolean'

function isEvery(value: unknown, test: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(test)
}

function isBowler(value: unknown): boolean {
  const average = field(value, 'average')
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'firstName')) &&
    isText(field(value, 'lastName')) &&
    isText(field(value, 'divisionId')) &&
    isText(field(value, 'divisionName')) &&
    (average === null || isNumber(average)) &&
    isText(field(value, 'position')) &&
    isNumber(field(value, 'pins')) &&
    isFlag(field(value, 'superSweeper'))
  )
}

function isPair(value: unknown): boolean {
  return (
    isNumber(field(value, 'firstLane')) &&
    isEvery(field(value, 'lanes'), isNumber) &&
    isNumber(field(value, 'capacity')) &&
    isEvery(field(value, 'bowlers'), isBowler)
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

function isSession(value: unknown): boolean {
  const kind = field(value, 'kind')
  return (
    isText(field(value, 'id')) &&
    (kind === 'squad' || kind === 'sweeper') &&
    isSessionDate(field(value, 'date')) &&
    isFlag(field(value, 'complete')) &&
    isNumber(field(value, 'startingLane')) &&
    isNumber(field(value, 'numberOfLanes')) &&
    isNumber(field(value, 'maxPerPair'))
  )
}

function isLanePage(value: unknown): value is LanePage {
  return (
    isSession(field(value, 'session')) &&
    isEvery(field(value, 'pairs'), isPair) &&
    isEvery(field(value, 'unassigned'), isBowler) &&
    isEvery(field(value, 'other'), isBowler) &&
    isEvery(field(value, 'divisions'), isDivisionCount)
  )
}

/** The lane page of one squad or sweeper: pairs, unassigned bowlers, other positions, counts (LAN-10). */
export async function fetchLanes(
  kind: SessionKind,
  tournamentId: string,
  sessionId: string,
): Promise<LanePage> {
  const response = await fetch(
    apiUrl(
      `/v1/tournaments/${encodeURIComponent(tournamentId)}/${kind}s/${encodeURIComponent(sessionId)}/lanes`,
    ),
  )
  if (response.status === 404 || response.status === 400) throw new SessionNotFoundError(kind)
  if (response.status === 422) {
    const message = field(await readJson(response, 'Failed to load lane assignments'), 'message')
    throw new LaneSetupError(
      isText(message) ? String(message) : 'This session cannot take lane assignments',
    )
  }
  if (!response.ok) {
    throw new Error(`Failed to load lane assignments (${response.status})`)
  }
  const body = await readJson(response, 'Failed to load lane assignments')
  if (!isLanePage(body)) {
    throw new Error('Failed to load lane assignments (unexpected response)')
  }
  return body
}
