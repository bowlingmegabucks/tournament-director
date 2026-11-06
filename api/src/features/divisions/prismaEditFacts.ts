import type { PrismaClient } from '../../shared/database.ts'
import type { DivisionEditFacts } from './editFacts.ts'

/** Both the client and a transaction fit. */
type FactsClient = Pick<PrismaClient, 'registration' | '$queryRaw'>

/**
 * Count what depends on one division's settings (D-147, D-148). A score counts when its bowler is
 * registered in this division and its squad or sweeper (both live in `Squads`) belongs to this
 * tournament. The scores table has no relations, so one `EXISTS` query joins it by hand: the
 * database answers yes or no, and no list of bowler ids travels to the API and back.
 */
export async function loadDivisionEditFacts(
  client: FactsClient,
  tournamentId: string,
  divisionId: string,
): Promise<DivisionEditFacts> {
  const registrationCount = await client.registration.count({ where: { divisionId } })
  if (registrationCount === 0) return { registrationCount: 0, hasScores: false }
  const [found] = await client.$queryRaw<{ found: bigint | number }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM SquadScores AS score
      INNER JOIN Registrations AS registration ON registration.BowlerId = score.BowlerId
      INNER JOIN Squads AS squad ON squad.Id = score.SquadId
      WHERE registration.DivisionId = ${divisionId} AND squad.TournamentId = ${tournamentId}
    ) AS found`
  return { registrationCount, hasScores: Number(found?.found ?? 0) > 0 }
}
