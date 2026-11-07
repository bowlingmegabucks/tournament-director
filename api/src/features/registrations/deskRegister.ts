import { toNewDeskBowler, type StoredBowler } from './bowler.ts'
import {
  completeRegistration,
  findDivision,
  unique,
  type RegisterDependencies,
} from './register.ts'
import { toDeskBowlerPatch, type DeskRequest, type FieldErrors } from './deskRequest.ts'
import { validation, type Failure } from './problem.ts'
import type { StoredRegistration } from './writer.ts'

/** What the desk is told when the bowler is already registered here (D-159). */
export interface ExistingRegistration {
  registrationId: string
  divisionId: string
  divisionName: string
  squadIds: string[]
  sweeperIds: string[]
}

export type DeskRegisterResult =
  | { ok: true; registrationId: string; mode: 'created' | 'appended' }
  | { ok: false; kind: 'tournamentNotFound' }
  | { ok: false; kind: 'bowlerNotFound' }
  | { ok: false; kind: 'complete' }
  | { ok: false; kind: 'alreadyRegistered'; existing: ExistingRegistration }
  | { ok: false; kind: 'usbcIdOnFile'; bowler: { id: string; name: string } }
  | { ok: false; kind: 'failures'; failures: Failure[] }

const failures = (list: Failure[]): DeskRegisterResult => ({
  ok: false,
  kind: 'failures',
  failures: list,
})

const displayName = (bowler: StoredBowler) =>
  `${bowler.firstName} ${bowler.lastName}${bowler.suffix === '' ? '' : `, ${bowler.suffix}`}`

async function describeExisting(
  deps: RegisterDependencies,
  tournamentId: string,
  existing: StoredRegistration,
): Promise<ExistingRegistration> {
  const [sessions, divisions] = await Promise.all([
    deps.writer.findSessions(existing.sessionIds),
    deps.divisions.listByTournament(tournamentId),
  ])
  return {
    registrationId: existing.id,
    divisionId: existing.divisionId,
    divisionName: divisions.find((division) => division.id === existing.divisionId)?.name ?? '',
    squadIds: sessions.filter((session) => session.kind === 'squad').map((session) => session.id),
    sweeperIds: sessions
      .filter((session) => session.kind === 'sweeper')
      .map((session) => session.id),
  }
}

/**
 * The desk adds a registration (D-157). Same checks and save as the registration site
 * (`completeRegistration`), but the bowler is picked by id or typed in, only names are required
 * (D-162), a registered bowler gets a conflict until the desk confirms an append (D-159, D-165),
 * and a division move after scores is refused (D-160). Every desk save records a $0 `Manual_`
 * payment (PAY-01a, D-163).
 */
