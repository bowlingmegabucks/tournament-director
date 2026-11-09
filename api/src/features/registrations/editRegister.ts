import { mergeBowler, type StoredBowler } from './bowler.ts'
import { checkBowler } from './bowlerRules.ts'
import { describeExisting, type ExistingRegistration } from './deskRegister.ts'
import { toEditBowlerPatch, type EditRequest } from './editRequest.ts'
import { checkEligibility } from './eligibility.ts'
import { validation, type Failure } from './problem.ts'
import { checkNewSessions, findDivision, unique, type RegisterDependencies } from './register.ts'
import { StaleRegistrationError, type RegistrationDetail, type StoredSession } from './writer.ts'

export interface EditWarning {
  field: string
  message: string
}

export type EditResult =
  | { ok: true; registrationId: string; added: number; removed: number }
  | { ok: false; kind: 'tournamentNotFound' | 'registrationNotFound' | 'complete' }
  | { ok: false; kind: 'changed'; existing: ExistingRegistration }
  | { ok: false; kind: 'warnings'; warnings: EditWarning[] }
  | { ok: false; kind: 'failures'; failures: Failure[] }

const failures = (list: Failure[]): EditResult => ({ ok: false, kind: 'failures', failures: list })

/** The squads and sweepers to add and remove, each list without repeats. */
interface Change {
  addSquads: string[]
  removeSquads: string[]
  addSweepers: string[]
  removeSweepers: string[]
}

interface Plan extends Change {
  nextSquads: string[]
  nextSweepers: string[]
}

function planOf(stored: RegistrationDetail, found: StoredSession[], change: Change): Plan {
  const held = (kind: 'squad' | 'sweeper') =>
    found
      .filter((session) => session.kind === kind && stored.sessionIds.includes(session.id))
      .map((session) => session.id)
  const next = (kind: 'squad' | 'sweeper', added: string[], removed: string[]) => [
    ...held(kind).filter((id) => !removed.includes(id)),
    ...added,
  ]
  return {
    ...change,
    nextSquads: next('squad', change.addSquads, change.removeSquads),
    nextSweepers: next('sweeper', change.addSweepers, change.removeSweepers),
  }
}

/** D-199: the desk read the registration earlier; a session to add that is held, or to remove that is gone, is stale. */
function isStale(stored: RegistrationDetail, change: Change): boolean {
  const held = (id: string) => stored.sessionIds.includes(id)
  return (
    [...change.addSquads, ...change.addSweepers].some(held) ||
    [...change.removeSquads, ...change.removeSweepers].some((id) => !held(id))
  )
}

interface Scope {
  tournamentId: string
  found: StoredSession[]
  scoredIds: string[]
}

const sessionOf = (found: StoredSession[], id: string) => found.find((s) => s.id === id)

/** REG-20, REG-33, REG-34, D-04, D-10, D-108: the squads and sweepers added and removed. */
function sessionFailures({ tournamentId, found, scoredIds }: Scope, plan: Plan): Failure[] {
  const list: Failure[] = [
    ...checkNewSessions('squad', plan.addSquads, found, tournamentId),
    ...checkNewSessions('sweeper', plan.addSweepers, found, tournamentId),
  ]
  const kinds = [
    { kind: 'squad' as const, label: 'squads', removed: plan.removeSquads },
    { kind: 'sweeper' as const, label: 'sweepers', removed: plan.removeSweepers },
  ]
  for (const { kind, label, removed } of kinds) {
    const name = kind === 'squad' ? 'Squad' : 'Sweeper'
    const sessions = removed.flatMap((id) => sessionOf(found, id) ?? [])
    if (sessions.some((session) => session.kind !== kind)) {
      list.push(validation(`Registration.Invalid${name}Ids`, `Invalid ${kind} IDs`))
    }
    if (sessions.some((session) => scoredIds.includes(session.id))) {
      list.push(
        validation(
          `Registration.Removed${name}HasScores`,
          `Bowler has already bowled in removed ${label}.`,
        ),
      )
    }
    if (sessions.some((session) => session.complete)) {
      list.push(
        validation(
          `Registration.Removed${name}Complete`,
          `Cannot remove a ${kind} that is already complete.`,
        ),
      )
    }
  }
  if (plan.nextSquads.length === 0) {
    list.push(
      validation(
        'Registration.SquadsRequired',
        'Bowler must enter at least one squad. To remove the last one, delete the registration.',
      ),
    )
  }
  return list
}

