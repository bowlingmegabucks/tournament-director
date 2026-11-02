import { randomUUID } from 'node:crypto'
import type { Division } from '../divisions/types.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { mergeBowler, toBowlerPatch, toNewBowler } from './bowler.ts'
import { checkBowler } from './bowlerRules.ts'
import { checkEligibility } from './eligibility.ts'
import { toNewPayment } from './payment.ts'
import { other, validation, type Failure } from './problem.ts'
import type { RegistrationInput } from './request.ts'
import type { RegistrationWriter, StoredRegistration, StoredSession } from './writer.ts'

export interface RegisterDependencies {
  tournaments: TournamentRepository
  divisions: DivisionRepository
  sweepers: SweeperRepository
  writer: RegistrationWriter
  now?: () => Date
  newId?: () => string
}

/** `append` when the bowler already has a registration in the tournament (REG-01). */
export type RegisterResult =
  | { ok: true; registrationId: string; mode: 'create' | 'append' | 'retry' }
  | { ok: false; mode: 'create' | 'append'; failures: Failure[] }

export const unique = (ids: string[]) => [...new Set(ids)]

// D-108 and REG-32/REG-33: the new squads or sweepers must exist, belong to this tournament,
// be the right kind, and still be open.
export function checkNewSessions(
  kind: 'squad' | 'sweeper',
  requested: string[],
  found: StoredSession[],
  tournamentId: string,
): Failure[] {
  const label = kind === 'squad' ? 'squad' : 'sweeper'
  const usable = new Set(
    found
      .filter((session) => session.kind === kind && session.tournamentId === tournamentId)
      .map((session) => session.id),
  )
  const failures: Failure[] = []
  if (requested.some((id) => !usable.has(id))) {
    failures.push(
      validation(
        kind === 'squad' ? 'Registration.InvalidSquadIds' : 'Registration.InvalidSweeperIds',
        `Invalid ${label} IDs`,
      ),
    )
  }
  if (
    found.some(
      (session) => requested.includes(session.id) && session.kind === kind && session.complete,
    )
  ) {
    failures.push(
      validation(
        kind === 'squad' ? 'Registration.SquadComplete' : 'Registration.SweeperComplete',
        `Cannot add ${label}(s) that are already complete.`,
      ),
    )
  }
  return failures
}

// REG-11: a squad or sweeper already on the registration cannot be added again.
function checkOverlap(
  kind: 'squad' | 'sweeper',
  requested: string[],
  existing: StoredRegistration | undefined,
): Failure[] {
  if (!existing?.sessionIds.some((id) => requested.includes(id))) return []
  return kind === 'squad'
    ? [validation('Squad.Conflict', 'The specified squads are already registered.')]
    : [validation('Sweeper.Conflict', 'The specified sweepers are already registered.')]
}

/**
 * API-05: create the registration, or append to the bowler's existing one in the tournament
 * (REG-01, REG-10 to REG-14). Bowler fields patch, never replace (D-05). Eligibility is a 400
 * for every caller (D-107). Other-tournament ids and complete squads are a 400 too (D-108). A
 * payment code already on file means the caller is retrying: answer with that registration (D-109).
 */
async function findDivision(
  { divisions, writer }: RegisterDependencies,
  divisionId: string,
  tournamentId: string,
): Promise<{ division: Division } | { failure: Failure }> {
  const owner = await writer.findDivisionTournament(divisionId)
  const notFound = other('Division.NotFound', 'The specified division does not exist.')
  if (owner === undefined) return { failure: notFound }
  if (owner !== tournamentId) {
    return {
      failure: validation(
        'Registration.DivisionNotInTournament',
        'Division ID is not valid for the tournament.',
      ),
    }
  }
  const division = (await divisions.listByTournament(tournamentId)).find(
    (candidate) => candidate.id === divisionId,
  )
  return division ? { division } : { failure: notFound }
}

