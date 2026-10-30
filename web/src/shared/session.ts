// What the squad pages and the recap sheets share: a session is a squad or a sweeper (D-60).

/** A squad or a sweeper: both use the lane page and the recap sheets. */
export type SessionKind = 'squad' | 'sweeper'

/** The API has no squad or sweeper with this id in the tournament (404), or an id is not valid (400). */
export class SessionNotFoundError extends Error {
  constructor(kind: SessionKind) {
    super(kind === 'squad' ? 'Squad not found' : 'Sweeper not found')
  }
}

/** The session cannot take lane assignments as set up, such as 6 bowlers per pair (422, LAN-02). */
export class LaneSetupError extends Error {}

/** Retry once, but not a missing session or a setup problem: a second try answers the same. */
export function retryUnlessFinal(failureCount: number, error: Error): boolean {
  return (
    !(error instanceof SessionNotFoundError) &&
    !(error instanceof LaneSetupError) &&
    failureCount < 1
  )
}