interface SuperSweeperState {
  was: boolean
  next: boolean
  tournamentSweeperIds: string[]
  /** This bowler has a sweeper score in this tournament (D-110). */
  scoredSweeper: boolean
}

/** REG-06, REG-17, REG-18, REG-35, D-110, D-203, D-204. */
function superSweeperFailures(
  state: SuperSweeperState,
  plan: Plan,
  found: StoredSession[],
): Failure[] {
  const changed = state.next !== state.was
  const list: Failure[] = []
  if (changed && state.scoredSweeper) {
    list.push(
      validation(
        'Registration.SuperSweeperLocked',
        'Cannot change Super Sweeper when sweeper scores have been recorded.',
      ),
    )
  }
  // Only a change that can break it needs the check: turning it on, or removing a sweeper while on.
  const needsAll = state.next && (changed || plan.removeSweepers.length > 0)
  if (needsAll && !state.tournamentSweeperIds.every((id) => plan.nextSweepers.includes(id))) {
    list.push(
      // Stryker disable next-line LogicalOperator: when this runs, `next` is true, so `was` and `changed` cannot both be false or both be true; the other combinations read the same either way.
      state.was && !changed
        ? validation(
            'Registration.SuperSweeperRemoveFirst',
            'Remove the Super Sweeper first, then remove this sweeper.',
          )
        : validation(
            'Registration.SuperSweeperNeedsAllSweepers',
            'Super Sweeper cannot be enrolled when not all sweepers are registered.',
          ),
    )
  }
  // REG-17: legacy refuses when any of the bowler's sweepers is complete.
  if (
    state.next &&
    changed &&
    found.some((session) => plan.nextSweepers.includes(session.id) && session.complete)
  ) {
    list.push(
      validation(
        'Registration.SuperSweeperSweeperComplete',
        "Cannot add Super Sweeper when one of the bowler's sweepers is complete.",
      ),
    )
  }
  return list
}

async function bowlerFailures(
  deps: RegisterDependencies,
  stored: StoredBowler,
  request: EditRequest,
  now: Date,
): Promise<{ merged: StoredBowler; patch: ReturnType<typeof toEditBowlerPatch>; list: Failure[] }> {
  const patch = toEditBowlerPatch(request.bowler)
  const merged = { ...stored, ...mergeBowler(stored, patch) }
  if (Object.keys(patch).length === 0) return { merged, patch, list: [] }
  const list = checkBowler(merged, {
    today: now.toISOString().slice(0, 10),
    rawPhone: request.bowler.phoneNumber,
  })
  // D-161 for a changed ID: another bowler may not already hold it.
  // Stryker disable next-line ConditionalExpression: with the ID unchanged the holder is the bowler itself, which the filter below skips, so the two guards are the same check.
  if (patch.usbcId !== undefined && patch.usbcId !== '' && patch.usbcId !== stored.usbcId) {
    const holders = await deps.writer.findBowlersByUsbcId(patch.usbcId)
    // Stryker disable next-line ConditionalExpression: see the guard above; the stored ID is the only one this bowler holds.
    if (holders.some((holder) => holder.id !== stored.id)) {
      list.push(validation('Bowler.UsbcIdInUse', 'Another bowler already has this USBC ID.'))
    }
  }
  return { merged, patch, list }
}

type EligibilityInput = Parameters<typeof checkEligibility>[0]

/** REG-04 and REG-05 against the division the bowler will hold after the save. */
async function eligibilityFailures(
  deps: RegisterDependencies,
  divisionId: string,
  next: {
    tournament: { id: string; startDate: EligibilityInput['tournamentStart'] }
    average: EligibilityInput['average']
    bowler: EligibilityInput['bowler']
  },
): Promise<Failure[]> {
  const located = await findDivision(deps, divisionId, next.tournament.id)
  if ('failure' in located) return [located.failure]
  return checkEligibility({
    division: located.division,
    average: next.average,
    bowler: next.bowler,
    tournamentStart: next.tournament.startDate,
  })
}

/**
 * The desk edits a registration (D-197): division, average, super sweeper, bowler details, and the
 * squads and sweepers to add and remove, in one save. Checks are the vendor `PATCH`'s plus D-04, D-10,
 * D-117, D-199 to D-206. A failure writes nothing. A request with no payment is a desk request
 * (D-106), so every desk rule applies.
 */