export async function register(
  deps: RegisterDependencies,
  input: RegistrationInput,
): Promise<RegisterResult> {
  const { tournaments, sweepers, writer } = deps
  const now = deps.now?.() ?? new Date()
  const newId = deps.newId ?? randomUUID

  const payment = input.payment ? toNewPayment(input.payment, newId(), now) : null
  if (payment) {
    const existingId = await writer.findRegistrationIdByPaymentCode(payment.confirmationCode)
    if (existingId) return { ok: true, registrationId: existingId, mode: 'retry' }
  }

  const tournament = await tournaments.get(input.tournamentId)
  if (!tournament) {
    return fail('create', [
      other('Tournament.NotFound', 'The specified tournament does not exist.'),
    ])
  }
  const located = await findDivision(deps, input.divisionId, tournament.id)
  if ('failure' in located) return fail('create', [located.failure])
  const { division } = located

  const usbcId = input.bowler.usbcId
  const knownBowlers = await writer.findBowlersByUsbcId(usbcId)
  if (knownBowlers.length > 1) {
    return fail('create', [
      other('Bowler.Duplicate', 'More than one bowler record has this USBC ID.'),
    ])
  }
  const knownBowler = knownBowlers[0]
  const existing = knownBowler
    ? await writer.findRegistration(knownBowler.id, tournament.id)
    : undefined
  const mode = existing ? 'append' : 'create'

  const patch = toBowlerPatch(input.bowler)
  const bowler = knownBowler ? mergeBowler(knownBowler, patch) : toNewBowler(input.bowler)

  const squadIds = unique(input.squads)
  const sweeperIds = unique(input.sweepers)
  const found = await writer.findSessions([
    ...squadIds,
    ...sweeperIds,
    ...(existing?.sessionIds ?? []),
  ])
  const countOf = (kind: 'squad' | 'sweeper', requested: string[]) =>
    found.filter(
      (session) =>
        session.kind === kind &&
        // Stryker disable next-line all: `found` holds only requested or registered ids, so the test never differs.
        (requested.includes(session.id) || existing?.sessionIds.includes(session.id)),
    ).length
  const squadCount = countOf('squad', squadIds)
  const sweeperCount = countOf('sweeper', sweeperIds)
  const tournamentSweeperCount = (await sweepers.listByTournament(tournament.id)).length

  const failures: Failure[] = [
    ...checkBowler(bowler, {
      today: now.toISOString().slice(0, 10),
      rawPhone: input.bowler.phoneNumber,
    }),
    ...checkOverlap('squad', squadIds, existing),
    ...checkOverlap('sweeper', sweeperIds, existing),
    ...checkNewSessions('squad', squadIds, found, tournament.id),
    ...checkNewSessions('sweeper', sweeperIds, found, tournament.id),
  ]
  const average = input.average ?? existing?.average ?? null
  failures.push(
    ...checkEligibility({
      division,
      average,
      bowler,
      tournamentStart: tournament.startDate,
    }),
  )
  if (squadCount === 0) {
    failures.push(validation('Registration.SquadsRequired', 'Bowler must enter at least one squad'))
  }
  if (input.superSweeper && sweeperCount !== tournamentSweeperCount) {
    failures.push(
      validation(
        'Registration.SuperSweeperNeedsAllSweepers',
        'Must enter all sweepers to enter Super Sweeper',
      ),
    )
  }
  if (failures.length > 0) return fail(mode, failures)

  const registrationId = existing?.id ?? newId()
  await writer.save({
    bowler: knownBowler
      ? { id: knownBowler.id, isNew: false, patch }
      : { id: newId(), isNew: true, data: bowler },
    registration: {
      id: registrationId,
      isNew: existing === undefined,
      divisionId: input.divisionId,
      average,
      superSweeper: input.superSweeper,
    },
    addSessionIds: [...squadIds, ...sweeperIds],
    payment,
  })
  return { ok: true, registrationId, mode }
}

function fail(mode: 'create' | 'append', failures: Failure[]): RegisterResult {
  return { ok: false, mode, failures }
}
