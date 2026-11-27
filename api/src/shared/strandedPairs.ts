import { buildPairs } from '../features/lanes/positions.ts'
import type { PrismaClient } from './database.ts'

/**
 * After a session's lanes change, forget the pairs out of play that no longer start a pair of it
 * (OOP-07). Otherwise a later change back could take a pair out that nobody chose to. Pass the
 * session's lanes as they now are; run it in the transaction that saves them.
 */
export async function dropStrandedPairs(
  client: Pick<PrismaClient, 'laneOutOfPlay'>,
  sessionId: string,
  startingLane: number,
  numberOfLanes: number,
): Promise<void> {
  const firstLanes = buildPairs(startingLane, numberOfLanes).map((pair) => pair.firstLane)
  await client.laneOutOfPlay.deleteMany({
    where: { squadId: sessionId, lane: { notIn: firstLanes } },
  })
}