export async function deskRegister(
  deps: RegisterDependencies,
  tournamentId: string,
  request: DeskRequest,
): Promise<DeskRegisterResult> {
  const { tournaments, writer } = deps
  const now = deps.now?.() ?? new Date()
  const newId = deps.newId ?? (() => crypto.randomUUID())

  const tournament = await tournaments.get(tournamentId)
  if (!tournament) return { ok: false, kind: 'tournamentNotFound' }
  const settings = await tournaments.getSettings(tournamentId)
  if (settings?.completed) return { ok: false, kind: 'complete' }

  const located = await findDivision(deps, request.divisionId, tournament.id)
  if ('failure' in located) return failures([located.failure])

  const patch = toDeskBowlerPatch(request.bowler)
  let knownBowler: StoredBowler | undefined
  if (request.bowlerId !== undefined) {
    knownBowler = await writer.findBowlerById(request.bowlerId)
    if (!knownBowler) return { ok: false, kind: 'bowlerNotFound' }
  } else if (patch.usbcId !== undefined) {
    // D-161: an exact USBC ID match only. No name matching.
    const [onFile] = await writer.findBowlersByUsbcId(patch.usbcId)
    if (onFile) {
      return {
        ok: false,
        kind: 'usbcIdOnFile',
        bowler: { id: onFile.id, name: displayName(onFile) },
      }
    }
  }

  const existing = knownBowler
    ? await writer.findRegistration(knownBowler.id, tournament.id)
    : undefined
  if (existing && !request.appendToExisting) {
    return {
      ok: false,
      kind: 'alreadyRegistered',
      existing: await describeExisting(deps, tournament.id, existing),
    }
  }
  if (existing && knownBowler && existing.divisionId !== request.divisionId) {
    // D-160, REG-15: a move is fine until the bowler has any score.
    if ((await writer.findScoredSessionIds(knownBowler.id)).length > 0) {
      return failures([
        validation(
          'Registration.DivisionLocked',
          'Cannot change bowler division after scores have been recorded.',
        ),
      ])
    }
  }

  const result = await completeRegistration(deps, {
    tournament,
    division: located.division,
    knownBowler,
    existing,
    patch,
    newBowler: () => toNewDeskBowler(patch),
    rawPhone: request.bowler.phoneNumber,
    divisionId: request.divisionId,
    squadIds: unique(request.squadIds),
    sweeperIds: unique(request.sweeperIds),
    superSweeper: request.superSweeper,
    average: request.average,
    payment: {
      id: newId(),
      confirmationCode: `Manual_${newId()}`,
      amount: 0,
      createdAtUtc: now,
    },
    now,
    newId,
  })
  if (!result.ok) return failures(result.failures)
  return {
    ok: true,
    registrationId: result.registrationId,
    mode: result.mode === 'append' ? 'appended' : 'created',
  }
}

// The form field each failure belongs under. A failure with no entry shows on the form as a whole.
const fieldOfCode: Record<string, string> = {
  'Bowler.FirstNameRequired': 'bowler.firstName',
  'Bowler.LastNameRequired': 'bowler.lastName',
  'Bowler.MiddleInitialTooLong': 'bowler.middleInitial',
  'Bowler.CityRequired': 'bowler.city',
  'Bowler.StateRequired': 'bowler.state',
  'Bowler.StateInvalid': 'bowler.state',
  'Bowler.ZipCodeInvalid': 'bowler.zipCode',
  'Bowler.EmailInvalid': 'bowler.email',
  'Bowler.PhoneInvalid': 'bowler.phoneNumber',
  'Bowler.DateOfBirthInvalid': 'bowler.dateOfBirth',
  'Bowler.UsbcIdInvalid': 'bowler.usbcId',
  'Registration.UsbcIdRequired': 'bowler.usbcId',
  'Registration.DateOfBirthRequired': 'bowler.dateOfBirth',
  'Registration.BowlerTooYoung': 'bowler.dateOfBirth',
  'Registration.BowlerTooOld': 'bowler.dateOfBirth',
  'Registration.GenderRequired': 'bowler.gender',
  'Registration.GenderInvalid': 'bowler.gender',
  'Registration.AverageRequired': 'average',
  'Registration.AverageTooLow': 'average',
  'Registration.AverageTooHigh': 'average',
  'Registration.SquadsRequired': 'squadIds',
  'Registration.InvalidSquadIds': 'squadIds',
  'Registration.SquadComplete': 'squadIds',
  'Squad.Conflict': 'squadIds',
  'Registration.InvalidSweeperIds': 'sweeperIds',
  'Registration.SweeperComplete': 'sweeperIds',
  'Sweeper.Conflict': 'sweeperIds',
  'Registration.SuperSweeperNeedsAllSweepers': 'superSweeper',
  'Registration.DivisionNotInTournament': 'divisionId',
  'Registration.DivisionLocked': 'divisionId',
  'Division.NotFound': 'divisionId',
}

/** The first message for each field (the form shows one line under an input). */
export function toFieldErrors(list: Failure[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const failure of list) {
    errors[fieldOfCode[failure.code] ?? 'form'] ??= failure.description
  }
  return errors
}
