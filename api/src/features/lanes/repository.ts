import type { LaneEntry } from './types.ts'

/**
 * What routes need from storage: who entered one squad or sweeper, and the position each holds
 * (LAN-01). Unsorted: `buildLanePage` sorts. An unknown session gives an empty list, so call this
 * through a route that has checked the session.
 */
export interface LaneRepository {
  listEntries(sessionId: string): Promise<LaneEntry[]>
  /** The first lanes of the pairs taken out of play (OOP-01). */
  listOutOfPlay(sessionId: string): Promise<number[]>
}

/** Entries stored with the session they belong to. */
export function createInMemoryLaneRepository(
  seed: { sessionId: string; entry: LaneEntry }[],
  outOfPlay: { sessionId: string; lane: number }[] = [],
): LaneRepository {
  return {
    listOutOfPlay: (sessionId) =>
      Promise.resolve(
        outOfPlay.filter((item) => item.sessionId === sessionId).map((item) => item.lane),
      ),
    listEntries: (sessionId) =>
      Promise.resolve(
        seed.filter((item) => item.sessionId === sessionId).map((item) => ({ ...item.entry })),
      ),
  }
}
