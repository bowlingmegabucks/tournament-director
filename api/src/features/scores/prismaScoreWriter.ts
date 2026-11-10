import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import {
  planChange,
  type ScoreChange,
  type ScoreChangeResult,
  type ScoreWriter,
  type SessionKind,
} from './scoreWriter.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes: Record<SessionKind, number> = { squad: 0, sweeper: 1 }

/**
 * Saves and clears one score in the legacy `SquadScores` table (D-228). The tournament, the
 * session, the entry, and the bowler's scores in the session are read and the change written in
 * one serializable transaction, so two keepers saving the same bowler cannot both fill the same
 * gap: MariaDB rolls one back (`P2034`), `withRetry` runs it again, and it then sees the first.
 * Only this bowler's rows are read, so other bowlers' scores stay unlocked. A squad's games are
 * the tournament's; a sweeper's are its own (D-238).
 */
export function createPrismaScoreWriter(client: PrismaClient, logger: Logger): ScoreWriter {
  const changeOnce = (input: ScoreChange): Promise<ScoreChangeResult> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { completed: true, games: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the row, and the row must be of this kind.
        const session = await tx.squad.findFirst({
          where: {
            id: input.sessionId,
            tournamentId: input.tournamentId,
            squadType: squadTypes[input.kind],
          },
          select: { complete: true, games: true },
        })
        if (!session) return { notFound: 'session' as const }
        const entry = await tx.squadRegistration.findUnique({
          where: {
            registrationId_squadId: {
              registrationId: input.registrationId,
              squadId: input.sessionId,
            },
          },
          select: { registration: { select: { bowlerId: true } } },
        })
        if (!entry) return { notFound: 'bowler' as const }
        const { bowlerId } = entry.registration

        const stored = await tx.squadScore.findMany({
          where: { bowlerId, squadId: input.sessionId },
          select: { game: true, score: true },
        })
        const plan = planChange(
          {
            kind: input.kind,
            tournamentComplete: tournament.completed,
            sessionComplete: session.complete,
            games: input.kind === 'squad' ? tournament.games : (session.games ?? 0),
            stored,
          },
          input,
        )
        if (plan.type === 'save') {
          for (const { game, score } of plan.writes) {
            await tx.squadScore.upsert({
              where: { bowlerId_squadId_game: { bowlerId, squadId: input.sessionId, game } },
              create: { bowlerId, squadId: input.sessionId, game, score },
              update: { score },
            })
          }
        } else if (plan.type === 'clear') {
          await tx.squadScore.delete({
            where: {
              bowlerId_squadId_game: { bowlerId, squadId: input.sessionId, game: plan.game },
            },
          })
        }
        return { plan }
      },
      { isolationLevel: 'Serializable' },
    )

  return {
    change: (input) => withDatabaseErrors(logger, () => withRetry(() => changeOnce(input))),
  }
}
