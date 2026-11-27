/**
 * Moving or refunding a no-show (NSH-01 to NSH-14). The API's `features/noShows/types.ts` has the
 * same fields: change both together.
 */

export interface EntryKey {
  squadId: string
  registrationId: string
}

export type Choice =
  | { action: 'move'; targetSquadId: string; keepAdvancing: EntryKey[] }
  | { action: 'refund'; keepAdvancing: EntryKey[] }

interface BowlerInSquad extends EntryKey {
  squadDate: string
  divisionName: string
  name: string
}

export interface SquadChange extends BowlerInSquad {
  change: 'losesAdvance' | 'gainsAdvance' | 'losesCash' | 'gainsCash'
}

export interface KeepChoice extends BowlerInSquad {
  kept: boolean
}

export interface AtLargeChange {
  divisionId: string
  divisionName: string
  spotsBefore: number
  spotsAfter: number
  joins: string[]
  leaves: string[]
}

export interface PayoutChange {
  payoutId: string
  label: string
  name: string
  /** Money text. The amount never changes (NSH-10). */
  amount: string
  /** The note the system will write, or `null` when the payout keeps its own (NSH-11). */
  note: string | null
}

export interface Preview {
  action: 'move' | 'refund'
  bowlerName: string
  source: { id: string; date: string }
  target: { id: string; date: string } | null
  deletesRegistration: boolean
  warnings: string[]
  changes: SquadChange[]
  keepAdvancing: KeepChoice[]
  atLarge: AtLargeChange[]
  payouts: PayoutChange[]
  version: string
}
