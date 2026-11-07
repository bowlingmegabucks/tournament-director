import type { PrismaClient } from './database.ts'
import { parsePosition } from '../features/lanes/positions.ts'
import type { SessionEditFacts } from './sessionEdit.ts'

/** Both the client and a transaction fit. */
type FactsClient = Pick<PrismaClient, 'squadRegistration' | 'squadScore'>

/**
 * Count what depends on one squad or sweeper (D-180). Only this session counts: a score in
 * another squad has no bearing. A saved position that does not read as `<lane><letter>` is left
 * out (the lane page lists it as "Other", D-61).
 */
export async function loadSessionEditFacts(
  client: FactsClient,
  sessionId: string,
): Promise<SessionEditFacts> {
  const entries = await client.squadRegistration.findMany({
    where: { squadId: sessionId },
    select: { laneAssignment: true },
  })
  const score = await client.squadScore.findFirst({
    where: { squadId: sessionId },
    select: { game: true },
  })
  return {
    entryCount: entries.length,
    hasScores: score !== null,
    assignedLanes: entries.flatMap((entry) => {
      const position = parsePosition(entry.laneAssignment ?? '')
      return position ? [position.lane] : []
    }),
  }
}
