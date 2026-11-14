import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { formatMoney } from '../../shared/formatMoney'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'

/** What the complete dialog says before the director presses Complete (TRN-41, D-259). */
export interface TournamentCompleteInfo {
  squadCount: number
  openSquadCount: number
  openSweeperCount: number
  /** Entries in open squads with no scores: each gets a zero for every game. */
  noScoreCount: number
  /** Entries in open squads with some games but not all: left as entered. */
  partialCount: number
  /** Payouts saved in the tournament (PAY-15, D-279). */
  payoutCount: number
  /** Payouts not marked paid, and what they add up to as money text. */
  unpaidPayoutCount: number
  unpaidPayoutTotal: string
}

/** What a complete closed (TRN-38, D-256). */
export interface TournamentCompleteResult {
  squadsCompleted: number
  sweepersCompleted: number
  noShowCount: number
}

/**
 * The API refused the complete (409): the tournament is already complete, it has no squad, or a
 * stored session cannot be read (D-257). `reasons` holds every reason. Nothing changed.
 */
export class TournamentCompleteRefusedError extends Error {
  readonly reasons: string[]

  constructor(message: string, reasons: string[]) {
    super(message)
    this.reasons = reasons
  }
}

/** The API puts one reason per line under `errors.tournament`, and a session's under `errors.session`. */
function reasonsOf(errors: unknown, fallback: string): string[] {
  const reasons = ['tournament', 'session'].flatMap((key) => {
    const text = field(errors, key)
    return typeof text === 'string' ? text.split('\n').filter((line) => line !== '') : []
  })
  return reasons.length > 0 ? reasons : [fallback]
}

/**
 * Complete a tournament (TRN-38). Throws `TournamentCompleteRefusedError` for a 409 and
 * `TournamentNotFoundError` when it is gone (404).
 */
export async function completeTournament(id: string): Promise<TournamentCompleteResult> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}/complete`), {
    method: 'POST',
  })
  if (response.status === 409) {
    const body = await readJson(response, 'Failed to complete the tournament')
    const message = field(body, 'message')
    const text = typeof message === 'string' ? message : 'The tournament cannot be completed.'
    throw new TournamentCompleteRefusedError(text, reasonsOf(field(body, 'errors'), text))
  }
  if (response.status === 404) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to complete a tournament.')
  if (response.status === 403) {
    throw new Error('You do not have permission to complete a tournament.')
  }
  if (!response.ok) throw new Error(`Failed to complete the tournament (${response.status})`)
  const body = await readJson(response, 'Failed to complete the tournament')
  const squadsCompleted = field(body, 'squadsCompleted')
  const sweepersCompleted = field(body, 'sweepersCompleted')
  const noShowCount = field(body, 'noShowCount')
  if (
    typeof squadsCompleted !== 'number' ||
    typeof sweepersCompleted !== 'number' ||
    typeof noShowCount !== 'number'
  ) {
    throw new TypeError('Failed to complete the tournament (unexpected response)')
  }
  return { squadsCompleted, sweepersCompleted, noShowCount }
}

function isInfo(value: unknown): value is TournamentCompleteInfo {
  return (
    typeof field(value, 'squadCount') === 'number' &&
    typeof field(value, 'openSquadCount') === 'number' &&
    typeof field(value, 'openSweeperCount') === 'number' &&
    typeof field(value, 'noScoreCount') === 'number' &&
    typeof field(value, 'partialCount') === 'number' &&
    typeof field(value, 'payoutCount') === 'number' &&
    typeof field(value, 'unpaidPayoutCount') === 'number' &&
    typeof field(value, 'unpaidPayoutTotal') === 'string'
  )
}

/** What a complete would do now, for the dialog (TRN-41, D-259). */
export async function fetchCompleteInfo(id: string): Promise<TournamentCompleteInfo> {
  const response = await apiFetch(apiUrl(`/v1/tournaments/${encodeURIComponent(id)}/complete-info`))
  if (response.status === 404 || response.status === 400) throw new TournamentNotFoundError()
  if (response.status === 401) throw new Error('Sign in to complete a tournament.')
  if (response.status === 403) {
    throw new Error('You do not have permission to complete a tournament.')
  }
  if (!response.ok) throw new Error(`Failed to load what completing does (${response.status})`)
  const info = field(
    await readJson(response, 'Failed to load what completing does'),
    'completeInfo',
  )
  if (!isInfo(info)) {
    throw new TypeError('Failed to load what completing does (unexpected response)')
  }
  return info
}

/** "1 squad" / "3 squads". */
const count = (n: number, noun: string) => (n === 1 ? `1 ${noun}` : `${n} ${noun}s`)

/**
 * The success toast (TRN-43, D-260): "Tournament completed. 3 squads and 1 sweeper closed, 7
 * bowlers got zeros." Lines with a zero count drop.
 */
export function completedMessage(result: TournamentCompleteResult): string {
  const closed = [
    result.squadsCompleted > 0 ? count(result.squadsCompleted, 'squad') : undefined,
    result.sweepersCompleted > 0 ? count(result.sweepersCompleted, 'sweeper') : undefined,
  ].filter((part): part is string => part !== undefined)
  const zeros =
    result.noShowCount > 0 ? `${count(result.noShowCount, 'bowler')} got zeros` : undefined
  const parts = [closed.length > 0 ? `${closed.join(' and ')} closed` : undefined, zeros].filter(
    (part): part is string => part !== undefined,
  )
  return parts.length > 0 ? `Tournament completed. ${parts.join(', ')}.` : 'Tournament completed.'
}

/** The dialog's lines about what will happen, in order (TRN-43, D-259). Zero counts drop their line. */
export function completeLines(info: TournamentCompleteInfo): string[] {
  const open = [
    info.openSquadCount > 0 ? count(info.openSquadCount, 'open squad') : undefined,
    info.openSweeperCount > 0 ? count(info.openSweeperCount, 'open sweeper') : undefined,
  ].filter((part): part is string => part !== undefined)
  const bowlers = (n: number) => count(n, 'bowler')
  return [
    open.length > 0 ? `Complete ${open.join(' and ')}.` : undefined,
    info.noScoreCount > 0
      ? `Save a zero for every game of ${bowlers(info.noScoreCount)} with no scores.`
      : undefined,
    info.partialCount > 0
      ? `Leave ${bowlers(info.partialCount)} with some games but not all as entered.`
      : undefined,
  ].filter((line): line is string => line !== undefined)
}

/**
 * What the director should know about payouts before completing (PAY-15, D-279): none recorded, or
 * some not marked paid. They are notes, not blocks: the typed name is the confirmation, and a
 * complete locks every payout (D-273). A tournament with everything paid has no note.
 */
export function payoutNotes(info: TournamentCompleteInfo): string[] {
  if (info.payoutCount === 0) return ['No payouts are recorded.']
  if (info.unpaidPayoutCount === 0) return []
  const total = formatMoney(info.unpaidPayoutTotal)
  return [
    info.unpaidPayoutCount === 1
      ? `1 payout is not marked paid (${total}).`
      : `${info.unpaidPayoutCount} payouts are not marked paid (${total}).`,
  ]
}
