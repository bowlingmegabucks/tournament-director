import { apiFetch } from '../../shared/apiFetch'
import { apiUrl } from '../../shared/apiUrl'
import { field } from '../../shared/field'
import { readJson } from '../../shared/readJson'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type {
  BowlerTotal,
  PaidChange,
  PayoutList,
  PayoutRow,
  PayoutSheet,
  PayoutSource,
  PayoutSummary,
  PayoutView,
  SaveRow,
  SheetOther,
  SheetPayee,
} from './types'

/** The event, or the payout, is not there (404). */
export class PayoutNotFoundError extends Error {}

/**
 * The API refused the save or the toggle (409): the gate is closed or the tournament is complete
 * (D-272, D-273). Nothing changed.
 */
export class PayoutRefusedError extends Error {}

/** A row is wrong (400). `errors` is keyed `amount:<registrationId>` and `note:<registrationId>`. */
export class PayoutFieldErrorsError extends Error {
  readonly errors: Record<string, string>

  constructor(message: string, errors: Record<string, string>) {
    super(message)
    this.errors = errors
  }
}

/** A save would change a paid payout and the director has not confirmed (409 with warnings, D-273). */
export class PaidConfirmError extends Error {
  readonly changes: PaidChange[]

  constructor(message: string, changes: PaidChange[]) {
    super(message)
    this.changes = changes
  }
}

const isText = (value: unknown): value is string => typeof value === 'string'
const isNullableText = (value: unknown): value is string | null => value === null || isText(value)
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isArrayOf = <T>(value: unknown, test: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(test)

function isSource(value: unknown): value is PayoutSource {
  return value === 'squad' || value === 'sweeper' || value === 'superSweeper' || value === 'finals'
}

function isView(value: unknown): value is PayoutView {
  return (
    isText(field(value, 'id')) &&
    isText(field(value, 'amount')) &&
    isNullableText(field(value, 'note')) &&
    isBoolean(field(value, 'paid'))
  )
}

function isPayee(value: unknown): value is SheetPayee {
  const payout = field(value, 'payout')
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName')) &&
    isText(field(value, 'detail')) &&
    (field(value, 'seed') === null || isNumber(field(value, 'seed'))) &&
    isBoolean(field(value, 'previousCasher')) &&
    isBoolean(field(value, 'inferred')) &&
    (payout === null || isView(payout))
  )
}

function isOther(value: unknown): value is SheetOther {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName'))
  )
}

function isSheet(value: unknown): value is PayoutSheet {
  const event = field(value, 'event')
  const status = field(value, 'status')
  return (
    isSource(field(event, 'source')) &&
    isText(field(event, 'eventId')) &&
    isText(field(event, 'label')) &&
    isNullableText(field(event, 'date')) &&
    isNullableText(field(event, 'divisionName')) &&
    (status === 'open' || status === 'notReady' || status === 'locked') &&
    isNullableText(field(value, 'reason')) &&
    isArrayOf(field(value, 'payees'), isPayee) &&
    isArrayOf(field(value, 'others'), isOther) &&
    isBoolean(field(value, 'tournamentComplete'))
  )
}

function isRow(value: unknown): value is PayoutRow {
  return (
    isText(field(value, 'id')) &&
    isSource(field(value, 'source')) &&
    isText(field(value, 'eventId')) &&
    isText(field(value, 'eventLabel')) &&
    isNullableText(field(value, 'eventDate')) &&
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName')) &&
    isText(field(value, 'amount')) &&
    isNullableText(field(value, 'note')) &&
    isBoolean(field(value, 'paid'))
  )
}

function isSummary(value: unknown): value is PayoutSummary {
  return (
    isNumber(field(value, 'count')) &&
    isText(field(value, 'total')) &&
    isNumber(field(value, 'paidCount')) &&
    isNumber(field(value, 'unpaidCount')) &&
    isText(field(value, 'unpaidTotal'))
  )
}

function isTotal(value: unknown): value is BowlerTotal {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'divisionName')) &&
    isNumber(field(value, 'count')) &&
    isText(field(value, 'total')) &&
    isText(field(value, 'unpaidTotal'))
  )
}

function isChange(value: unknown): value is PaidChange {
  return (
    isText(field(value, 'registrationId')) &&
    isText(field(value, 'name')) &&
    isText(field(value, 'from')) &&
    isNullableText(field(value, 'to'))
  )
}

const base = (tournamentId: string) => `/v1/tournaments/${encodeURIComponent(tournamentId)}/payouts`

/** The path of one event's sheet (PAY-02 to PAY-05). The super sweeper has no event id. */
export function sheetUrl(source: PayoutSource, tournamentId: string, eventId: string): string {
  const root = base(tournamentId)
  switch (source) {
    case 'squad':
      return apiUrl(`${root}/squad/${encodeURIComponent(eventId)}`)
    case 'sweeper':
      return apiUrl(`${root}/sweeper/${encodeURIComponent(eventId)}`)
    case 'superSweeper':
      return apiUrl(`${root}/super-sweeper`)
    case 'finals':
      return apiUrl(`${root}/finals/${encodeURIComponent(eventId)}`)
  }
}

