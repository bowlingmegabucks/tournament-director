import { createHash } from 'node:crypto'
import { FieldErrorsError, HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { LaneRepository } from '../lanes/repository.ts'
import type { LaneEntry } from '../lanes/types.ts'
import { formatCents } from '../payouts/money.ts'
import type { PayoutStore } from '../payouts/store.ts'
import type { PayoutRecord } from '../payouts/types.ts'
import type { RegistrationWriter } from '../registrations/writer.ts'
import { requireRatios } from '../results/resultHelpers.ts'
import type { ScoreRepository } from '../scores/repository.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { Squad } from '../squads/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import { workOutFallout, type Fallout, type Snapshot } from './fallout.ts'
import { shortSessionTime, systemNote } from './notes.ts'
import type { NoShowCommand } from './store.ts'
import type { Choice, PayoutChange, Preview } from './types.ts'

export interface NoShowDeps {
  tournaments: TournamentRepository
  divisions: DivisionRepository
  squads: SquadRepository
  sweepers: SweeperRepository
  lanes: LaneRepository
  scores: ScoreRepository
  payouts: PayoutStore
  writer: RegistrationWriter
}

export interface Request {
  tournamentId: string
  squadId: string
  registrationId: string
  choice: Choice
}

export const messages = {
  tournament: 'This tournament is complete, so its entries cannot change.',
  squad: 'This squad is not complete. Change the registration instead.',
  noShow: 'This bowler has a score in this squad, so they are not a no-show.',
  targetUnknown: 'Choose a squad of this tournament.',
  targetComplete: 'Choose a squad that is not complete.',
  targetHeld: 'This bowler is already entered in that squad.',
  scores:
    'Refunding this entry deletes the registration, and this bowler has scores. Move them instead.',
  squadPayout: 'This bowler has a payout for this squad. Remove it first.',
  anyPayout:
    'Refunding this entry deletes the registration, and this bowler has a payout. Remove it first.',
  sweepers:
    'This is their only squad entry. Refunding it makes them ineligible for sweepers and deletes the registration, including every sweeper entry.',
  noSweepers: 'This is their only squad entry. Refunding it deletes the registration.',
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

async function readSnapshot(
  deps: NoShowDeps,
  tournamentId: string,
  squads: readonly Squad[],
): Promise<Snapshot> {
  const ratios = await deps.tournaments.getRatios(tournamentId)
  if (!ratios) throw new HttpError(404, 'Tournament not found')
  requireRatios("This tournament's", { finals: ratios.finalsRatio })
  for (const squad of squads) {
    requireRatios("A squad's", { finals: squad.finalsRatio, cash: squad.cashRatio })
  }
  const [divisions, reads] = await Promise.all([
    deps.divisions.listByTournament(tournamentId),
    Promise.all(
      squads.map(async (squad) => ({
        id: squad.id,
        entries: await deps.lanes.listEntries(squad.id),
        scores: await deps.scores.listScores(squad.id),
      })),
    ),
  ])
  return {
    squads,
    divisions,
    finalsRatio: ratios.finalsRatio,
    entries: new Map(reads.map((read) => [read.id, read.entries])),
    scores: new Map(reads.map((read) => [read.id, read.scores])),
  }
}

/** NSH-08, NSH-11: the payouts that stop being earned, and what the system writes on each. */
function payoutChanges(
  records: readonly PayoutRecord[],
  snapshot: Snapshot,
  fallout: Fallout,
  note: string,
): PayoutChange[] {
  const entries: LaneEntry[] = [...snapshot.entries.values()].flat()
  const nameOf = new Map(entries.map((entry) => [entry.registrationId, entry.name]))
  const change = (record: PayoutRecord, label: string): PayoutChange => ({
    payoutId: record.id,
    label,
    name: nameOf.get(record.registrationId) ?? 'Unknown bowler',
    amount: formatCents(record.amountCents),
    note: record.note ? null : note,
  })
  return records.flatMap((record) => {
    const key = `${record.eventId}:${record.registrationId}`
    if (record.source === 'squad' && fallout.lostCash.has(key)) {
      const squad = snapshot.squads.find((item) => item.id === record.eventId)
      return squad ? [change(record, `Squad ${shortSessionTime(squad.date)}`)] : []
    }
    if (record.source === 'finals' && fallout.lostFinals.has(key)) {
      const division = snapshot.divisions.find((item) => item.id === record.eventId)
      return [change(record, `Finals: ${division?.name ?? ''}`)]
    }
    return []
  })
}

export interface Planned {
  preview: Preview
  command: Omit<NoShowCommand, 'actorId'>
  /** Squads and sweepers whose screens must refetch after the save. */
  sessionIds: string[]
}

/**
 * Check one move or refund (NSH-01 to NSH-08) and work out what it would change (NSH-09). Throws
 * 404 for an unknown tournament, squad, or entry, and 409 with `errors` for a refusal.
 */
export async function planNoShow(deps: NoShowDeps, request: Request): Promise<Planned> {
  const { tournamentId, squadId, registrationId, choice } = request
  const settings = await deps.tournaments.getSettings(tournamentId)
  if (!settings) throw new HttpError(404, 'Tournament not found')
  const [squads, sweepers, detail, facts, records] = await Promise.all([
    deps.squads.listByTournament(tournamentId),
    deps.sweepers.listByTournament(tournamentId),
    deps.writer.getDetail(registrationId),
    deps.writer.getDeskDeleteFacts(registrationId, tournamentId),
    deps.payouts.list(tournamentId),
  ])
  const source = squads.find((squad) => squad.id === squadId)
  if (!source) throw new HttpError(404, 'Squad not found')
  if (detail?.tournamentId !== tournamentId || !facts || !detail.sessionIds.includes(squadId)) {
    throw new HttpError(404, 'This bowler is not entered in this squad')
  }

  const errors: Record<string, string> = {}
  if (settings.completed) errors.tournament = messages.tournament
  if (!source.complete) errors.squad = messages.squad
  const sourceScores = await deps.scores.listScores(squadId)
  if (sourceScores.some((row) => row.bowlerId === detail.bowlerId && row.score > 0)) {
    errors.noShow = messages.noShow
  }

  let target: Squad | undefined
  if (choice.action === 'move') {
    target = squads.find((squad) => squad.id === choice.targetSquadId)
    if (!target) errors.target = messages.targetUnknown
    else if (detail.sessionIds.includes(target.id)) errors.target = messages.targetHeld
    else if (target.complete) errors.target = messages.targetComplete
  }

  const otherSquads = squads.filter(
    (squad) => squad.id !== squadId && detail.sessionIds.includes(squad.id),
  )
  const deletesRegistration = choice.action === 'refund' && otherSquads.length === 0
  const mine = records.filter((record) => record.registrationId === registrationId)
  if (mine.some((record) => record.source === 'squad' && record.eventId === squadId)) {
    errors.payout = messages.squadPayout
  } else if (deletesRegistration && mine.length > 0) {
    errors.payout = messages.anyPayout
  }
  if (deletesRegistration) {
    // NSH-07: the zeros of this squad do not count; any other score in the tournament does.
    const others = new Set(
      [...squads, ...sweepers].map((session) => session.id).filter((id) => id !== squadId),
    )
    const scored = await deps.writer.findScoredSessionIds(detail.bowlerId)
    if (scored.some((id) => others.has(id))) errors.scores = messages.scores
  }
  const first = Object.values(errors)[0]
  if (first !== undefined) throw new FieldErrorsError(409, first, errors)

  const snapshot = await readSnapshot(deps, tournamentId, squads)
  const fallout = await workOutFallout(snapshot, { squadId, registrationId }, choice.keepAdvancing)
  const bowlerName =
    snapshot.entries.get(squadId)?.find((entry) => entry.registrationId === registrationId)?.name ??
    facts.bowlerName
  const note = systemNote(bowlerName, source.date, target?.date ?? null)
  const payouts = payoutChanges(records, snapshot, fallout, note)

  const warnings: string[] = []
  // The facts hold real payments only (D-106).
  const paidCents = deletesRegistration
    ? facts.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)
    : 0
  const sweeperIds = sweepers
    .map((sweeper) => sweeper.id)
    .filter((id) => detail.sessionIds.includes(id))
  if (deletesRegistration) {
    warnings.push(sweeperIds.length > 0 ? messages.sweepers : messages.noSweepers)
    if (paidCents > 0) {
      warnings.push(
        `This bowler paid ${dollars(paidCents)} outside this system. Deleting the registration removes the payment records.`,
      )
    }
  }

  const body: Omit<Preview, 'version'> = {
    action: choice.action,
    bowlerName,
    source: { id: source.id, date: source.date },
    target: target ? { id: target.id, date: target.date } : null,
    deletesRegistration,
    warnings,
    changes: fallout.changes,
    keepAdvancing: fallout.keepAdvancing,
    atLarge: fallout.atLarge,
    payouts,
  }
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex')

  return {
    preview: { ...body, version },
    command: {
      tournamentId,
      sourceSquadId: squadId,
      registrationId,
      bowlerId: detail.bowlerId,
      targetSquadId: target?.id ?? null,
      deleteRegistration: deletesRegistration,
      paidCents,
      keepAdvancing: fallout.kept,
      notes: payouts.flatMap((item) =>
        item.note === null ? [] : [{ payoutId: item.payoutId, note: item.note }],
      ),
    },
    sessionIds: [
      ...new Set([
        squadId,
        ...(target ? [target.id] : []),
        ...(deletesRegistration ? sweeperIds : []),
        ...fallout.changedSquadIds,
        ...fallout.kept.map((key) => key.squadId),
      ]),
    ],
  }
}