export async function editRegistration(
  deps: RegisterDependencies,
  tournamentId: string,
  registrationId: string,
  request: EditRequest,
): Promise<EditResult> {
  const { tournaments, sweepers, writer } = deps
  const now = deps.now?.() ?? new Date()
  const newId = deps.newId ?? (() => crypto.randomUUID())

  const tournament = await tournaments.get(tournamentId)
  if (!tournament) return { ok: false, kind: 'tournamentNotFound' }
  if ((await tournaments.getSettings(tournamentId))?.completed) {
    return { ok: false, kind: 'complete' }
  }
  const stored = await writer.getDetail(registrationId)
  if (stored?.tournamentId !== tournament.id) return { ok: false, kind: 'registrationNotFound' }

  const change: Change = {
    addSquads: unique(request.addSquadIds),
    removeSquads: unique(request.removeSquadIds),
    addSweepers: unique(request.addSweeperIds),
    removeSweepers: unique(request.removeSweeperIds),
  }
  const changed = async (): Promise<EditResult> => ({
    ok: false,
    kind: 'changed',
    existing: await describeExisting(deps, tournament.id, stored),
  })
  if (isStale(stored, change)) return changed()

  const scoredIds = await writer.findScoredSessionIds(stored.bowlerId)
  const found = await writer.findSessions([
    ...stored.sessionIds,
    ...change.addSquads,
    ...change.addSweepers,
    ...change.removeSquads,
    ...change.removeSweepers,
    ...scoredIds,
  ])
  const scoredHere = found.filter(
    (session) => scoredIds.includes(session.id) && session.tournamentId === tournament.id,
  )
  const plan = planOf(stored, found, change)
  const list = sessionFailures({ tournamentId: tournament.id, found, scoredIds }, plan)

  const superSweeper = request.superSweeper ?? stored.superSweeper
  list.push(
    ...superSweeperFailures(
      {
        was: stored.superSweeper,
        next: superSweeper,
        tournamentSweeperIds: (await sweepers.listByTournament(tournament.id)).map((s) => s.id),
        scoredSweeper: scoredHere.some((session) => session.kind === 'sweeper'),
      },
      plan,
      found,
    ),
  )

  const divisionId = request.divisionId ?? stored.divisionId
  const divisionMoved = divisionId !== stored.divisionId
  const average = request.average === undefined ? stored.average : request.average
  const averageChanged = average !== stored.average
  const bowler = await bowlerFailures(deps, stored.bowler, request, now)
  list.push(...bowler.list)
  const idsChanged = (['gender', 'dateOfBirth', 'usbcId'] as const).some(
    (field) => field in bowler.patch && bowler.patch[field] !== stored.bowler[field],
  )

  if (divisionMoved && scoredHere.length > 0) {
    // REG-15, D-117, D-205.
    list.push(
      validation(
        'Registration.DivisionLocked',
        'Cannot change bowler division after scores have been recorded.',
      ),
    )
  }
  // REG-04 and REG-05 run when something they read changed (D-205). A bowler who no longer fits
  // after the division was edited (D-12) can still add a squad.
  if (divisionMoved || averageChanged || idsChanged) {
    list.push(
      ...(await eligibilityFailures(deps, divisionId, {
        tournament,
        average,
        bowler: bowler.merged,
      })),
    )
  }
  if (list.length > 0) return failures(list)

  // D-201: a later average moves handicap and results once scores exist.
  if (averageChanged && scoredHere.length > 0 && !request.confirmWarnings) {
    return {
      ok: false,
      kind: 'warnings',
      warnings: [
        { field: 'average', message: 'This bowler has scores. Handicap and results will change.' },
      ],
    }
  }

  const addSessionIds = [...change.addSquads, ...change.addSweepers]
  const removeSessionIds = [...change.removeSquads, ...change.removeSweepers]
  try {
    await writer.save({
      bowler: { id: stored.bowlerId, isNew: false, patch: bowler.patch },
      registration: { id: stored.id, isNew: false, divisionId, average, superSweeper },
      addSessionIds,
      removeSessionIds,
      // D-200: only an added session records the desk placeholder.
      payment:
        addSessionIds.length === 0
          ? null
          : {
              id: newId(),
              confirmationCode: `Manual_${newId()}`,
              amount: 0,
              createdAtUtc: now,
            },
      expect: { present: removeSessionIds, absent: addSessionIds },
    })
  } catch (error) {
    // D-199: someone changed it between the read and the save.
    if (error instanceof StaleRegistrationError) return changed()
    throw error
  }
  return {
    ok: true,
    registrationId: stored.id,
    added: addSessionIds.length,
    removed: removeSessionIds.length,
  }
}
