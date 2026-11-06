import type { PrismaClient } from '../../shared/database.ts'
import type { DivisionEditFacts } from './editFacts.ts'

/** Both the client and a transaction fit. */
type FactsClient = Pick<PrismaClient, 'registration' | 'squad' | 'squadScore'>

/**
 * Count what depends on one division's settings (D-147, D-148). A score counts when its bowler is
 * registered in this division and its squad or sweeper belongs to this tournament: the scores table
 * has no relations, so the bowlers come first and the scores second.
 */
export async function loadDivisionEditFacts(
  client: FactsClient,
  tournamentId: string,
  divisionId: string,
): Promise<DivisionEditFacts> {
  const registrations = await client.registration.findMany({
    where: { divisionId },
    select: { bowlerId: true },
  })
  if (registrations.length === 0) return { registrationCount: 0, hasScores: false }
  const sessions = await client.squad.findMany({ where: { tournamentId }, select: { id: true } })
  const hasScores =
    sessions.length > 0 &&
    (await client.squadScore.findFirst({
      where: {
        bowlerId: { in: registrations.map((row) => row.bowlerId) },
        squadId: { in: sessions.map((row) => row.id) },
      },
      select: { game: true },
    })) !== null
  return { registrationCount: registrations.length, hasScores }
}
