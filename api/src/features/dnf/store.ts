/**
 * What routes and results need to keep the DNF flags (D-248): the bowlers who walked off an open
 * squad or sweeper, so the full-game count stops waiting for them. The Prisma version uses the
 * `SessionDnf` table; a session with no row has no flag.
 */
export interface SetIfOpenInput {
  tournamentId: string
  kind: 'squad' | 'sweeper'
  sessionId: string
  registrationId: string
}

export interface DnfStore {
  /** The registrations flagged in each session. A session with none has no entry. */
  listFlagged(sessionIds: readonly string[]): Promise<Map<string, ReadonlySet<string>>>
  /** Flag a bowler. `true` when the flag is new. */
  set(sessionId: string, registrationId: string): Promise<boolean>
  /**
   * Flag a bowler only if, at the moment of the write, the tournament and the session are open and
   * the bowler has a saved score (D-249). One transaction, so a Complete or a cleared score that
   * lands between the route's reads and the write is seen. `set` is a new flag, `same` a repeat.
   */
  setIfOpen(input: SetIfOpenInput): Promise<'set' | 'same' | 'complete' | 'no-score'>
  /** Remove a flag. `true` when there was one. */
  clear(sessionId: string, registrationId: string): Promise<boolean>
}

const keyOf = (sessionId: string, registrationId: string) => `${sessionId}|${registrationId}`

/** Storage in memory, for tests. `state` holds `sessionId|registrationId` keys. */
export function createInMemoryDnfStore(
  seed: readonly { sessionId: string; registrationId: string }[] = [],
) {
  const state = new Set(seed.map((row) => keyOf(row.sessionId, row.registrationId)))
  const store: DnfStore = {
    listFlagged(sessionIds) {
      const found = new Map<string, Set<string>>()
      for (const key of state) {
        // Stryker disable next-line StringLiteral: every key holds a bar, so the defaults are never read.
        const [sessionId = '', registrationId = ''] = key.split('|')
        if (!sessionIds.includes(sessionId)) continue
        found.set(sessionId, (found.get(sessionId) ?? new Set()).add(registrationId))
      }
      return Promise.resolve(found)
    },
    set(sessionId, registrationId) {
      const key = keyOf(sessionId, registrationId)
      const isNew = !state.has(key)
      state.add(key)
      return Promise.resolve(isNew)
    },
    async setIfOpen({ sessionId, registrationId }) {
      // Memory has no sessions or scores to look at; the route checked them already.
      return (await store.set(sessionId, registrationId)) ? 'set' : 'same'
    },
    clear(sessionId, registrationId) {
      return Promise.resolve(state.delete(keyOf(sessionId, registrationId)))
    },
  }
  return { store, state }
}
