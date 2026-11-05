import type { PrismaClient } from '../../shared/database.ts'
import type { EditFacts, SessionFact } from './editFacts.ts'

/** Both the client and a transaction fit: the writer reads these inside its transaction. */
type FactsClient = Pick<PrismaClient, 'registration' | 'squad' | 'squadScore'>

const SWEEPER = 1

/** Count what depends on a tournament's settings (D-128). */
export async function loadEditFacts(client: FactsClient, tournamentId: string): Promise<EditFacts> {
  // The Registrations table has no TournamentId column; the division carries it (Q-26).
  const registrationCount = await client.registration.count({
    where: { division: { tournamentId } },
  })
  const sessions = await client.squad.findMany({
    where: { tournamentId },
    select: { id: true, squadType: true, date: true },
    orderBy: { date: 'asc' },
  })
  const squadIds = sessions.filter((row) => row.squadType !== SWEEPER).map((row) => row.id)
  const sweeperIds = sessions.filter((row) => row.squadType === SWEEPER).map((row) => row.id)

  const anyScore = async (ids: string[]) =>
    ids.length > 0 &&
    (await client.squadScore.findFirst({
      where: { squadId: { in: ids } },
      select: { game: true },
    })) !== null
  const hasSweeperScores = await anyScore(sweeperIds)
  const hasScores = hasSweeperScores || (await anyScore(squadIds))

  const fact = (row: (typeof sessions)[number] | undefined): SessionFact | undefined =>
    row && { kind: row.squadType === SWEEPER ? 'sweeper' : 'squad', date: row.date }
  return {
    registrationCount,
    hasScores,
    hasSweeperScores,
    firstSession: fact(sessions[0]),
    lastSession: fact(sessions.at(-1)),
  }
}
