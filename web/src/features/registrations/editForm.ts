import type { SessionKind } from '../../shared/session'
import type { Squad } from '../squads/types'
import { formatFee } from '../tournaments/format'
import type { Sweeper } from '../sweepers/types'
import { bowlerFields, toBowlerValues, type DueLine, type RegistrationValues } from './deskForm'
import type { BowlerValues, EditInfo, EditRegistrationRequest, EditResult } from './types'

/** The registration part of the form, as stored (D-197). */
export function toEditRegistrationValues(
  registration: EditInfo['registration'],
): RegistrationValues {
  return {
    divisionId: registration.divisionId,
    average: registration.average === null ? '' : String(registration.average),
    squadIds: [...registration.squadIds],
    sweeperIds: [...registration.sweeperIds],
    superSweeper: registration.superSweeper,
  }
}

const idsNotIn = (ids: string[], other: string[]) => ids.filter((id) => !other.includes(id))

/** The fields the desk changed on the bowler, as sent: trimmed, and an emptied box is kept so it clears (D-206). */
export function editedFields(stored: BowlerValues, edited: BowlerValues): Partial<BowlerValues> {
  const changes: Partial<BowlerValues> = {}
  for (const key of bowlerFields) {
    const next = edited[key].trim()
    if (next !== stored[key].trim()) Object.assign(changes, { [key]: next })
  }
  return changes
}

export interface EditChange {
  key: keyof BowlerValues
  from: string
  /** `''` means the box was emptied: the Review step says "(cleared)". */
  to: string
}

/** The bowler fields the desk changed, old against new, for the Review step (D-206). */
export function editChangesOf(stored: BowlerValues, edited: BowlerValues): EditChange[] {
  const changed = editedFields(stored, edited)
  return bowlerFields.flatMap((key) => {
    const to = changed[key]
    return to === undefined ? [] : [{ key, from: stored[key], to }]
  })
}

interface BuildInput {
  info: EditInfo
  bowler: BowlerValues
  registration: RegistrationValues
  confirmWarnings?: boolean
}

/**
 * The request: only what changed. Squads and sweepers go as additions and removals (D-199), so a
 * squad the site added meanwhile is never erased. A blank average clears it (REG-16).
 */
export function buildEditRequest({
  info,
  bowler,
  registration,
  confirmWarnings = false,
}: BuildInput): EditRegistrationRequest {
  const { registration: stored } = info
  const request: EditRegistrationRequest = {}
  if (registration.divisionId !== stored.divisionId) request.divisionId = registration.divisionId
  const typed = registration.average.trim()
  const average = typed === '' ? null : Number(typed)
  if (average !== stored.average) request.average = average
  if (registration.superSweeper !== stored.superSweeper) {
    request.superSweeper = registration.superSweeper
  }
  const lists = {
    addSquadIds: idsNotIn(registration.squadIds, stored.squadIds),
    removeSquadIds: idsNotIn(stored.squadIds, registration.squadIds),
    addSweeperIds: idsNotIn(registration.sweeperIds, stored.sweeperIds),
    removeSweeperIds: idsNotIn(stored.sweeperIds, registration.sweeperIds),
  }
  for (const [key, ids] of Object.entries(lists)) {
    if (ids.length > 0) Object.assign(request, { [key]: ids })
  }
  const changed = editedFields(storedBowlerOf(info), bowler)
  if (Object.keys(changed).length > 0) request.bowler = changed
  if (confirmWarnings) request.confirmWarnings = true
  return request
}

/** The bowler as the form starts: what is stored. */
export const storedBowlerOf = (info: EditInfo): BowlerValues => toBowlerValues(info.bowler)

/** Whether the request holds a change worth saving (the confirmation flag alone is not one). */
export function hasChanges(request: EditRegistrationRequest): boolean {
  return Object.entries(request).some(([key]) => key !== 'confirmWarnings')
}

export interface Money {
  /** Sessions added: the desk collects these fees (D-207). */
  collect: DueLine[]
  /** Sessions removed: a refund may be due, handled outside the app (D-11, D-207). */
  refund: DueLine[]
  /** Collect minus refund, in dollars: above 0 collect, below 0 refund, 0 even. */
  net: number
}

interface MoneyInput {
  info: EditInfo
  registration: RegistrationValues
  squads: Squad[]
  sweepers: Sweeper[]
}

const centsOf = (lines: DueLine[]) =>
  lines.reduce((total, line) => total + Math.round(line.amount * 100), 0)

/**
 * What the desk collects and what may be refunded (D-207). A squad's fee is its own or the
 * tournament's, which the API has settled (TRN-12). There is no super sweeper fee. A session the
 * bowler keeps costs nothing here. Whole cents, so 0.1 and 0.2 make 0.3.
 */
export function moneyOf({ info, registration, squads, sweepers }: MoneyInput): Money {
  const { registration: stored } = info
  const lines = (kind: DueLine['kind'], ids: string[], sessions: (Squad | Sweeper)[]): DueLine[] =>
    sessions
      .filter((session) => ids.includes(session.id))
      .map((session) => ({ kind, id: session.id, date: session.date, amount: session.entryFee }))
  const collect = [
    ...lines('squad', idsNotIn(registration.squadIds, stored.squadIds), squads),
    ...lines('sweeper', idsNotIn(registration.sweeperIds, stored.sweeperIds), sweepers),
  ]
  const refund = [
    ...lines('squad', idsNotIn(stored.squadIds, registration.squadIds), squads),
    ...lines('sweeper', idsNotIn(stored.sweeperIds, registration.sweeperIds), sweepers),
  ]
  return { collect, refund, net: (centsOf(collect) - centsOf(refund)) / 100 }
}

/** "Added 2, removed 1." for the success toast (D-197). */
export function describeResult({ added, removed }: Pick<EditResult, 'added' | 'removed'>): string {
  const parts = [
    added > 0 ? `added ${String(added)}` : undefined,
    removed > 0 ? `removed ${String(removed)}` : undefined,
  ].filter((part) => part !== undefined)
  return parts.length === 0
    ? 'Registration updated.'
    : `Registration updated. ${capital(parts.join(', '))}.`
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The reason a session cannot come off the registration, or `undefined` (REG-34, D-10). */
export function removeLock(
  session: { id: string; complete: boolean },
  info: EditInfo,
): string | undefined {
  if (session.complete) return 'Cannot remove: this one is complete.'
  if (info.locks.scoredSessionIds.includes(session.id)) {
    return 'Cannot remove: this bowler has scores here.'
  }
  return undefined
}

/** "Net: collect $20.00." / "Net: refund $5.00." / "Net: even." (D-207) */
export function netText(net: number): string {
  if (net > 0) return `Net: collect ${formatFee(net)}.`
  if (net < 0) return `Net: refund ${formatFee(-net)}.`
  return 'Net: even. Nothing to collect or refund.'
}

/** The request that takes a bowler off this session, and onto another when there is one (D-202). */
export function sessionChange(
  kind: SessionKind,
  sessionId: string,
  targetId?: string,
): EditRegistrationRequest {
  const remove =
    kind === 'squad' ? { removeSquadIds: [sessionId] } : { removeSweeperIds: [sessionId] }
  if (targetId === undefined) return remove
  return {
    ...remove,
    ...(kind === 'squad' ? { addSquadIds: [targetId] } : { addSweeperIds: [targetId] }),
  }
}