/** The failures every payout call shares. Returns when the response is fine. */
async function checkCommon(response: Response, failure: string): Promise<void> {
  if (response.status === 401) throw new Error('Sign in to see payouts.')
  if (response.status === 403) throw new Error('You do not have permission to use payouts.')
  if (response.status === 404 || response.status === 400) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined)
    const message = field(body, 'message')
    if (message === 'Tournament not found' && response.status === 404) {
      throw new TournamentNotFoundError()
    }
    throw new PayoutNotFoundError(isText(message) ? message : failure)
  }
}

function sheetOf(body: unknown, failure: string): PayoutSheet {
  const sheet = field(body, 'sheet')
  if (!isSheet(sheet)) throw new TypeError(`${failure} (unexpected response)`)
  return sheet
}

export async function fetchSheet(
  source: PayoutSource,
  tournamentId: string,
  eventId: string,
): Promise<PayoutSheet> {
  const failure = 'Failed to load the payouts'
  const response = await apiFetch(sheetUrl(source, tournamentId, eventId))
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  return sheetOf(await readJson(response, failure), failure)
}

/** The 400 of a save: the rows that need fixing. */
function fieldErrorsOf(body: unknown): PayoutFieldErrorsError {
  const errors = field(body, 'errors')
  const message = field(body, 'message')
  const entries =
    typeof errors === 'object' && errors !== null
      ? Object.entries(errors).filter((entry): entry is [string, string] => isText(entry[1]))
      : []
  return new PayoutFieldErrorsError(
    isText(message) ? message : 'Fix the rows marked and save again.',
    Object.fromEntries(entries),
  )
}

/** The 409 of a save: a paid payout to confirm, or a refusal. */
function conflictOf(body: unknown): PaidConfirmError | PayoutRefusedError {
  const message = field(body, 'message')
  const text = isText(message) ? message : 'The payouts cannot be saved.'
  const changes = field(body, 'paidChanges')
  if (field(body, 'warnings') !== undefined && isArrayOf(changes, isChange)) {
    return new PaidConfirmError(text, changes)
  }
  const event = field(field(body, 'errors'), 'event')
  return new PayoutRefusedError(isText(event) ? event : text)
}

/**
 * Save the whole event (PAY-12, D-278). Throws `PayoutFieldErrorsError` (400), `PayoutRefusedError`
 * or `PaidConfirmError` (409), and `PayoutNotFoundError` (404). Answers the fresh sheet.
 */
export async function savePayouts(
  source: PayoutSource,
  tournamentId: string,
  eventId: string,
  rows: readonly SaveRow[],
  confirmPaid: boolean,
): Promise<PayoutSheet> {
  const failure = 'Failed to save the payouts'
  const response = await apiFetch(sheetUrl(source, tournamentId, eventId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payouts: rows, ...(confirmPaid ? { confirmPaid: true } : {}) }),
  })
  if (response.status === 400) throw fieldErrorsOf(await readJson(response, failure))
  if (response.status === 409) throw conflictOf(await readJson(response, failure))
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  return sheetOf(await readJson(response, failure), failure)
}

export async function fetchPayouts(tournamentId: string): Promise<PayoutList> {
  const failure = 'Failed to load the payouts'
  const response = await apiFetch(apiUrl(base(tournamentId)))
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  const body = await readJson(response, failure)
  const payouts = field(body, 'payouts')
  const summary = field(body, 'summary')
  const complete = field(body, 'tournamentComplete')
  if (!isArrayOf(payouts, isRow) || !isSummary(summary) || !isBoolean(complete)) {
    throw new TypeError(`${failure} (unexpected response)`)
  }
  return { payouts, summary, tournamentComplete: complete }
}

/** What each bowler earned across the tournament, optionally at least `min` dollars (PAY-19). */
export async function fetchTotals(tournamentId: string, min: string): Promise<BowlerTotal[]> {
  const failure = 'Failed to load the totals'
  const query = min.trim() === '' ? '' : `?min=${encodeURIComponent(min.trim())}`
  const response = await apiFetch(apiUrl(`${base(tournamentId)}/totals${query}`))
  if (response.status === 400) {
    const message = field(await readJson(response, failure), 'message')
    throw new PayoutFieldErrorsError(isText(message) ? message : failure, {
      min: isText(message) ? message : failure,
    })
  }
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  const bowlers = field(await readJson(response, failure), 'bowlers')
  if (!isArrayOf(bowlers, isTotal)) throw new TypeError(`${failure} (unexpected response)`)
  return bowlers
}

/** Tick or untick Paid on the full list (PAY-13, D-274). */
export async function setPaid(
  tournamentId: string,
  payoutId: string,
  paid: boolean,
): Promise<PayoutView> {
  const failure = 'Failed to change the paid flag'
  const response = await apiFetch(apiUrl(`${base(tournamentId)}/${encodeURIComponent(payoutId)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paid }),
  })
  if (response.status === 409) {
    const body = await readJson(response, failure)
    const event = field(field(body, 'errors'), 'event')
    const message = field(body, 'message')
    if (isText(event)) throw new PayoutRefusedError(event)
    throw new PayoutRefusedError(isText(message) ? message : failure)
  }
  await checkCommon(response, failure)
  if (!response.ok) throw new Error(`${failure} (${response.status})`)
  const payout = field(await readJson(response, failure), 'payout')
  if (!isView(payout)) throw new TypeError(`${failure} (unexpected response)`)
  return payout
}
