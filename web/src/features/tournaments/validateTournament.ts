import type { FieldErrors, NewTournament, TournamentFormValues } from './types'

/**
 * The create rules (TRN-01 to TRN-07, TRN-09, D-125), run in the browser for quick feedback. The API
 * runs the same rules with the same messages and stays the authority (D-121): change both together.
 */

const MAX_TEXT = 100
const MAX_FEE = 999.99
const MAX_GAMES = 99
const MAX_RATIO = 99.9

// 7.55 * 100 is not exactly 755 in floating point, so allow a tiny error.
function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places
  // Stryker disable next-line EqualityOperator: a difference of exactly 1e-6 cannot occur for two or fewer places.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

function textError(label: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return `${label} is required`
  if (trimmed.length > MAX_TEXT) return `${label} cannot be longer than ${MAX_TEXT} characters`
  return undefined
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function dateError(label: string, value: string): string | undefined {
  if (value === '') return `${label} is required`
  return isRealDate(value) ? undefined : 'Enter a valid date'
}

type Parsed = { error: string } | { value: number }

function parseNumber(label: string, text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { error: `${label} is required` }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { error: 'Enter a number' }
  return { value: Number(trimmed) }
}

function numberField(
  label: string,
  text: string,
  check: (value: number) => string | undefined,
): string | undefined {
  const parsed = parseNumber(label, text)
  return 'error' in parsed ? parsed.error : check(parsed.value)
}

function ratioCheck(label: string, minimum: number, inclusive: boolean, message: string) {
  return (value: number) => {
    if (inclusive ? value < minimum : value <= minimum) return message
    if (value > MAX_RATIO) return `${label} cannot be more than ${MAX_RATIO}`
    if (!hasAtMostDecimals(value, 1)) return 'Use at most one decimal place'
    return undefined
  }
}

/** The message for each field that breaks a rule. An empty object means the form can be sent. */
export function validateTournament(values: TournamentFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const set = (field: keyof TournamentFormValues, message: string | undefined) => {
    if (message !== undefined) errors[field] = message
  }

  set('name', textError('Name', values.name))
  set('bowlingCenter', textError('Bowling center', values.bowlingCenter))
  set('startDate', dateError('Start date', values.startDate))
  set('endDate', dateError('End date', values.endDate))
  if (
    errors.startDate === undefined &&
    errors.endDate === undefined &&
    values.endDate < values.startDate
  ) {
    errors.endDate = 'End date must be on or after start date'
  }
  set(
    'entryFee',
    numberField('Entry fee', values.entryFee, (value) => {
      if (value <= 0) return 'Entry fee must be greater than $0'
      if (value > MAX_FEE) return `Entry fee cannot be more than $${MAX_FEE}`
      if (!hasAtMostDecimals(value, 2)) return 'Use at most two decimal places'
      return undefined
    }),
  )
  set(
    'games',
    numberField('Games', values.games, (value) => {
      if (value < 1) return 'Must have at least one game'
      if (value > MAX_GAMES) return `Games cannot be more than ${MAX_GAMES}`
      if (!Number.isInteger(value)) return 'Enter a whole number'
      return undefined
    }),
  )
  set(
    'finalsRatio',
    numberField(
      'Finals ratio',
      values.finalsRatio,
      ratioCheck('Finals ratio', 1, false, 'Finals ratio must be greater than 1'),
    ),
  )
  set(
    'cashRatio',
    numberField(
      'Cash ratio',
      values.cashRatio,
      ratioCheck('Cash ratio', 1, false, 'Cash ratio must be greater than 1'),
    ),
  )
  set(
    'superSweeperCashRatio',
    numberField(
      'Super sweeper cash ratio',
      values.superSweeperCashRatio,
      ratioCheck(
        'Super sweeper cash ratio',
        1,
        true,
        'Super sweeper cash ratio must be at least 1',
      ),
    ),
  )
  return errors
}

/** The body to send. Call it only when `validateTournament` found nothing. */
export function toNewTournament(values: TournamentFormValues): NewTournament {
  return {
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    bowlingCenter: values.bowlingCenter.trim(),
    entryFee: Number(values.entryFee),
    games: Number(values.games),
    finalsRatio: Number(values.finalsRatio),
    cashRatio: Number(values.cashRatio),
    superSweeperCashRatio: Number(values.superSweeperCashRatio),
  }
}

export const emptyTournamentForm: TournamentFormValues = {
  name: '',
  startDate: '',
  endDate: '',
  bowlingCenter: '',
  entryFee: '',
  games: '',
  finalsRatio: '',
  cashRatio: '',
  superSweeperCashRatio: '',
}
