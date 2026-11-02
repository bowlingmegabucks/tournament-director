import { randomUUID } from 'node:crypto'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { checkEligibility } from './eligibility.ts'
import { isPaidRequest, toNewPayment } from './payment.ts'
import { other, validation, type Failure } from './problem.ts'
import { checkNewSessions, unique } from './register.ts'
import type { UpdateInput } from './updateRequest.ts'
import type { RegistrationWriter } from './writer.ts'

export interface UpdateDependencies {
  tournaments: TournamentRepository
  divisions: DivisionRepository
  sweepers: SweeperRepository
  writer: RegistrationWriter
  now?: () => Date
  newId?: () => string
}

/** `retry` means the payment code was already on file: nothing was written (D-118). */
export type UpdateResult =
  { ok: true; mode: 'update' | 'retry' } | { ok: false; failures: Failure[] }

const fail = (...failures: Failure[]): UpdateResult => ({ ok: false, failures })

/**
 * API-07: change a registration (REG-30 to REG-39). Squad and sweeper lists replace the stored
 * ones; a list left out stays. A *paid* request gets the legacy rules; any other request also gets
 * D-04 (keep a squad), D-10 (no dropping a complete squad or sweeper), and D-117 (no division
 * change after scores) (D-106, D-115). The super sweeper lock is per bowler for everyone (D-110).
 * A failure writes nothing.
 */
export async function updateRegistration(
  deps: UpdateDependencies,
  registrationId: string,
  input: UpdateInput,
): Promise<UpdateResult> {
  const { tournaments, divisions, sweepers, writer } = deps
  const now = deps.now?.() ?? new Date()
  const newId = deps.newId ?? randomUUID

  const payment = input.payment ? toNewPayment(input.payment, newId(), now) : null
  if (payment) {
    const holder = await writer.findRegistrationIdByPaymentCode(payment.confirmationCode)
    if (holder === registrationId) return { ok: true, mode: 'retry' }
    if (holder !== undefined) {
      return fail(
        validation(
          'Payment.AlreadyUsed',
          'The payment confirmation belongs to another registration.',
        ),
      )
    }
  }

  const stored = await writer.getDetail(registrationId)
  if (!stored) {
    return fail(other('Registration.NotFound', `Registration with ID ${registrationId} not found.`))
  }
  const { tournamentId } = stored
  const tournament = await tournaments.get(tournamentId)
  if (!tournament) {
    return fail(other('Tournament.NotFound', 'The specified tournament does not exist.'))
  }
  const desk = !isPaidRequest(input.payment)

  const newDivisionId = input.divisionId ?? undefined
  const divisionId = newDivisionId ?? stored.divisionId
  const divisionChanged = divisionId !== stored.divisionId
  if (newDivisionId !== undefined && divisionChanged) {
    const owner = await writer.findDivisionTournament(newDivisionId)
    if (owner === undefined) {
      return fail(other('Division.NotFound', 'The specified division does not exist.'))
    }
    if (owner !== tournamentId) {
      return fail(
        validation(
          'Registration.DivisionNotInTournament',
          'Division ID is not valid for the tournament.',
        ),
      )
    }
  }

  const squadIds = input.squadIds ? unique(input.squadIds) : undefined
  const sweeperIds = input.sweeperIds ? unique(input.sweeperIds) : undefined
  const scoredIds = await writer.findScoredSessionIds(stored.bowlerId)
  const found = await writer.findSessions([
    ...stored.sessionIds,
    // Stryker disable next-line ArrayDeclaration: an extra unknown id finds no session.
    ...(squadIds ?? []),
    // Stryker disable next-line ArrayDeclaration: an extra unknown id finds no session.
    ...(sweeperIds ?? []),
    ...scoredIds,
  ])
  const onRegistration = (kind: 'squad' | 'sweeper') =>
    found
      .filter((session) => session.kind === kind && stored.sessionIds.includes(session.id))
      .map((session) => session.id)
  const currentSquads = onRegistration('squad')
  const currentSweepers = onRegistration('sweeper')
  const nextSquads = squadIds ?? currentSquads
  const nextSweepers = sweeperIds ?? currentSweepers
  const added = (next: string[], current: string[]) => next.filter((id) => !current.includes(id))
  const removed = (next: string[], current: string[]) => current.filter((id) => !next.includes(id))
  const addSquads = added(nextSquads, currentSquads)
  const addSweepers = added(nextSweepers, currentSweepers)
  const removeIds = [
    ...removed(nextSquads, currentSquads),
    ...removed(nextSweepers, currentSweepers),
  ]
  const scoredHere = found.filter(
    (session) => scoredIds.includes(session.id) && session.tournamentId === tournamentId,
  )

  const tournamentSweepers = await sweepers.listByTournament(tournamentId)
  const failures: Failure[] = [
    ...checkNewSessions('squad', addSquads, found, tournamentId),
    ...checkNewSessions('sweeper', addSweepers, found, tournamentId),
  ]

  // REG-34 and D-10.
  if (removeIds.some((id) => scoredIds.includes(id))) {
    failures.push(
      validation(
        'Registration.RemovedSessionHasScores',
        'Bowler has already bowled in removed squads.',
      ),
    )
  }
  if (desk && found.some((session) => removeIds.includes(session.id) && session.complete)) {
    failures.push(
      validation(
        'Registration.RemovedSessionComplete',
        'Cannot remove a squad or sweeper that is already complete.',
      ),
    )
  }
  // REG-31 and D-04.
  if (desk && nextSquads.length === 0) {
    failures.push(validation('Registration.SquadsRequired', 'Bowler must enter at least one squad'))
  }
  // REG-35 and REG-36 (D-110).
  const superSweeper = input.superSweeper ?? stored.superSweeper
  if (superSweeper && !tournamentSweepers.every((sweeper) => nextSweepers.includes(sweeper.id))) {
    failures.push(
      validation(
        'Registration.SuperSweeperNeedsAllSweepers',
        'Super Sweeper cannot be enrolled when not all sweepers are registered.',
      ),
    )
  }
  if (
    superSweeper !== stored.superSweeper &&
    scoredHere.some((session) => session.kind === 'sweeper')
  ) {
    failures.push(
      validation(
        'Registration.SuperSweeperLocked',
        'Cannot change Super Sweeper when sweeper scores have been recorded.',
      ),
    )
  }
  // REG-15 and D-117.
  if (desk && divisionChanged && scoredHere.length > 0) {
    failures.push(
      validation(
        'Registration.DivisionLocked',
        'Cannot change bowler division after scores have been recorded.',
      ),
    )
  }
  // REG-37 and REG-38 (D-116): eligibility on the new division, or the new average.
  const average = input.average ?? stored.average
  if (input.divisionId != null || input.average != null) {
    const division = (await divisions.listByTournament(tournamentId)).find(
      (candidate) => candidate.id === divisionId,
    )
    if (!division) {
      return fail(other('Division.NotFound', 'The specified division does not exist.'))
    }
    failures.push(
      ...checkEligibility({
        division,
        average,
        bowler: stored.bowler,
        tournamentStart: tournament.startDate,
      }),
    )
  }
  if (failures.length > 0) return { ok: false, failures }

  await writer.save({
    bowler: { id: stored.bowlerId, isNew: false, patch: {} },
    registration: { id: stored.id, isNew: false, divisionId, average, superSweeper },
    addSessionIds: [...addSquads, ...addSweepers],
    removeSessionIds: removeIds,
    payment,
  })
  return { ok: true, mode: 'update' }
}
