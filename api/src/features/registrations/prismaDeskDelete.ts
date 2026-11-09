import type { PrismaClient } from '../../shared/database.ts'
import { localDateTime } from '../../shared/sessions.ts'
import type { DeskDeleteEntry, DeskDeleteFacts } from './deskDelete.ts'
import { isRealPayment, paymentSystem } from './payment.ts'

/** Both the client and a transaction fit: the writer reads these inside its transaction. */
export type DeskDeleteClient = Pick<
  PrismaClient,
  'registration' | 'squad' | 'squadScore' | 'tournament'
>

const SWEEPER = 1

const toNumber = (value: { toNumber(): number } | null) => value?.toNumber() ?? null

/**
 * What a desk delete reads (D-211, D-212): the bowler and division names, each entry with its fee
 * (a squad's own or the tournament's, TRN-12; a sweeper's), the real payments, whether the
 * tournament is complete, and whether the bowler has any score in it. `undefined` for an unknown
 * registration or one whose division belongs to another tournament. The confirmation code stays
 * here: only the processing system leaves.
 */
export async function loadDeskDeleteFacts(
  client: DeskDeleteClient,
  registrationId: string,
  tournamentId: string,
): Promise<DeskDeleteFacts | undefined> {
  const row = await client.registration.findUnique({
    where: { id: registrationId },
    select: {
      bowlerId: true,
      bowler: { select: { firstName: true, lastName: true } },
      division: { select: { name: true, tournamentId: true } },
      squads: {
        select: {
          squad: {
            select: {
              id: true,
              squadType: true,
              date: true,
              squadEntryFee: true,
              sweeperEntryFee: true,
            },
          },
        },
      },
      payments: { select: { confirmationCode: true, amount: true } },
    },
  })
  if (row?.division.tournamentId !== tournamentId) return undefined
  // `Division` has no relation to the tournament in the model (Q-26), so read it by id.
  const tournament = await client.tournament.findUnique({
    where: { id: tournamentId },
    select: { completed: true, entryFee: true },
  })
  if (!tournament) return undefined

  const tournamentFee = tournament.entryFee.toNumber()
  const entries: DeskDeleteEntry[] = row.squads.flatMap(({ squad }) => {
    const date = localDateTime(squad.date)
    if (date === undefined) return []
    const isSweeper = squad.squadType === SWEEPER
    const own = toNumber(isSweeper ? squad.sweeperEntryFee : squad.squadEntryFee)
    return [
      {
        id: squad.id,
        kind: isSweeper ? ('sweeper' as const) : ('squad' as const),
        date,
        entryFee: own ?? (isSweeper ? 0 : tournamentFee),
      },
    ]
  })
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // A score belongs to the bowler and a squad, so ask for the bowler's scores in this tournament.
  const scoredInTournament = await client.squad.count({
    where: {
      tournamentId,
      id: {
        in: (
          await client.squadScore.findMany({
            where: { bowlerId: row.bowlerId },
            distinct: ['squadId'],
            select: { squadId: true },
          })
        ).map((score) => score.squadId),
      },
    },
  })

  return {
    bowlerName: `${row.bowler.firstName} ${row.bowler.lastName}`.trim(),
    divisionName: row.division.name,
    tournamentComplete: tournament.completed,
    hasScores: scoredInTournament > 0,
    entries,
    payments: row.payments
      .map((payment) => ({ code: payment.confirmationCode, amount: payment.amount.toNumber() }))
      .filter((payment) => isRealPayment(payment.code, payment.amount))
      .map((payment) => ({ system: paymentSystem(payment.code), amount: payment.amount })),
  }
}
