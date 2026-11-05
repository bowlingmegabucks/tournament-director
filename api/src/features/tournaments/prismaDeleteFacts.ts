import type { PrismaClient } from '../../shared/database.ts'
import type { DeleteFacts } from './deletePlan.ts'
import { loadEditFacts } from './prismaEditFacts.ts'

/** Both the client and a transaction fit: the writer reads these inside its transaction. */
type DeleteFactsClient = Pick<PrismaClient, 'registration' | 'squad' | 'squadScore' | 'division'>

const SWEEPER = 1
/** The desk's $0 placeholder payment code starts with this (PAY-01a). */
export const manualPrefix = 'Manual_'

/** `startsWith` becomes `LIKE 'x%'` and Prisma does not escape `_` or `%`: escape them here. */
const likeEscaped = (text: string) => text.replace(/[\\%_]/g, '\\$&')

/**
 * Count what a delete depends on (D-133, D-134). Scores and registrations come from the same reads
 * the edit page uses. A real payment is one the registration site took: a code that does not start
 * with `Manual_` and an amount above 0 (D-106).
 */
export async function loadDeleteFacts(
  client: DeleteFactsClient,
  tournamentId: string,
  completed: boolean,
): Promise<DeleteFacts> {
  const { registrationCount, hasScores } = await loadEditFacts(client, tournamentId)
  // The Registrations table has no TournamentId column; the division carries it (Q-26).
  const inTournament = { division: { tournamentId } }
  const paidRegistrations = await client.registration.count({
    where: {
      ...inTournament,
      payments: {
        some: {
          amount: { gt: 0 },
          NOT: { confirmationCode: { startsWith: likeEscaped(manualPrefix) } },
        },
      },
    },
  })
  const divisions = await client.division.count({ where: { tournamentId } })
  const sweepers = await client.squad.count({ where: { tournamentId, squadType: SWEEPER } })
  const squads = await client.squad.count({ where: { tournamentId, squadType: { not: SWEEPER } } })
  return {
    completed,
    hasScores,
    paidRegistrations,
    registrations: registrationCount,
    divisions,
    squads,
    sweepers,
  }
}
