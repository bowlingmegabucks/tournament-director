import type { EntryKey } from './types.ts'

/** What one confirmed move or refund writes. The store rechecks the facts in its transaction. */
export interface NoShowCommand {
  tournamentId: string
  sourceSquadId: string
  registrationId: string
  bowlerId: string
  /** `null` for a refund. */
  targetSquadId: string | null
  /** A refund of the only squad entry (NSH-06). */
  deleteRegistration: boolean
  keepAdvancing: readonly EntryKey[]
  /** Payouts with no note that get one (NSH-11). */
  notes: readonly { payoutId: string; note: string }[]
  /** The admin's user id. */
  actorId: string
}

export interface NoShowStore {
  /** `changed` when a fact no longer holds, and nothing was written. */
  apply(command: NoShowCommand): Promise<'saved' | 'changed'>
}

/** Keeps the commands, for tests. `answer` is what every call returns. */
export function createInMemoryNoShowStore(answer: 'saved' | 'changed' = 'saved') {
  const commands: NoShowCommand[] = []
  const store: NoShowStore = {
    apply(command) {
      commands.push(command)
      return Promise.resolve(answer)
    },
  }
  return { store, commands }
}
