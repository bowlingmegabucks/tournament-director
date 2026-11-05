import {
  divisionFields,
  type Division,
  type DivisionFieldErrors,
  type DivisionFormValues,
  type NewDivision,
} from './types'

/**
 * The create rules (DIV-02, DIV-04 to DIV-11, D-141), run in the browser for quick feedback. The
 * API runs the same rules with the same messages and stays the authority (D-138): change both
 * together. The over-100 percent warning (D-142) is the API's alone.
 */

export const emptyDivisionForm: DivisionFormValues = {
  name: '',
  gender: '',
  minimumAge: '',
  maximumAge: '',
  minimumAverage: '',
  maximumAverage: '',
  handicapPercentage: '',
  handicapBase: '',
  maximumHandicapPerGame: '',
}

const MAX_NAME = 100

type Parsed = { blank: true } | { error: string } | { value: number }

/** A blank box means not set. Anything else must be a whole number. */
function parseOptional(text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { blank: true }
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return { error: 'Enter a number' }
  const value = Number(trimmed)
  if (!Number.isInteger(value)) return { error: 'Enter a whole number' }
  return { value }
}

function ranged(text: string, min: number, max: number, message: string): Parsed {
  const parsed = parseOptional(text)
  if ('value' in parsed && (parsed.value < min || parsed.value > max)) return { error: message }
  return parsed
}

const valueOf = (parsed: Parsed): number | null => ('value' in parsed ? parsed.value : null)

/** The number the next division gets: one more than the highest, and 1 for the first (D-139). */
export function nextDivisionNumber(divisions: readonly Division[]): number {
  return Math.max(0, ...divisions.map((division) => division.number)) + 1
}

/** Check every field. An empty result means the form may be sent. */
export function validateDivision(values: DivisionFormValues): DivisionFieldErrors {
  const errors: DivisionFieldErrors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Name is required'
  else if (name.length > MAX_NAME) errors.name = `Name cannot be longer than ${MAX_NAME} characters`

  const parsed = {
    minimumAge: ranged(values.minimumAge, 1, 120, 'Minimum age must be between 1 and 120'),
    maximumAge: ranged(values.maximumAge, 1, 120, 'Maximum age must be between 1 and 120'),
    minimumAverage: ranged(
      values.minimumAverage,
      1,
      300,
      'Minimum average must be between 1 and 300',
    ),
    maximumAverage: ranged(
      values.maximumAverage,
      1,
      300,
      'Maximum average must be between 1 and 300',
    ),
    handicapPercentage: percentage(values.handicapPercentage),
    handicapBase: ranged(values.handicapBase, 0, 300, 'Handicap base must be between 0 and 300'),
    maximumHandicapPerGame: ranged(
      values.maximumHandicapPerGame,
      1,
      300,
      'Maximum handicap per game must be between 1 and 300',
    ),
  }
  for (const [key, result] of Object.entries(parsed)) {
    if ('error' in result) errors[key as keyof typeof parsed] = result.error
  }

  // These need two fields; each says nothing when the other is blank or already wrong.
  const above = (a: Parsed, b: Parsed) => 'value' in a && 'value' in b && a.value > b.value
  if (errors.minimumAge === undefined && above(parsed.minimumAge, parsed.maximumAge)) {
    errors.minimumAge = 'Minimum age must be less than or equal to maximum age'
  }
  if (errors.minimumAverage === undefined && above(parsed.minimumAverage, parsed.maximumAverage)) {
    errors.minimumAverage = 'Minimum average must be less than or equal to maximum average'
  }
  const hasPercent = !('blank' in parsed.handicapPercentage)
  const hasBase = !('blank' in parsed.handicapBase)
  if (hasPercent && !hasBase && errors.handicapBase === undefined) {
    errors.handicapBase = 'Handicap base is required with a handicap percentage'
  }
  if (hasBase && !hasPercent && errors.handicapPercentage === undefined) {
    errors.handicapPercentage = 'Handicap percentage is required with a handicap base'
  }
  if (
    !('blank' in parsed.maximumHandicapPerGame) &&
    !(hasPercent && hasBase) &&
    errors.maximumHandicapPerGame === undefined
  ) {
    errors.maximumHandicapPerGame =
      'Maximum handicap per game is allowed only with a handicap percentage and base'
  }
  return errors
}

function percentage(text: string): Parsed {
  const parsed = parseOptional(text)
  if (!('value' in parsed)) return parsed
  if (parsed.value < 1)
    return { error: 'Handicap percentage must be at least 1, or leave it blank' }
  if (parsed.value > 999) return { error: 'Handicap percentage cannot be more than 999' }
  return parsed
}

/** The body for a form that passed `validateDivision`. */
export function toNewDivision(values: DivisionFormValues): NewDivision {
  return {
    name: values.name.trim(),
    gender: values.gender === '' ? null : values.gender,
    minimumAge: valueOf(parseOptional(values.minimumAge)),
    maximumAge: valueOf(parseOptional(values.maximumAge)),
    minimumAverage: valueOf(parseOptional(values.minimumAverage)),
    maximumAverage: valueOf(parseOptional(values.maximumAverage)),
    handicapPercentage: valueOf(parseOptional(values.handicapPercentage)),
    handicapBase: valueOf(parseOptional(values.handicapBase)),
    maximumHandicapPerGame: valueOf(parseOptional(values.maximumHandicapPerGame)),
  }
}

/** Is this one of the form's fields? The API may name another in an error. */
export const isDivisionField = (name: string): name is (typeof divisionFields)[number] =>
  (divisionFields as readonly string[]).includes(name)
