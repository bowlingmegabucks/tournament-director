import { withDatabaseErrors, type PrismaClient } from '../../shared/database.ts'
import type { Logger } from '../../shared/logger.ts'
import { withRetry } from '../../shared/serializableRetry.ts'
import { planLaneMove } from './movePlan.ts'
import type { LaneMove, LaneMoveResult, LaneWriter, SessionKind } from './writer.ts'

/** `Squads.SquadType`: a squad is 0, a sweeper is 1. */
const squadTypes: Record<SessionKind, number> = { squad: 0, sweeper: 1 }

/**
 * Moves one bowler in the legacy `SquadRegistration` table (D-216). The tournament, the session,
 * and every entry of the session are read and the position written in one serializable
 * transaction, so two moves into the last seat of a pair cannot both succeed: MariaDB rolls one
 * back (`P2034`), `withRetry` runs it again, and it then sees the first move and answers "full"
 * (Q-28). Only the one session's rows are read, so WinForms rows of other sessions stay unlocked.
 */
export function createPrismaLaneWriter(client: PrismaClient, logger: Logger): LaneWriter {
  const moveOnce = (input: LaneMove): Promise<LaneMoveResult> =>
    client.$transaction(
      async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: input.tournamentId },
          select: { completed: true },
        })
        if (!tournament) return { notFound: 'tournament' as const }
        // The tournament in the URL must own the row, and the row must be of this kind.
        const session = await tx.squad.findFirst({
          where: {
            id: input.sessionId,
            tournamentId: input.tournamentId,
            squadType: squadTypes[input.kind],
          },
        })
        if (!session) return { notFound: 'session' as const }

        const rows = await tx.squadRegistration.findMany({
          where: { squadId: input.sessionId },
          select: { registrationId: true, laneAssignment: true },
        })
        const outcome = planLaneMove(
          {
            kind: input.kind,
            tournamentComplete: tournament.completed,
            sessionComplete: session.complete,
            startingLane: session.startingLane,
            numberOfLanes: session.numberOfLanes,
            maxPerPair: session.maxPerPair,
            entries: rows.map((row) => ({
              registrationId: row.registrationId,
              position: row.laneAssignment ?? '',
            })),
          },
          input.registrationId,
          input.lane,
        )
        if (outcome.type === 'move') {
          await tx.squadRegistration.update({
            where: {
              registrationId_squadId: {
                registrationId: input.registrationId,
                squadId: input.sessionId,
              },
            },
            data: { laneAssignment: outcome.position },
          })
        }
        return outcome
      },
      { isolationLevel: 'Serializable' },
    )

  return {
    move: (input) => withDatabaseErrors(logger, () => withRetry(() => moveOnce(input))),
  }
}
