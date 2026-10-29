import type { LaneEntry } from './types.ts'

/**
 * What routes need from storage: who entered one squad or sweeper, and the position each holds
 * (LAN-01). Unsorted: `buildLanePage` sorts. An unknown session gives an empty list, so call this
 * through a route that has checked the session.
 */
export interface LaneRepository {
  listEntries(sessionId: string): Promise<LaneEntry[]>
}

/** Entries stored with the session they belong to. */
export function createInMemoryLaneRepository(
  seed: { sessionId: string; entry: LaneEntry }[],
): LaneRepository {
  return {
    listEntries: (sessionId) =>
      Promise.resolve(
        seed.filter((item) => item.sessionId === sessionId).map((item) => ({ ...item.entry })),
      ),
  }
}
