import { z } from 'zod'

/** The step pattern of a squad or sweeper (LAN-19, D-235). */
export const skipSchema = z.enum(['staggered', 'same'])
export type Skip = z.infer<typeof skipSchema>

/** No stored row means the usual pattern (D-235). */
export const DEFAULT_SKIP: Skip = 'staggered'

/**
 * What routes need to keep the skip of one session (D-235). The Prisma version uses the
 * `SessionSkip` table; a session with no row reads as staggered.
 */
export interface SkipStore {
  get(sessionId: string): Promise<Skip>
  set(sessionId: string, skip: Skip): Promise<void>
}

/** Storage in memory, for tests. `state` shows what was saved. */
export function createInMemorySkipStore(seed: Record<string, Skip> = {}) {
  const state = new Map<string, Skip>(Object.entries(seed))
  const store: SkipStore = {
    get: (sessionId) => Promise.resolve(state.get(sessionId) ?? DEFAULT_SKIP),
    set: (sessionId, skip) => {
      state.set(sessionId, skip)
      return Promise.resolve()
    },
  }
  return { store, state }
}
